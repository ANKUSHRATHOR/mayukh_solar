import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, UserPlus } from 'lucide-react';
import type { Database } from '@/integrations/supabase/types';

type AppRole = Database['public']['Enums']['app_role'];

const roles: { value: AppRole; label: string }[] = [
  { value: 'admin', label: 'Admin' },
  { value: 'telecaller', label: 'Telecaller' },
  { value: 'sales_person', label: 'Sales Person' },
  { value: 'operator', label: 'Operator' },
  { value: 'welder', label: 'Welder' },
  { value: 'electrician', label: 'Electrician' },
];

const AddStaff = () => {
  const [fullName, setFullName] = useState('');
  const [mobile, setMobile] = useState('');
  const [role, setRole] = useState<AppRole | ''>('');
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();

  const validateMobile = (num: string) => /^[6-9]\d{9}$/.test(num);

  const handleCreate = async () => {
    if (!fullName.trim()) {
      toast({ title: 'Name required', variant: 'destructive' });
      return;
    }
    if (!validateMobile(mobile)) {
      toast({ title: 'Invalid mobile', description: 'Enter a valid 10-digit number', variant: 'destructive' });
      return;
    }
    if (!role) {
      toast({ title: 'Role required', variant: 'destructive' });
      return;
    }

    // Check admin limit
    if (role === 'admin') {
      const { data: adminCount } = await supabase.rpc('count_admins');
      if (adminCount && adminCount >= 2) {
        toast({ title: 'Admin limit reached', description: 'Maximum 2 admin accounts allowed', variant: 'destructive' });
        return;
      }
    }

    setLoading(true);
    try {
      const tempPin = Math.floor(100000 + Math.random() * 900000).toString();
      const mobileEmail = `${mobile}@mayukhsolar.app`;

      // Create auth user with temp password
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: mobileEmail,
        password: tempPin,
      });
      if (authError) throw authError;
      if (!authData.user) throw new Error('Failed to create user');

      const userId = authData.user.id;

      // Create staff record
      const { error: staffError } = await supabase.from('staff').insert({
        user_id: userId,
        full_name: fullName.trim(),
        mobile,
        must_change_password: true,
      });
      if (staffError) throw staffError;

      // Assign role
      const { error: roleError } = await supabase.from('user_roles').insert({
        user_id: userId,
        role,
      });
      if (roleError) throw roleError;

      toast({
        title: 'Staff Created!',
        description: `Temporary PIN: ${tempPin} — Share with ${fullName}. They must change it on first login.`,
      });

      navigate('/staff');
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 lg:p-8 max-w-lg mx-auto space-y-6">
      <Button variant="ghost" onClick={() => navigate('/staff')} className="mb-2">
        <ArrowLeft className="mr-2 h-4 w-4" /> Back to Staff
      </Button>

      <Card className="shadow-elevated border-0">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <UserPlus className="h-5 w-5 text-primary" /> Add New Staff
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="name">Full Name</Label>
            <Input
              id="name"
              placeholder="Enter staff full name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="h-11"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="mobile">Mobile Number</Label>
            <Input
              id="mobile"
              type="tel"
              placeholder="10-digit mobile number"
              value={mobile}
              onChange={(e) => setMobile(e.target.value.replace(/\D/g, '').slice(0, 10))}
              className="h-11"
              maxLength={10}
            />
          </div>

          <div className="space-y-2">
            <Label>Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as AppRole)}>
              <SelectTrigger className="h-11">
                <SelectValue placeholder="Select role" />
              </SelectTrigger>
              <SelectContent>
                {roles.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button
            onClick={handleCreate}
            className="w-full h-12 gradient-primary text-primary-foreground font-semibold"
            disabled={loading}
          >
            {loading ? 'Creating...' : 'Create Staff Account'}
          </Button>

          <p className="text-xs text-muted-foreground text-center">
            A temporary 6-digit PIN will be generated. Share it with the staff member — they'll set a permanent password on first login.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default AddStaff;
