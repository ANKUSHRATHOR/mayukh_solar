import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { UserPlus, MoreVertical, Search, Shield, Power, Pencil, Trash2, KeyRound, History, Users, Phone, Briefcase, Wrench, Settings2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { Database } from '@/integrations/supabase/types';

type AppRole = Database['public']['Enums']['app_role'];

interface StaffWithRole {
  id: string;
  user_id: string;
  full_name: string;
  mobile: string;
  email: string | null;
  is_active: boolean;
  last_login: string | null;
  created_at: string;
  must_change_password?: boolean;
  temp_password_plain?: string | null;
  temp_password_issued_at?: string | null;
  role?: AppRole;
}

const roleColors: Record<AppRole, string> = {
  admin: 'bg-primary text-primary-foreground',
  telecaller: 'bg-info text-info-foreground',
  sales_person: 'bg-success text-success-foreground',
  operator: 'bg-warning text-warning-foreground',
  welder: 'bg-accent text-accent-foreground',
  electrician: 'bg-secondary text-secondary-foreground',
};

const roles: { value: AppRole; label: string }[] = [
  { value: 'admin', label: 'Admin' },
  { value: 'telecaller', label: 'Telecaller' },
  { value: 'sales_person', label: 'Sales Person' },
  { value: 'operator', label: 'Operator' },
  { value: 'welder', label: 'Welder' },
  { value: 'electrician', label: 'Electrician' },
];

const roleName = (r: AppRole) => r.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase());

