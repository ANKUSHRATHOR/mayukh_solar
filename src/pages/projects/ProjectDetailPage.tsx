import { useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import {
  AlertTriangle,
  Briefcase,
  CheckCircle2,
  ChevronDown,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import DetailShell from '@/components/common/DetailShell';
import SectionCard from '@/components/common/SectionCard';
import DetailField, { DetailGrid } from '@/components/common/DetailField';
import StatusBadge from '@/components/common/StatusBadge';
import ProjectDocumentsTab from './ProjectDocumentsTab';
import ProjectWorkPanel from './ProjectWorkPanel';
import { allProjectStageMeta, pipelineFor, stageIndex, stageProgress } from '@/lib/projectStages';
import { fetchProject, fetchStageRequirements, projectIdentity } from '@/lib/projects';
import { formatMoney } from '@/lib/payments';

const ProjectDetailPage = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // Tab lives in the URL so a link can point at a specific tab and the browser
  // back button steps between them.
  // Stages already behind the project are hidden by default — they are history,
  // and twelve rows of it pushed the current stage and Commercials off-screen.
  const [showDoneStages, setShowDoneStages] = useState(false);

  const tab = searchParams.get('tab') ?? 'customer';
  const setTab = (value: string) => setSearchParams({ tab: value }, { replace: true });

  const projectQuery = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => fetchProject(projectId!),
    enabled: Boolean(projectId),
  });

  const project = projectQuery.data;

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

  // A loan project cannot start fabrication until the bank's first installment
  // lands. Surfaced persistently here rather than as a toast on a failed save.
  const fabricationBlocked =
    project?.payment_type === 'loan' &&
    requirements?.loan_first_installment_received === false;

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
            <StatusBadge
              value={project.payment_type}
              map={{
                cash: { label: 'Cash', tone: 'success' },
                loan: { label: 'Loan', tone: 'info' },
              }}
            />
          </>
        )
      }
      actions={
        project && (
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => navigate(`/projects/${project.id}/edit`)}
          >
            <Pencil className="h-4 w-4" /> Edit
          </Button>
        )
      }
      aside={
        project && (
          <>
            {/* A pipeline is a path, not a checklist: the markers are joined by a
                rail, the current stage is the thing the eye lands on, and the
                stages already behind you collapse so the card leads with where
                the project actually is. Completed stages were struck through,
                which reads as cancelled rather than done. */}
            <SectionCard
              title="Pipeline"
              actions={
                currentIndex >= 0 && (
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-bold tabular-nums text-muted-foreground">
                    {currentIndex + 1}/{pipeline.length}
                  </span>
                )
              }
            >
              <div className="space-y-4">
                {/* The stage name is already the page header's status badge and the
                    bold row below, so this line carries only the progress. The
                    percentage is distance travelled between the first and last
                    stage, which is why it does not equal 4/12. */}
                <div className="space-y-2">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-[11px] text-muted-foreground">
                      {currentIndex >= 0 ? 'Progress' : 'Off-pipeline (legacy stage)'}
                    </span>
                    <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                      {progress}% through
                    </span>
                  </div>
                  <Progress value={progress} className="h-1.5" />
                </div>

                {currentIndex > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowDoneStages((v) => !v)}
                    className="flex w-full items-center gap-1.5 rounded text-[11px] font-semibold text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                    aria-expanded={showDoneStages}
                  >
                    <ChevronDown
                      className={cn('h-3.5 w-3.5 transition-transform', showDoneStages && 'rotate-180')}
                    />
                    {currentIndex} completed
                  </button>
                )}

                <ol className="relative space-y-2.5">
                  {pipeline.map((stage, index) => {
                    const done = currentIndex >= 0 && index < currentIndex;
                    const current = index === currentIndex;
                    if (done && !showDoneStages) return null;

                    const last = index === pipeline.length - 1;
                    return (
                      <li key={stage.stage} className="relative flex gap-2.5">
                        {/* The rail joins one marker to the next, so the list
                            reads as a sequence rather than twelve loose rows. */}
                        {!last && (
                          <span
                            aria-hidden
                            className={cn(
                              'absolute left-[6px] top-[14px] h-[calc(100%+0.625rem)] w-px',
                              // bg-border is only a hair lighter than the card, so
                              // a 1px rail on it was invisible.
                              done ? 'bg-success/50' : 'bg-muted-foreground/25'
                            )}
                          />
                        )}
                        <span className="relative z-10 mt-[3px] flex h-3 w-3 shrink-0 items-center justify-center">
                          {done ? (
                            <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                          ) : (
                            <span
                              className={cn(
                                'h-2 w-2 rounded-full',
                                current
                                  ? 'bg-primary ring-4 ring-primary/20'
                                  : 'bg-muted-foreground/30'
                              )}
                            />
                          )}
                        </span>
                        <span
                          className={cn(
                            'text-xs leading-tight',
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
            </SectionCard>

            {fabricationBlocked && (
              <SectionCard title="Blocked" icon={AlertTriangle}>
                <p className="text-sm leading-relaxed text-foreground">
                  Fabrication cannot start until the bank&rsquo;s first installment is
                  received and marked completed.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3 w-full gap-2"
                  onClick={() => setTab('payments')}
                >
                  <Wallet className="h-4 w-4" /> Review payments
                </Button>
              </SectionCard>
            )}

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
                {project.payment_type === 'loan' && (
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
          <TabsList className="w-full justify-start overflow-x-auto">
            <TabsTrigger value="customer" className="gap-1.5 text-xs sm:text-sm">
              <User className="h-3.5 w-3.5" /> Customer Details
            </TabsTrigger>
            <TabsTrigger value="plant" className="gap-1.5 text-xs sm:text-sm">
              <Sun className="h-3.5 w-3.5" /> Plant Details
            </TabsTrigger>
            <TabsTrigger value="documents" className="gap-1.5 text-xs sm:text-sm">
              <FileText className="h-3.5 w-3.5" /> Documents
            </TabsTrigger>
          </TabsList>

          <TabsContent value="customer" className="mt-4 space-y-4">
            <SectionCard title="Customer" icon={User}>
              <DetailGrid>
                <DetailField label="K-Number" value={identity?.kNumber} emptyText="Not linked" />
                <DetailField label="Name" value={identity?.name} />
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

              <div className="mt-4 flex flex-wrap gap-2 border-t border-border/50 pt-4">
                {project.lead_id && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={() => navigate(`/leads/${project.lead_id}`)}
                  >
                    <ExternalLink className="h-4 w-4" /> Open source lead
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
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
            <SectionCard title="System specification" icon={Sun}>
              <DetailGrid>
                <DetailField label="Capacity" value={`${project.capacity_kw} kW`} />
                <DetailField label="Structure" value={project.structure_type?.replace(/_/g, ' ')} />
                <DetailField label="Panel brand" value={project.panel_brand} />
                <DetailField
                  label="Panels"
                  value={`${project.panel_qty} × ${project.panel_watt}W`}
                />
                <DetailField label="Inverter brand" value={project.inverter_brand} />
                <DetailField label="Inverter capacity" value={`${project.inverter_capacity} kW`} />
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

          <TabsContent value="documents" className="mt-4">
            <ProjectDocumentsTab projectId={project.id} />
          </TabsContent>
        </Tabs>
      )}
    </DetailShell>
  );
};

export default ProjectDetailPage;
