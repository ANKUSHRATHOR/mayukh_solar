import { useNavigate } from 'react-router-dom';
import { AlertTriangle, CalendarClock, PhoneOff, Timer, TrendingDown, Truck } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import SectionCard from '@/components/common/SectionCard';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface ActionItem {
  key: string;
  label: string;
  description: string;
  count: number;
  icon: LucideIcon;
  tone: 'danger' | 'warning' | 'info';
  /** Opens the exact records — a drill-down, or the list page that owns them. */
  onOpen: () => void;
  /** Secondary route, when the right place to act is a different screen. */
  goTo?: { label: string; path: string };
}

const toneRing = {
  danger: 'border-destructive/40 bg-destructive/5',
  warning: 'border-warning/40 bg-warning/5',
  info: 'border-info/40 bg-info/5',
};

const toneText = {
  danger: 'text-destructive',
  warning: 'text-warning',
  info: 'text-info',
};

interface ActionCenterProps {
  dueToday: number;
  overdue: number;
  followUpsOverdue: number;
  notAttempted: number;
  projectsDelayed: number;
  belowTarget: number;
  onDrill: (bucket: 'due_today' | 'overdue', title: string) => void;
}

/**
 * What to do next, not what happened.
 *
 * A performance screen that only reports is a screen people read once a month.
 * These six are the states that need somebody to act today, each one a count
 * that opens the records inside it — the same drill-down the tiles use, or the
 * list page that already owns that work. Nothing here can change a record on
 * its own: acting means going to the screen whose permissions govern it, so an
 * operator who cannot reassign a lead still cannot.
 *
 * Rows with nothing in them are dropped rather than shown as zeroes. A wall of
 * green zeroes is noise; an empty section is the answer.
 */
const ActionCenter = ({
  dueToday,
  overdue,
  followUpsOverdue,
  notAttempted,
  projectsDelayed,
  belowTarget,
  onDrill,
}: ActionCenterProps) => {
  const navigate = useNavigate();

  const all: ActionItem[] = [
    {
      key: 'due_today',
      label: 'Due today',
      description: 'Open work whose due date is today.',
      count: dueToday,
      icon: CalendarClock,
      tone: 'info',
      onOpen: () => onDrill('due_today', 'Due today'),
      goTo: { label: 'Tasks', path: '/tasks' },
    },
    {
      key: 'overdue',
      label: 'Overdue work',
      description: 'Past its due date and neither completed nor cancelled.',
      count: overdue,
      icon: AlertTriangle,
      tone: 'danger',
      onOpen: () => onDrill('overdue', 'Overdue work'),
    },
    {
      key: 'follow_ups',
      label: 'Follow-ups overdue',
      description: 'Leads promised a call back on a date now past.',
      count: followUpsOverdue,
      icon: Timer,
      tone: 'danger',
      onOpen: () => navigate('/leads?view=follow_up'),
      goTo: { label: 'Leads', path: '/leads' },
    },
    {
      key: 'not_attempted',
      label: 'Never dialled',
      description: 'Leads assigned in this period that nobody has called.',
      count: notAttempted,
      icon: PhoneOff,
      tone: 'warning',
      onOpen: () => navigate('/leads?view=new'),
      goTo: { label: 'Leads', path: '/leads' },
    },
    {
      key: 'delayed',
      label: 'Projects delayed',
      description: 'Past their expected install date and still running.',
      count: projectsDelayed,
      icon: Truck,
      tone: 'warning',
      onOpen: () => navigate('/projects'),
    },
    {
      key: 'below_target',
      label: 'Below target',
      description: 'People tracking under their pro-rated target for this period.',
      count: belowTarget,
      icon: TrendingDown,
      tone: 'warning',
      onOpen: () => {
        document.getElementById('performance-leaderboard')?.scrollIntoView({ behavior: 'smooth' });
      },
    },
  ];

  const items = all.filter((item) => item.count > 0);

  if (items.length === 0) {
    return (
      <SectionCard title="Needs attention" description="Nothing is late, unattempted or behind.">
        <p className="py-4 text-center text-sm text-muted-foreground">
          Nothing needs chasing for this period and selection.
        </p>
      </SectionCard>
    );
  }

  return (
    <SectionCard
      title="Needs attention"
      description="Counts that somebody has to act on. Open one to see exactly which records."
      icon={AlertTriangle}
    >
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <div
            key={item.key}
            className={cn('flex items-start gap-3 rounded-xl border p-3', toneRing[item.tone])}
          >
            <item.icon className={cn('mt-0.5 h-4 w-4 shrink-0', toneText[item.tone])} />
            <div className="min-w-0 flex-1">
              <p className="flex items-baseline gap-2">
                <span className={cn('text-xl font-extrabold tabular-nums', toneText[item.tone])}>
                  {item.count}
                </span>
                <span className="truncate text-sm font-semibold text-foreground">{item.label}</span>
              </p>
              <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                {item.description}
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="h-8 px-2.5 text-xs"
                  onClick={item.onOpen}
                >
                  See records
                </Button>
                {item.goTo && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-8 px-2.5 text-xs"
                    onClick={() => navigate(item.goTo!.path)}
                  >
                    {item.goTo.label}
                  </Button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </SectionCard>
  );
};

export default ActionCenter;
