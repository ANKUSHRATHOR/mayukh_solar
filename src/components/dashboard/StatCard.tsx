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
}

const StatCard = forwardRef<HTMLDivElement, StatCardProps>(({ title, value, icon: Icon, change, changeType = 'neutral', className, onClick }, ref) => {
  const interactive = typeof onClick === 'function';
  return (
    <div
      ref={ref}
      onClick={onClick}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      onKeyDown={interactive ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick?.(); } } : undefined}
      className={cn(
        'bg-card rounded-xl p-5 shadow-card border border-border hover:shadow-elevated transition-shadow',
        interactive && 'cursor-pointer hover:border-primary/40 active:scale-[0.99] focus:outline-none focus:ring-2 focus:ring-primary/40',
        className,
      )}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-muted-foreground font-medium">{title}</p>
          <p className="text-2xl font-bold mt-1 text-card-foreground">{value}</p>
          {change && (
            <p className={cn(
              'text-xs mt-1.5 font-medium',
              changeType === 'up' && 'text-success',
              changeType === 'down' && 'text-destructive',
              changeType === 'neutral' && 'text-muted-foreground'
            )}>
              {change}
            </p>
          )}
        </div>
        <div className="p-2.5 rounded-lg bg-accent">
          <Icon className="h-5 w-5 text-accent-foreground" />
        </div>
      </div>
    </div>
  );
});

StatCard.displayName = 'StatCard';

export default StatCard;
