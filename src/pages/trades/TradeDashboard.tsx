import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Camera,
  CheckCircle2,
  Clock,
  MapPin,
  Phone,
  Search,
  Wrench,
  Zap,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import PageContainer from '@/components/common/PageContainer';
import PageHeader from '@/components/common/PageHeader';
import EmptyState from '@/components/common/EmptyState';
import ErrorState from '@/components/common/ErrorState';
import StatCard from '@/components/dashboard/StatCard';
import MarkWorkDoneDialog from '@/components/projects/MarkWorkDoneDialog';
import {
  TRADE_PHOTO,
  fetchTradeJobs,
  isTradeDone,
  mapsLinkFor,
  type Trade,
  type TradeJob,
} from '@/lib/projectWork';

interface Props {
  trade: Trade;
}

const structureLabels: Record<string, string> = {
  rcc_roof: 'RCC Roof',
  tin_shed_roof: 'Tin Shed Roof',
  ground_mount: 'Ground Mount',
};

const tradeCopy = {
  welder: {
    title: 'My Installations',
    description: 'Structure work assigned to you. Mark a job done once the plant is up.',
    icon: Wrench,
    action: 'Mark structure done',
  },
  electrician: {
    title: 'My Wiring Jobs',
    description: 'Wiring assigned to you. Record serial numbers when you finish.',
    icon: Zap,
    action: 'Mark wiring done',
  },
} as const;

/**
 * Shared dashboard for welders and electricians.
 *
 * Both trades do the same thing — look at their jobs, call the customer, drive
 * to site, finish, photograph, submit — so they share one screen rather than
 * two near-identical ones that drift apart.
 */
