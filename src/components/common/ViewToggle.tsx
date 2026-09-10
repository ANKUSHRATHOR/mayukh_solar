import { LayoutGrid, Rows3 } from 'lucide-react';
import { Button } from '@/components/ui/button';

export type TableView = 'table' | 'cards';

/**
 * Table or cards, the reader's choice.
 *
 * Shown at every width. It was `hidden md:flex`, which meant a window even a
 * few pixels under 768px got the card layout and no way to leave it — the
 * control disappeared exactly when it was needed. On a phone the label still
 * hides, but the icons stay tappable.
 *
 * Lives here rather than on the payments page because every list offers it now.
 */
const ViewToggle = ({
  view,
  onChange,
}: {
  view: TableView;
  onChange: (value: TableView) => void;
}) => (
  <div className="flex h-11 shrink-0 items-center rounded-lg border border-border/70 p-0.5 sm:h-9">
    {([
      { value: 'table', label: 'Table', icon: Rows3 },
      { value: 'cards', label: 'Cards', icon: LayoutGrid },
    ] as const).map(({ value, label, icon: Icon }) => (
      <Button
        key={value}
        type="button"
        variant={view === value ? 'secondary' : 'ghost'}
        size="sm"
        className="h-full gap-1.5 px-2.5 text-xs font-semibold sm:px-2"
        onClick={() => onChange(value)}
        aria-pressed={view === value}
        aria-label={`Show as ${label.toLowerCase()}`}
      >
        <Icon className="h-3.5 w-3.5" />
        <span className="hidden lg:inline">{label}</span>
      </Button>
    ))}
  </div>
);

export default ViewToggle;
