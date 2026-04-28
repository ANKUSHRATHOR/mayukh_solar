import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Search, ShieldCheck, Trash2, XCircle, Activity, User } from 'lucide-react';

const actionLabel = (action: string) => action.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

const actionIcon = (action: string) => {
  if (action.includes('deleted')) return Trash2;
  if (action.includes('cancelled')) return XCircle;
  return Activity;
};

const ActivityLogs = () => {
  const [logs, setLogs] = useState<any[]>([]);
  const [staff, setStaff] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const fetchLogs = async () => {
    setLoading(true);
    const [logsRes, staffRes] = await Promise.all([
      supabase.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(100),
      supabase.from('staff').select('user_id, full_name'),
    ]);
    setLogs(logsRes.data || []);
    setStaff(staffRes.data || []);
    setLoading(false);
  };

  useEffect(() => { fetchLogs(); }, []);

  const staffName = (userId: string | null) => {
    if (!userId) return 'System';
    return staff.find((s) => s.user_id === userId)?.full_name || 'Unknown user';
  };

  const reasonText = (log: any) => {
    const newValue = log.new_value || {};
    const oldValue = log.old_value || {};
    return newValue.reason || newValue.cancelled_reason_other || newValue.cancelled_reason || oldValue.cancelled_reason_other || oldValue.special_notes || 'No reason recorded';
  };

  const filtered = logs.filter((log) => {
    const text = `${log.action} ${log.entity_type} ${log.entity_id} ${staffName(log.user_id)} ${reasonText(log)}`.toLowerCase();
    return !search || text.includes(search.toLowerCase());
  });

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
            <ShieldCheck className="h-6 w-6 text-primary" /> Activity Logs
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">Track who created, cancelled, deleted, or changed important records.</p>
        </div>
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search logs..." className="pl-10" />
        </div>
      </div>

      <div className="space-y-3">
        {loading ? (
          <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">Loading...</CardContent></Card>
        ) : filtered.length === 0 ? (
          <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">No activity found.</CardContent></Card>
        ) : filtered.map((log) => {
          const Icon = actionIcon(log.action);
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
                      <p className="text-sm text-muted-foreground">
                        Record: <span className="font-medium text-foreground">{log.entity_id || '—'}</span>
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Reason: <span className="font-medium text-foreground">{reasonText(log)}</span>
                      </p>
                    </div>
                  </div>
                  <div className="shrink-0 space-y-1 text-left sm:text-right">
                    <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground sm:justify-end">
                      <User className="h-3.5 w-3.5" /> {staffName(log.user_id)}
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