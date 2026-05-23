import { forwardRef } from 'react';
import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StatCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  change?: string;
  changeType?: 'up' | 'down' | 'neutral';
  className?: string;
  onClick?: () => void;
  accent?: 'primary' | 'success' | 'warning' | 'info' | 'destructive';
}

const accentMap: Record<NonNullable<StatCardProps['accent']>, string> = {
  primary: 'from-primary/25 to-primary/0 text-primary',
  success: 'from-success/25 to-success/0 text-success',
  warning: 'from-warning/25 to-warning/0 text-warning',
  info: 'from-info/25 to-info/0 text-info',
  destructive: 'from-destructive/25 to-destructive/0 text-destructive',
};

const StatCard = forwardRef<HTMLDivElement, StatCardProps>(
  ({ title, value, icon: Icon, change, changeType = 'neutral', className, onClick, accent = 'primary' }, ref) => {
    const interactive = typeof onClick === 'function';
    return (
      <div
        ref={ref}
        onClick={onClick}
        role={interactive ? 'button' : undefined}
        tabIndex={interactive ? 0 : undefined}
        onKeyDown={interactive ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick?.(); } } : undefined}
        className={cn(
          'group relative overflow-hidden rounded-2xl p-5 bento transition-all duration-300 animate-in-up',
          interactive && 'cursor-pointer hover:-translate-y-0.5 hover:shadow-elevated focus:outline-none focus:ring-2 focus:ring-primary/50',
          className,
        )}
      >
        <div className={cn('pointer-events-none absolute -top-16 -right-16 h-44 w-44 rounded-full bg-gradient-to-br opacity-50 blur-3xl transition-opacity group-hover:opacity-80', accentMap[accent])} />
        <div className="relative flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-semibold">{title}</p>
            <p className="text-3xl font-extrabold mt-2 text-display tabular-nums leading-none">{value}</p>
            {change && (
              <p className={cn(
                'text-xs mt-2 font-medium inline-flex items-center gap-1',
                changeType === 'up' && 'text-success',
                changeType === 'down' && 'text-destructive',
                changeType === 'neutral' && 'text-muted-foreground'
              )}>
                <span className={cn('h-1.5 w-1.5 rounded-full',
                  changeType === 'up' && 'bg-success',
                  changeType === 'down' && 'bg-destructive',
                  changeType === 'neutral' && 'bg-muted-foreground/50')} />
                {change}
              </p>
            )}
          </div>
          <div className={cn('relative p-3 rounded-xl bg-background/70 border border-border/80 shrink-0 backdrop-blur', accentMap[accent].split(' ').pop())}>
            <Icon className="h-5 w-5" />
            <span className="pointer-events-none absolute inset-0 rounded-xl ring-1 ring-inset ring-white/5" />
          </div>
        </div>
      </div>
    );
  }
);

StatCard.displayName = 'StatCard';

export default StatCard;
