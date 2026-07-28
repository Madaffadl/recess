"use client";

/**
 * Hybrid 3-D pawn overlay.
 *
 * Sits as an absolutely-positioned <canvas> on top of the 2-D CSS board.
 * Uses raw Three.js (three@0.134 — already hoisted from mapillary-js) so we
 * avoid an @react-three/fiber peer-dep conflict with that library's old three
 * requirement.
 *
 * Coordinate system
 * -----------------
 * The CSS board is a 15×15 grid where each cell centre sits at
 *   left = (col + 0.5) / 15 × 100%
 *   top  = (row + 0.5) / 15 × 100%
 *
 * The Three.js scene uses an orthographic frustum fixed at [-7.5, 7.5] × [-7.5, 7.5]
 * (matching GRID=15).  A board cell [row, col] maps to world coords:
 *   x =  col + 0.5 − 7.5   (Three.js X → CSS left, same direction)
 *   y = −(row + 0.5 − 7.5) (Three.js Y → CSS top, inverted)
 *
 * Because the frustum is fixed in world units the mapping is size-independent:
 * responsive behaviour is automatic at every breakpoint.
 */

import { useRef, useEffect } from "react";
import * as THREE from "three";
import type { Cell, LudoColor } from "./logic";
import { GRID } from "./logic";

const HALF = GRID / 2; // 7.5
const PCT  = GRID / 100; // converts CSS %-offset → world units

// Classic board-game token colours (mirrors PLAYER in board.tsx)
const BASE_COLOR  = [0xe23b34, 0x38a24a, 0xf0b310, 0x2f7fd1] as const;
const LIGHT_COLOR = [0xf47b74, 0x6fc47e, 0xffd257, 0x6ba7e6] as const;
const GOLD        = 0xe7b23f;

// ── Coordinate conversion ─────────────────────────────────────────────────────

function toWorld(row: number, col: number, dx: number, dy: number): THREE.Vector3 {
  return new THREE.Vector3(
    col + 0.5 - HALF + dx * PCT,
    HALF - (row + 0.5) - dy * PCT,
    0,
  );
}

// ── Pawn mesh factory ─────────────────────────────────────────────────────────

function makeRingMesh(): THREE.Mesh {
  const geo = new THREE.TorusGeometry(0.42, 0.05, 8, 28);
  const mat = new THREE.MeshBasicMaterial({
    color: GOLD,
    transparent: true,
    opacity: 0.75,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = "ring";
  return mesh;
}

function makePawnGroup(
  color: LudoColor,
  canMove: boolean,
): { group: THREE.Group; ring: THREE.Mesh | null } {
  const group = new THREE.Group();

  // Drop shadow
  const shadowGeo = new THREE.CircleGeometry(0.38, 24);
  const shadowMat = new THREE.MeshBasicMaterial({
    color: 0x000000,
    transparent: true,
    opacity: 0.22,
    depthWrite: false,
  });
  const shadow = new THREE.Mesh(shadowGeo, shadowMat);
  shadow.position.set(0, 0, -0.05);
  group.add(shadow);

  // Main body — sphere scaled thin in Z gives a shiny coin/token look under lighting
  const bodyGeo = new THREE.SphereGeometry(0.30, 24, 16);
  const bodyMat = new THREE.MeshStandardMaterial({
    color: BASE_COLOR[color],
    roughness: 0.12,
    metalness: 0.40,
  });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.scale.set(1, 1, 0.55);
  group.add(body);

  // Specular highlight blob (upper-left, mirrors the CSS radial-gradient at 33% 27%)
  const hlGeo = new THREE.SphereGeometry(0.30, 10, 7);
  const hlMat = new THREE.MeshBasicMaterial({
    color: LIGHT_COLOR[color],
    transparent: true,
    opacity: 0.28,
    depthWrite: false,
  });
  const hl = new THREE.Mesh(hlGeo, hlMat);
  hl.scale.set(0.38, 0.38, 0.38);
  hl.position.set(-0.07, 0.08, 0.14);
  group.add(hl);

  const ring = canMove ? makeRingMesh() : null;
  if (ring) group.add(ring);

  return { group, ring };
}

function disposePawnGroup(group: THREE.Group): void {
  group.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.geometry.dispose();
      if (Array.isArray(obj.material)) {
        obj.material.forEach((m) => m.dispose());
      } else {
        (obj.material as THREE.Material).dispose();
      }
    }
  });
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type PawnToken = {
  pIdx: number;
  tIdx: number;
  cell: Cell;
  dx: number;
  dy: number;
  color: LudoColor;
  /** Whether this token can be moved right now (drives the pulsing gold ring). */
  canMove: boolean;
};

