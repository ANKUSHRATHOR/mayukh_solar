import { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface PageHeaderProps {
  title: string;
  /** Short line under the title. Say what the page is for, not what it is. */
  description?: string;
  icon?: LucideIcon;
  /** Renders a back button. `true` goes back in history; a string navigates there. */
  back?: boolean | string;
  /** Buttons, menus, export — right-aligned on desktop, wrapped below on mobile. */
  actions?: ReactNode;
  /** Badges or meta shown inline after the title (status pills, record codes). */
  meta?: ReactNode;
  className?: string;
}

/**
 * Standard page heading. Every list, form and detail page uses this so titles,
 * back affordances and action placement stay in the same spot across modules.
 */
const PageHeader = ({
  title,
  description,
  icon: Icon,
  back,
  actions,
  meta,
  className,
}: PageHeaderProps) => {
  const navigate = useNavigate();

  return (
    <div className={cn('flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between', className)}>
      <div className="flex min-w-0 items-start gap-3">
        {back && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Go back"
            className="mt-0.5 h-11 w-11 shrink-0 sm:h-9 sm:w-9"
            onClick={() => (typeof back === 'string' ? navigate(back) : navigate(-1))}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
        )}
        {Icon && !back && (
          <div className="mt-0.5 shrink-0 rounded-xl border border-border/80 bg-background/70 p-2.5 text-primary backdrop-blur">
            <Icon className="h-5 w-5" />
          </div>
        )}
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-xl font-extrabold leading-tight text-foreground text-display sm:text-2xl">
              {title}
            </h1>
            {meta}
          </div>
          {description && (
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{description}</p>
          )}
        </div>
      </div>

      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
};

export default PageHeader;
