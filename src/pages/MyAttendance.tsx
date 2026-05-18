import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay } from 'date-fns';

const statusBg: Record<string, string> = {
  present: 'bg-success/20 text-success border-success/40',
  late: 'bg-warning/20 text-warning border-warning/40',
  half_day: 'bg-accent text-accent-foreground border-accent',
  absent: 'bg-destructive/20 text-destructive border-destructive/40',
};

const MyAttendance = () => {
  const { staff } = useAuth();
  const [month, setMonth] = useState(format(new Date(), 'yyyy-MM'));

  const range = useMemo(() => {
    const [y, m] = month.split('-').map(Number);
    const start = startOfMonth(new Date(y, m - 1, 1));
    const end = endOfMonth(start);
    return { start, end, days: eachDayOfInterval({ start, end }) };
  }, [month]);

  const { data: rows } = useQuery({
    queryKey: ['my-att', staff?.user_id, month],
    enabled: !!staff?.user_id,
    queryFn: async () => {
      const { data } = await supabase.from('attendance' as any)
        .select('*').eq('staff_user_id', staff!.user_id)
        .gte('date', format(range.start, 'yyyy-MM-dd')).lte('date', format(range.end, 'yyyy-MM-dd'));
      return (data as any[]) || [];
    },
  });

  const byDate = useMemo(() => {
    const m: Record<string, any> = {};
    rows?.forEach((r) => { m[r.date] = r; });
    return m;
  }, [rows]);

  const summary = useMemo(() => {
    const s = { present: 0, late: 0, half_day: 0, absent: 0, hours: 0 };
    rows?.forEach((r: any) => {
      (s as any)[r.status] = ((s as any)[r.status] || 0) + 1;
      s.hours += (r.worked_minutes || 0) / 60;
    });
    const totalDays = range.days.length;
    const pct = totalDays ? Math.round(((s.present + s.late + s.half_day * 0.5) / totalDays) * 100) : 0;
    return { ...s, pct };
  }, [rows, range]);

  // align grid to Sunday start
  const leadingBlanks = getDay(range.start);

  return (
    <div className="p-4 lg:p-8 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">My monthly attendance</h1>
        <p className="text-sm text-muted-foreground mt-1">Calendar view of your punches</p>
      </div>

      <Card className="border-border shadow-card">
        <CardContent className="p-4 grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label>Month</Label>
            <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {(['present', 'late', 'half_day', 'absent'] as const).map((k) => (
          <Card key={k} className="border-border"><CardContent className="p-3">
            <p className="text-xs text-muted-foreground uppercase">{k.replace('_', ' ')}</p>
            <p className="text-2xl font-bold">{(summary as any)[k] || 0}</p>
          </CardContent></Card>
        ))}
        <Card className="border-border"><CardContent className="p-3">
          <p className="text-xs text-muted-foreground uppercase">Attendance %</p>
          <p className="text-2xl font-bold text-primary">{summary.pct}%</p>
          <p className="text-xs text-muted-foreground">{summary.hours.toFixed(1)} hours total</p>
        </CardContent></Card>
      </div>

      <Card className="border-border shadow-card">
        <CardHeader className="pb-3"><CardTitle className="text-base">Calendar</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-7 gap-1 text-xs">
            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
              <div key={i} className="p-2 text-center font-semibold text-muted-foreground">{d}</div>
            ))}
            {Array.from({ length: leadingBlanks }).map((_, i) => <div key={`b${i}`} />)}
            {range.days.map((d) => {
              const key = format(d, 'yyyy-MM-dd');
              const r = byDate[key];
              const cls = r ? statusBg[r.status] : 'bg-muted/40 text-muted-foreground border-border';
              return (
                <div key={key} className={`min-h-[60px] rounded-md border p-1.5 ${cls}`}>
                  <div className="text-sm font-bold">{format(d, 'd')}</div>
                  {r && (
                    <>
                      <div className="text-[10px] capitalize">{r.status.replace('_', ' ')}</div>
                      {!!r.worked_minutes && (
                        <div className="text-[10px]">{Math.floor(r.worked_minutes / 60)}h{r.worked_minutes % 60}m</div>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default MyAttendance;
