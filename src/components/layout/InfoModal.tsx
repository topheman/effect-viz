import { Info } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useState } from "react";

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

  return (
    <Dialog
      onOpenChange={(open) => {
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
            {/* QR Code */}
            <div
              data-testid="qrcode-container"
              className={`rounded-lg bg-white p-4`}
            >
              <QRCodeSVG
                value={currentUrl}
                size={200}
                level="M"
                fgColor="#09090b"
                includeMargin={false}
              />
            </div>

            {/* URL */}
            <p
              className={`
                max-w-full text-center text-sm break-all text-muted-foreground
              `}
            >
              {currentUrl}
            </p>

            {/* GitHub Link */}
            <a
              href={GITHUB_REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              className={`
                inline-flex items-center gap-2 text-sm text-primary
                underline-offset-4 transition-colors
                hover:underline
              `}
            >
              View on GitHub
            </a>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
