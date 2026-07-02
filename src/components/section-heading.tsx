import type { ReactNode } from "react";

import { Reveal } from "@/components/reveal";

type SectionHeadingProps = {
  eyebrow?: string;
  title: ReactNode;
  description?: string;
  action?: ReactNode;
};

export function SectionHeading({
  eyebrow,
  title,
  description,
  action,
}: SectionHeadingProps) {
  return (
    <Reveal>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-xl">
          {eyebrow && (
            <span className="terminal-badge uppercase tracking-[0.18em] text-subtle">
              {eyebrow}
            </span>
          )}
          <h2 className="mt-2.5 font-display text-2xl font-semibold tracking-tight sm:text-[28px]">
            {title}
          </h2>
          {description && (
            <p className="mt-2.5 text-sm leading-relaxed text-muted sm:text-base">
              {description}
            </p>
          )}
        </div>
        {action}
      </div>
    </Reveal>
  );
}
