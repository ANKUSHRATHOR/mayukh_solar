import { useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Phone, Lock, ArrowRight, Sun, Mail, KeyRound, ShieldCheck } from 'lucide-react';
import logo from '@/assets/mayukh-solar-logo.png';
import SolarScene from '@/components/three/SolarScene';


type LoginMode = 'choose' | 'otp' | 'password' | 'email_otp' | 'email_password' | 'forgot_password';

const Login = () => {
  const [mobile, setMobile] = useState('');
  const [email, setEmail] = useState('');
  const [mode, setMode] = useState<LoginMode>('choose');
  const [otp, setOtp] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();

  const mobileEmail = `${mobile}@mayukhsolar.app`;
  const validateMobile = (num: string) => /^[6-9]\d{9}$/.test(num);
  const validateEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

  const handleSendOtp = async () => {
    if (!validateMobile(mobile)) {
      toast({ title: 'Invalid mobile number', description: 'Enter a valid 10-digit Indian mobile number', variant: 'destructive' });
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({ email: mobileEmail });
      if (error) throw error;
      setOtpSent(true);
      toast({ title: 'OTP Sent', description: `A verification code has been sent to ${mobile}` });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleSendEmailOtp = async () => {
    if (!validateEmail(email)) {
      toast({ title: 'Invalid email', description: 'Enter a valid email address', variant: 'destructive' });
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({ email });
      if (error) throw error;
      setOtpSent(true);
      toast({ title: 'OTP Sent', description: `A verification code has been sent to ${email}` });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (otp.length !== 6) {
      toast({ title: 'Invalid OTP', description: 'Enter the 6-digit code', variant: 'destructive' });
      return;
    }
    setLoading(true);
    try {
      const verifyEmail = mode === 'email_otp' ? email : mobileEmail;
      const { error } = await supabase.auth.verifyOtp({ email: verifyEmail, token: otp, type: 'email' });
      if (error) throw error;

      if (mode === 'forgot_password') {
        toast({ title: 'Identity Verified', description: 'Set your new password below' });
      } else {
        navigate('/');
      }
    } catch (err: any) {
      toast({ title: 'Verification Failed', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordLogin = async () => {
    if (!validateMobile(mobile)) {
      toast({ title: 'Invalid mobile number', description: 'Enter a valid 10-digit Indian mobile number', variant: 'destructive' });
      return;
    }
    if (!password) {
      toast({ title: 'Password required', variant: 'destructive' });
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: mobileEmail, password });
      if (error) throw error;
      navigate('/');
    } catch (err: any) {
      toast({ title: 'Login Failed', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleEmailPasswordLogin = async () => {
    if (!validateEmail(email)) {
      toast({ title: 'Invalid email', description: 'Enter a valid email address', variant: 'destructive' });
      return;
    }
    if (!password) {
      toast({ title: 'Password required', variant: 'destructive' });
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      navigate('/');
    } catch (err: any) {
      toast({ title: 'Login Failed', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (newPassword.length < 8) {
      toast({ title: 'Weak password', description: 'Password must be at least 8 characters', variant: 'destructive' });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({ title: 'Mismatch', description: 'Passwords do not match', variant: 'destructive' });
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      toast({ title: 'Password Reset', description: 'Your password has been updated successfully.' });
      navigate('/');
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const resetMode = () => {
    setMode('choose');
    setOtpSent(false);
    setOtp('');
    setPassword('');
    setNewPassword('');
    setConfirmPassword('');
  };

  return (
    <main className="relative min-h-dvh flex items-center justify-center p-4 overflow-hidden bg-[hsl(222_28%_9%)]">
      <Helmet>
        <title>Sign In | Mayukh Solar Staff Portal</title>
        <meta name="description" content="Secure staff sign-in for Mayukh Solar CRM. Access your leads, projects, quotations, and field workflow." />
        <link rel="canonical" href="https://mayukh-solar.lovable.app/login" />
        <meta property="og:title" content="Sign In | Mayukh Solar Staff Portal" />
        <meta property="og:description" content="Secure staff sign-in for Mayukh Solar CRM." />
        <meta property="og:url" content="https://mayukh-solar.lovable.app/login" />
      </Helmet>

      {/* Live 3D Solar Wallpaper */}
      <div className="fixed inset-0 z-0">
        <SolarScene />
      </div>
      {/* Atmospheric gradient veils */}
      <div className="fixed inset-0 z-[1] pointer-events-none">
        <div className="absolute inset-0 bg-[radial-gradient(1200px_600px_at_80%_-10%,hsl(22_96%_55%/0.28),transparent_60%),radial-gradient(900px_500px_at_-10%_110%,hsl(280_70%_55%/0.18),transparent_60%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,hsl(222_30%_8%/0.4),hsl(222_30%_8%/0.1)_40%,hsl(222_30%_8%/0.55))]" />
      </div>

      <div className="relative z-10 w-full max-w-md animate-in-up">
        {/* Floating glass card */}
        <div className="relative rounded-3xl glow-border">
          <div
            className="rounded-3xl border border-white/10 p-8 shadow-elevated"
            style={{
              background:
                'linear-gradient(180deg, hsl(0 0% 100% / 0.06), hsl(0 0% 100% / 0.01) 40%), linear-gradient(160deg, hsl(222 24% 16% / 0.72), hsl(222 28% 10% / 0.78))',
              backdropFilter: 'blur(22px) saturate(160%)',
              WebkitBackdropFilter: 'blur(22px) saturate(160%)',
            }}
          >
          <div className="text-center mb-8">
            <div className="flex justify-center mb-4">
              <div className="relative">
                <div className="absolute inset-0 rounded-full bg-primary/40 blur-2xl animate-glow-pulse" />
                <img src={logo} alt="Mayukh Solar" width={84} height={84} className="relative drop-shadow-[0_8px_24px_hsl(22_96%_55%/0.45)]" />
              </div>
            </div>
            <h1 className="text-2xl font-bold text-display tracking-tight">Mayukh Solar — Staff Portal</h1>
            <p className="text-xs text-muted-foreground mt-1.5 tracking-[0.18em] uppercase">V R Enterprises CRM</p>
          </div>


          <div className="space-y-4">
            {/* Mobile Input (shown for mobile-based modes) */}
            {(mode === 'choose' || mode === 'otp' || mode === 'password' || mode === 'forgot_password') && (
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="tel"
                  placeholder="Enter mobile number"
                  value={mobile}
                  onChange={e => setMobile(e.target.value.replace(/\D/g, '').slice(0, 10))}
                  className="pl-10 h-12 text-base"
                  maxLength={10}
                  disabled={mode !== 'choose' && mode !== 'forgot_password' && otpSent}
                />
              </div>
            )}

            {/* Email Input (shown for email OTP mode) */}
            {mode === 'email_otp' && (
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="email"
                  placeholder="Enter your email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="pl-10 h-12 text-base"
                  disabled={otpSent}
                />
              </div>
            )}

            {/* Mode: Choose */}
            {mode === 'choose' && (
              <div className="space-y-3">
                <div className="flex gap-3">
                  <Button
                    onClick={() => { setMode('otp'); handleSendOtp(); }}
                    className="flex-1 h-12 gradient-primary text-primary-foreground font-semibold"
                    disabled={loading || !validateMobile(mobile)}
                  >
                    <Sun className="mr-2 h-4 w-4" /> Get OTP
                  </Button>
                  <Button
                    onClick={() => setMode('password')}
                    variant="outline"
                    className="flex-1 h-12 font-semibold"
                    disabled={!validateMobile(mobile)}
                  >
                    <Lock className="mr-2 h-4 w-4" /> Password
                  </Button>
                </div>
                <Button
                  onClick={() => setMode('email_otp')}
                  variant="outline"
                  className="w-full h-11 font-semibold"
                >
                  <Mail className="mr-2 h-4 w-4" /> Login with Email OTP
                </Button>
              </div>
            )}

            {/* Mode: Mobile OTP */}
            {mode === 'otp' && otpSent && (
              <div className="space-y-4">
                <Input
                  type="text"
                  placeholder="Enter 6-digit OTP"
                  value={otp}
                  onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  className="h-12 text-center text-xl tracking-[0.5em] font-mono"
                  maxLength={6}
                />
                <Button
                  onClick={handleVerifyOtp}
                  className="w-full h-12 gradient-primary text-primary-foreground font-semibold"
                  disabled={loading || otp.length !== 6}
                >
                  Verify & Login <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
                <button onClick={resetMode} className="text-sm text-muted-foreground hover:text-primary w-full text-center transition-colors">
                  ← Back to login options
                </button>
              </div>
            )}

            {/* Mode: Forgot Password — Send OTP */}
            {mode === 'forgot_password' && !otpSent && (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground text-center">
                  Enter your registered mobile number and we'll send you a verification code to reset your password.
                </p>
                <Button
                  onClick={handleSendOtp}
                  className="w-full h-12 gradient-primary text-primary-foreground font-semibold"
                  disabled={loading || !validateMobile(mobile)}
                >
                  {loading ? 'Sending...' : 'Send Reset Code'} <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
                <button onClick={resetMode} className="text-sm text-muted-foreground hover:text-primary w-full text-center transition-colors">
                  ← Back to login options
                </button>
              </div>
            )}

            {/* Mode: Forgot Password — Verify OTP */}
            {mode === 'forgot_password' && otpSent && otp.length !== 6 && (
              <div className="space-y-4">
                <Input
                  type="text"
                  placeholder="Enter 6-digit OTP"
                  value={otp}
                  onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  className="h-12 text-center text-xl tracking-[0.5em] font-mono"
                  maxLength={6}
                />
                <Button
                  onClick={handleVerifyOtp}
                  className="w-full h-12 gradient-primary text-primary-foreground font-semibold"
                  disabled={loading || otp.length !== 6}
                >
                  Verify <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
                <button onClick={resetMode} className="text-sm text-muted-foreground hover:text-primary w-full text-center transition-colors">
                  ← Back to login options
                </button>
              </div>
            )}

            {/* Mode: Forgot Password — Set New Password */}
            {mode === 'forgot_password' && otpSent && otp.length === 6 && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 mb-2">
                  <ShieldCheck className="h-5 w-5 text-primary" />
                  <span className="text-sm font-medium text-foreground">Set a new password</span>
                </div>
                <div className="relative">
                  <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="password"
                    placeholder="New password (min 8 chars)"
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    className="pl-10 h-12"
                  />
                </div>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="password"
                    placeholder="Confirm new password"
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    className="pl-10 h-12"
                    onKeyDown={e => e.key === 'Enter' && handleResetPassword()}
                  />
                </div>
                <Button
                  onClick={handleResetPassword}
                  className="w-full h-12 gradient-primary text-primary-foreground font-semibold"
                  disabled={loading || !newPassword || !confirmPassword}
                >
                  {loading ? 'Updating...' : 'Reset Password & Login'} <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
                <button onClick={resetMode} className="text-sm text-muted-foreground hover:text-primary w-full text-center transition-colors">
                  ← Back to login options
                </button>
              </div>
            )}

            {/* Mode: Email OTP */}
            {mode === 'email_otp' && !otpSent && (
              <div className="space-y-4">
                <Button
                  onClick={handleSendEmailOtp}
                  className="w-full h-12 gradient-primary text-primary-foreground font-semibold"
                  disabled={loading || !validateEmail(email)}
                >
                  {loading ? 'Sending...' : 'Send Email OTP'} <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
                <button onClick={resetMode} className="text-sm text-muted-foreground hover:text-primary w-full text-center transition-colors">
                  ← Back to login options
                </button>
              </div>
            )}

            {mode === 'email_otp' && otpSent && (
              <div className="space-y-4">
                <Input
                  type="text"
                  placeholder="Enter 6-digit OTP"
                  value={otp}
                  onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  className="h-12 text-center text-xl tracking-[0.5em] font-mono"
                  maxLength={6}
                />
                <Button
                  onClick={handleVerifyOtp}
                  className="w-full h-12 gradient-primary text-primary-foreground font-semibold"
                  disabled={loading || otp.length !== 6}
                >
                  Verify & Login <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
                <button onClick={resetMode} className="text-sm text-muted-foreground hover:text-primary w-full text-center transition-colors">
                  ← Back to login options
                </button>
              </div>
            )}

            {/* Mode: Password */}
            {mode === 'password' && (
              <div className="space-y-4">
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="password"
                    placeholder="Enter password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="pl-10 h-12"
                    onKeyDown={e => e.key === 'Enter' && handlePasswordLogin()}
                  />
                </div>
                <Button
                  onClick={handlePasswordLogin}
                  className="w-full h-12 gradient-primary text-primary-foreground font-semibold"
                  disabled={loading || !password}
                >
                  {loading ? 'Signing in...' : 'Sign In'} <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
                <button onClick={resetMode} className="text-sm text-muted-foreground hover:text-primary w-full text-center transition-colors">
                  ← Back to login options
                </button>
              </div>
            )}

            {/* Forgot password link on password mode */}
            {mode === 'password' && (
              <div className="text-center -mt-2">
                <button
                  onClick={() => { setMode('forgot_password'); setOtpSent(false); setOtp(''); setPassword(''); }}
                  className="text-sm text-primary hover:underline font-medium"
                >
                  Forgot password?
                </button>
              </div>
            )}
          </div>

          <p className="text-xs text-muted-foreground text-center mt-8">
            Only authorized staff can access this app.<br />
            Contact your admin for access.
          </p>
          </div>
        </div>
      </div>
    </main>

  );
};

export default Login;
