"use client";

import { usePathname } from "next/navigation";

import { AnonymousLounge } from "@/components/anonymous-lounge";

/**
 * The persistent lounge surface — adapts per breakpoint and route:
 *
 * Desktop (≥lg)        : sticky right-hand sidebar beside the page content.
 * Mobile/tablet (<lg)  : inline panel stacked below the page content.
 *                        The layout parent uses flex-col on mobile so this
 *                        naturally sits after <main> and before <SiteFooter>.
 *
 * Room detail pages    : returns null — the room page renders its own
 *                        FloatingLounge widget so the game can use full width.
 */
export function LoungeDock() {
  const pathname = usePathname();
  const isRoomDetail = /^\/rooms\/[^/]+$/.test(pathname ?? "");

  if (isRoomDetail) return null;

  return (
    <>
      {/* Desktop: sticky sidebar */}
      <aside className="sticky top-16 hidden h-[calc(100vh-4rem)] w-[360px] shrink-0 p-4 lg:block">
        <AnonymousLounge />
      </aside>

      {/* Mobile/tablet: inline panel below page content, above footer */}
      <div className="border-t border-border px-4 pb-6 pt-4 lg:hidden">
        <div className="h-[min(460px,62vh)] overflow-hidden rounded-2xl">
          <AnonymousLounge />
        </div>
      </div>
    </>
  );
}
