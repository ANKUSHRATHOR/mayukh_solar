// Staff performance dashboard with CSV export — admin only.
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Download } from 'lucide-react';
import { format, startOfMonth } from 'date-fns';
import { downloadCsv } from '@/lib/exportCsv';

const StaffPerformance = () => {
  const today = new Date();
  const [from, setFrom] = useState(format(startOfMonth(today), 'yyyy-MM-dd'));
  const [to, setTo] = useState(format(today, 'yyyy-MM-dd'));

  const { data, isLoading } = useQuery({
    queryKey: ['staff-performance', from, to],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('staff_performance' as any, { _from: from, _to: to });
      if (error) throw error;
      return (data as any[]) || [];
    },
  });

  const exportCsv = () => {
    downloadCsv(`staff-performance-${from}_${to}.csv`, [
      { header: 'Name', value: (r: any) => r.full_name },
      { header: 'Role', value: (r: any) => r.role },
      { header: 'Leads Created', value: (r: any) => r.leads_created },
      { header: 'Leads Assigned', value: (r: any) => r.leads_assigned },
      { header: 'Projects Completed', value: (r: any) => r.projects_completed },
      { header: 'Present', value: (r: any) => r.present_days },
      { header: 'Absent', value: (r: any) => r.absent_days },
      { header: 'Attendance %', value: (r: any) => r.attendance_pct },
    ], data || []);
  };

  return (
    <div className="p-4 lg:p-8 max-w-6xl mx-auto space-y-6 animate-in-up">
      <div>
        <h1 className="text-2xl font-bold text-display">Staff Performance</h1>
        <p className="text-sm text-muted-foreground mt-1">KPI summary across leads, projects and attendance.</p>
      </div>

      <div className="bento p-4 grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
        <div className="space-y-1.5"><Label>From</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
        <div className="space-y-1.5"><Label>To</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
        <Button variant="outline" onClick={exportCsv} disabled={!data?.length}><Download className="h-4 w-4 mr-1" /> Export CSV</Button>
      </div>

      <div className="bento p-5">
        <h2 className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground mb-3">Results</h2>
        {isLoading ? <p className="text-sm text-muted-foreground">Loading...</p> : !data?.length ? <p className="text-sm text-muted-foreground">No data.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border/60">
                <tr>
                  <th className="py-2">Staff</th><th>Role</th>
                  <th className="text-right">Leads Created</th>
                  <th className="text-right">Leads Assigned</th>
                  <th className="text-right">Projects Done</th>
                  <th className="text-right">Present</th>
                  <th className="text-right">Absent</th>
                  <th className="text-right">Attendance %</th>
                </tr>
              </thead>
              <tbody>
                {data.map((r: any) => (
                  <tr key={r.user_id} className="border-b border-border/30 hover:bg-accent/30 transition-colors">
                    <td className="py-2.5 font-medium">{r.full_name}</td>
                    <td><Badge variant="outline" className="text-xs capitalize">{r.role}</Badge></td>
                    <td className="text-right">{r.leads_created}</td>
                    <td className="text-right">{r.leads_assigned}</td>
                    <td className="text-right">{r.projects_completed}</td>
                    <td className="text-right text-success">{r.present_days}</td>
                    <td className="text-right text-destructive">{r.absent_days}</td>
                    <td className="text-right font-bold text-primary">{r.attendance_pct}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default StaffPerformance;
