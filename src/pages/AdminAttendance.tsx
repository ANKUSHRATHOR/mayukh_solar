import { useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { Eye, XCircle, Download, Check, X as XIcon } from 'lucide-react';
import { downloadCsv } from '@/lib/exportCsv';
import { useStickyState } from '@/hooks/useStickyState';

const statusColor: Record<string, string> = {
  present: 'bg-success text-success-foreground',
  late: 'bg-warning text-warning-foreground',
  half_day: 'bg-accent text-accent-foreground',
  absent: 'bg-destructive text-destructive-foreground',
};

const AdminAttendance = () => {
  const { toast } = useToast();
  const qc = useQueryClient();
  const now = new Date();
  const [month, setMonth] = useStickyState<string>('admin-attendance:month', format(now, 'yyyy-MM'));
  const [staffId, setStaffId] = useStickyState<string>('admin-attendance:staffId', 'all');

  const { data: staff } = useQuery({
    queryKey: ['staff-list'],
    queryFn: async () => {
      const { data } = await supabase.from('staff').select('user_id, full_name, mobile').order('full_name');
      return data || [];
    },
  });

  const range = useMemo(() => {
    const [y, m] = month.split('-').map(Number);
    const start = new Date(y, m - 1, 1);
    const end = new Date(y, m, 0);
    return { start: format(start, 'yyyy-MM-dd'), end: format(end, 'yyyy-MM-dd') };
  }, [month]);

  const { data: rows } = useQuery({
    queryKey: ['admin-attendance', month, staffId],
    queryFn: async () => {
      let q = supabase.from('attendance' as any).select('*').gte('date', range.start).lte('date', range.end).order('date', { ascending: false });
      if (staffId !== 'all') q = q.eq('staff_user_id', staffId);
      const { data } = await q;
      return (data as any[]) || [];
    },
  });

  const { data: events } = useQuery({
    queryKey: ['admin-events', month, staffId],
    queryFn: async () => {
      const startISO = new Date(range.start + 'T00:00:00').toISOString();
      const endISO = new Date(range.end + 'T23:59:59').toISOString();
      let q = supabase.from('attendance_events' as any).select('*').gte('captured_at', startISO).lte('captured_at', endISO).order('captured_at', { ascending: false });
      if (staffId !== 'all') q = q.eq('staff_user_id', staffId);
      const { data } = await q;
      return (data as any[]) || [];
    },
  });

  const staffName = (uid: string) => staff?.find((s) => s.user_id === uid)?.full_name || uid.slice(0, 6);

  const reject = async (id: string) => {
    const reason = window.prompt('Rejection reason (will be sent to staff):');
    if (!reason) return;
    const { error } = await supabase.from('attendance_events' as any)
      .update({ is_rejected: true, rejection_reason: reason, rejected_at: new Date().toISOString() })
      .eq('id', id);
    if (error) { toast({ title: 'Failed', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Rejected', description: 'Staff has been notified.' });
    qc.invalidateQueries({ queryKey: ['admin-events'] });
  };

  const openImage = async (path: string) => {
    const { data } = await supabase.storage.from('attendance-media').createSignedUrl(path, 300);
    if (data?.signedUrl) window.open(data.signedUrl, '_blank');
  };

  // Punch-out requests panel
  const { data: punchReqs } = useQuery({
    queryKey: ['punch-out-requests'],
    queryFn: async () => {
      const { data } = await supabase.from('punch_out_requests' as any)
        .select('*').order('created_at', { ascending: false }).limit(50);
      return (data as any[]) || [];
    },
  });

  const reviewReq = async (id: string, approve: boolean) => {
    const notes = approve ? null : window.prompt('Reason for rejection (optional):') || null;
    const { error } = await supabase.rpc('review_punch_out_request' as any, { _id: id, _approve: approve, _notes: notes });
    if (error) { toast({ title: 'Failed', description: error.message, variant: 'destructive' }); return; }
    toast({ title: approve ? 'Approved' : 'Rejected' });
    qc.invalidateQueries({ queryKey: ['punch-out-requests'] });
  };

  const summary = useMemo(() => {
    const s = { present: 0, late: 0, half_day: 0, absent: 0, hours: 0, overtime: 0 };
    rows?.forEach((r: any) => {
      (s as any)[r.status] = ((s as any)[r.status] || 0) + 1;
      s.hours += (r.worked_minutes || 0) / 60;
      s.overtime += (r.overtime_minutes || 0) / 60;
    });
    return s;
  }, [rows]);

  const exportRows = () => {
    if (!rows?.length) return;
    downloadCsv(`attendance-${month}.csv`, [
      { header: 'Date', value: (r: any) => format(new Date(r.date), 'yyyy-MM-dd') },
      { header: 'Staff', value: (r: any) => staffName(r.staff_user_id) },
      { header: 'Status', value: (r: any) => r.status },
      { header: 'Check In', value: (r: any) => r.check_in_at ? format(new Date(r.check_in_at), 'HH:mm') : '' },
      { header: 'Check Out', value: (r: any) => r.check_out_at ? format(new Date(r.check_out_at), 'HH:mm') : '' },
      { header: 'Worked (min)', value: (r: any) => r.worked_minutes || 0 },
      { header: 'Overtime (min)', value: (r: any) => r.overtime_minutes || 0 },
    ], rows);
  };

  return (
    <div className="p-4 lg:p-8 max-w-6xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Attendance Reports</h1>
          <p className="text-sm text-muted-foreground mt-1">Daily logs, GPS, bike-meter images and rejections</p>
        </div>
        <Button variant="outline" size="sm" onClick={exportRows} disabled={!rows?.length}><Download className="h-4 w-4 mr-1" /> Export CSV</Button>
      </div>


      <Card className="border-border shadow-card">
        <CardContent className="p-4 grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label>Month</Label>
            <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label>Staff</Label>
            <Select value={staffId} onValueChange={setStaffId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Staff</SelectItem>
                {staff?.map((s) => (
                  <SelectItem key={s.user_id} value={s.user_id}>{s.full_name} — {s.mobile}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        {(['present', 'late', 'half_day', 'absent'] as const).map((k) => (
          <Card key={k} className="border-border"><CardContent className="p-3">
            <p className="text-xs text-muted-foreground uppercase">{k.replace('_', ' ')}</p>
            <p className="text-xl font-bold">{(summary as any)[k] || 0}</p>
          </CardContent></Card>
        ))}
        <Card className="border-border"><CardContent className="p-3">
          <p className="text-xs text-muted-foreground uppercase">Hours</p>
          <p className="text-xl font-bold">{summary.hours.toFixed(1)}</p>
        </CardContent></Card>
        <Card className="border-border"><CardContent className="p-3">
          <p className="text-xs text-muted-foreground uppercase">Overtime</p>
          <p className="text-xl font-bold">{summary.overtime.toFixed(1)}h</p>
        </CardContent></Card>
      </div>

      <Card className="border-border shadow-card">
        <CardHeader className="pb-3"><CardTitle className="text-base">Daily attendance</CardTitle></CardHeader>
        <CardContent>
          {!rows?.length ? <p className="text-sm text-muted-foreground">No data.</p> : (
            <div className="space-y-2">
              {rows.map((r: any) => (
                <div key={r.id} className="flex items-center justify-between gap-3 rounded-md border border-border p-2 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{staffName(r.staff_user_id)}</p>
                    <p className="text-xs text-muted-foreground">{format(new Date(r.date), 'dd MMM yyyy')}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge className={statusColor[r.status]}>{r.status.replace('_', ' ')}</Badge>
                    <span className="text-xs text-muted-foreground">{Math.floor((r.worked_minutes || 0) / 60)}h{r.worked_minutes % 60}m</span>
                    {!!r.overtime_minutes && <span className="text-xs text-warning">OT {Math.floor(r.overtime_minutes / 60)}h</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-border shadow-card">
        <CardHeader className="pb-3"><CardTitle className="text-base">Punch events (bike meter + GPS)</CardTitle></CardHeader>
        <CardContent>
          {!events?.length ? <p className="text-sm text-muted-foreground">No events.</p> : (
            <div className="space-y-2">
              {events.map((e: any) => (
                <div key={e.id} className={`rounded-md border p-3 text-sm ${e.is_rejected ? 'border-destructive/50 bg-destructive/5' : 'border-border'}`}>
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div>
                      <p className="font-medium">{staffName(e.staff_user_id)} — <span className="capitalize">{e.kind.replace('_', ' ')}</span></p>
                      <p className="text-xs text-muted-foreground">{format(new Date(e.captured_at), 'dd MMM HH:mm')}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {e.latitude && (
                        <a className="text-xs text-primary underline" href={`https://www.google.com/maps?q=${e.latitude},${e.longitude}`} target="_blank" rel="noreferrer">
                          {e.latitude.toFixed(4)}, {e.longitude.toFixed(4)} (±{Math.round(e.accuracy_m || 0)}m)
                        </a>
                      )}
                      {e.bike_meter_image_path && (
                        <Button size="sm" variant="outline" onClick={() => openImage(e.bike_meter_image_path)}><Eye className="h-3 w-3 mr-1" /> Image</Button>
                      )}
                      {e.bike_meter_reading != null && <span className="text-xs">{e.bike_meter_reading} km</span>}
                      {!e.is_rejected && (
                        <Button size="sm" variant="destructive" onClick={() => reject(e.id)}><XCircle className="h-3 w-3 mr-1" /> Reject</Button>
                      )}
                    </div>
                  </div>
                  {e.is_rejected && <p className="text-xs text-destructive mt-1">Rejected: {e.rejection_reason || '—'}</p>}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-border shadow-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Outside Punch-Out Requests</CardTitle>
        </CardHeader>
        <CardContent>
          {!punchReqs?.length ? (
            <p className="text-sm text-muted-foreground">No requests.</p>
          ) : (
            <div className="space-y-2">
              {punchReqs.map((r: any) => (
                <div key={r.id} className={`rounded-md border p-3 text-sm ${r.status === 'pending' ? 'border-warning/50 bg-warning/5' : 'border-border'}`}>
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <p className="font-medium">{staffName(r.staff_user_id)} <Badge variant="outline" className="ml-2 capitalize">{r.status}</Badge></p>
                      <p className="text-xs text-muted-foreground mt-0.5">{format(new Date(r.created_at), 'dd MMM HH:mm')}</p>
                      <p className="text-sm mt-1"><span className="text-muted-foreground">Reason:</span> {r.reason}</p>
                      <a className="text-xs text-primary underline" href={`https://www.google.com/maps?q=${r.latitude},${r.longitude}`} target="_blank" rel="noreferrer">
                        {Number(r.latitude).toFixed(5)}, {Number(r.longitude).toFixed(5)}
                      </a>
                      {r.review_notes && <p className="text-xs text-muted-foreground mt-1">Notes: {r.review_notes}</p>}
                    </div>
                    {r.status === 'pending' && (
                      <div className="flex items-center gap-2 shrink-0">
                        <Button size="sm" onClick={() => reviewReq(r.id, true)} className="bg-success text-success-foreground hover:bg-success/90"><Check className="h-3 w-3 mr-1" /> Approve</Button>
                        <Button size="sm" variant="destructive" onClick={() => reviewReq(r.id, false)}><XIcon className="h-3 w-3 mr-1" /> Reject</Button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminAttendance;
