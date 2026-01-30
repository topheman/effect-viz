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

const GITHUB_REPO_URL = "https://github.com/topheman/effect-viz";

export function InfoModal() {
  const [currentUrl] = useState<string>(() => {
    const [url] = window.location.href.split("#");
    return url;
  });

  return (
    <Dialog>
      <Tooltip>
        <TooltipTrigger asChild>
          <DialogTrigger asChild>
            <Button variant="ghost" size="icon">
              <Info className="h-4 w-4" />
            </Button>
          </DialogTrigger>
        </TooltipTrigger>
        <TooltipContent>About</TooltipContent>
      </Tooltip>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>EffectViz</DialogTitle>
          <DialogDescription>
            A visual playground for exploring Effect.ts runtime behavior
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-6 py-4">
          {/* QR Code */}
          <div
            data-testid="qrcode-container"
            className="rounded-lg bg-white p-4"
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
      </DialogContent>
    </Dialog>
  );
}