const StaffManagement = () => {
  const [staffList, setStaffList] = useState<StaffWithRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [editStaff, setEditStaff] = useState<StaffWithRole | null>(null);
  const [editName, setEditName] = useState('');
  const [editMobile, setEditMobile] = useState('');
  const [editRole, setEditRole] = useState<AppRole | ''>('');
  const [editLoading, setEditLoading] = useState(false);
  const [deleteStaff, setDeleteStaff] = useState<StaffWithRole | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [resetStaff, setResetStaff] = useState<StaffWithRole | null>(null);
  const [resetLoading, setResetLoading] = useState(false);
  const [tempPassword, setTempPassword] = useState('');
  const { toast } = useToast();
  const navigate = useNavigate();

  const fetchStaff = async () => {
    setLoading(true);
    try {
      const { data: staffData, error } = await supabase
        .from('staff')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      const { data: rolesData } = await supabase.from('user_roles').select('*');

      const roleMap = new Map<string, AppRole>();
      rolesData?.forEach((r) => roleMap.set(r.user_id, r.role));

      const enriched: StaffWithRole[] = (staffData || []).map((s) => ({
        ...s,
        role: roleMap.get(s.user_id),
      }));

      setStaffList(enriched);
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchStaff(); }, []);

  const toggleActive = async (staff: StaffWithRole) => {
    try {
      const { error } = await supabase
        .from('staff')
        .update({ is_active: !staff.is_active })
        .eq('id', staff.id);
      if (error) throw error;
      toast({ title: staff.is_active ? 'Staff deactivated' : 'Staff activated' });
      fetchStaff();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  const openEdit = (s: StaffWithRole) => {
    setEditStaff(s);
    setEditName(s.full_name);
    setEditMobile(s.mobile);
    setEditRole(s.role || '');
  };

  const handleEdit = async () => {
    if (!editStaff || !editName.trim() || !editMobile || !editRole) {
      toast({ title: 'All fields required', variant: 'destructive' });
      return;
    }
    if (!/^[6-9]\d{9}$/.test(editMobile)) {
      toast({ title: 'Invalid mobile number', variant: 'destructive' });
      return;
    }
    setEditLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('update-staff', {
        body: {
          action: 'update',
          staff_id: editStaff.id,
          user_id: editStaff.user_id,
          full_name: editName.trim(),
          mobile: editMobile,
          role: editRole,
        },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      toast({ title: 'Staff updated successfully' });
      setEditStaff(null);
      fetchStaff();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setEditLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteStaff) return;
    setDeleteLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('update-staff', {
        body: {
          action: 'delete',
          staff_id: deleteStaff.id,
          user_id: deleteStaff.user_id,
        },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      toast({ title: 'Staff deleted successfully' });
      setDeleteStaff(null);
      fetchStaff();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!resetStaff) return;
    setResetLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('update-staff', {
        body: {
          action: 'reset_password',
          staff_id: resetStaff.id,
          user_id: resetStaff.user_id,
        },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      setTempPassword(data.temp_password);
      toast({ title: 'Password reset successfully' });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
      setResetStaff(null);
    } finally {
      setResetLoading(false);
    }
  };

  const matchesSearch = (s: StaffWithRole) =>
    s.full_name.toLowerCase().includes(search.toLowerCase()) ||
    s.mobile.includes(search) ||
    (s.email?.toLowerCase().includes(search.toLowerCase()) ?? false) ||
    (s.role && roleName(s.role).toLowerCase().includes(search.toLowerCase()));

  const categories = useMemo(() => ([
    { key: 'all', label: 'All', icon: Users, roles: null as AppRole[] | null },
    { key: 'admin', label: 'Admin', icon: Shield, roles: ['admin'] as AppRole[] },
    { key: 'sales_person', label: 'Sales', icon: Briefcase, roles: ['sales_person'] as AppRole[] },
    { key: 'telecaller', label: 'Telecaller', icon: Phone, roles: ['telecaller'] as AppRole[] },
    { key: 'operator', label: 'Operator', icon: Settings2, roles: ['operator'] as AppRole[] },
    { key: 'installation', label: 'Installation', icon: Wrench, roles: ['welder', 'electrician'] as AppRole[] },
  ]), []);

  const [tab, setTab] = useState<string>('all');

  const visible = staffList.filter((s) => {
    if (!matchesSearch(s)) return false;
    const cat = categories.find((c) => c.key === tab);
    if (!cat || cat.roles === null) return true;
    return s.role ? cat.roles.includes(s.role) : false;
  });

  const countFor = (key: string) => {
    const cat = categories.find((c) => c.key === key);
    if (!cat || cat.roles === null) return staffList.length;
    return staffList.filter((s) => s.role && cat.roles!.includes(s.role)).length;
  };

  const renderList = () => {
    if (loading) {
      return <div className="text-center py-12 text-muted-foreground">Loading staff...</div>;
    }
    if (visible.length === 0) {
      return (
        <Card className="shadow-card border-border">
          <CardContent className="py-12 text-center">
            <Shield className="mx-auto h-12 w-12 text-muted-foreground/40 mb-4" />
            <p className="text-muted-foreground">
              {search ? 'No staff found matching your search.' : 'No staff members in this category yet.'}
            </p>
          </CardContent>
        </Card>
      );
    }
    return (
      <div className="grid gap-3">
        {visible.map((s) => (
          <Card key={s.id} className="shadow-card border-border hover:shadow-elevated transition-shadow">
            <CardContent className="p-4 flex items-center gap-4">
              <div className="h-10 w-10 rounded-full gradient-primary flex items-center justify-center text-primary-foreground font-bold text-sm shrink-0">
                {s.full_name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-semibold text-sm text-foreground">{s.full_name}</p>
                  {s.role && (
                    <Badge className={`text-xs ${roleColors[s.role]}`}>
                      {roleName(s.role)}
                    </Badge>
                  )}
                  <Badge variant={s.is_active ? 'default' : 'secondary'} className="text-xs">
                    {s.is_active ? 'Active' : 'Inactive'}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5 truncate">
                  {s.mobile} {s.last_login ? `• Last login: ${new Date(s.last_login).toLocaleDateString()}` : '• Never logged in'}
                </p>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="shrink-0">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => openEdit(s)}>
                    <Pencil className="mr-2 h-4 w-4" />
                    Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => { setResetStaff(s); setTempPassword(''); }}>
                    <KeyRound className="mr-2 h-4 w-4" />
                    Reset Password
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => toggleActive(s)}>
                    <Power className="mr-2 h-4 w-4" />
                    {s.is_active ? 'Deactivate' : 'Activate'}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setDeleteStaff(s)} className="text-destructive focus:text-destructive">
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  };

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Staff Management</h1>
          <p className="text-muted-foreground text-sm mt-1">{staffList.length} staff members</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => navigate('/staff/reset-logs')}>
            <History className="mr-2 h-4 w-4" /> Reset Logs
          </Button>
          <Button onClick={() => navigate('/staff/new')} className="gradient-primary text-primary-foreground font-semibold">
            <UserPlus className="mr-2 h-4 w-4" /> Add Staff
          </Button>
        </div>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by name, mobile, email, or role..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList className="flex w-full flex-wrap justify-start gap-1 h-auto p-1">
          {categories.map((c) => {
            const Icon = c.icon;
            return (
              <TabsTrigger key={c.key} value={c.key} className="data-[state=active]:gradient-primary data-[state=active]:text-primary-foreground gap-2">
                <Icon className="h-3.5 w-3.5" />
                <span>{c.label}</span>
                <Badge variant="secondary" className="ml-1 text-[10px] px-1.5 py-0 h-4">{countFor(c.key)}</Badge>
              </TabsTrigger>
            );
          })}
        </TabsList>
        {categories.map((c) => (
          <TabsContent key={c.key} value={c.key} className="mt-4">
            {renderList()}
          </TabsContent>
        ))}
      </Tabs>

      {/* Admin Credentials Panel — shows any staff with a pending temp PIN */}
      {(() => {
        const pending = staffList.filter((s) => s.temp_password_plain && s.must_change_password);
        if (pending.length === 0) return null;
        return (
          <Card className="border-warning/40 bg-warning/5 shadow-card">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center gap-2">
                <KeyRound className="h-4 w-4 text-warning" />
                <p className="font-semibold text-sm text-foreground">Pending Temporary PINs ({pending.length})</p>
              </div>
              <p className="text-xs text-muted-foreground">
                These staff have not changed their password yet. Share the PIN privately — it disappears once they set a new password.
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {pending.map((s) => (
                  <div key={s.id} className="flex items-center justify-between gap-3 rounded-md border border-border bg-background px-3 py-2">
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{s.full_name}</p>
                      <p className="text-[11px] text-muted-foreground truncate">
                        {s.mobile} {s.temp_password_issued_at ? `• issued ${new Date(s.temp_password_issued_at).toLocaleDateString()}` : ''}
                      </p>
                    </div>
                    <span className="font-mono text-lg font-bold tracking-widest text-primary select-all">{s.temp_password_plain}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        );
      })()}




      {/* Edit Dialog */}
      <Dialog open={!!editStaff} onOpenChange={(open) => !open && setEditStaff(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Staff Member</DialogTitle>
            <DialogDescription>Update staff details and role.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Full Name</Label>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Mobile Number</Label>
              <Input
                type="tel"
                value={editMobile}
                onChange={(e) => setEditMobile(e.target.value.replace(/\D/g, '').slice(0, 10))}
                maxLength={10}
              />
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={editRole} onValueChange={(v) => setEditRole(v as AppRole)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent>
                  {roles.map((r) => (
                    <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditStaff(null)}>Cancel</Button>
            <Button onClick={handleEdit} disabled={editLoading}>
              {editLoading ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteStaff} onOpenChange={(open) => !open && setDeleteStaff(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Staff Member</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to permanently delete <strong>{deleteStaff?.full_name}</strong>? This will remove their account, role, and all access. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleteLoading}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteLoading ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reset Password Dialog */}
      <AlertDialog open={!!resetStaff} onOpenChange={(open) => { if (!open) { setResetStaff(null); setTempPassword(''); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset Password</AlertDialogTitle>
            <AlertDialogDescription>
              {tempPassword ? (
                <span className="space-y-2 block">
                  <span className="block">Temporary password for <strong>{resetStaff?.full_name}</strong>:</span>
                  <span className="block bg-muted p-3 rounded-md font-mono text-lg text-foreground text-center select-all">{tempPassword}</span>
                  <span className="block text-xs">Share this with the staff member. They will be asked to set a new password on next login.</span>
                </span>
              ) : (
                <>Reset password for <strong>{resetStaff?.full_name}</strong>? A temporary password will be generated.</>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            {tempPassword ? (
              <Button onClick={() => { setResetStaff(null); setTempPassword(''); }}>Done</Button>
            ) : (
              <>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <Button onClick={handleResetPassword} disabled={resetLoading}>
                  {resetLoading ? 'Resetting...' : 'Reset Password'}
                </Button>
              </>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default StaffManagement;
