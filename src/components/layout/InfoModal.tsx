import { Info, X } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { OnboardingStepId } from "@/hooks/useOnboarding";
import { cn } from "@/lib/utils";

const GITHUB_REPO_URL = "https://github.com/topheman/effect-viz";
const PORTFOLIO_URL = "https://topheman.github.io/me/";

const MOBILE_BREAKPOINT_PX = 640; // Tailwind sm
const QR_SIZE_DESKTOP = 200;
const QR_SIZE_MOBILE = 64;

interface InfoModalProps {
  onboardingStep?: OnboardingStepId | null;
  onOnboardingComplete?: (stepId: OnboardingStepId) => void;
  onRestartOnboarding?: () => void;
}

export function InfoModal({
  onboardingStep = null,
  onOnboardingComplete,
  onRestartOnboarding,
}: InfoModalProps = {}) {
  const [currentUrl] = useState<string>(() => {
    const [url] = window.location.href.split("#");
    return url;
  });

  const [isMobile, setIsMobile] = useState(() => {
    if (
      typeof window === "undefined" ||
      typeof window.matchMedia !== "function"
    )
      return false;
    return window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT_PX - 1}px)`)
      .matches;
  });
  const [showBigQr, setShowBigQr] = useState(false);

  useEffect(() => {
    const m = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT_PX - 1}px)`);
    const fn = () => setIsMobile(m.matches);
    m.addEventListener("change", fn);
    return () => m.removeEventListener("change", fn);
  }, []);

  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open) setShowBigQr(false);
        if (open) onOnboardingComplete?.("info");
      }}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <DialogTrigger asChild>
            <Button
              data-onboarding-step="info"
              variant="ghost"
              size="icon"
              className={cn(
                onboardingStep === "info" &&
                  "origin-center animate-onboarding-pulse",
              )}
              style={
                {
                  "--onboarding-pulse-x": "-20%",
                  "--onboarding-pulse-y": "-30%",
                  "z-index": onboardingStep === "info" ? "100" : "auto",
                } as React.CSSProperties
              }
            >
              <Info className="h-4 w-4" />
            </Button>
          </DialogTrigger>
        </TooltipTrigger>
        <TooltipContent>About</TooltipContent>
      </Tooltip>

      <DialogContent>
        <DialogHeader>
          <DialogTitle
            className={`
              cursor-pointer select-none
              hover:opacity-80
            `}
            onClick={onRestartOnboarding}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onRestartOnboarding?.();
              }
            }}
            role="button"
            tabIndex={0}
          >
            {import.meta.env.VITE_SHORT_TITLE}
          </DialogTitle>
          <DialogDescription>
            {import.meta.env.VITE_DESCRIPTION}
          </DialogDescription>
        </DialogHeader>

        <div
          className={`flex max-h-[60vh] flex-col gap-6 overflow-y-auto py-4`}
          data-testid="info-modal-body"
        >
          {/* About the project */}
          <section
            className="flex flex-col gap-3 text-sm text-muted-foreground"
            aria-label="About the project"
          >
            <p>
              The goal of this project is for me to learn Effect by building an
              Effect runtime visualizer.
            </p>
            <p>
              This is v1: I use explicit tracing wrappers like{" "}
              <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
                withTrace
              </code>{" "}
              or{" "}
              <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
                forkWithTrace
              </code>{" "}
              (manual instrumentation, explicit and educational).
            </p>
            <p>
              I used AI as my Effect tutor that guided me through a multi-step
              workshop (read about it on the{" "}
              <a
                href={GITHUB_REPO_URL}
                target="_blank"
                rel="noopener noreferrer"
                className={`
                  text-primary underline-offset-4
                  hover:underline
                `}
              >
                GitHub repo
              </a>
              ).
            </p>
          </section>

          <div className="flex flex-col items-center gap-6">
            {/* QR Code: small + clickable on mobile, large on desktop */}
            {isMobile ? (
              <>
                <button
                  type="button"
                  onClick={() => setShowBigQr(true)}
                  className={`
                    rounded-lg bg-white p-2
                    focus:ring-2 focus:ring-ring focus:ring-offset-2
                    focus:outline-none
                  `}
                  aria-label="Show larger QR code"
                  data-testid="qrcode-container"
                >
                  <QRCodeSVG
                    value={currentUrl}
                    size={QR_SIZE_MOBILE}
                    level="M"
                    fgColor="#09090b"
                    includeMargin={false}
                  />
                </button>
                {showBigQr && (
                  <div
                    className={`
                      fixed inset-0 z-100 flex items-center justify-center
                      bg-black/70 p-4
                    `}
                    role="dialog"
                    aria-modal="true"
                    aria-label="QR code full size"
                    onClick={() => setShowBigQr(false)}
                  >
                    <button
                      type="button"
                      onClick={() => setShowBigQr(false)}
                      className={`
                        absolute top-4 right-4 rounded-full bg-background p-2
                        text-foreground
                        focus:ring-2 focus:ring-ring focus:outline-none
                      `}
                      aria-label="Close QR code"
                    >
                      <X className="h-5 w-5" />
                    </button>
                    <div
                      className="rounded-lg bg-white p-4"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <QRCodeSVG
                        value={currentUrl}
                        size={QR_SIZE_DESKTOP}
                        level="M"
                        fgColor="#09090b"
                        includeMargin={false}
                      />
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div
                data-testid="qrcode-container"
                className="rounded-lg bg-white p-4"
              >
                <QRCodeSVG
                  value={currentUrl}
                  size={QR_SIZE_DESKTOP}
                  level="M"
                  fgColor="#09090b"
                  includeMargin={false}
                />
              </div>
            )}

            {/* URL */}
            <p
              className={`
                max-w-full text-center text-sm break-all text-muted-foreground
              `}
            >
              {currentUrl}
            </p>

            <p>
              {/* GitHub Link */}
              <a
                href={GITHUB_REPO_URL}
                target="_blank"
                title="Visit the GitHub repo"
                rel="noopener noreferrer"
                className={`
                  text-sm text-primary underline-offset-4 transition-colors
                  hover:underline
                `}
              >
                Visit GitHub repo
              </a>
              {" - "}
              {/* Portfolio Link */}
              <a
                href={PORTFOLIO_URL}
                target="_blank"
                title="Visit my portfolio"
                rel="noopener noreferrer"
                className={`
                  text-sm text-primary underline-offset-4 transition-colors
                  hover:underline
                `}
              >
                Visit portfolio
              </a>
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