const TradeDashboard = ({ trade }: Props) => {
  const { user } = useAuth();
  const copy = tradeCopy[trade];

  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<'pending' | 'done'>('pending');
  const [activeJob, setActiveJob] = useState<TradeJob | null>(null);

  const jobsQuery = useQuery({
    queryKey: ['trade-jobs', trade, user?.id],
    queryFn: () => fetchTradeJobs(trade, user!.id),
    enabled: Boolean(user?.id),
  });

  const jobs = jobsQuery.data ?? [];
  const pending = jobs.filter((j) => !isTradeDone(j, trade));
  const done = jobs.filter((j) => isTradeDone(j, trade));

  const displayed = useMemo(() => {
    const list = tab === 'pending' ? pending : done;
    const term = search.trim().toLowerCase();
    if (!term) return list;
    return list.filter((job) => {
      const kNumber = job.k_number ?? job.leads?.k_number ?? '';
      return (
        kNumber.toLowerCase().includes(term) ||
        (job.leads?.customer_name ?? '').toLowerCase().includes(term) ||
        (job.leads?.mobile ?? '').includes(term)
      );
    });
  }, [tab, pending, done, search]);

  return (
    <PageContainer>
      <PageHeader title={copy.title} description={copy.description} icon={copy.icon} />

      <div className="grid grid-cols-2 gap-3 sm:gap-4">
        <StatCard
          onClick={() => setTab('pending')}
          title="Pending"
          value={pending.length}
          icon={Clock}
          accent={pending.length > 0 ? 'warning' : 'success'}
        />
        <StatCard
          onClick={() => setTab('done')}
          title="Completed"
          value={done.length}
          icon={CheckCircle2}
          accent="success"
        />
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by K-Number, name or mobile…"
          className="h-11 pl-9"
        />
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as 'pending' | 'done')}>
        <TabsList className="w-full">
          <TabsTrigger value="pending" className="flex-1 gap-1.5">
            Pending
            {pending.length > 0 && (
              <Badge variant="destructive" className="px-1.5 text-[10px]">
                {pending.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="done" className="flex-1">
            Completed
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {jobsQuery.isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-52 rounded-2xl" />
          ))}
        </div>
      ) : jobsQuery.error ? (
        <ErrorState error={jobsQuery.error} onRetry={() => jobsQuery.refetch()} />
      ) : displayed.length === 0 ? (
        <EmptyState
          title={
            search
              ? 'No matches'
              : tab === 'pending'
                ? 'Nothing pending'
                : 'Nothing completed yet'
          }
          description={
            search
              ? 'Try a different search term.'
              : tab === 'pending'
                ? 'New jobs appear here once an operator assigns you to a project.'
                : 'Jobs you finish will be listed here.'
          }
          icon={copy.icon}
        />
      ) : (
        <div className="space-y-3">
          {displayed.map((job) => {
            const kNumber = job.k_number ?? job.leads?.k_number;
            const complete = isTradeDone(job, trade);

            return (
              <div
                key={job.id}
                className="rounded-2xl border border-border/70 bg-card p-4 shadow-card"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-mono text-sm font-bold text-foreground">
                      {kNumber ?? (
                        <span className="font-sans font-normal text-muted-foreground">
                          No K-Number
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 text-sm font-semibold text-foreground">
                      {job.leads?.customer_name ?? job.consumer_name ?? 'Customer'}
                    </p>
                  </div>
                  <Badge
                    className={
                      complete
                        ? 'border-transparent bg-success/15 text-success'
                        : 'border-transparent bg-warning/15 text-warning'
                    }
                  >
                    {complete ? 'Done' : 'Pending'}
                  </Badge>
                </div>

                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-border/50 pt-3 text-sm">
                  <div>
                    <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Capacity
                    </dt>
                    <dd className="font-medium">{job.capacity_kw} kW</dd>
                  </div>
                  <div>
                    <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Structure
                    </dt>
                    <dd className="font-medium">
                      {structureLabels[job.structure_type] ?? job.structure_type}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Panels
                    </dt>
                    <dd className="font-medium">
                      {job.panel_qty}× {job.panel_watt}W
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Inverter
                    </dt>
                    <dd className="font-medium">
                      {job.inverter_brand} {job.inverter_capacity}kW
                    </dd>
                  </div>
                </dl>

                {job.special_notes && (
                  <p className="mt-3 rounded-lg bg-muted/50 p-2.5 text-sm text-muted-foreground">
                    {job.special_notes}
                  </p>
                )}

                {/* Call and navigate were plain text before — the two things a
                    worker standing outside a house actually needs. */}
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {job.leads?.mobile && (
                    <Button variant="outline" className="h-11 gap-2" asChild>
                      <a href={`tel:${job.leads.mobile}`}>
                        <Phone className="h-4 w-4" /> Call
                      </a>
                    </Button>
                  )}
                  <Button variant="outline" className="h-11 gap-2" asChild>
                    <a href={mapsLinkFor(job)} target="_blank" rel="noreferrer">
                      <MapPin className="h-4 w-4" /> Navigate
                    </a>
                  </Button>
                </div>

                {job.leads?.address && (
                  <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                    {[job.leads.address, job.leads.village_city, job.leads.district]
                      .filter(Boolean)
                      .join(', ')}
                  </p>
                )}

                {!complete && (
                  <Button
                    className="mt-3 h-12 w-full gap-2"
                    onClick={() => setActiveJob(job)}
                  >
                    <Camera className="h-4 w-4" /> {copy.action}
                  </Button>
                )}

                {complete && !job.hasPhoto && (
                  <p className="mt-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                    Marked done but the {TRADE_PHOTO[trade].label.toLowerCase()} is missing.
                    Upload it so the operator can verify the work.
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      <MarkWorkDoneDialog
        open={Boolean(activeJob)}
        onOpenChange={(open) => !open && setActiveJob(null)}
        job={activeJob}
        trade={trade}
        userId={user?.id ?? ''}
        onCompleted={() => jobsQuery.refetch()}
      />
    </PageContainer>
  );
};

export default TradeDashboard;
