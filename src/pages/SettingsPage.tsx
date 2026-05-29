import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Lock, User, Phone, Mail, Shield, Bell, BellOff } from 'lucide-react';
import { isPushSupported, enablePushNotifications, disablePushNotifications, getPushPermission } from '@/lib/push';

const SettingsPage = () => {
  const { staff, role, refreshProfile } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editingProfile, setEditingProfile] = useState(false);
  const { toast } = useToast();
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const pushSupported = isPushSupported();

  useEffect(() => {
    if (!pushSupported) return;
    getPushPermission().then(p => setPushEnabled(p === 'granted'));
  }, [pushSupported]);

  const savePushPref = async (enabled: boolean) => {
    if (!staff?.user_id) return;
    await (supabase as any).from('notification_preferences').upsert({
      user_id: staff.user_id,
      push_enabled: enabled,
      in_app_enabled: true,
    }, { onConflict: 'user_id' });
  };

  const handleTogglePush = async () => {
    setPushBusy(true);
    try {
      if (pushEnabled) {
        await disablePushNotifications();
        await savePushPref(false);
        setPushEnabled(false);
        toast({ title: 'Notifications disabled' });
      } else {
        const res = await enablePushNotifications();
        if (res.ok) {
          await savePushPref(true);
          setPushEnabled(true);
          toast({ title: 'Notifications enabled', description: 'You will get device alerts for new updates.' });
        } else {
          toast({ title: 'Could not enable', description: res.reason, variant: 'destructive' });
        }
      }
    } finally {
      setPushBusy(false);
    }
  };

  const roleLabel = role ? role.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase()) : '';

  const handleChangePassword = async () => {
    if (newPassword.length < 6) {
      toast({ title: 'Password too short', description: 'Minimum 6 characters', variant: 'destructive' });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({ title: 'Passwords do not match', variant: 'destructive' });
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      // Clear must_change_password flag
      if (staff) {
        await supabase.from('staff').update({ must_change_password: false }).eq('user_id', staff.user_id);
      }
      toast({ title: 'Password updated successfully' });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      refreshProfile();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateProfile = async () => {
    if (!staff) return;
    setLoading(true);
    try {
      // Update email via edge function (also syncs auth.users so OTP-by-email works)
      const newEmail = (editEmail || '').trim();
      if (newEmail !== (staff.email || '')) {
        if (newEmail) {
          const { data, error } = await supabase.functions.invoke('update-staff-email', { body: { email: newEmail } });
          if (error) throw new Error(error.message);
          if ((data as any)?.error) throw new Error((data as any).error);
        }
      }
      // Update name via direct table update (allowed by RLS)
      if (editName && editName !== staff.full_name) {
        const { error } = await supabase.from('staff').update({ full_name: editName }).eq('user_id', staff.user_id);
        if (error) throw error;
      }
      toast({ title: 'Profile updated' });
      refreshProfile();
      setEditingProfile(false);
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };


  return (
    <div className="p-6 lg:p-8 max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-foreground">Settings</h1>

      {/* Profile Card */}
      <Card className="shadow-card border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><User className="h-4 w-4" /> Profile</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!editingProfile ? (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs text-muted-foreground">Full Name</Label>
                  <p className="text-sm font-medium text-foreground">{staff?.full_name}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Mobile</Label>
                  <p className="text-sm font-medium text-foreground flex items-center gap-1"><Phone className="h-3 w-3" />{staff?.mobile}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Email</Label>
                  <p className="text-sm font-medium text-foreground flex items-center gap-1"><Mail className="h-3 w-3" />{staff?.email || '—'}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Role</Label>
                  <p className="text-sm font-medium text-foreground flex items-center gap-1"><Shield className="h-3 w-3" />{roleLabel}</p>
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={() => { setEditName(staff?.full_name || ''); setEditEmail(staff?.email || ''); setEditingProfile(true); }}>
                Edit Profile
              </Button>
            </>
          ) : (
            <div className="space-y-3">
              <div>
                <Label>Full Name</Label>
                <Input value={editName} onChange={e => setEditName(e.target.value)} />
              </div>
              <div>
                <Label>Email</Label>
                <Input type="email" value={editEmail} onChange={e => setEditEmail(e.target.value)} placeholder="Optional" />
              </div>
              <div className="flex gap-2">
                <Button onClick={handleUpdateProfile} disabled={loading} className="gradient-primary text-primary-foreground">Save</Button>
                <Button variant="outline" onClick={() => setEditingProfile(false)}>Cancel</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Change Password */}
      <Card className="shadow-card border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><Lock className="h-4 w-4" /> Change Password</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>New Password</Label>
            <Input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Minimum 6 characters" />
          </div>
          <div>
            <Label>Confirm Password</Label>
            <Input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="Re-enter new password" />
          </div>
          <Button onClick={handleChangePassword} disabled={loading || !newPassword || !confirmPassword} className="gradient-primary text-primary-foreground">
            {loading ? 'Updating...' : 'Update Password'}
          </Button>
        </CardContent>
      </Card>

      {/* Push Notifications */}
      <Card className="shadow-card border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            {pushEnabled ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />} Device Notifications
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {!pushSupported ? (
            <p className="text-sm text-muted-foreground">
              Your browser does not support push notifications. On iPhone, install this app to your Home Screen first.
            </p>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                Get instant alerts on your device for new leads, document approvals, and project updates — even when the app is closed.
              </p>
              <Button
                onClick={handleTogglePush}
                disabled={pushBusy}
                variant={pushEnabled ? 'outline' : 'default'}
                className={pushEnabled ? '' : 'gradient-primary text-primary-foreground'}
              >
                {pushBusy ? 'Working...' : pushEnabled ? 'Disable Notifications' : 'Enable Notifications'}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default SettingsPage;
