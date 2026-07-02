import * as React from "react";

import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "flex h-10 w-full min-w-0 rounded-xl border border-border bg-white/[0.03] px-3.5 py-2 text-sm text-foreground transition-colors outline-none",
        "placeholder:text-subtle",
        "focus-visible:border-primary/50 focus-visible:bg-white/[0.05] focus-visible:ring-2 focus-visible:ring-primary/20",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  );
}

export { Input };
