"use client";

import { usePathname } from "next/navigation";

import { AnonymousLounge } from "@/components/anonymous-lounge";

/**
 * The persistent right-hand lounge sidebar. Hidden on game-room detail pages
 * (`/rooms/[id]`), where the room renders a minimized floating lounge instead
 * so the game can take the full width.
 */
export function LoungeDock() {
  const pathname = usePathname();
  const isRoomDetail = /^\/rooms\/[^/]+$/.test(pathname ?? "");

  if (isRoomDetail) return null;

  return (
    <aside className="sticky top-16 hidden h-[calc(100vh-4rem)] w-[360px] shrink-0 p-4 lg:block">
      <AnonymousLounge />
    </aside>
  );
}
