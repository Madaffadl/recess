"use client";

import { useEffect, useRef, useState } from "react";
import { ImageOff } from "lucide-react";
import { Viewer } from "mapillary-js";
import "mapillary-js/dist/mapillary.css";

const MAPILLARY_TOKEN = process.env.NEXT_PUBLIC_MAPILLARY_TOKEN ?? "";

/**
 * Interactive Mapillary street-level viewer (WebGL — browser-only, must be
 * loaded via next/dynamic with ssr:false).
 *
 * The viewer is created once and reused across rounds via `moveTo`, which is
 * far cheaper than tearing down/recreating the WebGL context every round.
 * Attribution is intentionally left enabled (Mapillary ToS requires crediting
 * contributors); place-name labels are not a Mapillary component, so nothing
 * leaks the answer.
 */
export function MapillaryViewer({ imageId }: { imageId: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const [failed, setFailed] = useState(false);

  // Create the viewer once.
  useEffect(() => {
    if (!containerRef.current || !MAPILLARY_TOKEN) return;

    const viewer = new Viewer({
      accessToken: MAPILLARY_TOKEN,
      container: containerRef.current,
      // Load only the base image, not high-res tiles. Tile requests are the
      // single biggest source of "Service temporarily unavailable" throttling
      // on the free token; base resolution is plenty for a guessing game.
      imageTiling: false,
      component: {
        cover: false, // load immediately, no click-to-start overlay
        bearing: true,
        zoom: true,
        direction: true, // arrows to walk the street — fetched on demand
        sequence: false, // playback bar prefetches the whole sequence — off
        spatial: false, // 3D point cloud + neighbour cameras — heavy, off
        attribution: true, // required by Mapillary ToS
        // Don't prefetch neighbours (default caches several images in every
        // direction, each firing metadata/tile/mesh requests). Depth 0 means
        // we fetch a neighbour only when the player actually navigates to it.
        cache: { depth: { sequence: 0, spherical: 0, step: 0, turn: 0 } },
      },
    });
    viewerRef.current = viewer;

    return () => {
      viewerRef.current = null;
      viewer.remove();
    };
  }, []);

  // Navigate to the current round's image whenever it changes.
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !imageId) return;
    setFailed(false);
    let cancelled = false;

    // moveTo can reject on a transient fetch failure ("Failed to fetch data" —
    // usually rate-limiting on the shared token). Retry a couple of times with
    // backoff before falling back, so a brief hiccup doesn't blank the round.
    const attempt = (triesLeft: number) => {
      viewer.moveTo(imageId).catch(() => {
        if (cancelled) return;
        if (triesLeft > 0) {
          setTimeout(() => {
            if (!cancelled) attempt(triesLeft - 1);
          }, 1500);
        } else {
          setFailed(true);
        }
      });
    };
    attempt(2); // up to 3 total attempts

    return () => {
      cancelled = true;
    };
  }, [imageId]);

  if (!MAPILLARY_TOKEN) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 bg-black/80 p-6 text-center text-sm text-white/70">
        <p className="font-semibold text-white">Street-view unavailable</p>
        <p>
          Set <code className="text-teal-300">NEXT_PUBLIC_MAPILLARY_TOKEN</code>{" "}
          in your <code>.env</code> to enable Mapillary imagery.
        </p>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />
      {failed && (
        <div className="absolute inset-0 z-[400] flex flex-col items-center justify-center gap-2 bg-black/85 p-6 text-center backdrop-blur-sm">
          <ImageOff className="size-6 text-white/50" />
          <p className="text-sm font-semibold text-white">Street view unavailable</p>
          <p className="max-w-xs text-xs text-white/60">
            This spot&apos;s imagery couldn&apos;t load. Make your best guess from
            the map — the round still counts.
          </p>
        </div>
      )}
    </div>
  );
}
