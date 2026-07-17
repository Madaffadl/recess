"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import { DrawTogetherBoard } from "@/games/draw-together/board";
import { GeoChallengeBoard } from "@/games/geo-challenge/board";

export default function FullpageGamePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  // sessionStorage is browser-only. Reading it in a useState initializer makes
  // the server render (gameId="") diverge from the client render (real gameId),
  // which picks a *different* Board component → hydration mismatch. Instead we
  // render a neutral placeholder until mount, then read sessionStorage. The
  // server and the client's first render both show the placeholder → they match.
  const [ready, setReady] = useState(false);
  const [handle, setHandle] = useState("Player");
  const [gameId, setGameId] = useState("");

  useEffect(() => {
    setHandle(sessionStorage.getItem("recess-handle") ?? "Player");
    setGameId(sessionStorage.getItem("recess-game-id") ?? "");
    setReady(true);
  }, []);

  const onExit = () => router.push(`/rooms/${params.id}`);

  return (
    <div className="fixed inset-0 z-50 bg-background">
      {!ready ? null : gameId === "geo-challenge" ? (
        <GeoChallengeBoard roomKey={params.id} handle={handle} onExit={onExit} />
      ) : (
        // Default: draw-together (original behaviour)
        <DrawTogetherBoard roomKey={params.id} handle={handle} onExit={onExit} />
      )}
    </div>
  );
}
