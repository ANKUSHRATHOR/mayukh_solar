import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import StatCard from '@/components/dashboard/StatCard';
import { Button } from '@/components/ui/button';
import {
  PhoneCall,
  Users,
  TrendingUp,
  Calendar,
  PhoneOff,
  PhoneForwarded,
  MapPin,
  AlertTriangle,
  ArrowRight,
} from 'lucide-react';
import { fetchTelecallerDayStats, type TelecallerDayStats } from '@/lib/calls';

/**
 * A telecaller's own day.
 *
 * The lead list that used to sit here was a second, weaker copy of /leads: its
 * own filter chips, its own row layout, capped at 500 rows and filtered in the
 * browser. The dashboard now answers "how is today going, and what do I owe?"
 * and hands off to the Leads page for the working list.
 */
const TelecallerDashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState({ total: 0, thisMonth: 0, today: 0 });
  // Today's calling figures, from one RPC. Null until it answers — and it stays
  // null if it fails, so the tiles are absent rather than showing a false zero.
  const [day, setDay] = useState<TelecallerDayStats | null>(null);

  const fetchStats = useCallback(async () => {
    if (!user) return;

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();

    // A telecaller works the leads they created *and* the ones an admin assigned
    // to them. Filtering on created_by alone hid every assigned lead, even
    // though RLS grants access to both.
    const ownScope = `created_by_user_id.eq.${user.id},assigned_to_user_id.eq.${user.id},assigned_telecaller_id.eq.${user.id}`;

    const [totalRes, monthRes, todayRes] = await Promise.all([
      supabase.from('leads').select('id', { count: 'exact', head: true }).or(ownScope),
      supabase.from('leads').select('id', { count: 'exact', head: true }).or(ownScope).gte('created_at', startOfMonth),
      supabase.from('leads').select('id', { count: 'exact', head: true }).or(ownScope).gte('created_at', startOfDay),
    ]);

    setStats({
      total: totalRes.count || 0,
      thisMonth: monthRes.count || 0,
      today: todayRes.count || 0,
    });
  }, [user]);

  const loadDayStats = useCallback(() => {
    if (!user) return;
    fetchTelecallerDayStats().then(setDay).catch(() => setDay(null));
  }, [user]);

  useEffect(() => { void fetchStats(); loadDayStats(); }, [fetchStats, loadDayStats]);

  useEffect(() => {
    if (!user) return;
    // postgres_changes takes a single equality filter, so assigned and created
    // leads need one subscription each — without the second, a lead assigned to
    // this telecaller would not move the counts until a manual reload.
    const channel = supabase
      .channel(`telecaller-leads-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leads', filter: `created_by_user_id=eq.${user.id}` }, () => void fetchStats())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leads', filter: `assigned_to_user_id=eq.${user.id}` }, () => void fetchStats())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leads', filter: `assigned_telecaller_id=eq.${user.id}` }, () => void fetchStats())
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [user, fetchStats]);

  // A call logged on a lead page changes these numbers, and a telecaller moves
  // between the two all day; refresh when the tab regains focus rather than
  // leaving this morning's tally on screen.
  useEffect(() => {
    const onFocus = () => loadDayStats();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [loadDayStats]);

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Telecaller Dashboard</h1>
        </div>
        <Button onClick={() => navigate('/leads/new')} className="gradient-primary text-primary-foreground font-semibold">
          <PhoneCall className="mr-2 h-4 w-4" /> Create New Lead
        </Button>
      </div>

      {/* Today first: a telecaller's day is judged on calls made, not on the
          lifetime lead count that used to lead this page. */}
      {day && (
        <section className="space-y-3">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-sm font-bold text-foreground">Today</h2>
            <p className="text-xs text-muted-foreground">
              {day.month_calls} call{day.month_calls === 1 ? '' : 's'} this month
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard title="Dialled" value={day.dialed} icon={PhoneCall} accent="primary" />
            <StatCard title="Connected" value={day.connected} icon={PhoneForwarded} accent="success" />
            <StatCard title="Not Connected" value={day.not_connected} icon={PhoneOff} accent="warning" />
            <StatCard title="Visits Created" value={day.visits_created} icon={MapPin} accent="info" />
          </div>

          {/* What the talking produced, and what is still owed. Read as a line
              rather than more tiles — these qualify the figures above, they are
              not four more headline numbers. */}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border border-border bg-card px-4 py-3 text-xs">
            <span className="text-muted-foreground">
              Interested <span className="font-bold text-success">{day.interested}</span>
            </span>
            <span className="text-muted-foreground">
              Follow-up <span className="font-bold text-warning">{day.follow_up}</span>
            </span>
            <span className="text-muted-foreground">
              Not interested <span className="font-bold text-foreground">{day.not_interested}</span>
            </span>
            <span className="text-muted-foreground">
              New leads <span className="font-bold text-foreground">{day.leads_created}</span>
            </span>
            {day.unlogged > 0 && (
              <span className="text-muted-foreground">
                Dialled, not logged <span className="font-bold text-foreground">{day.unlogged}</span>
              </span>
            )}
          </div>

          {(day.follow_ups_due_today > 0 || day.follow_ups_overdue > 0) && (
            <button
              type="button"
              onClick={() => navigate('/leads')}
              className="flex w-full items-center gap-2 rounded-xl border border-warning/30 bg-warning/5 px-4 py-3 text-left text-xs font-semibold text-foreground transition-colors hover:bg-warning/10"
            >
              <AlertTriangle className="h-4 w-4 shrink-0 text-warning" />
              {day.follow_ups_due_today} follow-up{day.follow_ups_due_today === 1 ? '' : 's'} due today
              {day.follow_ups_overdue > 0 && (
                <span className="text-destructive">· {day.follow_ups_overdue} overdue</span>
              )}
            </button>
          )}
        </section>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard title="Total Leads" value={stats.total} icon={Users} />
        <StatCard title="This Month" value={stats.thisMonth} icon={TrendingUp} />
        <StatCard title="Today" value={stats.today} icon={Calendar} />
      </div>

      {/* The working list lives on /leads, which searches, filters and pages in
          the database rather than over the first 500 rows. */}
      <Button
        variant="outline"
        className="h-11 w-full justify-between"
        onClick={() => navigate('/leads')}
      >
        <span>Open my leads</span>
        <ArrowRight className="h-4 w-4" />
      </Button>
    </div>
  );
};

export default TelecallerDashboard;
