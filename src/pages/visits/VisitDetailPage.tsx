import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import {
  CalendarClock,
  CheckCircle2,
  ExternalLink,
  FileText,
  MapPin,
  Navigation,
  Phone,
  User,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import DetailShell from '@/components/common/DetailShell';
import SectionCard from '@/components/common/SectionCard';
import DetailField, { DetailGrid } from '@/components/common/DetailField';
import CompleteVisitDialog from '@/components/leads/CompleteVisitDialog';
import CreateQuotationDialog from '@/components/leads/CreateQuotationDialog';
import LeadQuotationsPanel from '@/components/leads/LeadQuotationsPanel';
import { VISIT_OUTCOMES, fetchVisit } from '@/lib/visits';
import type { LeadQuotation } from '@/lib/leadQuotations';

const outcomeLabel = (value: string | null) =>
  VISIT_OUTCOMES.find((o) => o.value === value)?.label ?? value ?? null;

/**
 * A single site visit.
 *
 * Deliberately narrow: what the surveyor needs standing at the gate — who the
 * customer is, where it is, how to call them, and the action to complete it.
 * The full sales cockpit stays on the lead page, one click away.
 */
const VisitDetailPage = () => {
  const { visitId } = useParams<{ visitId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [completing, setCompleting] = useState(false);
  const [quoting, setQuoting] = useState(false);
  // Quotation being edited via the panel's row menu; null means the dialog
  // (when open) is creating a fresh one.
  const [editingQuote, setEditingQuote] = useState<LeadQuotation | null>(null);

  const visitQuery = useQuery({
    queryKey: ['visit', visitId],
    queryFn: () => fetchVisit(visitId!),
    enabled: Boolean(visitId),
  });

  const visit = visitQuery.data;
  const lead = visit?.leads ?? null;
  const isOpen = visit?.visit_status === 'scheduled';

  const address =
    [lead?.address, lead?.village_city, lead?.district, lead?.state]
      .filter(Boolean)
      .join(', ') || null;

  // Prefer the surveyed coordinates; fall back to the DISCOM-derived ones,
  // then to a text search on the address.
  const mapsHref = (() => {
    if (visit?.latitude && visit?.longitude) {
      return `https://www.google.com/maps/search/?api=1&query=${visit.latitude},${visit.longitude}`;
    }
    if (lead?.latitude && lead?.longitude) {
      return `https://www.google.com/maps/search/?api=1&query=${lead.latitude},${lead.longitude}`;
    }
    return address
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
      : null;
  })();

  return (
    <>
      <DetailShell
        title={lead?.k_number ?? lead?.customer_name ?? 'Site visit'}
        icon={CalendarClock}
        backTo="/visits"
        isLoading={visitQuery.isLoading}
        error={visitQuery.error}
        onRetry={() => visitQuery.refetch()}
        notFound={!visitQuery.isLoading && !visitQuery.error && !visit}
        notFoundTitle="Visit not found"
        meta={
          visit && (
            <Badge
              className={
                isOpen
                  ? 'border-transparent bg-warning/15 px-2 py-0.5 text-[10px] font-bold uppercase text-warning'
                  : 'border-transparent bg-success/15 px-2 py-0.5 text-[10px] font-bold uppercase text-success'
              }
            >
              {isOpen ? 'Open' : 'Completed'}
            </Badge>
          )
        }
        actions={
          visit && (
            <>
              {isOpen && (
                <Button size="sm" className="gap-2" onClick={() => setCompleting(true)}>
                  <CheckCircle2 className="h-4 w-4" /> Complete visit
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() => setQuoting(true)}
              >
                <FileText className="h-4 w-4" /> Create quotation
              </Button>
            </>
          )
        }
      >
        {visit && (
          <>
            {/* Call and navigate first — the two things needed on arrival. */}
            <SectionCard title="Customer" icon={User}>
              <DetailGrid>
                <DetailField label="Name" value={lead?.customer_name} />
                <DetailField label="K-Number" value={lead?.k_number} emptyText="Not linked" />
                <DetailField
                  label="Interested capacity"
                  value={lead?.kw_interest ? `${lead.kw_interest} kW` : null}
                />
              </DetailGrid>

              <div className="mt-4 grid grid-cols-1 gap-2 border-t border-border/50 pt-4 sm:grid-cols-2">
                {lead?.mobile && (
                  <Button variant="outline" className="h-11 gap-2" asChild>
                    <a href={`tel:${lead.mobile}`}>
                      <Phone className="h-4 w-4" /> Call {lead.mobile}
                    </a>
                  </Button>
                )}
                {mapsHref && (
                  <Button variant="outline" className="h-11 gap-2" asChild>
                    <a href={mapsHref} target="_blank" rel="noreferrer">
                      <Navigation className="h-4 w-4" /> Navigate
                    </a>
                  </Button>
                )}
              </div>

              {lead?.alt_mobile && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Alternate:{' '}
                  <a href={`tel:${lead.alt_mobile}`} className="font-medium text-primary hover:underline">
                    {lead.alt_mobile}
                  </a>
                </p>
              )}
            </SectionCard>

            <SectionCard title="Address" icon={MapPin}>
              <p className="text-sm leading-relaxed text-foreground">
                {address ?? <span className="text-muted-foreground/60">No address recorded</span>}
              </p>
              {visit.latitude && visit.longitude && (
                <p className="mt-2 font-mono text-xs text-muted-foreground">
                  Surveyed at {Number(visit.latitude).toFixed(6)},{' '}
                  {Number(visit.longitude).toFixed(6)}
                  {visit.location_accuracy_m != null &&
                    ` (±${Math.round(visit.location_accuracy_m)} m)`}
                </p>
              )}
            </SectionCard>

            {lead && (
              <LeadQuotationsPanel leadId={lead.id} onEdit={(q) => setEditingQuote(q)} />
            )}

            <SectionCard title="Visit" icon={CalendarClock}>
              <DetailGrid>
                <DetailField
                  label="Scheduled for"
                  value={
                    visit.scheduled_for
                      ? format(new Date(visit.scheduled_for), 'dd MMM yyyy, h:mm a')
                      : null
                  }
                />
                <DetailField
                  label="Completed"
                  value={
                    visit.completed_at
                      ? format(new Date(visit.completed_at), 'dd MMM yyyy, h:mm a')
                      : null
                  }
                  emptyText="Not yet"
                />
                <DetailField label="Outcome" value={outcomeLabel(visit.outcome)} />
                <DetailField label="Notes" wide value={visit.visit_notes} />
              </DetailGrid>

              {lead && (
                <div className="mt-4 border-t border-border/50 pt-4">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-2"
                    onClick={() => navigate(`/leads/${lead.id}`)}
                  >
                    <ExternalLink className="h-4 w-4" /> Open full lead record
                  </Button>
                </div>
              )}
            </SectionCard>
          </>
        )}
      </DetailShell>

      {visit && lead && (
        <>
          <CompleteVisitDialog
            open={completing}
            onOpenChange={setCompleting}
            visit={visit}
            leadId={lead.id}
            userId={user?.id ?? ''}
            onCompleted={() => visitQuery.refetch()}
          />
          <CreateQuotationDialog
            open={quoting || Boolean(editingQuote)}
            onOpenChange={(open) => {
              if (!open) {
                setQuoting(false);
                setEditingQuote(null);
              }
            }}
            leadId={lead.id}
            customerName={lead.customer_name}
            customerMobile={lead.mobile}
            capacityKw={lead.kw_interest}
            editQuote={editingQuote}
            onCreated={() => {
              // The quotations panel has its own query, so refetching the visit
              // alone would leave the updated quotation invisible until reload.
              queryClient.invalidateQueries({ queryKey: ['lead-quotations', lead.id] });
              visitQuery.refetch();
            }}
          />
        </>
      )}
    </>
  );
};

export default VisitDetailPage;
