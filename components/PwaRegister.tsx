'use client';

import { useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function PwaRegister() {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showInstallBanner, setShowInstallBanner] = useState(false);

  useEffect(() => {
    // 1. Register Service Worker in supported environments
    if ('serviceWorker' in navigator && window.location.protocol.startsWith('http')) {
      navigator.serviceWorker
        .register('/sw.js')
        .then((reg) => {
          reg.update().catch(() => {});
        })
        .catch((err) => {
          console.debug('ServiceWorker registration not active:', err);
        });
    }

    // 2. Check if already running standalone
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;

    if (isStandalone) {
      return;
    }

    // 3. Listen for browser install prompt (Chrome / Edge / Android)
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as BeforeInstallPromptEvent);
      setShowInstallBanner(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // 4. Listen for successful install
    window.addEventListener('appinstalled', () => {
      setShowInstallBanner(false);
      setInstallPrompt(null);
    });

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === 'accepted') {
      setShowInstallBanner(false);
    }
  };

  if (!showInstallBanner || !installPrompt) {
    return null;
  }

  return (
    <div className="fixed bottom-3 left-3 right-3 sm:left-auto sm:right-4 sm:max-w-md z-50 bg-[#0d1117] border border-emerald-500/50 rounded-xl p-3.5 shadow-2xl font-mono text-xs flex items-center justify-between gap-3 animate-in fade-in slide-in-from-bottom-2">
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-lg bg-[#161b22] border border-[#30363d] flex items-center justify-center text-emerald-400 font-bold text-xs shrink-0">
          &gt;_
        </div>
        <div>
          <div className="font-bold text-white flex items-center gap-1.5 text-xs">
            <span>INSTALL APP</span>
            <span className="text-[10px] px-1 py-0.2 bg-emerald-950/60 text-emerald-400 border border-emerald-500/30 rounded">
              PWA
            </span>
          </div>
          <p className="text-[11px] text-slate-400">Add to home screen for native full-screen experience</p>
        </div>
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        <button
          onClick={handleInstallClick}
          className="px-2.5 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-black font-bold rounded text-xs transition-colors cursor-pointer"
        >
          INSTALL
        </button>
        <button
          onClick={() => setShowInstallBanner(false)}
          className="p-1.5 text-slate-400 hover:text-white rounded hover:bg-[#21262d] transition-colors"
          title="Dismiss"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
