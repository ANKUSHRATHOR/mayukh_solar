import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { resolveStatus, toneClasses, type StatusMeta } from '@/lib/statusMeta';

interface StatusBadgeProps {
  /** The raw enum value, e.g. `quotation_accepted`. */
  value: string | null | undefined;
  /** A map from `@/lib/statusMeta` — leadStatusMeta, projectStatusMeta, etc. */
  map: Record<string, StatusMeta>;
  size?: 'sm' | 'md';
  className?: string;
}

/**
 * Renders a domain status consistently. Unmapped values degrade to a neutral
 * humanized label instead of borrowing another status's colour.
 */
const StatusBadge = ({ value, map, size = 'md', className }: StatusBadgeProps) => {
  const { label, tone } = resolveStatus(map, value);

  return (
    <Badge
      variant="outline"
      className={cn(
        'whitespace-nowrap font-bold uppercase tracking-wide',
        size === 'sm' ? 'px-1.5 py-0 text-[9px]' : 'px-2 py-0.5 text-[10px]',
        toneClasses[tone],
        className
      )}
    >
      {label}
    </Badge>
  );
};

export default StatusBadge;
