import { useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import {
  Briefcase,
  ExternalLink,
  FileText,
  Landmark,
  MapPin,
  Pencil,
  Sun,
  User,
  Wallet,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import DetailShell from '@/components/common/DetailShell';
import SectionCard from '@/components/common/SectionCard';
import DetailField, { DetailGrid } from '@/components/common/DetailField';
import StatusBadge from '@/components/common/StatusBadge';
import StageAdvanceControl from '@/components/projects/StageAdvanceControl';
import ProjectDocumentsTab from './ProjectDocumentsTab';
import ProjectWorkPanel from './ProjectWorkPanel';
import ProjectPaymentsPanel from '@/components/projects/ProjectPaymentsPanel';
import PlantDetailsDialog from '@/components/projects/PlantDetailsDialog';
import { fromProject, structureTypeLabel } from '@/lib/plantDetails';
import {
  allProjectStageMeta,
  pipelineFor,
  stageIndex,
  stageNumber,
  stageProgress,
} from '@/lib/projectStages';
import { fetchProject, fetchStageRequirements, projectIdentity } from '@/lib/projects';
import { formatMoney, involvesLoan, paymentTypeMeta } from '@/lib/payments';

const ProjectDetailPage = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { role, user } = useAuth();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  // Tab lives in the URL so a link can point at a specific tab and the browser
  // back button steps between them.
  const [plantOpen, setPlantOpen] = useState(false);

  const tab = searchParams.get('tab') ?? 'customer';
  const setTab = (value: string) => setSearchParams({ tab: value }, { replace: true });

  const projectQuery = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => fetchProject(projectId!),
    enabled: Boolean(projectId),
  });

  const project = projectQuery.data;
  // Mirrors the projects UPDATE policies: admin and operator can edit any
  // project, a sales person only one assigned to them. Governs the plant fields
  // and the stage control alike — both are an UPDATE on the same row.
  const canEditProject =
    role === 'admin' ||
    role === 'operator' ||
    (role === 'sales_person' && project?.assigned_sales_person_id === user?.id);

  const requirementsQuery = useQuery({
    queryKey: ['project-requirements', projectId],
    queryFn: () => fetchStageRequirements(projectId!),
    enabled: Boolean(projectId) && Boolean(project),
  });

  const identity = project ? projectIdentity(project) : null;
  const requirements = requirementsQuery.data;

  const pipeline = project ? pipelineFor(project.payment_type) : [];
  const currentIndex = project ? stageIndex(project.status, project.payment_type) : -1;
  const progress = project ? stageProgress(project.status, project.payment_type) : 0;
  const currentStage = currentIndex >= 0 ? pipeline[currentIndex] : undefined;
  const nextStageDef = currentIndex >= 0 ? pipeline[currentIndex + 1] : undefined;

  return (
    <DetailShell
      title={identity?.primary ?? 'Project'}
      description={
        identity && identity.kNumber
          ? `${identity.name}${identity.mobile ? ` · ${identity.mobile}` : ''}`
          : identity?.mobile ?? undefined
      }
      icon={Briefcase}
      backTo="/projects"
      isLoading={projectQuery.isLoading}
      error={projectQuery.error}
      onRetry={() => projectQuery.refetch()}
      notFound={!projectQuery.isLoading && !projectQuery.error && !project}
      notFoundTitle="Project not found"
      meta={
        project && (
          <>
            <StatusBadge value={project.status} map={allProjectStageMeta} />
            <StatusBadge value={project.payment_type} map={paymentTypeMeta} />
          </>
        )
      }
      actions={
        project && (
          <Button
            variant="outline"
            size="sm"
            className="h-11 gap-2 sm:h-9"
            onClick={() => navigate(`/projects/${project.id}/edit`)}
          >
            <Pencil className="h-4 w-4" /> Edit
          </Button>
        )
      }
      banner={
        project && (
          // One dense rail rather than twelve markers and their labels: the
          // question this answers is "where is it, and what is next", and the
          // full stage list belongs in the picker, which is where you go when
          // you want to change it. On the sidebar's dark scale so it reads as
          // chrome belonging to the page rather than another content card, and
          // because that scale stays dark in both themes.
          // One dense rail rather than twelve markers and their labels: the
          // question this answers is "where is it, and what is next", and the
          // full stage list belongs in the picker, which is where you go when
          // you want to change it.
          //
          // Painted from the app tokens, not the sidebar's fixed dark scale, so
          // it follows the theme the way every other surface on the page does.
          <div className="rounded-2xl border border-border/70 bg-card px-4 py-3 shadow-card">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:gap-4">
              <div className="flex min-w-0 items-center gap-3">
                <span className="shrink-0 text-[11px] font-semibold tabular-nums text-muted-foreground">
                  {currentIndex >= 0 ? `${stageNumber(currentIndex)} / ${pipeline.length}` : '—'}
                </span>
                <span aria-hidden className="h-4 w-px shrink-0 bg-border" />
                <span className="truncate text-sm font-bold text-foreground">
                  {currentStage?.label ?? allProjectStageMeta[project.status]?.label ?? project.status}
                </span>
              </div>

              <div
                className="h-1 w-full overflow-hidden rounded-full bg-muted lg:flex-1"
                role="progressbar"
                aria-valuenow={progress}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Pipeline progress"
              >
                <div
                  className="h-full rounded-full bg-primary transition-[width] duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>

              <div className="flex items-center justify-between gap-3 lg:justify-end">
                <span className="truncate text-xs text-muted-foreground">
                  {nextStageDef
                    ? `Next · ${nextStageDef.label}`
                    : currentIndex >= 0
                      ? 'Final stage'
                      : 'Off-pipeline'}
                </span>

                <StageAdvanceControl
                  projectId={project.id}
                  pipeline={pipeline}
                  currentIndex={currentIndex}
                  facts={requirements}
                  canEdit={canEditProject}
                  isAdmin={role === 'admin'}
                  onChanged={() => {
                    void queryClient.invalidateQueries({ queryKey: ['project', projectId] });
                    void queryClient.invalidateQueries({ queryKey: ['project-requirements', projectId] });
                  }}
                />
              </div>
            </div>
          </div>
        )
      }
      aside={
        project && (
          <>
            <SectionCard title="Commercials" icon={Wallet}>
              <div className="space-y-4">
                <DetailField
                  label="Project value"
                  value={
                    <span className="text-base font-extrabold tabular-nums">
                      {formatMoney(project.final_amount)}
                    </span>
                  }
                />
                {requirements && (
                  <DetailField
                    label="Balance due"
                    value={
                      <span
                        className={
                          requirements.fully_paid
                            ? 'font-bold text-success'
                            : 'font-bold text-warning'
                        }
                      >
                        {requirements.fully_paid
                          ? 'Fully paid'
                          : formatMoney(requirements.balance_due)}
                      </span>
                    }
                  />
                )}
                <DetailField label="Discount" value={project.discount ? formatMoney(project.discount) : null} />
                {involvesLoan(project.payment_type) && (
                  <DetailField
                    label="Bank"
                    value={
                      project.loan_bank && (
                        <span className="inline-flex items-center gap-1.5">
                          <Landmark className="h-3.5 w-3.5 text-muted-foreground" />
                          {project.loan_bank}
                        </span>
                      )
                    }
                  />
                )}
              </div>
            </SectionCard>
          </>
        )
      }
    >
      {project && (
        <Tabs value={tab} onValueChange={setTab}>
          {/* Four fixed tabs splitting the width evenly on phones. Four cells
              in 375px is ~85px each, so Documents shortens to "Docs" below sm —
              at its full length it ran past its cell, which is the same
              overflow that made it undiscoverable when there were three. */}
          <TabsList className="grid h-auto w-full grid-cols-4 sm:inline-flex sm:h-10 sm:w-auto">
            <TabsTrigger value="customer" className="h-11 gap-1.5 px-2 text-xs sm:h-auto sm:px-3 sm:text-sm">
              <User className="h-3.5 w-3.5 shrink-0" />
              <span className="sm:hidden">Customer</span>
              <span className="hidden sm:inline">Customer Details</span>
            </TabsTrigger>
            <TabsTrigger value="plant" className="h-11 gap-1.5 px-2 text-xs sm:h-auto sm:px-3 sm:text-sm">
              <Sun className="h-3.5 w-3.5 shrink-0" />
              <span className="sm:hidden">Plant</span>
              <span className="hidden sm:inline">Plant Details</span>
            </TabsTrigger>
            <TabsTrigger value="payments" className="h-11 gap-1.5 px-2 text-xs sm:h-auto sm:px-3 sm:text-sm">
              <Wallet className="h-3.5 w-3.5 shrink-0" />
              <span>Payments</span>
            </TabsTrigger>
            <TabsTrigger value="documents" className="h-11 gap-1.5 px-2 text-xs sm:h-auto sm:px-3 sm:text-sm">
              <FileText className="h-3.5 w-3.5 shrink-0" />
              <span className="sm:hidden">Docs</span>
              <span className="hidden sm:inline">Documents</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="customer" className="mt-4 space-y-4">
            <SectionCard title="Customer" icon={User}>
              <DetailGrid>
                <DetailField label="K-Number" value={identity?.kNumber} emptyText="Not linked" />
                <DetailField label="Name" value={identity?.name} wide />
                <DetailField
                  label="Mobile"
                  value={
                    identity?.mobile && (
                      <a
                        href={`tel:${identity.mobile}`}
                        className="font-semibold text-primary hover:underline"
                      >
                        {identity.mobile}
                      </a>
                    )
                  }
                />
                <DetailField label="Email" value={project.leads?.email} />
                <DetailField
                  label="Address"
                  wide
                  value={[
                    project.leads?.address,
                    project.leads?.village_city,
                    project.leads?.district,
                    project.leads?.state,
                  ]
                    .filter(Boolean)
                    .join(', ')}
                />
              </DetailGrid>

              <div className="mt-4 flex flex-col gap-2 border-t border-border/50 pt-4 sm:flex-row sm:flex-wrap">
                {project.lead_id && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-11 gap-2 sm:h-9"
                    onClick={() => navigate(`/leads/${project.lead_id}`)}
                  >
                    <ExternalLink className="h-4 w-4" /> Open source lead
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="h-11 gap-2 sm:h-9"
                  onClick={() => navigate(`/projects/${project.id}/home-location`)}
                >
                  <MapPin className="h-4 w-4" />
                  {project.home_latitude ? 'View site location' : 'Set site location'}
                </Button>
              </div>
            </SectionCard>

            <ProjectWorkPanel project={project} requirements={requirements ?? null} />
          </TabsContent>

          <TabsContent value="plant" className="mt-4 space-y-4">
            {/* Editing the specs used to mean leaving for the finalization form.
                The section edits in place, through the same dialog the lead uses. */}
            <SectionCard
              title="System specification"
              icon={Sun}
              actions={canEditProject && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5 text-xs font-semibold"
                  onClick={() => setPlantOpen(true)}
                  aria-label="Edit system specification"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Edit</span>
                </Button>
              )}
            >
              <DetailGrid>
                <DetailField label="Capacity" value={`${project.capacity_kw} kW`} />
                <DetailField label="Structure" value={structureTypeLabel(project.structure_type)} />
                <DetailField label="Grid phase" value={project.phase} />
                <DetailField label="Panel brand" value={project.panel_brand} />
                <DetailField
                  label="Panels"
                  value={`${project.panel_qty} × ${project.panel_watt}W`}
                />
                <DetailField label="Inverter brand" value={project.inverter_brand} />
                <DetailField label="Inverter capacity" value={`${project.inverter_capacity} kW`} />
                {/* Carried over from the lead since 20260907000200 — the specs a
                    welder and an electrician need on site. */}
                <DetailField label="Wire make" value={project.wiremake} />
                <DetailField label="Wire size" value={project.wire_size} />
                <DetailField label="Wire material" value={project.wire_material} />
                <DetailField
                  label="Subsidy"
                  value={project.subsidy_amount ? formatMoney(project.subsidy_amount) : null}
                />
              </DetailGrid>
            </SectionCard>

            <SectionCard title="Site location" icon={MapPin}>
              {project.home_latitude && project.home_longitude ? (
                <div className="space-y-3">
                  <DetailGrid>
                    <DetailField label="Latitude" value={project.home_latitude} />
                    <DetailField label="Longitude" value={project.home_longitude} />
                  </DetailGrid>
                  <Button variant="outline" size="sm" className="gap-2" asChild>
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${project.home_latitude},${project.home_longitude}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <MapPin className="h-4 w-4" /> Open in Maps
                    </a>
                  </Button>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No site location saved yet. Installation cannot be scheduled without it.
                </p>
              )}
            </SectionCard>

            {project.special_notes && (
              <SectionCard title="Notes">
                <p className="whitespace-pre-wrap text-sm leading-relaxed">
                  {project.special_notes}
                </p>
              </SectionCard>
            )}

            <SectionCard title="Record">
              <DetailGrid>
                <DetailField
                  label="Created"
                  value={format(new Date(project.created_at), 'dd MMM yyyy')}
                />
                <DetailField
                  label="Last updated"
                  value={format(new Date(project.updated_at), 'dd MMM yyyy')}
                />
                <DetailField
                  label="Completed"
                  value={
                    project.completed_at
                      ? format(new Date(project.completed_at), 'dd MMM yyyy')
                      : null
                  }
                  emptyText="Not yet"
                />
              </DetailGrid>
            </SectionCard>
          </TabsContent>

          <TabsContent value="payments" className="mt-4">
            <ProjectPaymentsPanel
              projectId={project.id}
              finalAmount={project.final_amount}
              paymentType={project.payment_type}
              projectLabel={identity?.primary ?? 'this project'}
              netMeterInstalledAt={project.net_meter_installed_at}
              onChanged={() => {
                projectQuery.refetch();
                // The stage gate reads balance_due and fully_paid, and the
                // list's money tiles read final_amount against receipts.
                requirementsQuery.refetch();
                queryClient.invalidateQueries({ queryKey: ['projects'] });
                queryClient.invalidateQueries({ queryKey: ['payments'] });
              }}
            />
          </TabsContent>

          <TabsContent value="documents" className="mt-4">
            <ProjectDocumentsTab projectId={project.id} />
          </TabsContent>
        </Tabs>
      )}

      {project && (
        <PlantDetailsDialog
          open={plantOpen}
          onOpenChange={setPlantOpen}
          mode="project"
          recordId={project.id}
          value={fromProject(project)}
          onSaved={() => {
            projectQuery.refetch();
            // final_amount feeds the list's money tiles.
            queryClient.invalidateQueries({ queryKey: ['projects'] });
          }}
        />
      )}

    </DetailShell>
  );
};

export default ProjectDetailPage;
