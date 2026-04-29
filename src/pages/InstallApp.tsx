import { useEffect, useState } from 'react';
import { Download, Smartphone, Share2, MoreVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import logo from '@/assets/mayukh-solar-logo.png';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const InstallApp = () => {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    setIsStandalone(window.matchMedia('(display-mode: standalone)').matches || ('standalone' in navigator && Boolean(navigator.standalone)));

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

  return (
    <main className="min-h-screen bg-background px-4 py-8 sm:px-6">
      <section className="mx-auto flex max-w-2xl flex-col items-center text-center">
        <img src={logo} alt="Mayukh Solar" className="h-20 w-20 object-contain" />
        <h1 className="mt-5 text-3xl font-bold text-foreground">Install Mayukh Solar CRM</h1>
        <p className="mt-2 max-w-md text-sm text-muted-foreground">
          Add the CRM to your phone home screen for faster access like a mobile app.
        </p>

        <Card className="mt-8 w-full text-left shadow-elevated">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Smartphone className="h-5 w-5 text-primary" />
              Mobile install steps
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {isStandalone ? (
              <div className="rounded-lg border border-border bg-accent/30 p-4 text-sm font-medium text-foreground">
                App is already installed on this device.
              </div>
            ) : installPrompt ? (
              <Button onClick={handleInstall} className="w-full gap-2">
                <Download className="h-4 w-4" />
                Install App
              </Button>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-lg border border-border p-4">
                <div className="mb-3 flex items-center gap-2 font-semibold text-foreground">
                  <Share2 className="h-4 w-4 text-primary" />
                  iPhone
                </div>
                <ol className="space-y-2 text-sm text-muted-foreground">
                  <li>1. Open the published app link in Safari.</li>
                  <li>2. Tap Share.</li>
                  <li>3. Tap Add to Home Screen.</li>
                  <li>4. Tap Add.</li>
                </ol>
              </div>

              <div className="rounded-lg border border-border p-4">
                <div className="mb-3 flex items-center gap-2 font-semibold text-foreground">
                  <MoreVertical className="h-4 w-4 text-primary" />
                  Android
                </div>
                <ol className="space-y-2 text-sm text-muted-foreground">
                  <li>1. Open the published app link in Chrome.</li>
                  <li>2. Tap the browser menu.</li>
                  <li>3. Tap Install app or Add to Home screen.</li>
                  <li>4. Confirm Install.</li>
                </ol>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>
    </main>
  );
};

export default InstallApp;
