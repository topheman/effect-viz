import * as React from "react";

import { cn } from "@/lib/utils";

export type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement>;

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <select
        ref={ref}
        className={cn(
          `
            h-9 w-full appearance-none rounded-md border border-input
            bg-background px-3 py-1 text-sm shadow-sm transition-colors
            focus:ring-2 focus:ring-ring/50 focus:outline-none
            disabled:cursor-not-allowed disabled:opacity-50
            dark:border-input dark:bg-input/30
          `,
          className,
        )}
        {...props}
      >
        {children}
      </select>
    );
  },
);
Select.displayName = "Select";

export { Select };
