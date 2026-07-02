import * as React from "react";

import { cn } from "@/lib/utils";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex min-h-20 w-full rounded-xl border border-border bg-white/[0.02] px-3.5 py-2.5 text-sm text-foreground transition-colors outline-none",
        "placeholder:text-subtle",
        "focus-visible:border-primary/50 focus-visible:bg-white/[0.04] focus-visible:ring-2 focus-visible:ring-primary/15",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  );
}

export { Textarea };
