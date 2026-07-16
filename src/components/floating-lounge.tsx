"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { MessageCircle, X } from "lucide-react";

import { LoungePanel } from "@/components/anonymous-lounge";

/**
 * Minimized chat widget for mobile and room pages.
 *
 * Mobile pattern  : full-width bottom sheet anchored above the toggle button,
 *                   with a dimming backdrop so the underlying page is hidden.
 * Tablet (sm+)    : compact right-aligned popover (same idea, narrower).
 * Desktop (lg+)   : hidden — LoungeDock renders the sidebar instead.
 */
export function FloatingLounge() {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* ── Backdrop: dims + blurs page content when the panel is open ── */}
      <AnimatePresence>
        {open && (
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-[39] bg-background/80 backdrop-blur-sm"
          />
        )}
      </AnimatePresence>

      {/* ── Chat panel ── */}
      <AnimatePresence>
        {open && (
          <motion.div
            key="panel"
            initial={{ opacity: 0, y: 28, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 28, scale: 0.97 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className={[
              // Base — stacking & shape
              "fixed z-40 flex flex-col overflow-hidden",
              "rounded-2xl border border-border shadow-2xl shadow-black/50",
              // Solid dark surface (not glass) so content behind is fully hidden
              "bg-[#12151d]",
              // Mobile: full-width, sits above the toggle button (bottom-24 = 96px)
              "bottom-24 left-3 right-3 max-h-[70vh]",
              // sm+: right-aligned compact popover
              "sm:bottom-24 sm:left-auto sm:right-5 sm:h-[min(520px,70vh)] sm:w-80",
            ].join(" ")}
          >
            <LoungePanel />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Toggle button — always fixed bottom-right ── */}
      <div className="fixed bottom-5 right-5 z-40">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? "Close lounge" : "Open Anonymous Lounge"}
          aria-expanded={open}
          className="grid size-14 shrink-0 place-items-center rounded-full border border-primary/30 bg-primary text-primary-foreground shadow-lg shadow-primary/25 transition-transform hover:scale-105 active:scale-95"
        >
          <AnimatePresence mode="wait" initial={false}>
            {open ? (
              <motion.span
                key="close"
                initial={{ rotate: -90, opacity: 0 }}
                animate={{ rotate: 0, opacity: 1 }}
                exit={{ rotate: 90, opacity: 0 }}
                transition={{ duration: 0.15 }}
              >
                <X className="size-6" />
              </motion.span>
            ) : (
              <motion.span
                key="open"
                initial={{ rotate: 90, opacity: 0 }}
                animate={{ rotate: 0, opacity: 1 }}
                exit={{ rotate: -90, opacity: 0 }}
                transition={{ duration: 0.15 }}
              >
                <MessageCircle className="size-6" />
              </motion.span>
            )}
          </AnimatePresence>
        </button>
      </div>
    </>
  );
}
