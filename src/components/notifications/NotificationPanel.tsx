import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Bell, CheckCheck, Mail, MailOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';

interface Notification {
  id: string;
  title: string;
  message: string;
  type: string;
  is_read: boolean;
  created_at: string;
  entity_type: string | null;
  entity_id: string | null;
}

type Filter = 'all' | 'unread';

const entityRoute = (entity_type?: string | null, entity_id?: string | null): string | null => {
  if (!entity_type || !entity_id) return null;
  switch (entity_type) {
    case 'lead': return `/leads/${entity_id}`;
    case 'project': return `/projects/${entity_id}`;
    case 'task': return `/tasks`;
    case 'attendance_event':
    case 'attendance': return `/attendance`;
    case 'punch_out_request': return `/attendance`;
    case 'document': return `/projects`;
    default: return null;
  }
};

const typeIcon: Record<string, string> = {
  lead_assigned: '📋', lead: '📋',
  task_assigned: '✅', task: '✅',
  project_status: '🏗️', worker_assigned: '🔧', project: '🏗️',
  document_rejected: '📄', document: '📄',
  attendance_rejected: '⚠️', punch_out_request: '🛵', punch_out_review: '🛵',
  staff: '👤', info: 'ℹ️', warning: '⚠️', success: '✅',
};

const NotificationPanel = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');

  const fetchNotifications = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50);
    setNotifications((data as Notification[]) || []);
  };

  useEffect(() => {
    if (!user) {
      setNotifications([]);
      return;
    }

    fetchNotifications();

    const channelName = `user-notifications-${user.id}`;
    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${user.id}`,
      }, (payload) => {
        setNotifications((prev) => {
          const n = payload.new as Notification;
          if (prev.some((p) => p.id === n.id)) return prev;
          return [n, ...prev].slice(0, 50);
        });
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${user.id}`,
      }, (payload) => {
        const updated = payload.new as Notification;
        setNotifications((prev) => prev.map((n) => (n.id === updated.id ? { ...n, ...updated } : n)));
      })
      .on('postgres_changes', {
        event: 'DELETE',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${user.id}`,
      }, (payload) => {
        const old = payload.old as Notification;
        setNotifications((prev) => prev.filter((n) => n.id !== old.id));
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user?.id]);

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  const markAllRead = async () => {
    if (!user || unreadCount === 0) return;
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', user.id)
      .eq('is_read', false);
  };

  const toggleRead = async (n: Notification, e: React.MouseEvent) => {
    e.stopPropagation();
    setNotifications((prev) => prev.map((p) => (p.id === n.id ? { ...p, is_read: !n.is_read } : p)));
    await supabase.from('notifications').update({ is_read: !n.is_read }).eq('id', n.id);
  };

  const openNotification = async (n: Notification) => {
    if (!n.is_read) {
      setNotifications((prev) => prev.map((p) => (p.id === n.id ? { ...p, is_read: true } : p)));
      await supabase.from('notifications').update({ is_read: true }).eq('id', n.id);
    }
    const route = entityRoute(n.entity_type, n.entity_id);
    if (route) {
      setOpen(false);
      navigate(route);
    }
  };

  const visible = filter === 'unread' ? notifications.filter((n) => !n.is_read) : notifications;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 h-4 min-w-[1rem] px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] flex items-center justify-center font-bold">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[22rem] p-0" align="end">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <p className="font-semibold text-sm">Notifications</p>
            {unreadCount > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/15 text-primary font-semibold">
                {unreadCount} new
              </span>
            )}
          </div>
          {unreadCount > 0 && (
            <button onClick={markAllRead} className="text-xs text-primary hover:underline flex items-center gap-1">
              <CheckCheck className="h-3.5 w-3.5" />
              Mark all read
            </button>
          )}
        </div>
        <div className="flex gap-1 px-3 pt-2 border-b border-border pb-2">
          {(['all', 'unread'] as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                'text-xs px-3 py-1 rounded-full font-medium transition-colors',
                filter === f
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted'
              )}
            >
              {f === 'all' ? 'All' : `Unread${unreadCount ? ` (${unreadCount})` : ''}`}
            </button>
          ))}
        </div>
        <ScrollArea className="max-h-96">
          {visible.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-10">
              {filter === 'unread' ? "You're all caught up." : 'No notifications yet'}
            </p>
          ) : (
            <div className="divide-y divide-border">
              {visible.map((n) => (
                <div
                  key={n.id}
                  onClick={() => openNotification(n)}
                  className={cn(
                    'px-4 py-3 text-sm transition-colors cursor-pointer hover:bg-accent/40 group',
                    !n.is_read && 'bg-primary/5'
                  )}
                >
                  <div className="flex items-start gap-2.5">
                    <span className="text-base shrink-0 mt-0.5">{typeIcon[n.type] || 'ℹ️'}</span>
                    <div className="min-w-0 flex-1">
                      <p className={cn('leading-tight text-foreground', !n.is_read ? 'font-semibold' : 'font-medium')}>
                        {n.title}
                      </p>
                      <p className="text-muted-foreground text-xs mt-0.5 leading-snug line-clamp-2">{n.message}</p>
                      <p className="text-muted-foreground/60 text-[10px] mt-1">
                        {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                      </p>
                    </div>
                    <button
                      onClick={(e) => toggleRead(n, e)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground shrink-0"
                      aria-label={n.is_read ? 'Mark unread' : 'Mark read'}
                    >
                      {n.is_read ? <Mail className="h-3.5 w-3.5" /> : <MailOpen className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
};

export default NotificationPanel;
