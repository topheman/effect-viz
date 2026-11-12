import { ArrowUpRight, Check, ChevronDown } from "lucide-react";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { EFFECT_VERSION_SITES, majorOf } from "@/lib/effectVersions";
import { cn } from "@/lib/utils";

const CURRENT_MAJOR = majorOf(__EFFECT_VERSION__);

/**
 * The deployed EffectViz sites, one per Effect major: this build's entry is
 * marked current and is not a link, the others link to their site.
 */
export function VersionLinks({ className }: { className?: string }) {
  return (
    <ul className={cn("flex flex-col gap-1", className)}>
      {EFFECT_VERSION_SITES.map((site) =>
        site.major === CURRENT_MAJOR ? (
          <li key={site.major}>
            <span
              aria-current="page"
              className="flex items-center gap-2 px-2 py-1 text-sm font-medium"
            >
              {site.label}
              <Check aria-hidden className="size-4" />
            </span>
          </li>
        ) : (
          <li key={site.major}>
            <a
              href={site.url}
              className={`
                flex items-center gap-2 rounded-sm px-2 py-1 text-sm
                text-muted-foreground
                hover:bg-accent hover:text-accent-foreground
              `}
            >
              {site.label}
              <ArrowUpRight aria-hidden className="size-4" />
            </a>
          </li>
        ),
      )}
    </ul>
  );
}

/**
 * A pill showing the build's exact Effect version, opening the list of
 * EffectViz sites: a disclosure holding navigation links, not a menu.
 */
export function VersionSelector() {
  return (
    <Popover>
      <PopoverTrigger
        className={`
          flex items-center gap-1 rounded-full border border-border px-2 py-0.5
          text-xs whitespace-nowrap text-muted-foreground
          hover:bg-accent hover:text-accent-foreground
          focus-visible:ring-[3px] focus-visible:ring-ring/50
          focus-visible:outline-none
        `}
      >
        Effect {__EFFECT_VERSION__}
        <ChevronDown aria-hidden className="size-3" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-40 p-1">
        <nav aria-label="Effect versions">
          <VersionLinks />
        </nav>
      </PopoverContent>
    </Popover>
  );
}
