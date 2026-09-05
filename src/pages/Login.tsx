import { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { useNavigate } from 'react-router-dom';
import { Browser } from '@capacitor/browser';
import { supabase } from '@/integrations/supabase/client';
import { isNative, NATIVE_AUTH_REDIRECT } from '@/native';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Phone, Lock, ArrowRight, Sun, Mail, KeyRound, ShieldCheck, User } from 'lucide-react';
import logo from '@/assets/mayukh-solar-logo.png';
import SolarScene from '@/components/three/SolarScene';


type LoginMode = 'choose' | 'otp' | 'password' | 'email_otp' | 'email_password' | 'forgot_password' | 'signup';

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
  const [signupName, setSignupName] = useState('');
  const [signupMobile, setSignupMobile] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    const hash = window.location.hash;
    const searchParams = new URLSearchParams(window.location.search);
    
    let errorMsg = searchParams.get('error_description');
    if (hash && hash.includes('error_description')) {
      const params = new URLSearchParams(hash.substring(1));
      errorMsg = params.get('error_description');
    }
    
    if (errorMsg) {
      toast({
        title: 'Authentication Error',
        description: decodeURIComponent(errorMsg).replace(/\+/g, ' '),
        variant: 'destructive',
      });
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, [toast]);

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
      const { error } = await supabase.auth.signInWithOtp({ email: mobileEmail, options: { shouldCreateUser: false } });
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
      const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
      if (error) throw error;
      setOtpSent(true);
      toast({ title: 'Login link sent', description: `Check ${email} and open the sign-in link from the same device.` });
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

  const handleGoogleLogin = async () => {
    setLoading(true);
    try {
      // In the native shell the WebView cannot host this flow: Google rejects
      // OAuth inside embedded WebViews (disallowed_useragent), and a plain
      // redirect completes in the system browser, leaving the app signed out.
      // So hand Google to a Chrome Custom Tab and take the result back over a
      // deep link, which src/native/deepLink.ts exchanges for a session.
      if (isNative()) {
        const { data, error } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: {
            redirectTo: NATIVE_AUTH_REDIRECT,
            // Return the authorize URL instead of navigating to it. This still
            // writes the PKCE verifier to this WebView's storage, which is what
            // lets the deep-link handler complete the exchange here.
            skipBrowserRedirect: true,
          },
        });
        if (error) throw error;
        if (!data?.url) throw new Error('Could not start Google sign-in.');

        await Browser.open({ url: data.url });
        return;
      }

      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/`,
        },
      });
      if (error) throw error;
    } catch (err: any) {
      toast({ title: 'Google Login Failed', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async () => {
    if (!signupName.trim()) {
      toast({ title: 'Full Name required', description: 'Please enter your full name.', variant: 'destructive' }); return;
    }
    if (!signupMobile.trim()) {
      toast({ title: 'Mobile Number required', description: 'Please enter your 10-digit mobile number.', variant: 'destructive' }); return;
    }
    if (!validateMobile(signupMobile)) {
      toast({ title: 'Invalid mobile number', description: 'Enter a valid 10-digit mobile number starting with 6-9.', variant: 'destructive' }); return;
    }
    if (!signupEmail.trim()) {
      toast({ title: 'Email address required', description: 'Please enter your email address.', variant: 'destructive' }); return;
    }
    if (!validateEmail(signupEmail)) {
      toast({ title: 'Invalid email address', description: 'Please enter a valid email format (e.g. name@domain.com).', variant: 'destructive' }); return;
    }
    if (!signupPassword) {
      toast({ title: 'Password required', description: 'Please choose a password.', variant: 'destructive' }); return;
    }
    if (signupPassword.length < 6) {
      toast({ title: 'Password too short', description: 'Password must be at least 6 characters.', variant: 'destructive' }); return;
    }
    
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: signupEmail,
        password: signupPassword,
        options: {
          emailRedirectTo: `${window.location.origin}/`,
          data: {
            full_name: signupName,
            phone: signupMobile,
          }
        }
      });
      if (error) throw error;
      
      toast({
        title: 'Sign Up Successful!',
        description: data.session ? 'Redirecting to dashboard...' : 'Account created. Please check your email for confirmation.',
      });
      
      if (data.session) {
        navigate('/');
      } else {
        setMode('choose');
      }
    } catch (err: any) {
      toast({ title: 'Sign Up Failed', description: err.message, variant: 'destructive' });
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
    setSignupName('');
    setSignupMobile('');
    setSignupEmail('');
    setSignupPassword('');
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
            {/* Email Input (shown for email OTP & email-password modes) */}
            {(mode === 'email_otp' || mode === 'email_password') && (
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="email"
                  placeholder="Enter your email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="pl-10 h-12 text-base"
                  disabled={mode === 'email_otp' && otpSent}
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
                <div className="flex gap-3">
                  <Button
                    onClick={() => setMode('email_otp')}
                    variant="outline"
                    className="flex-1 h-11 font-semibold"
                  >
                    <Mail className="mr-2 h-4 w-4" /> Email Link
                  </Button>
                  <Button
                    onClick={() => setMode('email_password')}
                    variant="outline"
                    className="flex-1 h-11 font-semibold"
                  >
                    <KeyRound className="mr-2 h-4 w-4" /> Email Login
                  </Button>
                </div>
                <div className="relative flex items-center justify-center py-1">
                  <div className="absolute left-0 right-0 top-1/2 h-[1px] bg-border z-0" />
                  <span className="relative z-10 px-3 bg-background text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Or continue with</span>
                </div>
                <Button
                  onClick={handleGoogleLogin}
                  variant="outline"
                  className="w-full h-12 font-semibold border-border hover:bg-muted/50 gap-2.5"
                  disabled={loading}
                >
                  <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" width="24" height="24" xmlns="http://www.w3.org/2000/svg">
                    <g transform="matrix(1, 0, 0, 1, 0, 0)">
                      <path d="M21.35,11.1H12v2.7h5.38c-0.24,1.28 -0.96,2.37 -2.04,3.1v2.6h3.3c1.93,-1.78 3.04,-4.4 3.04,-7.4C21.68,11.8 21.56,11.43 21.35,11.1z" fill="#4285F4" />
                      <path d="M12,20.82c2.38,0 4.38,-0.78 5.84,-2.12l-3.3,-2.6c-0.91,0.61 -2.08,0.97 -3.27,0.97 -2.52,0 -4.66,-1.7 -5.42,-3.98H2.43v2.6C3.9,18.72 7.71,20.82 12,20.82z" fill="#34A853" />
                      <path d="M6.58,13.19c-0.2,-0.6 -0.31,-1.24 -0.31,-1.9c0,-0.66 0.11,-1.3 0.31,-1.9V6.79H2.43c-0.78,1.57 -1.23,3.34 -1.23,5.21c0,1.87 0.45,3.64 1.23,5.21l4.15,-3.21z" fill="#FBBC05" />
                      <path d="M12,5.23c1.3,0 2.47,0.45 3.39,1.32l2.54,-2.54C16.37,2.58 14.37,1.82 12,1.82c-4.29,0 -8.1,2.1 -9.57,5.18l4.15,3.21c0.76,-2.28 2.9,-3.98 5.42,-3.98z" fill="#EA4335" />
                    </g>
                  </svg>
                  Google Account
                </Button>
                <div className="text-center pt-2">
                  <span className="text-xs text-muted-foreground">Don't have an account? </span>
                  <button
                    onClick={() => setMode('signup')}
                    className="text-xs text-primary hover:underline font-semibold"
                  >
                    Sign Up
                  </button>
                </div>
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
                <p className="text-sm text-muted-foreground text-center">
                  We will send a secure login link to your registered email.
                </p>
                <Button
                  onClick={handleSendEmailOtp}
                  className="w-full h-12 gradient-primary text-primary-foreground font-semibold"
                  disabled={loading || !validateEmail(email)}
                >
                  {loading ? 'Sending...' : 'Send Login Link'} <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
                <button onClick={resetMode} className="text-sm text-muted-foreground hover:text-primary w-full text-center transition-colors">
                  ← Back to login options
                </button>
              </div>
            )}

            {mode === 'email_otp' && otpSent && (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground text-center">
                  Open the email link on this device to complete sign in.
                </p>
                <Button
                  onClick={handleSendEmailOtp}
                  variant="outline"
                  className="w-full h-12 font-semibold"
                  disabled={loading}
                >
                  {loading ? 'Sending...' : 'Resend Login Link'} <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
                <button onClick={resetMode} className="text-sm text-muted-foreground hover:text-primary w-full text-center transition-colors">
                  ← Back to login options
                </button>
              </div>
            )}


            {/* Mode: Email + Password */}
            {mode === 'email_password' && (
              <div className="space-y-4">
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="password"
                    placeholder="Enter password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="pl-10 h-12"
                    onKeyDown={e => e.key === 'Enter' && handleEmailPasswordLogin()}
                  />
                </div>
                <Button
                  onClick={handleEmailPasswordLogin}
                  className="w-full h-12 gradient-primary text-primary-foreground font-semibold"
                  disabled={loading || !validateEmail(email) || !password}
                >
                  {loading ? 'Signing in...' : 'Sign In'} <ArrowRight className="ml-2 h-4 w-4" />
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

            {/* Mode: Sign Up */}
            {mode === 'signup' && (
              <div className="space-y-4">
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="text"
                    placeholder="Enter full name"
                    value={signupName}
                    onChange={e => setSignupName(e.target.value)}
                    className="pl-10 h-12"
                  />
                </div>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="tel"
                    placeholder="Enter mobile number"
                    value={signupMobile}
                    onChange={e => setSignupMobile(e.target.value.replace(/\D/g, '').slice(0, 10))}
                    className="pl-10 h-12"
                    maxLength={10}
                  />
                </div>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="email"
                    placeholder="Enter email address"
                    value={signupEmail}
                    onChange={e => setSignupEmail(e.target.value)}
                    className="pl-10 h-12"
                  />
                </div>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="password"
                    placeholder="Choose password (min 6 chars)"
                    value={signupPassword}
                    onChange={e => setSignupPassword(e.target.value)}
                    className="pl-10 h-12"
                    onKeyDown={e => e.key === 'Enter' && handleSignUp()}
                  />
                </div>
                <Button
                  onClick={handleSignUp}
                  className="w-full h-12 gradient-primary text-primary-foreground font-semibold"
                  disabled={loading}
                >
                  {loading ? 'Creating Account...' : 'Register'} <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
                <div className="relative flex items-center justify-center py-1">
                  <div className="absolute left-0 right-0 top-1/2 h-[1px] bg-border z-0" />
                  <span className="relative z-10 px-3 bg-background text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Or register with</span>
                </div>
                <Button
                  onClick={handleGoogleLogin}
                  variant="outline"
                  className="w-full h-12 font-semibold border-border hover:bg-muted/50 gap-2.5"
                  disabled={loading}
                >
                  <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" width="24" height="24" xmlns="http://www.w3.org/2000/svg">
                    <g transform="matrix(1, 0, 0, 1, 0, 0)">
                      <path d="M21.35,11.1H12v2.7h5.38c-0.24,1.28 -0.96,2.37 -2.04,3.1v2.6h3.3c1.93,-1.78 3.04,-4.4 3.04,-7.4C21.68,11.8 21.56,11.43 21.35,11.1z" fill="#4285F4" />
                      <path d="M12,20.82c2.38,0 4.38,-0.78 5.84,-2.12l-3.3,-2.6c-0.91,0.61 -2.08,0.97 -3.27,0.97 -2.52,0 -4.66,-1.7 -5.42,-3.98H2.43v2.6C3.9,18.72 7.71,20.82 12,20.82z" fill="#34A853" />
                      <path d="M6.58,13.19c-0.2,-0.6 -0.31,-1.24 -0.31,-1.9c0,-0.66 0.11,-1.3 0.31,-1.9V6.79H2.43c-0.78,1.57 -1.23,3.34 -1.23,5.21c0,1.87 0.45,3.64 1.23,5.21l4.15,-3.21z" fill="#FBBC05" />
                      <path d="M12,5.23c1.3,0 2.47,0.45 3.39,1.32l2.54,-2.54C16.37,2.58 14.37,1.82 12,1.82c-4.29,0 -8.1,2.1 -9.57,5.18l4.15,3.21c0.76,-2.28 2.9,-3.98 5.42,-3.98z" fill="#EA4335" />
                    </g>
                  </svg>
                  Google Account
                </Button>
                <button onClick={resetMode} className="text-sm text-muted-foreground hover:text-primary w-full text-center transition-colors">
                  ← Back to login options
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
