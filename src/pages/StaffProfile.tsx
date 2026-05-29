import { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, Mail, User, Phone, ShieldCheck, KeyRound } from 'lucide-react';

const StaffProfile = () => {
  const { staff, user, refreshProfile } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [sendingOtp, setSendingOtp] = useState(false);

  useEffect(() => {
    const placeholder = user?.email?.endsWith('@mayukhsolar.app');
    setEmail(placeholder ? '' : (staff?.email || user?.email || ''));
  }, [staff, user]);

  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const currentEmail = staff?.email || (user?.email?.endsWith('@mayukhsolar.app') ? '' : user?.email || '');

  const saveEmail = async () => {
    if (!validEmail) {
      toast({ title: 'Invalid email', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke('update-staff-email', { body: { email } });
      if (error) throw new Error(error.message);
      if ((data as any)?.error) throw new Error((data as any).error);
      await refreshProfile();
      toast({ title: 'Email saved', description: 'You can now sign in with this email via OTP.' });
    } catch (e: any) {
      toast({ title: 'Failed', description: e.message, variant: 'destructive' });
    } finally { setSaving(false); }
  };

  const sendTestOtp = async () => {
    if (!currentEmail) {
      toast({ title: 'Add your email first', variant: 'destructive' });
      return;
    }
    setSendingOtp(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({ email: currentEmail, options: { shouldCreateUser: false } });
      if (error) throw error;
      toast({ title: 'OTP sent', description: `Check ${currentEmail} for the verification code.` });
    } catch (e: any) {
      toast({ title: 'Failed', description: e.message, variant: 'destructive' });
    } finally { setSendingOtp(false); }
  };

  return (
    <div className="p-4 lg:p-8 max-w-2xl mx-auto space-y-6">
      <Helmet><title>My Profile | Mayukh Solar</title></Helmet>

      <Button variant="ghost" onClick={() => navigate(-1)}>
        <ArrowLeft className="h-4 w-4 mr-2" /> Back
      </Button>

      <Card className="shadow-card border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <User className="h-5 w-5 text-primary" /> Staff Profile
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Name</Label>
              <div className="flex items-center gap-2 text-sm font-medium">
                <User className="h-4 w-4 text-muted-foreground" />{staff?.full_name || '—'}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Mobile</Label>
              <div className="flex items-center gap-2 text-sm font-medium">
                <Phone className="h-4 w-4 text-muted-foreground" />{staff?.mobile || '—'}
              </div>
            </div>
          </div>

          <div className="space-y-2 pt-2 border-t border-border">
            <Label htmlFor="email" className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-primary" /> Email Address (for OTP login)
            </Label>
            <Input
              id="email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-11"
            />
            <p className="text-xs text-muted-foreground">
              Add your real email address. We'll send a 6-digit OTP to this email whenever you sign in via "Email OTP".
            </p>
            <Button
              onClick={saveEmail}
              disabled={saving || !validEmail || email.trim().toLowerCase() === (currentEmail || '').toLowerCase()}
              className="gradient-primary text-primary-foreground"
            >
              <ShieldCheck className="h-4 w-4 mr-2" />
              {saving ? 'Saving...' : 'Save Email'}
            </Button>
          </div>

          {currentEmail && (
            <div className="pt-4 border-t border-border space-y-2">
              <p className="text-sm text-muted-foreground">
                Verified email: <span className="font-medium text-foreground">{currentEmail}</span>
              </p>
              <Button variant="outline" onClick={sendTestOtp} disabled={sendingOtp}>
                <KeyRound className="h-4 w-4 mr-2" />
                {sendingOtp ? 'Sending...' : 'Send test OTP to my email'}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default StaffProfile;
