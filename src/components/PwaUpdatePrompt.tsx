import { useEffect, useRef, useState } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const COUNTDOWN_SECONDS = 5;

export function PwaUpdatePrompt() {
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  const [countdown, setCountdown] = useState(COUNTDOWN_SECONDS);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const close = () => {
    setOfflineReady(false);
    setNeedRefresh(false);
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const handleCancel = () => {
    setNeedRefresh(false);
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const handleRefreshNow = () => {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    void updateServiceWorker(true);
  };

  // Countdown when needRefresh is true
  useEffect(() => {
    if (!needRefresh) {
      return;
    }
    // Defer initial countdown reset to avoid synchronous setState in effect
    const id = setTimeout(() => setCountdown(COUNTDOWN_SECONDS), 0);
    timerRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          if (timerRef.current !== null) {
            clearInterval(timerRef.current);
            timerRef.current = null;
          }
          void updateServiceWorker(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => {
      clearTimeout(id);
      if (timerRef.current !== null) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [needRefresh, updateServiceWorker]);

  if (!offlineReady && !needRefresh) {
    return null;
  }

  const snackbarClasses = cn(
    `
      fixed z-50 flex flex-col gap-3 rounded-lg border border-border bg-card p-4
      text-card-foreground shadow-lg
    `,
    `
      right-4 bottom-6 left-4
      md:left-auto md:max-w-md
    `,
    "pb-[max(1.5rem,env(safe-area-inset-bottom))]",
  );

  if (offlineReady) {
    return (
      <div className={snackbarClasses} role="status" aria-live="polite">
        <p className="text-sm">App ready to work offline.</p>
        <Button variant="default" size="default" onClick={() => close()}>
          OK
        </Button>
      </div>
    );
  }

  return (
    <div
      className={snackbarClasses}
      role="alert"
      aria-live="assertive"
      aria-label="New version available"
    >
      <p className="text-sm">
        New version available. Refreshing in {countdown} second
        {countdown !== 1 ? "s" : ""}.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="default"
          size="default"
          className={`
            min-h-[44px] min-w-[44px] py-2
            md:min-h-0 md:min-w-0
          `}
          onClick={handleRefreshNow}
        >
          Refresh now
        </Button>
        <Button
          variant="outline"
          size="default"
          className={`
            min-h-[44px] min-w-[44px] py-2
            md:min-h-0 md:min-w-0
          `}
          onClick={handleCancel}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
