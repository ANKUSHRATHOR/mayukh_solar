import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import {
  Ban,
  CalendarClock,
  CheckCircle2,
  ExternalLink,
  FileText,
  MapPin,
  MoreVertical,
  Navigation,
  Pencil,
  Phone,
  Trash2,
  User,
  UserCog,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import DetailShell from '@/components/common/DetailShell';
import SectionCard from '@/components/common/SectionCard';
import DetailField, { DetailGrid } from '@/components/common/DetailField';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import CompleteVisitDialog from '@/components/leads/CompleteVisitDialog';
import LeadCallLink from '@/components/leads/LeadCallLink';
import VisitFormDialog from '@/components/leads/VisitFormDialog';
import CancelVisitDialog from '@/components/leads/CancelVisitDialog';
import LeadAssignmentCard from '@/components/leads/LeadAssignmentCard';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import QuotationFormDialog from '@/components/leads/QuotationFormDialog';
import LeadQuotationsPanel from '@/components/leads/LeadQuotationsPanel';
import { canDeleteVisits, canManageVisits, fetchVisit, outcomeLabel } from '@/lib/visits';
import { useStaffNames } from '@/hooks/useStaffNames';
import type { LeadQuotation } from '@/lib/leadQuotations';

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
  const { user, role } = useAuth();
  const queryClient = useQueryClient();

  const [completing, setCompleting] = useState(false);
  const [quoting, setQuoting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editingOwner, setEditingOwner] = useState(false);
  const { nameOf } = useStaffNames();
  // Admin only, deliberately narrower than the lead page (where an operator can
  // reassign too): this is the surveyor's screen, and the owner is shown here so
  // they know who to hand back to, not so the round can be re-dealt in the field.
  const canEditOwner = role === 'admin';
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
  const isCancelled = visit?.visit_status === 'cancelled';
  const canEdit = isOpen && canManageVisits(role);
  const canDelete = canDeleteVisits(role);

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
                  : isCancelled
                    ? 'border-transparent bg-muted px-2 py-0.5 text-[10px] font-bold uppercase text-muted-foreground'
                    : 'border-transparent bg-success/15 px-2 py-0.5 text-[10px] font-bold uppercase text-success'
              }
            >
              {/* A cancelled visit used to read "Completed" here. */}
              {isOpen ? 'Open' : isCancelled ? 'Cancelled' : 'Completed'}
            </Badge>
          )
        }
        actions={
          visit && (
            <>
              {isOpen && (
                <Button size="sm" className="gap-2" onClick={() => setCompleting(true)}>
                  <CheckCircle2 className="h-4 w-4" /> Update Status
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
              {(canEdit || canDelete) && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="w-9 shrink-0 p-0" aria-label="More visit actions">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-44">
                    {canEdit && (
                      <>
                        <DropdownMenuItem onSelect={() => setEditing(true)} className="gap-2">
                          <Pencil className="h-4 w-4" /> Edit visit
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => setCancelling(true)} className="gap-2">
                          <Ban className="h-4 w-4" /> Cancel visit
                        </DropdownMenuItem>
                      </>
                    )}
                    {canDelete && (
                      <>
                        {canEdit && <DropdownMenuSeparator />}
                        <DropdownMenuItem
                          onSelect={() => setDeleting(true)}
                          className="gap-2 text-destructive focus:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" /> Delete
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </>
          )
        }
      >
        {visit && (
          <>
            {/* Call and navigate first — the two things needed on arrival. */}
            <SectionCard
              title="Customer"
              icon={User}
              actions={
                canEditOwner ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-11 gap-1.5 sm:h-8"
                    onClick={() => setEditingOwner(true)}
                  >
                    <UserCog className="h-4 w-4" /> Change owner
                  </Button>
                ) : undefined
              }
            >
              <DetailGrid>
                <DetailField label="Name" value={lead?.customer_name} wide />
                <DetailField label="K-Number" value={lead?.k_number} emptyText="Not linked" />
                <DetailField
                  label="Interested capacity"
                  value={lead?.kw_interest ? `${lead.kw_interest} kW` : null}
                />
                {/* Who owns the lead, so the surveyor knows who booked this and
                    who to hand the outcome back to. */}
                <DetailField
                  label="Telecaller"
                  value={nameOf(lead?.assigned_telecaller_id)}
                  emptyText="Not assigned"
                />
                <DetailField
                  label="Sales rep"
                  value={nameOf(lead?.assigned_to_user_id)}
                  emptyText="Not assigned"
                />
              </DetailGrid>

              <div className="mt-4 grid grid-cols-1 gap-2 border-t border-border/50 pt-4 sm:grid-cols-2">
                {lead?.mobile && (
                  <Button variant="outline" className="h-11 gap-2" asChild>
                    <LeadCallLink leadId={lead.id} mobile={lead.mobile}>
                      <Phone className="h-4 w-4" /> Call {lead.mobile}
                    </LeadCallLink>
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
              <LeadQuotationsPanel
                leadId={lead.id}
                onEdit={(q) => setEditingQuote(q)}
                customerName={lead.customer_name}
                customerMobile={lead.mobile}
                onSent={() => visitQuery.refetch()}
              />
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
                <DetailField label="Outcome" value={visit.outcome ? outcomeLabel(visit.outcome) : undefined} />
                {isCancelled && (
                  <DetailField label="Cancelled because" wide value={visit.cancelled_reason} />
                )}
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
          <VisitFormDialog
            open={editing}
            onOpenChange={setEditing}
            leadId={lead.id}
            visit={visit}
            onSaved={() => visitQuery.refetch()}
          />
          <CancelVisitDialog
            mode="cancel"
            visit={cancelling ? visit : null}
            onOpenChange={setCancelling}
            onDone={() => visitQuery.refetch()}
          />
          <CancelVisitDialog
            mode="delete"
            visit={deleting ? visit : null}
            onOpenChange={setDeleting}
            // The visit no longer exists, so its page has nothing left to show.
            onDone={() => navigate('/visits')}
          />
          {/* The same control the lead page uses, so both screens assign a lead
              the same way and through the same server checks. */}
          <Dialog open={editingOwner} onOpenChange={setEditingOwner}>
            <DialogContent className="sm:max-w-[520px]">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-base font-bold">
                  <UserCog className="h-4 w-4 text-primary" /> Lead owner
                </DialogTitle>
                <DialogDescription>
                  Who works {lead.customer_name}: the telecaller on the phone, and the sales rep who
                  visits and closes. Each is set on its own.
                </DialogDescription>
              </DialogHeader>
              <div className="py-2">
                <LeadAssignmentCard
                  leadId={lead.id}
                  telecallerId={lead.assigned_telecaller_id ?? null}
                  salesPersonId={lead.assigned_to_user_id ?? null}
                  onChanged={() => {
                    // The visit carries the lead's owners, and the list shows
                    // them in its own column.
                    void visitQuery.refetch();
                    queryClient.invalidateQueries({ queryKey: ['visits'] });
                  }}
                />
              </div>
            </DialogContent>
          </Dialog>

          <CompleteVisitDialog
            open={completing}
            onOpenChange={setCompleting}
            visit={visit}
            leadId={lead.id}
            userId={user?.id ?? ''}
            onCompleted={() => visitQuery.refetch()}
          />
          <QuotationFormDialog
            open={quoting || Boolean(editingQuote)}
            onOpenChange={(open) => {
              if (!open) {
                setQuoting(false);
                setEditingQuote(null);
              }
            }}
            leadId={lead.id}
            customerName={lead.customer_name}
            capacityKw={lead.kw_interest}
            editQuote={editingQuote}
            onSaved={() => {
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
