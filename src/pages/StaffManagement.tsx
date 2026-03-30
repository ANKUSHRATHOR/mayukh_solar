import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { UserPlus, MoreVertical, Search, Shield, Power } from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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

const roleName = (r: AppRole) => r.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase());

const StaffManagement = () => {
  const [staffList, setStaffList] = useState<StaffWithRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
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

  const filtered = staffList.filter((s) =>
    s.full_name.toLowerCase().includes(search.toLowerCase()) ||
    s.mobile.includes(search) ||
    (s.role && roleName(s.role).toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Staff Management</h1>
          <p className="text-muted-foreground text-sm mt-1">{staffList.length} staff members</p>
        </div>
        <Button onClick={() => navigate('/staff/new')} className="gradient-primary text-primary-foreground font-semibold">
          <UserPlus className="mr-2 h-4 w-4" /> Add Staff
        </Button>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by name, mobile, or role..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Loading staff...</div>
      ) : filtered.length === 0 ? (
        <Card className="shadow-card border-border">
          <CardContent className="py-12 text-center">
            <Shield className="mx-auto h-12 w-12 text-muted-foreground/40 mb-4" />
            <p className="text-muted-foreground">
              {search ? 'No staff found matching your search.' : 'No staff members yet. Add your first staff member.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {filtered.map((s) => (
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
                  <p className="text-xs text-muted-foreground mt-0.5">
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
                    <DropdownMenuItem onClick={() => toggleActive(s)}>
                      <Power className="mr-2 h-4 w-4" />
                      {s.is_active ? 'Deactivate' : 'Activate'}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default StaffManagement;