type PawnState = {
  group: THREE.Group;
  /** Mutable target position — the animation loop lerps toward this. */
  target: THREE.Vector3;
  ring: THREE.Mesh | null;
};

// ── Component ─────────────────────────────────────────────────────────────────

export function PawnOverlay({ tokens }: { tokens: PawnToken[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const sceneRef = useRef<{
    renderer: THREE.WebGLRenderer;
    camera: THREE.OrthographicCamera;
    scene: THREE.Scene;
    pawns: Map<string, PawnState>;
    rafId: number;
    clock: THREE.Clock;
  } | null>(null);

  // ── Three.js lifecycle (mount / unmount) ───────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    const w = canvas.offsetWidth || 1;
    const h = canvas.offsetHeight || 1;
    renderer.setSize(w, h, false);

    // Fixed orthographic frustum in world units — size-independent → responsive.
    const camera = new THREE.OrthographicCamera(-HALF, HALF, HALF, -HALF, 0.1, 20);
    camera.position.set(0, 0, 10);
    camera.lookAt(new THREE.Vector3(0, 0, 0));

    const scene = new THREE.Scene();
    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const dir = new THREE.DirectionalLight(0xffffff, 1.4);
    dir.position.set(-2, 3, 7);
    scene.add(dir);

    const clock = new THREE.Clock();
    const pawns = new Map<string, PawnState>();
    const state = { renderer, camera, scene, pawns, rafId: 0, clock };
    sceneRef.current = state;

    // Keep canvas pixel size in sync with its CSS size (handles all breakpoints).
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) renderer.setSize(width, height, false);
    });
    ro.observe(canvas);

    const animate = () => {
      state.rafId = requestAnimationFrame(animate);
      const elapsed = clock.getElapsedTime();

      for (const [, pawn] of pawns) {
        // Smooth position animation — lerp 20 % per frame toward target.
        pawn.group.position.lerp(pawn.target, 0.2);

        if (pawn.ring) {
          const s = 1 + Math.sin(elapsed * 4.5) * 0.12;
          pawn.ring.scale.setScalar(s);
          (pawn.ring.material as THREE.MeshBasicMaterial).opacity =
            0.5 + Math.sin(elapsed * 4.5 + 1) * 0.3;
        }
      }

      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(state.rafId);
      ro.disconnect();
      for (const [, pawn] of pawns) disposePawnGroup(pawn.group);
      pawns.clear();
      renderer.dispose();
      sceneRef.current = null;
    };
  }, []);

  // ── Sync pawn meshes when game state changes ───────────────────────────────
  useEffect(() => {
    const state = sceneRef.current;
    if (!state) return;
    const { scene, pawns } = state;

    const seen = new Set<string>();

    for (const token of tokens) {
      const key = `${token.pIdx}-${token.tIdx}`;
      seen.add(key);
      const target = toWorld(token.cell[0], token.cell[1], token.dx, token.dy);

      const existing = pawns.get(key);
      if (existing) {
        // Update position target (animation loop will lerp there).
        existing.target.copy(target);

        // Add ring when token becomes movable.
        if (token.canMove && !existing.ring) {
          const ring = makeRingMesh();
          existing.group.add(ring);
          existing.ring = ring;
        }
        // Remove ring when token is no longer movable.
        if (!token.canMove && existing.ring) {
          existing.group.remove(existing.ring);
          existing.ring.geometry.dispose();
          (existing.ring.material as THREE.Material).dispose();
          existing.ring = null;
        }
      } else {
        // New pawn — teleport straight to initial position (no fly-in from origin).
        const { group, ring } = makePawnGroup(token.color, token.canMove);
        group.position.copy(target);
        scene.add(group);
        pawns.set(key, { group, target: target.clone(), ring });
      }
    }

    // Remove pawns for tokens that no longer exist.
    for (const [key, pawn] of pawns) {
      if (!seen.has(key)) {
        scene.remove(pawn.group);
        disposePawnGroup(pawn.group);
        pawns.delete(key);
      }
    }
  }, [tokens]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        display: "block",
        pointerEvents: "none",
      }}
    />
  );
}
