import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { Calculator, Save, Plus, Wallet, Download, CheckCircle2 } from 'lucide-react';
import { downloadCsv } from '@/lib/exportCsv';

const statusColor: Record<string, string> = {
  pending: 'bg-warning text-warning-foreground',
  partial: 'bg-accent text-accent-foreground',
  paid: 'bg-success text-success-foreground',
};

const SalaryManagement = () => {
  const { toast } = useToast();
  const qc = useQueryClient();
  const now = new Date();
  const [staffId, setStaffId] = useState<string>('');
  const [salary, setSalary] = useState('');
  const [ot, setOt] = useState('');
  const [workDays, setWorkDays] = useState('26');
  const [month, setMonth] = useState(format(now, 'yyyy-MM'));
  const [busy, setBusy] = useState(false);
  // Advances
  const [advStaffId, setAdvStaffId] = useState('');
  const [advAmount, setAdvAmount] = useState('');
  const [advNote, setAdvNote] = useState('');
  const [advDate, setAdvDate] = useState(format(now, 'yyyy-MM-dd'));
  // Pay dialog
  const [payRun, setPayRun] = useState<any | null>(null);
  const [payAmount, setPayAmount] = useState('');

  const { data: staff } = useQuery({
    queryKey: ['staff-list-salary'],
    queryFn: async () => {
      const { data } = await supabase.from('staff').select('user_id, full_name, mobile').eq('is_active', true).order('full_name');
      return data || [];
    },
  });

  const { data: profiles } = useQuery({
    queryKey: ['salary-profiles'],
    queryFn: async () => {
      const { data } = await supabase.from('salary_profiles' as any).select('*');
      return (data as any[]) || [];
    },
  });

  const { data: runs } = useQuery({
    queryKey: ['salary-runs', month],
    queryFn: async () => {
      const [y, m] = month.split('-').map(Number);
      const { data } = await supabase.from('salary_runs' as any).select('*').eq('year', y).eq('month', m).order('generated_at', { ascending: false });
      return (data as any[]) || [];
    },
  });

  const { data: advances } = useQuery({
    queryKey: ['salary-advances'],
    queryFn: async () => {
      const { data } = await supabase.from('salary_advances' as any).select('*').order('given_on', { ascending: false });
      return (data as any[]) || [];
    },
  });

  const staffName = (uid: string) => staff?.find((s) => s.user_id === uid)?.full_name || uid.slice(0, 6);
  const currentProfile = useMemo(() => profiles?.find((p) => p.staff_user_id === staffId), [profiles, staffId]);

  const saveProfile = async () => {
    if (!staffId || !salary) return;
    setBusy(true);
    const payload = {
      staff_user_id: staffId,
      monthly_salary: Number(salary),
      overtime_hourly_rate: Number(ot || 0),
      working_days_per_month: Number(workDays || 26),
      effective_from: format(new Date(), 'yyyy-MM-dd'),
    };
    const { error } = await supabase.from('salary_profiles' as any).upsert(payload, { onConflict: 'staff_user_id' });
    setBusy(false);
    if (error) { toast({ title: 'Save failed', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Salary profile saved' });
    qc.invalidateQueries({ queryKey: ['salary-profiles'] });
  };

  const compute = async (uid?: string) => {
    const target = uid || staffId;
    if (!target) { toast({ title: 'Pick a staff member', variant: 'destructive' }); return; }
    const [y, m] = month.split('-').map(Number);
    setBusy(true);
    const { error } = await supabase.rpc('compute_salary' as any, { _user: target, _year: y, _month: m });
    setBusy(false);
    if (error) { toast({ title: 'Compute failed', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Salary computed' });
    qc.invalidateQueries({ queryKey: ['salary-runs'] });
  };

  const computeAll = async () => {
    if (!profiles?.length) return;
    setBusy(true);
    const [y, m] = month.split('-').map(Number);
    for (const p of profiles) {
      await supabase.rpc('compute_salary' as any, { _user: p.staff_user_id, _year: y, _month: m });
    }
    setBusy(false);
    toast({ title: 'All salaries computed' });
    qc.invalidateQueries({ queryKey: ['salary-runs'] });
  };

  const addAdvance = async () => {
    if (!advStaffId || !advAmount) { toast({ title: 'Staff and amount required', variant: 'destructive' }); return; }
    setBusy(true);
    const { error } = await supabase.from('salary_advances' as any).insert({
      staff_user_id: advStaffId, amount: Number(advAmount), note: advNote || null, given_on: advDate,
    });
    setBusy(false);
    if (error) { toast({ title: 'Failed', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Advance recorded' });
    setAdvAmount(''); setAdvNote('');
    qc.invalidateQueries({ queryKey: ['salary-advances'] });
  };

  const openPay = (r: any, mode: 'full' | 'partial') => {
    setPayRun(r);
    const remaining = Math.max(Number(r.net) - Number(r.paid_amount || 0), 0);
    setPayAmount(mode === 'full' ? String(remaining) : '');
  };

  const confirmPay = async () => {
    if (!payRun) return;
    const amt = Number(payAmount);
    if (!amt || amt <= 0) { toast({ title: 'Enter amount', variant: 'destructive' }); return; }
    setBusy(true);
    const { error } = await supabase.rpc('mark_salary_paid' as any, { _run_id: payRun.id, _amount: amt });
    setBusy(false);
    if (error) { toast({ title: 'Failed', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Payment recorded' });
    setPayRun(null); setPayAmount('');
    qc.invalidateQueries({ queryKey: ['salary-runs'] });
  };

  const exportRuns = () => {
    downloadCsv(`salary-${month}.csv`, [
      { header: 'Staff', value: (r: any) => staffName(r.staff_user_id) },
      { header: 'Year', value: (r: any) => r.year },
      { header: 'Month', value: (r: any) => r.month },
      { header: 'Present', value: (r: any) => r.present_days },
      { header: 'Late', value: (r: any) => r.late_days },
      { header: 'Half', value: (r: any) => r.half_days },
      { header: 'Absent', value: (r: any) => r.absent_days },
      { header: 'OT (min)', value: (r: any) => r.overtime_minutes },
      { header: 'Gross', value: (r: any) => r.gross },
      { header: 'Deductions', value: (r: any) => r.deductions },
      { header: 'Advance', value: (r: any) => r.advance_deduction },
      { header: 'Net', value: (r: any) => r.net },
      { header: 'Paid', value: (r: any) => r.paid_amount },
      { header: 'Status', value: (r: any) => r.status },
    ], runs || []);
  };

  const exportAdvances = () => {
    downloadCsv(`advances.csv`, [
      { header: 'Staff', value: (a: any) => staffName(a.staff_user_id) },
      { header: 'Date', value: (a: any) => a.given_on },
      { header: 'Amount', value: (a: any) => a.amount },
      { header: 'Note', value: (a: any) => a.note || '' },
      { header: 'Deducted in run', value: (a: any) => a.deducted_run_id || 'pending' },
    ], advances || []);
  };

  return (
    <div className="p-4 lg:p-8 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Salary Management</h1>
        <p className="text-sm text-muted-foreground mt-1">Monthly salaries, attendance-based deductions, overtime & advances</p>
      </div>

      <Tabs defaultValue="runs" className="space-y-4">
        <TabsList>
          <TabsTrigger value="runs">Payroll</TabsTrigger>
          <TabsTrigger value="profiles">Profiles</TabsTrigger>
          <TabsTrigger value="advances">Advances</TabsTrigger>
        </TabsList>

        <TabsContent value="profiles" className="space-y-4">
          <Card className="border-border shadow-card">
            <CardHeader className="pb-3"><CardTitle className="text-base">Salary profile</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div className="space-y-1.5 md:col-span-2">
                <Label>Staff</Label>
                <Select value={staffId} onValueChange={(v) => {
                  setStaffId(v);
                  const p = profiles?.find((x) => x.staff_user_id === v);
                  setSalary(p ? String(p.monthly_salary) : '');
                  setOt(p ? String(p.overtime_hourly_rate) : '');
                  setWorkDays(p ? String(p.working_days_per_month) : '26');
                }}>
                  <SelectTrigger><SelectValue placeholder="Pick staff" /></SelectTrigger>
                  <SelectContent>
                    {staff?.map((s) => <SelectItem key={s.user_id} value={s.user_id}>{s.full_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Monthly salary (₹)</Label>
                <Input type="number" value={salary} onChange={(e) => setSalary(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Overtime (₹/hour)</Label>
                <Input type="number" value={ot} onChange={(e) => setOt(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Working days/month</Label>
                <Input type="number" value={workDays} onChange={(e) => setWorkDays(e.target.value)} />
              </div>
              <div className="md:col-span-3 flex items-end gap-2">
                <Button onClick={saveProfile} disabled={busy || !staffId || !salary} className="gradient-primary text-primary-foreground">
                  <Save className="h-4 w-4 mr-1" /> Save profile
                </Button>
                {currentProfile && (
                  <span className="text-xs text-muted-foreground">Existing: ₹{currentProfile.monthly_salary}/mo, OT ₹{currentProfile.overtime_hourly_rate}/h</span>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="runs" className="space-y-4">
          <Card className="border-border shadow-card">
            <CardHeader className="pb-3"><CardTitle className="text-base">Generate monthly salary</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
              <div className="space-y-1.5">
                <Label>Month</Label>
                <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Staff (optional)</Label>
                <Select value={staffId} onValueChange={setStaffId}>
                  <SelectTrigger><SelectValue placeholder="All" /></SelectTrigger>
                  <SelectContent>
                    {staff?.map((s) => <SelectItem key={s.user_id} value={s.user_id}>{s.full_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={() => compute()} disabled={busy || !staffId}><Calculator className="h-4 w-4 mr-1" /> Compute selected</Button>
              <Button variant="outline" onClick={computeAll} disabled={busy}>Compute all staff</Button>
            </CardContent>
          </Card>

          <Card className="border-border shadow-card">
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <CardTitle className="text-base">Salary runs — {month}</CardTitle>
              <Button variant="outline" size="sm" onClick={exportRuns} disabled={!runs?.length}>
                <Download className="h-4 w-4 mr-1" /> Export CSV
              </Button>
            </CardHeader>
            <CardContent>
              {!runs?.length ? <p className="text-sm text-muted-foreground">No salary runs generated for this month yet.</p> : (
                <div className="space-y-2">
                  {runs.map((r: any) => {
                    const remaining = Math.max(Number(r.net) - Number(r.paid_amount || 0), 0);
                    return (
                      <div key={r.id} className="rounded-md border border-border p-3 text-sm">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-2 min-w-0">
                            <p className="font-semibold truncate">{staffName(r.staff_user_id)}</p>
                            <Badge className={statusColor[r.status] || ''}>{r.status}</Badge>
                          </div>
                          <p className="font-bold text-primary">Net ₹{Number(r.net).toLocaleString('en-IN')}</p>
                        </div>
                        <div className="mt-1 grid grid-cols-2 md:grid-cols-6 gap-2 text-xs text-muted-foreground">
                          <span>Present: {r.present_days}</span>
                          <span>Late: {r.late_days}</span>
                          <span>Half: {r.half_days}</span>
                          <span>Absent: {r.absent_days}</span>
                          <span>OT: {Math.floor(r.overtime_minutes / 60)}h</span>
                          <span>Advance ₹{Number(r.advance_deduction || 0).toLocaleString('en-IN')}</span>
                        </div>
                        <div className="mt-2 flex items-center justify-between gap-2 flex-wrap">
                          <div className="text-xs text-muted-foreground">Paid ₹{Number(r.paid_amount || 0).toLocaleString('en-IN')} / Remaining ₹{remaining.toLocaleString('en-IN')}</div>
                          <div className="flex gap-2">
                            <Button size="sm" variant="outline" disabled={r.status === 'paid'} onClick={() => openPay(r, 'partial')}>Partial</Button>
                            <Button size="sm" disabled={r.status === 'paid'} className="gradient-primary text-primary-foreground" onClick={() => openPay(r, 'full')}>
                              <CheckCircle2 className="h-4 w-4 mr-1" /> Mark Paid
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="advances" className="space-y-4">
          <Card className="border-border shadow-card">
            <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Wallet className="h-4 w-4" /> Add advance</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
              <div className="space-y-1.5 md:col-span-2">
                <Label>Staff</Label>
                <Select value={advStaffId} onValueChange={setAdvStaffId}>
                  <SelectTrigger><SelectValue placeholder="Pick staff" /></SelectTrigger>
                  <SelectContent>
                    {staff?.map((s) => <SelectItem key={s.user_id} value={s.user_id}>{s.full_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Amount (₹)</Label>
                <Input type="number" value={advAmount} onChange={(e) => setAdvAmount(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Date</Label>
                <Input type="date" value={advDate} onChange={(e) => setAdvDate(e.target.value)} />
              </div>
              <Button onClick={addAdvance} disabled={busy || !advStaffId || !advAmount} className="gradient-primary text-primary-foreground">
                <Plus className="h-4 w-4 mr-1" /> Add
              </Button>
              <div className="md:col-span-5 space-y-1.5">
                <Label>Note</Label>
                <Input value={advNote} onChange={(e) => setAdvNote(e.target.value)} placeholder="Reason / reference" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-border shadow-card">
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <CardTitle className="text-base">Recent advances</CardTitle>
              <Button variant="outline" size="sm" onClick={exportAdvances} disabled={!advances?.length}>
                <Download className="h-4 w-4 mr-1" /> Export CSV
              </Button>
            </CardHeader>
            <CardContent>
              {!advances?.length ? <p className="text-sm text-muted-foreground">No advances yet.</p> : (
                <div className="space-y-2">
                  {advances.map((a: any) => (
                    <div key={a.id} className="flex items-center justify-between gap-2 rounded-md border border-border p-2 text-sm">
                      <div className="min-w-0">
                        <p className="font-medium truncate">{staffName(a.staff_user_id)}</p>
                        <p className="text-xs text-muted-foreground">{a.given_on}{a.note ? ` · ${a.note}` : ''}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge variant="outline">{a.deducted_run_id ? 'Settled' : 'Pending'}</Badge>
                        <span className="font-semibold">₹{Number(a.amount).toLocaleString('en-IN')}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={!!payRun} onOpenChange={(o) => { if (!o) { setPayRun(null); setPayAmount(''); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Mark salary paid</DialogTitle></DialogHeader>
          {payRun && (
            <div className="space-y-3 text-sm">
              <p><strong>{staffName(payRun.staff_user_id)}</strong> — {payRun.month}/{payRun.year}</p>
              <p>Net ₹{Number(payRun.net).toLocaleString('en-IN')} · Paid ₹{Number(payRun.paid_amount || 0).toLocaleString('en-IN')}</p>
              <div>
                <Label>Amount to pay now (₹)</Label>
                <Input type="number" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayRun(null)}>Cancel</Button>
            <Button onClick={confirmPay} disabled={busy} className="gradient-primary text-primary-foreground">Confirm</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SalaryManagement;
