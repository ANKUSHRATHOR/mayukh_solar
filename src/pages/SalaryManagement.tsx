import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { Calculator, Save } from 'lucide-react';

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

  const { data: staff } = useQuery({
    queryKey: ['staff-list-salary'],
    queryFn: async () => {
      const { data } = await supabase.from('staff').select('user_id, full_name, mobile').order('full_name');
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

  return (
    <div className="p-4 lg:p-8 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Salary Management</h1>
        <p className="text-sm text-muted-foreground mt-1">Monthly salaries, attendance-based deductions and overtime</p>
      </div>

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

      <Card className="border-border shadow-card">
        <CardHeader className="pb-3"><CardTitle className="text-base">Generate monthly salary</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
          <div className="space-y-1.5">
            <Label>Month</Label>
            <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
          </div>
          <Button onClick={() => compute()} disabled={busy || !staffId}><Calculator className="h-4 w-4 mr-1" /> Compute selected</Button>
          <Button variant="outline" onClick={computeAll} disabled={busy}>Compute all staff</Button>
        </CardContent>
      </Card>

      <Card className="border-border shadow-card">
        <CardHeader className="pb-3"><CardTitle className="text-base">Salary runs — {month}</CardTitle></CardHeader>
        <CardContent>
          {!runs?.length ? <p className="text-sm text-muted-foreground">No salary runs generated for this month yet.</p> : (
            <div className="space-y-2">
              {runs.map((r: any) => (
                <div key={r.id} className="rounded-md border border-border p-3 text-sm">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <p className="font-semibold">{staffName(r.staff_user_id)}</p>
                    <p className="font-bold text-primary">Net ₹{Number(r.net).toLocaleString('en-IN')}</p>
                  </div>
                  <div className="mt-1 grid grid-cols-2 md:grid-cols-6 gap-2 text-xs text-muted-foreground">
                    <span>Present: {r.present_days}</span>
                    <span>Late: {r.late_days}</span>
                    <span>Half: {r.half_days}</span>
                    <span>Absent: {r.absent_days}</span>
                    <span>OT: {Math.floor(r.overtime_minutes / 60)}h</span>
                    <span>Gross ₹{Number(r.gross).toLocaleString('en-IN')} − ₹{Number(r.deductions).toLocaleString('en-IN')}</span>
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

export default SalaryManagement;
