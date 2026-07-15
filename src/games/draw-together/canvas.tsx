"use client";

import { useCallback, useEffect, useRef } from "react";

import { CANVAS_W, CANVAS_H, type StrokeBatch } from "./logic";

type Props = {
  isDrawer: boolean;
  color: string;
  size: number;
  tool: "pen" | "eraser";
  incomingStrokes: StrokeBatch[];
  clearSignal: number;
  onStroke: (batch: StrokeBatch) => void;
  onClear: () => void;
};

const BROADCAST_MS = 50;

export function DrawingCanvas({
  isDrawer,
  color,
  size,
  tool,
  incomingStrokes,
  clearSignal,
  onStroke,
}: Props) {
  const bgRef = useRef<HTMLCanvasElement>(null); // committed strokes
  const fgRef = useRef<HTMLCanvasElement>(null); // current live stroke (drawer only)
  const containerRef = useRef<HTMLDivElement>(null);

  // Drawer's in-progress stroke
  const strokeRef = useRef<StrokeBatch | null>(null);
  const isDrawingRef = useRef(false);
  const lastBroadcastRef = useRef(0);
  // Index of the last point already broadcast; the next delta starts here so
  // consecutive segments share an endpoint and join seamlessly.
  const lastSentRef = useRef(0);

  // Viewer's processed-queue cursor: how many incoming batches we've drawn.
  const processedRef = useRef(0);

  function getCtx(canvas: HTMLCanvasElement | null) {
    return canvas?.getContext("2d") ?? null;
  }

  const applyStroke = useCallback(
    (ctx: CanvasRenderingContext2D, batch: StrokeBatch) => {
      if (batch.points.length === 0) return;
      ctx.save();
      ctx.globalCompositeOperation =
        batch.tool === "eraser" ? "destination-out" : "source-over";
      ctx.strokeStyle = batch.color;
      ctx.fillStyle = batch.color;
      ctx.lineWidth = batch.size;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      if (batch.points.length === 1) {
        // A tap → dot.
        const [x, y] = batch.points[0];
        ctx.beginPath();
        ctx.arc(x, y, batch.size / 2, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.moveTo(batch.points[0][0], batch.points[0][1]);
        for (let i = 1; i < batch.points.length; i++) {
          ctx.lineTo(batch.points[i][0], batch.points[i][1]);
        }
        ctx.stroke();
      }
      ctx.restore();
    },
    [],
  );

  // ── Viewer: drain the incoming queue (never just the last item, so nothing
  //    is lost when React batches multiple broadcasts into one render). ──────
  useEffect(() => {
    const ctx = getCtx(bgRef.current);
    if (!ctx) return;
    // Array shrank (cleared / new round) → restart from the beginning.
    if (incomingStrokes.length < processedRef.current) processedRef.current = 0;
    for (let i = processedRef.current; i < incomingStrokes.length; i++) {
      applyStroke(ctx, incomingStrokes[i]);
    }
    processedRef.current = incomingStrokes.length;
  }, [incomingStrokes, applyStroke]);

  // ── Clear signal (manual clear / round change) ────────────────────────────
  useEffect(() => {
    const bgCtx = getCtx(bgRef.current);
    const fgCtx = getCtx(fgRef.current);
    if (bgCtx) bgCtx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    if (fgCtx) fgCtx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    processedRef.current = 0;
  }, [clearSignal]);

  // ── Coordinate mapping (display px → logical 800×500 space) ───────────────
  function toLogical(clientX: number, clientY: number): [number, number] {
    const canvas = bgRef.current;
    if (!canvas) return [0, 0];
    const rect = canvas.getBoundingClientRect();
    const scaleX = CANVAS_W / rect.width;
    const scaleY = CANVAS_H / rect.height;
    return [(clientX - rect.left) * scaleX, (clientY - rect.top) * scaleY];
  }

  // ── Drawer pointer handlers ───────────────────────────────────────────────
  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!isDrawer) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      isDrawingRef.current = true;
      lastSentRef.current = 0;
      lastBroadcastRef.current = 0;
      const pt = toLogical(e.clientX, e.clientY);
      strokeRef.current = {
        strokeId: crypto.randomUUID(),
        points: [pt],
        color,
        size,
        tool,
        done: false,
      };
      // Preview the initial dot on the foreground.
      const fgCtx = getCtx(fgRef.current);
      if (fgCtx) {
        fgCtx.clearRect(0, 0, CANVAS_W, CANVAS_H);
        applyStroke(fgCtx, strokeRef.current);
      }
    },
    [isDrawer, color, size, tool, applyStroke],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isDrawer || !isDrawingRef.current || !strokeRef.current) return;
      const pt = toLogical(e.clientX, e.clientY);
      const s = strokeRef.current;
      s.points.push(pt);

      // Live full-stroke preview on the foreground layer.
      const fgCtx = getCtx(fgRef.current);
      if (fgCtx) {
        fgCtx.clearRect(0, 0, CANVAS_W, CANVAS_H);
        applyStroke(fgCtx, s);
      }

      // Throttled delta broadcast: only the new points since the last send,
      // starting from the previously-sent point so segments connect.
      const now = Date.now();
      if (now - lastBroadcastRef.current >= BROADCAST_MS) {
        lastBroadcastRef.current = now;
        const delta = s.points.slice(lastSentRef.current);
        if (delta.length >= 2) {
          onStroke({ ...s, points: delta, done: false });
          lastSentRef.current = s.points.length - 1;
        }
      }
    },
    [isDrawer, onStroke, applyStroke],
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!isDrawer || !isDrawingRef.current || !strokeRef.current) return;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* pointer already released */
      }
      isDrawingRef.current = false;
      const s = strokeRef.current;

      // Broadcast the final delta (or a lone dot for a tap).
      const delta = s.points.slice(lastSentRef.current);
      const isTap = s.points.length === 1;
      if (delta.length >= 2 || isTap) {
        onStroke({ ...s, points: delta, done: true });
      }

      // Commit the full stroke to our own background, clear the preview.
      const bgCtx = getCtx(bgRef.current);
      const fgCtx = getCtx(fgRef.current);
      if (bgCtx) applyStroke(bgCtx, s);
      if (fgCtx) fgCtx.clearRect(0, 0, CANVAS_W, CANVAS_H);
      strokeRef.current = null;
    },
    [isDrawer, onStroke, applyStroke],
  );

  return (
    <div
      ref={containerRef}
      className="relative w-full overflow-hidden rounded-2xl bg-white transition-shadow duration-500"
      style={{
        aspectRatio: `${CANVAS_W}/${CANVAS_H}`,
        boxShadow: isDrawer
          ? "0 0 0 1px rgba(245,158,11,0.5), 0 0 44px -8px rgba(245,158,11,0.45), inset 0 2px 0 0 rgba(255,255,255,0.9)"
          : "0 0 0 1px rgba(255,255,255,0.1), 0 24px 60px -24px rgba(0,0,0,0.7)",
      }}
    >
      <canvas
        ref={bgRef}
        width={CANVAS_W}
        height={CANVAS_H}
        className="absolute inset-0 h-full w-full"
      />
      <canvas
        ref={fgRef}
        width={CANVAS_W}
        height={CANVAS_H}
        className="absolute inset-0 h-full w-full touch-none"
        style={{
          cursor: isDrawer ? (tool === "eraser" ? "cell" : "crosshair") : "default",
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        onPointerCancel={onPointerUp}
      />
    </div>
  );
}
