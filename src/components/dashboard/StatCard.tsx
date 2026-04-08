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
}

const StatCard = forwardRef<HTMLDivElement, StatCardProps>(({ title, value, icon: Icon, change, changeType = 'neutral', className }, ref) => {
  return (
    <div className={cn('bg-card rounded-xl p-5 shadow-card border border-border hover:shadow-elevated transition-shadow', className)}>
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
};

export default StatCard;
