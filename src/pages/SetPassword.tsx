import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { Lock, ShieldCheck } from 'lucide-react';
import logo from '@/assets/mayukh-solar-logo.png';

const SetPassword = () => {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const { refreshProfile } = useAuth();
  const navigate = useNavigate();

  const handleSetPassword = async () => {
    if (password.length < 8) {
      toast({ title: 'Weak password', description: 'Password must be at least 8 characters', variant: 'destructive' });
      return;
    }
    if (password !== confirmPassword) {
      toast({ title: 'Mismatch', description: 'Passwords do not match', variant: 'destructive' });
      return;
    }
    setLoading(true);
    try {
      const { error: pwError } = await supabase.auth.updateUser({ password });
      if (pwError) throw pwError;

      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from('staff').update({ must_change_password: false }).eq('user_id', user.id);
      }
      await refreshProfile();
      toast({ title: 'Password set!', description: 'Your account is now ready.' });
      navigate('/');
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md shadow-elevated border-0">
        <CardContent className="p-8">
          <div className="text-center mb-8">
            <div className="flex justify-center mb-4">
              <img src={logo} alt="Mayukh Solar" width={64} height={64} />
            </div>
            <ShieldCheck className="mx-auto h-10 w-10 text-primary mb-3" />
            <h1 className="text-xl font-bold text-foreground">Set Your Password</h1>
            <p className="text-sm text-muted-foreground mt-1">Create a permanent password for your account</p>
          </div>

          <div className="space-y-4">
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="password"
                placeholder="New password (min 8 chars)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pl-10 h-12"
              />
            </div>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="password"
                placeholder="Confirm password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="pl-10 h-12"
                onKeyDown={(e) => e.key === 'Enter' && handleSetPassword()}
              />
            </div>
            <Button
              onClick={handleSetPassword}
              className="w-full h-12 gradient-primary text-primary-foreground font-semibold"
              disabled={loading || !password || !confirmPassword}
            >
              {loading ? 'Setting...' : 'Set Password & Continue'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default SetPassword;
