import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { UserPlus, UserCog } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { invokeApi } from '@/lib/apiClient';
import PageContainer from '@/components/common/PageContainer';
import PageHeader from '@/components/common/PageHeader';
import SectionCard from '@/components/common/SectionCard';
import FormShell from '@/components/common/FormShell';
import TextField from '@/components/common/fields/TextField';
import SelectField from '@/components/common/fields/SelectField';
import SwitchField from '@/components/common/fields/SwitchField';
import ErrorState from '@/components/common/ErrorState';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { appRoleSchema, mobileSchema, optionalEmailSchema, requiredText } from '@/lib/schemas';
import { roleMeta } from '@/lib/statusMeta';
import { fetchStaffMember } from '@/lib/staff';

const staffFormSchema = z.object({
  full_name: requiredText('Full name', 100),
  mobile: mobileSchema,
  email: optionalEmailSchema,
  role: appRoleSchema,
  is_active: z.boolean(),
});

type StaffFormValues = z.infer<typeof staffFormSchema>;

const roleOptions = Object.entries(roleMeta).map(([value, meta]) => ({
  value,
  label: meta.label,
}));

/**
 * Create and edit a staff member.
 *
 * Both operations go through edge functions rather than direct table writes:
 * creating a member also provisions an `auth.users` row, and changing the role
 * touches `user_roles`. Those need the service role, so they cannot run client
 * side.
 */
const StaffFormPage = () => {
  const { id } = useParams<{ id: string }>();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const existingQuery = useQuery({
    queryKey: ['staff', id],
    queryFn: () => fetchStaffMember(id!),
    enabled: isEdit,
  });

  const form = useForm<StaffFormValues>({
    resolver: zodResolver(staffFormSchema),
    defaultValues: {
      full_name: '',
      mobile: '',
      email: '',
      role: 'sales_person',
      is_active: true,
    },
  });

  // Populate once the record arrives. `reset` rather than per-field setValue so
  // `formState.isDirty` stays accurate — otherwise the unsaved-changes guard
  // would fire immediately on an untouched edit form.
  const existing = existingQuery.data;
  useEffect(() => {
    if (!existing) return;
    form.reset({
      full_name: existing.full_name,
      mobile: existing.mobile,
      email: existing.email ?? '',
      role: existing.role ?? 'sales_person',
      is_active: existing.is_active,
    });
  }, [existing, form]);

  const onSubmit = async (values: StaffFormValues) => {
    setSubmitError(null);
    try {
      // These routes accept only name, mobile and role — they provision the auth
      // user and write user_roles, both of which need the service key.
      const { data, error } = isEdit
        ? await invokeApi('update-staff', {
            body: {
              action: 'update',
              staff_id: id,
              user_id: existing!.user_id,
              full_name: values.full_name,
              mobile: values.mobile,
              role: values.role,
            },
          })
        : await invokeApi('create-staff', {
            body: {
              full_name: values.full_name,
              mobile: values.mobile,
              role: values.role,
            },
          });

      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);

      // Email and active flag aren't handled by those functions, so they go
      // straight to the table — admins have UPDATE on `staff` under RLS.
      if (isEdit) {
        const { error: patchError } = await supabase
          .from('staff')
          .update({ email: values.email || null, is_active: values.is_active })
          .eq('id', id!);
        if (patchError) throw new Error(patchError.message);
      } else if (values.email && data?.user_id) {
        // create-staff returns user_id, not the staff row id.
        await supabase.from('staff').update({ email: values.email }).eq('user_id', data.user_id);
      }

      queryClient.invalidateQueries({ queryKey: ['staff'] });
      toast({
        title: isEdit ? 'Staff member updated' : 'Staff member created',
        description:
          !isEdit && data?.temp_pin
            ? `Temporary PIN: ${data.temp_pin} — share it with them; they must change it at first sign-in.`
            : undefined,
        // A one-time credential the admin has to write down, so give them time.
        duration: !isEdit && data?.temp_pin ? 30000 : undefined,
      });

      navigate(isEdit ? `/users/${id}` : '/users');
    } catch (err) {
      // Held on the form rather than only in a toast, so it stays visible
      // beside the submit button while the user corrects the problem.
      setSubmitError(err instanceof Error ? err.message : String(err));
    }
  };

  if (isEdit && existingQuery.isLoading) {
    return (
      <PageContainer width="narrow">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-64 rounded-2xl" />
      </PageContainer>
    );
  }

  if (isEdit && existingQuery.error) {
    return (
      <PageContainer width="narrow">
        <PageHeader title="Edit staff" back="/users" />
        <ErrorState error={existingQuery.error} onRetry={() => existingQuery.refetch()} />
      </PageContainer>
    );
  }

  return (
    <PageContainer width="narrow">
      <PageHeader
        title={isEdit ? 'Edit staff member' : 'Add staff member'}
        icon={isEdit ? UserCog : UserPlus}
        back={isEdit ? `/users/${id}` : '/users'}
      />

      <FormShell
        form={form}
        onSubmit={onSubmit}
        submitLabel={isEdit ? 'Save changes' : 'Create staff member'}
        cancelTo={isEdit ? `/users/${id}` : '/users'}
        submitError={submitError}
      >
        <SectionCard title="Details">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <TextField
              form={form}
              name="full_name"
              label="Full name"
              placeholder="e.g. Ramesh Kumar"
              required
              autoComplete="name"
              className="sm:col-span-2"
            />
            <TextField
              form={form}
              name="mobile"
              label="Mobile number"
              placeholder="10-digit number"
              type="tel"
              inputMode="numeric"
              required
              description="Used to sign in to the portal."
            />
            <TextField
              form={form}
              name="email"
              label="Email"
              placeholder="name@example.com"
              type="email"
            />
          </div>
        </SectionCard>

        <SectionCard title="Access">
          <div className="space-y-4">
            <SelectField
              form={form}
              name="role"
              label="Role"
              options={roleOptions}
              required
            />
            {isEdit && (
              <SwitchField
                form={form}
                name="is_active"
                label="Account active"
                description="Turn off to block sign-in without deleting their records."
              />
            )}
          </div>
        </SectionCard>
      </FormShell>
    </PageContainer>
  );
};

export default StaffFormPage;
