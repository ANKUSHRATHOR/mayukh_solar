import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import {
  Activity,
  CalendarClock,
  ClipboardList,
  Mail,
  Pencil,
  Phone,
  ShieldAlert,
  ShieldCheck,
  User,
  UserCheck,
  UserX,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import DetailShell from '@/components/common/DetailShell';
import SectionCard from '@/components/common/SectionCard';
import DetailField, { DetailGrid } from '@/components/common/DetailField';
import StatusBadge from '@/components/common/StatusBadge';
import { useToast } from '@/hooks/use-toast';
import { roleMeta } from '@/lib/statusMeta';
import { fetchStaffActivity, fetchStaffMember, setStaffActive } from '@/lib/staff';

const StaffDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [confirmToggle, setConfirmToggle] = useState(false);

  const staffQuery = useQuery({
    queryKey: ['staff', id],
    queryFn: () => fetchStaffMember(id!),
    enabled: Boolean(id),
  });

  const staff = staffQuery.data;

  const activityQuery = useQuery({
    queryKey: ['staff-activity', staff?.user_id],
    queryFn: () => fetchStaffActivity(staff!.user_id),
    enabled: Boolean(staff?.user_id),
  });

  const toggleActive = useMutation({
    mutationFn: () => setStaffActive(staff!.id, !staff!.is_active),
    onSuccess: () => {
      toast({
        title: staff!.is_active ? 'Staff member deactivated' : 'Staff member activated',
        description: staff!.is_active
          ? 'They can no longer sign in to the portal.'
          : 'They can sign in again.',
      });
      queryClient.invalidateQueries({ queryKey: ['staff'] });
      setConfirmToggle(false);
    },
    onError: (err: unknown) => {
      toast({
        title: 'Could not update the account',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    },
  });

  return (
    <>
      <DetailShell
        title={staff?.full_name ?? 'Staff member'}
        icon={User}
        backTo="/users"
        isLoading={staffQuery.isLoading}
        error={staffQuery.error}
        onRetry={() => staffQuery.refetch()}
        notFound={!staffQuery.isLoading && !staffQuery.error && !staff}
        notFoundTitle="Staff member not found"
        meta={
          staff && (
            <>
              {staff.role ? (
                <StatusBadge value={staff.role} map={roleMeta} />
              ) : (
                <StatusBadge
                  value="no_role"
                  map={{ no_role: { label: 'No role assigned', tone: 'warning' } }}
                />
              )}
              <StatusBadge
                value={staff.is_active ? 'active' : 'inactive'}
                map={{
                  active: { label: 'Active', tone: 'success' },
                  inactive: { label: 'Inactive', tone: 'danger' },
                }}
              />
            </>
          )
        }
        actions={
          staff && (
            <>
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() => navigate(`/users/${staff.id}/edit`)}
              >
                <Pencil className="h-4 w-4" /> Edit
              </Button>
              <Button
                variant={staff.is_active ? 'outline' : 'default'}
                size="sm"
                className="gap-2"
                onClick={() => setConfirmToggle(true)}
              >
                {staff.is_active ? (
                  <>
                    <UserX className="h-4 w-4" /> Deactivate
                  </>
                ) : (
                  <>
                    <UserCheck className="h-4 w-4" /> Activate
                  </>
                )}
              </Button>
            </>
          )
        }
        aside={
          staff && (
            <>
              <SectionCard title="Access" icon={staff.role ? ShieldCheck : ShieldAlert}>
                <div className="space-y-4">
                  <DetailField
                    label="Role"
                    value={staff.role ? <StatusBadge value={staff.role} map={roleMeta} /> : null}
                    emptyText="Not assigned — they cannot use the portal"
                  />
                  <DetailField
                    label="Account"
                    value={staff.is_active ? 'Active' : 'Inactive'}
                  />
                  <DetailField
                    label="Password"
                    value={
                      staff.must_change_password
                        ? 'Must be changed at next sign-in'
                        : 'Set by the user'
                    }
                  />
                </div>
              </SectionCard>

              <SectionCard title="Activity" icon={Activity}>
                {activityQuery.isLoading ? (
                  <div className="space-y-3">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-4 w-2/3" />
                    <Skeleton className="h-4 w-1/2" />
                  </div>
                ) : activityQuery.error ? (
                  <p className="text-sm text-muted-foreground">
                    Activity counts are unavailable right now.
                  </p>
                ) : (
                  <div className="space-y-4">
                    <DetailField
                      label="Leads created"
                      value={activityQuery.data?.leadsCreated.toLocaleString('en-IN')}
                    />
                    <DetailField
                      label="Leads assigned"
                      value={activityQuery.data?.leadsAssigned.toLocaleString('en-IN')}
                    />
                    <DetailField
                      label="Open tasks"
                      value={activityQuery.data?.openTasks.toLocaleString('en-IN')}
                    />
                  </div>
                )}
              </SectionCard>
            </>
          )
        }
      >
        {staff && (
          <>
            <SectionCard title="Contact details" icon={Phone}>
              <DetailGrid>
                <DetailField label="Full name" value={staff.full_name} wide />
                <DetailField
                  label="Mobile"
                  value={
                    <a
                      href={`tel:${staff.mobile}`}
                      className="font-semibold text-primary hover:underline"
                    >
                      {staff.mobile}
                    </a>
                  }
                />
                <DetailField
                  label="Email"
                  value={
                    staff.email && (
                      <a
                        href={`mailto:${staff.email}`}
                        className="inline-flex items-center gap-1.5 font-semibold text-primary hover:underline"
                      >
                        <Mail className="h-3.5 w-3.5" />
                        <span className="truncate">{staff.email}</span>
                      </a>
                    )
                  }
                />
              </DetailGrid>
            </SectionCard>

            <SectionCard title="Account history" icon={CalendarClock}>
              <DetailGrid>
                <DetailField
                  label="Created"
                  value={format(new Date(staff.created_at), 'dd MMM yyyy, h:mm a')}
                />
                <DetailField
                  label="Last updated"
                  value={format(new Date(staff.updated_at), 'dd MMM yyyy, h:mm a')}
                />
                <DetailField
                  label="Last sign-in"
                  value={
                    staff.last_login
                      ? format(new Date(staff.last_login), 'dd MMM yyyy, h:mm a')
                      : null
                  }
                  emptyText="Never signed in"
                />
              </DetailGrid>
            </SectionCard>

            <SectionCard title="Related work" icon={ClipboardList}>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate(`/leads?assignee=${staff.user_id}`)}
                >
                  View their leads
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate(`/admin/attendance?staff=${staff.id}`)}
                >
                  View attendance
                </Button>
              </div>
            </SectionCard>
          </>
        )}
      </DetailShell>

      <AlertDialog open={confirmToggle} onOpenChange={setConfirmToggle}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {staff?.is_active ? 'Deactivate this account?' : 'Activate this account?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {staff?.is_active
                ? `${staff?.full_name} will be signed out and blocked from the portal. Their records are kept.`
                : `${staff?.full_name} will be able to sign in again with their existing credentials.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={toggleActive.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                toggleActive.mutate();
              }}
              disabled={toggleActive.isPending}
              className={
                staff?.is_active
                  ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
                  : undefined
              }
            >
              {toggleActive.isPending
                ? 'Working…'
                : staff?.is_active
                  ? 'Deactivate'
                  : 'Activate'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default StaffDetailPage;
