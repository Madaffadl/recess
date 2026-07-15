"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";

import { DrawTogetherBoard } from "@/games/draw-together/board";

export default function DrawTogetherPlayPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  const [handle] = useState<string>(
    () => sessionStorage.getItem("recess-handle") ?? "Player",
  );

  return (
    <div className="fixed inset-0 z-50 bg-background">
      <DrawTogetherBoard
        roomKey={params.id}
        handle={handle}
        onExit={() => router.push(`/rooms/${params.id}`)}
      />
    </div>
  );
}
