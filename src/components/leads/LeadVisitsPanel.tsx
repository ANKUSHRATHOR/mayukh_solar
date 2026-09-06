import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format, isPast } from 'date-fns';
import {
  CalendarClock,
  CheckCircle2,
  Clock,
  MapPin,
  Navigation,
  User,
  XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import SectionCard from '@/components/common/SectionCard';
import ErrorState from '@/components/common/ErrorState';
import CompleteVisitDialog from './CompleteVisitDialog';
import { cn } from '@/lib/utils';
import { fetchVisits, outcomeLabel, type SiteVisit } from '@/lib/visits';

interface Props {
  leadId: string;
  userId: string;
  staffNames: Record<string, string>;
  onVisitCompleted: () => void;
  /**
   * `card` renders the full visit history section. `banner` renders a slim
   * call-to-action strip only while a visit is scheduled — and nothing at all
   * otherwise, since completed visits already appear in the activity timeline.
   */
  variant?: 'card' | 'banner';
}

/**
 * Booked and completed site visits for a lead.
 *
 * Previously a booked visit was invisible: it only set `leads.follow_up_date`
 * and appeared in the activity timeline as a generic "Note Logged" line, so
 * nobody could see that a visit was scheduled, for when, or for whom.
 */
const LeadVisitsPanel = ({
  leadId,
  userId,
  staffNames,
  onVisitCompleted,
  variant = 'card',
}: Props) => {
  const [completing, setCompleting] = useState<SiteVisit | null>(null);

  const visitsQuery = useQuery({
    queryKey: ['lead-visits', leadId],
    queryFn: () => fetchVisits(leadId),
  });

  const visits = visitsQuery.data ?? [];
  const scheduled = visits.filter((v) => v.visit_status === 'scheduled');

  if (variant === 'banner') {
    // Nothing to act on → nothing on screen. History lives in the timeline.
    if (scheduled.length === 0) return null;

    // Earliest booked visit is the one to act on next.
    const next = [...scheduled].sort(
      (a, b) =>
        new Date(a.scheduled_for ?? a.visit_date ?? 0).getTime() -
        new Date(b.scheduled_for ?? b.visit_date ?? 0).getTime()
    )[0];
    const when = next.scheduled_for ?? next.visit_date;
    const overdue = when ? isPast(new Date(when)) : false;
    const surveyor =
      staffNames[next.assigned_to_user_id ?? ''] ??
      staffNames[next.staff_id] ??
      'Unassigned';

    return (
      <>
        <div
          className={cn(
            'flex flex-wrap items-center gap-3 rounded-2xl border px-4 py-3',
            overdue ? 'border-destructive/30 bg-destructive/5' : 'border-warning/30 bg-warning/5'
          )}
        >
          <span
            className={cn(
              'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl',
              overdue ? 'bg-destructive/15 text-destructive' : 'bg-warning/15 text-warning'
            )}
          >
            <CalendarClock className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Site visit booked
              </p>
              {overdue && (
                <Badge className="border-transparent bg-destructive/15 px-1.5 py-0 text-[9px] font-bold uppercase text-destructive">
                  Overdue
                </Badge>
              )}
              {scheduled.length > 1 && (
                <Badge className="border-transparent bg-muted px-1.5 py-0 text-[9px] font-bold uppercase text-muted-foreground">
                  +{scheduled.length - 1} more
                </Badge>
              )}
            </div>
            <p className="text-sm font-bold text-foreground">
              {when ? format(new Date(when), 'dd MMM yyyy, h:mm a') : 'No date set'}
              <span className="ml-2 inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
                <User className="h-3 w-3" /> {surveyor}
              </span>
            </p>
          </div>
          <Button size="sm" className="h-9 shrink-0 gap-1.5" onClick={() => setCompleting(next)}>
            <MapPin className="h-4 w-4" /> Complete visit
          </Button>
        </div>

        <CompleteVisitDialog
          open={Boolean(completing)}
          onOpenChange={(open) => !open && setCompleting(null)}
          visit={completing}
          leadId={leadId}
          userId={userId}
          onCompleted={() => {
            visitsQuery.refetch();
            onVisitCompleted();
          }}
        />
      </>
    );
  }

  return (
    <>
      <SectionCard
        title="Site visits"
        icon={CalendarClock}
        description={
          scheduled.length > 0
            ? `${scheduled.length} visit${scheduled.length > 1 ? 's' : ''} booked`
            : undefined
        }
        actions={
          scheduled.length > 0 ? (
            <Badge className="border-transparent bg-warning/15 px-2 py-0.5 text-[10px] font-bold uppercase text-warning">
              Booked
            </Badge>
          ) : undefined
        }
        contentClassName="p-0"
      >
        {visitsQuery.isLoading ? (
          <div className="space-y-3 p-4">
            <Skeleton className="h-16 rounded-xl" />
            <Skeleton className="h-16 rounded-xl" />
          </div>
        ) : visitsQuery.error ? (
          <ErrorState error={visitsQuery.error} onRetry={() => visitsQuery.refetch()} />
        ) : visits.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">
            No site visit booked yet. Use Actions → Book Visit.
          </p>
        ) : (
          <ul className="divide-y divide-border/50">
            {visits.map((visit) => {
              const isScheduled = visit.visit_status === 'scheduled';
              const isCompleted = visit.visit_status === 'completed';
              const when = visit.scheduled_for ?? visit.visit_date;
              const overdue = isScheduled && when && isPast(new Date(when));
              const surveyor =
                staffNames[visit.assigned_to_user_id ?? ''] ??
                staffNames[visit.staff_id] ??
                'Unassigned';

              return (
                <li key={visit.id} className="px-4 py-3.5">
                  <div className="flex items-start gap-3">
                    <span
                      className={cn(
                        'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl',
                        isCompleted
                          ? 'bg-success/15 text-success'
                          : visit.visit_status === 'cancelled'
                            ? 'bg-destructive/15 text-destructive'
                            : overdue
                              ? 'bg-destructive/15 text-destructive'
                              : 'bg-warning/15 text-warning'
                      )}
                    >
                      {isCompleted ? (
                        <CheckCircle2 className="h-4 w-4" />
                      ) : visit.visit_status === 'cancelled' ? (
                        <XCircle className="h-4 w-4" />
                      ) : (
                        <Clock className="h-4 w-4" />
                      )}
                    </span>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-bold text-foreground">
                          {when ? format(new Date(when), 'dd MMM yyyy, h:mm a') : 'No date'}
                        </span>
                        {overdue && (
                          <Badge className="border-transparent bg-destructive/15 px-1.5 py-0 text-[9px] font-bold uppercase text-destructive">
                            Overdue
                          </Badge>
                        )}
                        {isCompleted && (
                          <Badge className="border-transparent bg-success/15 px-1.5 py-0 text-[9px] font-bold uppercase text-success">
                            Completed
                          </Badge>
                        )}
                        {visit.visit_status === 'cancelled' && (
                          <Badge className="border-transparent bg-muted px-1.5 py-0 text-[9px] font-bold uppercase text-muted-foreground">
                            Cancelled
                          </Badge>
                        )}
                      </div>

                      <p className="mt-1 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                        <User className="h-3.5 w-3.5" /> {surveyor}
                      </p>

                      {isCompleted && (
                        <>
                          <p className="mt-1 text-sm text-foreground">
                            {outcomeLabel(visit.outcome)}
                          </p>
                          {visit.latitude && visit.longitude && (
                            <a
                              href={`https://www.google.com/maps/search/?api=1&query=${visit.latitude},${visit.longitude}`}
                              target="_blank"
                              rel="noreferrer"
                              className="mt-1 inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
                            >
                              <Navigation className="h-3.5 w-3.5" />
                              Surveyed location
                              {visit.location_accuracy_m != null &&
                                ` (±${Math.round(visit.location_accuracy_m)} m)`}
                            </a>
                          )}
                        </>
                      )}

                      {visit.visit_notes && (
                        <p className="mt-1.5 whitespace-pre-wrap rounded-lg bg-muted/50 p-2 text-xs text-muted-foreground">
                          {visit.visit_notes}
                        </p>
                      )}

                      {visit.cancelled_reason && (
                        <p className="mt-1 text-xs text-destructive">
                          Cancelled: {visit.cancelled_reason}
                        </p>
                      )}
                    </div>
                  </div>

                  {isScheduled && (
                    <Button
                      className="mt-3 h-11 w-full gap-2"
                      onClick={() => setCompleting(visit)}
                    >
                      <MapPin className="h-4 w-4" /> Complete this visit
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </SectionCard>

      <CompleteVisitDialog
        open={Boolean(completing)}
        onOpenChange={(open) => !open && setCompleting(null)}
        visit={completing}
        leadId={leadId}
        userId={userId}
        onCompleted={() => {
          visitsQuery.refetch();
          onVisitCompleted();
        }}
      />
    </>
  );
};

export default LeadVisitsPanel;
