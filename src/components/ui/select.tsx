import { ChevronDown } from "lucide-react";
import * as React from "react";

import { cn } from "@/lib/utils";

export type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement> & {
  /** Classes for the positioning wrapper — the box the select occupies in its parent's layout. */
  wrapperClassName?: string;
};

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, wrapperClassName, children, style, ...props }, ref) => {
    return (
      <span className={cn("relative block", wrapperClassName)}>
        <select
          ref={ref}
          className={cn(
            `
              peer h-9 w-full appearance-none rounded-md border
              border-muted-foreground/50 py-1 pr-6 pl-3 text-sm shadow-sm
              transition-colors
              focus:ring-2 focus:ring-ring/50 focus:outline-none
              disabled:cursor-not-allowed disabled:opacity-50
              dark:bg-input/30
            `,
            className,
          )}
          style={
            {
              "--input": "var(--color-background)",
              ...style,
            } as React.CSSProperties
          }
          {...props}
        >
          {children}
        </select>
        <ChevronDown
          aria-hidden="true"
          className={`
            pointer-events-none absolute top-1/2 right-1.5 size-3
            -translate-y-1/2 text-muted-foreground
            peer-disabled:opacity-50
          `}
        />
      </span>
    );
  },
);
Select.displayName = "Select";

export { Select };
