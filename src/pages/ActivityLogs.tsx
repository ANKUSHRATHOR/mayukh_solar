import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, ShieldCheck, Trash2, XCircle, Activity, User, Monitor, Smartphone, Download } from 'lucide-react';
import { downloadCsv } from '@/lib/exportCsv';

const actionLabel = (action: string) => action.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

const actionIcon = (action: string) => {
  if (action.includes('deleted')) return Trash2;
  if (action.includes('cancelled') || action.includes('rejected')) return XCircle;
  if (action === 'login' || action === 'logout') return User;
  return Activity;
};

const detectDevice = (ua?: string | null) => {
  if (!ua) return { label: '—', icon: Monitor };
  const s = ua.toLowerCase();
  const mobile = /android|iphone|ipad|ipod|mobile/.test(s);
  let os = 'Unknown';
  if (s.includes('android')) os = 'Android';
  else if (s.includes('iphone') || s.includes('ipad') || s.includes('ios')) os = 'iOS';
  else if (s.includes('windows')) os = 'Windows';
  else if (s.includes('mac os')) os = 'macOS';
  else if (s.includes('linux')) os = 'Linux';
  let browser = 'Browser';
  if (s.includes('edg/')) browser = 'Edge';
  else if (s.includes('chrome/') && !s.includes('edg/')) browser = 'Chrome';
  else if (s.includes('firefox/')) browser = 'Firefox';
  else if (s.includes('safari/') && !s.includes('chrome/')) browser = 'Safari';
  return { label: `${os} · ${browser}`, icon: mobile ? Smartphone : Monitor };
};

const ActivityLogs = () => {
  const [logs, setLogs] = useState<any[]>([]);
  const [staff, setStaff] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState<string>('all');

  const fetchLogs = async () => {
    setLoading(true);
    const [logsRes, staffRes] = await Promise.all([
      supabase.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(300),
      supabase.from('staff').select('user_id, full_name'),
    ]);
    setLogs(logsRes.data || []);
    setStaff(staffRes.data || []);
    setLoading(false);
  };

  useEffect(() => { fetchLogs(); }, []);

  const staffName = (userId: string | null) =>
    !userId ? 'System' : staff.find((s) => s.user_id === userId)?.full_name || 'Unknown user';

  const reasonText = (log: any) => {
    const nv = log.new_value || {}; const ov = log.old_value || {};
    return nv.reason || nv.cancelled_reason_other || nv.cancelled_reason || nv.rejection_reason || ov.cancelled_reason_other || ov.special_notes || '—';
  };

  const allActions = useMemo(() => Array.from(new Set(logs.map((l) => l.action))).sort(), [logs]);

  const filtered = logs.filter((log) => {
    if (actionFilter !== 'all' && log.action !== actionFilter) return false;
    const text = `${log.action} ${log.entity_type} ${log.entity_id} ${staffName(log.user_id)} ${reasonText(log)}`.toLowerCase();
    return !search || text.includes(search.toLowerCase());
  });

  const exportLogs = () => {
    downloadCsv('activity-logs.csv', [
      { header: 'When', value: (l: any) => new Date(l.created_at).toLocaleString() },
      { header: 'Action', value: (l: any) => l.action },
      { header: 'Entity', value: (l: any) => l.entity_type },
      { header: 'Entity ID', value: (l: any) => l.entity_id || '' },
      { header: 'User', value: (l: any) => staffName(l.user_id) },
      { header: 'Device', value: (l: any) => detectDevice(l.new_value?.user_agent).label },
      { header: 'Reason / Detail', value: (l: any) => reasonText(l) },
    ], filtered);
  };

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
            <ShieldCheck className="h-6 w-6 text-primary" /> Activity Logs
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">All audit events — login, leads, documents, attendance, salary.</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search..." className="pl-10" />
          </div>
          <Select value={actionFilter} onValueChange={setActionFilter}>
            <SelectTrigger className="w-full sm:w-56"><SelectValue placeholder="All actions" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All actions</SelectItem>
              {allActions.map((a) => <SelectItem key={a} value={a}>{actionLabel(a)}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={exportLogs}><Download className="h-4 w-4 mr-1" /> Export</Button>
        </div>
      </div>

      <div className="space-y-3">
        {loading ? (
          <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">Loading...</CardContent></Card>
        ) : filtered.length === 0 ? (
          <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">No activity found.</CardContent></Card>
        ) : filtered.map((log) => {
          const Icon = actionIcon(log.action);
          const dev = detectDevice(log.new_value?.user_agent);
          const DevIcon = dev.icon;
          return (
            <Card key={log.id} className="border-border shadow-card">
              <CardContent className="p-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex min-w-0 gap-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-accent text-accent-foreground">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="font-bold text-foreground">{actionLabel(log.action)}</h2>
                        <Badge variant="outline" className="rounded-full text-xs">{log.entity_type}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">Record: <span className="font-medium text-foreground">{log.entity_id || '—'}</span></p>
                      <p className="text-sm text-muted-foreground">Detail: <span className="font-medium text-foreground">{reasonText(log)}</span></p>
                    </div>
                  </div>
                  <div className="shrink-0 space-y-1 text-left sm:text-right">
                    <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground sm:justify-end">
                      <User className="h-3.5 w-3.5" /> {staffName(log.user_id)}
                    </p>
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground sm:justify-end">
                      <DevIcon className="h-3.5 w-3.5" /> {dev.label}
                    </p>
                    <p className="text-xs text-muted-foreground">{new Date(log.created_at).toLocaleString()}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
};

export default ActivityLogs;
