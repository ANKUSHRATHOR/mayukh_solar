import type { LucideIcon } from 'lucide-react';
import StatCard from '@/components/dashboard/StatCard';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { Delta } from '@/lib/performance';

interface KpiCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  accent?: 'primary' | 'success' | 'warning' | 'info' | 'destructive';
  /** The formula, in words. Every percentage on this page carries one. */
  formula?: string;
  /** Change against the previous period. `unknown` prints the reason, not a number. */
  delta?: Delta;
  deltaLabel?: string;
  /** Opens the records behind the figure. */
  onClick?: () => void;
}

/**
 * A KPI tile that can explain itself and be opened.
 *
 * `StatCard` unchanged underneath — this adds the two things a performance
 * figure needs that a dashboard tile does not: the formula, so the reader can
 * reconstruct the number, and a click through to the rows it counted, so they
 * can check it. The tooltip also names the comparison period, because "+12%"
 * against an unnamed baseline is not a fact.
 */
const KpiCard = ({
  title,
  value,
  icon,
  accent = 'primary',
  formula,
  delta,
  deltaLabel,
  onClick,
}: KpiCardProps) => {
  // A previous period with nothing in it supports no percentage. Saying so is
  // the whole point — "+100%" from zero reads as a doubling.
  const change =
    delta === undefined
      ? undefined
      : delta.direction === 'unknown'
        ? `No comparison${deltaLabel ? ` vs ${deltaLabel}` : ''}`
        : `${delta.value! > 0 ? '+' : ''}${delta.value}%${deltaLabel ? ` vs ${deltaLabel}` : ''}`;

  const card = (
    <StatCard
      title={title}
      value={value}
      icon={icon}
      accent={accent}
      onClick={onClick}
      change={change}
      changeType={
        delta?.direction === 'up' ? 'up' : delta?.direction === 'down' ? 'down' : 'neutral'
      }
    />
  );

  if (!formula && !onClick) return card;

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>{card}</TooltipTrigger>
        <TooltipContent className="max-w-xs text-xs leading-relaxed">
          {formula && <p>{formula}</p>}
          {onClick && (
            <p className="mt-1 text-muted-foreground">Open the records behind this figure.</p>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

export default KpiCard;
