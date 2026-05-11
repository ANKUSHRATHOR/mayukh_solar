import { useEffect, useState } from 'react';
import { Download, RefreshCw, Smartphone, Share2, MoreVertical, Bell, BellOff, AlertCircle, Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import logo from '@/assets/mayukh-solar-logo.png';
import { enablePushNotifications, isPushSupported, isStandalone as checkStandalone } from '@/lib/push';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const isIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
const isSafari = () => {
  const ua = navigator.userAgent;
  return /^((?!chrome|android|crios|fxios|edgios).)*safari/i.test(ua);
};

const InstallApp = () => {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [enablingPush, setEnablingPush] = useState(false);
  const [pushPermission, setPushPermission] = useState<NotificationPermission>(
    typeof Notification !== 'undefined' ? Notification.permission : 'default',
  );
  const [linkCopied, setLinkCopied] = useState(false);

  const onIos = isIos();
  const onSafari = isSafari();

  useEffect(() => {
    setIsStandalone(checkStandalone());
    const handlePrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handlePrompt);
    return () => window.removeEventListener('beforeinstallprompt', handlePrompt);
  }, []);

  const handleInstall = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  };

  const handleEnablePush = async () => {
    setEnablingPush(true);
    const result = await enablePushNotifications();
    setEnablingPush(false);
    setPushPermission(typeof Notification !== 'undefined' ? Notification.permission : 'default');
    if (result.ok) {
      toast.success('Notifications enabled on this device');
    } else {
      toast.error(result.reason || 'Could not enable notifications');
    }
  };

  const handleRefreshApp = async () => {
    setIsRefreshing(true);
    try {
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(
          registrations
            .filter((r) => !(r.active?.scriptURL || '').includes('push-sw.js'))
            .map((r) => r.unregister()),
        );
      }
      if ('caches' in window) {
        const cacheNames = await caches.keys();
        await Promise.all(cacheNames.map((name) => caches.delete(name)));
      }
    } finally {
      const url = new URL(window.location.href);
      url.searchParams.set('app-refresh', Date.now().toString());
      window.location.replace(url.toString());
    }
  };

  return (
    <main className="min-h-screen bg-background px-4 py-8 sm:px-6">
      <section className="mx-auto flex max-w-2xl flex-col items-center text-center">
        <img src={logo} alt="Mayukh Solar" className="h-20 w-20 object-contain" />
        <h1 className="mt-5 text-3xl font-bold text-foreground">Install Mayukh Solar CRM</h1>
        <p className="mt-2 max-w-md text-sm text-muted-foreground">
          Add the CRM to your phone Home Screen for faster access and to receive push notifications.
        </p>

        {onIos && !onSafari && !isStandalone && (
          <div className="mt-6 flex w-full items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-left text-sm text-destructive">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <strong>Open in Safari to install on iPhone.</strong> Chrome and other browsers on iPhone do not support
              installing apps to the Home Screen. Tap the address bar, copy this link, then paste it into Safari.
            </div>
          </div>
        )}

        <Card className="mt-8 w-full text-left shadow-elevated">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Smartphone className="h-5 w-5 text-primary" />
              Install steps
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {isStandalone ? (
              <div className="rounded-lg border border-border bg-accent/30 p-4 text-sm font-medium text-foreground">
                ✓ App is installed on this device.
              </div>
            ) : installPrompt ? (
              <Button onClick={handleInstall} className="w-full gap-2">
                <Download className="h-4 w-4" />
                Install App
              </Button>
            ) : null}

            <Button onClick={handleRefreshApp} variant="outline" className="w-full gap-2" disabled={isRefreshing}>
              <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              {isRefreshing ? 'Updating app...' : 'Update Installed App'}
            </Button>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-lg border border-border p-4">
                <div className="mb-3 flex items-center gap-2 font-semibold text-foreground">
                  <Share2 className="h-4 w-4 text-primary" />
                  iPhone (Safari only)
                </div>
                <ol className="space-y-2 text-sm text-muted-foreground">
                  <li>1. Open this page in <b>Safari</b> (not Chrome).</li>
                  <li>2. Tap the <b>Share</b> button (square with arrow up).</li>
                  <li>3. Scroll down and tap <b>Add to Home Screen</b>.</li>
                  <li>4. Tap <b>Add</b> in the top right corner.</li>
                  <li>5. Open the new Mayukh Solar icon from your Home Screen.</li>
                </ol>
              </div>

              <div className="rounded-lg border border-border p-4">
                <div className="mb-3 flex items-center gap-2 font-semibold text-foreground">
                  <MoreVertical className="h-4 w-4 text-primary" />
                  Android
                </div>
                <ol className="space-y-2 text-sm text-muted-foreground">
                  <li>1. Open this page in Chrome.</li>
                  <li>2. Tap the browser menu (3 dots).</li>
                  <li>3. Tap <b>Install app</b> or <b>Add to Home screen</b>.</li>
                  <li>4. Confirm <b>Install</b>.</li>
                </ol>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="mt-6 w-full text-left shadow-elevated">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Bell className="h-5 w-5 text-primary" />
              Push Notifications
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Get notified outside the app whenever a lead or project is assigned to you.
              {onIos && ' On iPhone, you must first install the app to your Home Screen and open it from there before enabling notifications.'}
            </p>

            {!isPushSupported() ? (
              <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-300">
                <BellOff className="mt-0.5 h-4 w-4 shrink-0" />
                <span>This browser does not support push notifications. {onIos && 'Install the app to your Home Screen and open it from there.'}</span>
              </div>
            ) : pushPermission === 'granted' ? (
              <div className="rounded-lg border border-border bg-accent/30 p-3 text-sm font-medium text-foreground">
                ✓ Notifications are enabled on this device.
              </div>
            ) : (
              <Button
                onClick={handleEnablePush}
                disabled={enablingPush || (onIos && !isStandalone)}
                className="w-full gap-2"
              >
                <Bell className="h-4 w-4" />
                {enablingPush ? 'Enabling...' : 'Enable Push Notifications'}
              </Button>
            )}

            {onIos && !isStandalone && (
              <p className="text-xs text-muted-foreground">
                Install the app first (steps above), then open it from the Home Screen to enable notifications.
              </p>
            )}
          </CardContent>
        </Card>
      </section>
    </main>
  );
};

export default InstallApp;
