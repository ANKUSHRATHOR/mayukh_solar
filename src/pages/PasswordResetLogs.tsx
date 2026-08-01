import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, KeyRound, ShieldAlert } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface LogRow {
  id: string;
  created_at: string;
  staff_user_id: string;
  reset_by_user_id: string;
  meta: any;
  staff_name?: string;
  reset_by_name?: string;
}

const PasswordResetLogs = () => {
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await supabase
          .from('password_reset_logs')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(200);
        if (error) throw error;

        const ids = Array.from(
          new Set([
            ...(data || []).map((l) => l.staff_user_id),
            ...(data || []).map((l) => l.reset_by_user_id),
          ])
        );
        const { data: staffRows } = await supabase
          .from('staff')
          .select('user_id, full_name')
          .in('user_id', ids);
        const nameMap = new Map<string, string>(
          (staffRows || []).map((s) => [s.user_id, s.full_name])
        );

        setLogs(
          (data || []).map((l) => ({
            ...l,
            staff_name: nameMap.get(l.staff_user_id) || 'Unknown',
            reset_by_name: nameMap.get(l.reset_by_user_id) || 'Admin',
          }))
        );
      } catch (err: any) {
        toast({ title: 'Error', description: err.message, variant: 'destructive' });
      } finally {
        setLoading(false);
      }
    })();
  }, [toast]);

  return (
    <div className="p-6 lg:p-8 max-w-4xl mx-auto space-y-6 animate-in-up">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/users')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-display text-2xl">Password Reset Logs</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Audit trail of admin-issued password resets.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Loading logs...</div>
      ) : logs.length === 0 ? (
        <div className="bento p-10 text-center">
          <ShieldAlert className="mx-auto h-12 w-12 text-muted-foreground/40 mb-4" />
          <p className="text-muted-foreground">No password resets have been issued yet.</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {logs.map((l) => (
            <div
              key={l.id}
              className="bento p-4 flex items-start gap-4 transition-shadow hover:shadow-elevated"
            >
              <div className="h-10 w-10 rounded-full bg-warning/15 flex items-center justify-center shrink-0">
                <KeyRound className="h-5 w-5 text-warning" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm">
                  <span className="font-semibold text-foreground">{l.reset_by_name}</span>{' '}
                  <span className="text-muted-foreground">reset password for</span>{' '}
                  <span className="font-semibold text-foreground">{l.staff_name}</span>
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {new Date(l.created_at).toLocaleString()} ·{' '}
                  {formatDistanceToNow(new Date(l.created_at), { addSuffix: true })}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default PasswordResetLogs;
