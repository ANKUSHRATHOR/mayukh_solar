import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import {
  Briefcase,
  CheckCircle2,
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
import { Progress } from '@/components/ui/progress';
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
import { allProjectStageMeta, pipelineFor, stageIndex, stageProgress } from '@/lib/projectStages';
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
  const currentStepRef = useRef<HTMLLIElement>(null);

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

  // The rail scrolls sideways when it does not fit, so a project halfway down
  // the pipeline would otherwise open showing stage one. `block: 'nearest'`
  // keeps this from yanking the page vertically as well.
  useEffect(() => {
    currentStepRef.current?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, [currentIndex]);

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
          // The pipeline is what this page is *about*, so it runs across the top
          // rather than down the 340px aside. Twelve stages read as a path when
          // they are laid along one; stacked in a narrow column they were a list
          // to scroll, which is why the completed ones had to be collapsed out of
          // the way. Laid out horizontally they all fit, so nothing is hidden.
          <SectionCard
            title="Pipeline"
            actions={
              currentIndex >= 0 && (
                <span className="rounded-full bg-foreground/10 px-2 py-0.5 text-[11px] font-bold tabular-nums text-foreground">
                  {currentIndex + 1}/{pipeline.length}
                </span>
              )
            }
          >
            <div className="space-y-3">
              {/* Scrolls sideways rather than wrapping: a rail that wraps onto a
                  second line stops reading as one sequence. */}
              <div className="-mx-1 overflow-x-auto px-1 pb-1">
                <ol className="flex min-w-max items-start sm:min-w-full">
                  {pipeline.map((stage, index) => {
                    const done = currentIndex >= 0 && index < currentIndex;
                    const current = index === currentIndex;
                    const last = index === pipeline.length - 1;
                    return (
                      <li
                        key={stage.stage}
                        ref={current ? currentStepRef : undefined}
                        className="relative flex w-[104px] shrink-0 flex-col items-center gap-1.5 sm:w-auto sm:flex-1"
                      >
                        {!last && (
                          <span
                            aria-hidden
                            className={cn(
                              'absolute left-1/2 top-[7px] h-px w-full',
                              done ? 'bg-success/60' : 'bg-muted-foreground/25'
                            )}
                          />
                        )}
                        {/* bg-card so the rail passes behind the marker, not through it. */}
                        <span className="relative z-10 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-card">
                          {done ? (
                            <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                          ) : (
                            <span
                              className={cn(
                                'h-2 w-2 rounded-full',
                                current ? 'bg-primary ring-4 ring-primary/20' : 'bg-muted-foreground/30'
                              )}
                            />
                          )}
                        </span>
                        <span
                          className={cn(
                            'px-1 text-center text-[10px] leading-tight',
                            current
                              ? 'font-bold text-foreground'
                              : done
                                ? 'text-muted-foreground'
                                : 'text-muted-foreground/70'
                          )}
                        >
                          {stage.label}
                        </span>
                      </li>
                    );
                  })}
                </ol>
              </div>

              {/* lg, not sm: the action carries a stage name and the progress a
                  label, and side by side below ~1024px they clipped each other. */}
              <div className="flex flex-col gap-3 border-t border-border/70 pt-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex items-center gap-3 lg:max-w-[18rem] lg:flex-1">
                  <Progress value={progress} className="h-1.5 flex-1" />
                  <span className="shrink-0 whitespace-nowrap text-[11px] tabular-nums text-muted-foreground">
                    {currentIndex >= 0 ? `${progress}% through` : 'Off-pipeline'}
                  </span>
                </div>

                <StageAdvanceControl
                  projectId={project.id}
                  pipeline={pipeline}
                  currentIndex={currentIndex}
                  facts={requirements}
                  canEdit={canEditProject}
                  isAdmin={role === 'admin'}
                  layout="inline"
                  onChanged={() => {
                    void queryClient.invalidateQueries({ queryKey: ['project', projectId] });
                    void queryClient.invalidateQueries({ queryKey: ['project-requirements', projectId] });
                  }}
                />
              </div>
            </div>
          </SectionCard>
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
