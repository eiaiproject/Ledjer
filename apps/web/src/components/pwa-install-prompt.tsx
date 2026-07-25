import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { X } from "reicon-react";

/**
 * PWA Install Prompt component.
 * Shows a banner when the browser fires the `beforeinstallprompt` event,
 * allowing the user to install the app to their home screen.
 *
 * Also handles:
 * - Already installed: hides prompt
 * - Dismissed: remembers via localStorage for 7 days
 * - Mobile: shows install instructions
 */
export function PwaInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<Event | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  // Check if already running as standalone (installed)
  useEffect(() => {
    const isStandaloneMode = window.matchMedia('(display-mode: standalone)').matches
      || (window.navigator as { standalone?: boolean }).standalone === true;
    setIsStandalone(isStandaloneMode);

    if (isStandaloneMode) {
      setIsInstalled(true);
      return;
    }
  }, []);

  // Listen for install prompt
  useEffect(() => {
    // Check if already dismissed recently
    const dismissedUntil = localStorage.getItem('pwa-dismissed-until');
    if (dismissedUntil && Date.now() < parseInt(dismissedUntil, 10)) {
      setDismissed(true);
      return;
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handler);

    // Check if already installed (app installed event)
    const installedHandler = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };
    window.addEventListener('appinstalled', installedHandler);

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      window.removeEventListener('appinstalled', installedHandler);
    };
  }, []);

  const handleInstall = useCallback(async () => {
    if (!deferredPrompt) return;

    const promptEvent = deferredPrompt as Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
    promptEvent.prompt();

    const { outcome } = await promptEvent.userChoice;
    if (outcome === 'accepted') {
      setIsInstalled(true);
    }
    setDeferredPrompt(null);
  }, [deferredPrompt]);

  const handleDismiss = useCallback(() => {
    setDismissed(true);
    // Remember for 7 days
    localStorage.setItem('pwa-dismissed-until', String(Date.now() + 7 * 24 * 60 * 60 * 1000));
  }, []);

  // Don't show if already installed, dismissed, or no prompt
  if (isInstalled || isStandalone || dismissed || !deferredPrompt) return null;

  return (
    <Card className="fixed bottom-20 left-4 right-4 z-[var(--z-toast)] shadow-lg border-wood-300 bg-white/95 backdrop-blur-sm lg:bottom-4 lg:left-auto lg:right-4 lg:w-80">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1.5 min-w-0">
            <p className="text-sm font-semibold text-text-primary">
              Pasang Ledjer
            </p>
            <p className="text-xs text-text-tertiary">
              Instal aplikasi ke layar utama untuk akses lebih cepat.
            </p>
            <Button size="sm" onClick={handleInstall} className="mt-1">
              Pasang Aplikasi
            </Button>
          </div>
          <button
            type="button"
            onClick={handleDismiss}
            className="shrink-0 p-1 text-text-tertiary hover:text-text-primary rounded"
            aria-label="Tutup"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </CardContent>
    </Card>
  );
}
