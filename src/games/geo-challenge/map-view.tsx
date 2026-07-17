"use client";

import { useEffect, useRef } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Polyline,
  useMapEvents,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Fix broken default icon paths in webpack / Next.js
// eslint-disable-next-line @typescript-eslint/no-explicit-any
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

// ── Icon helpers ────────────────────────────────────────────────────────────

function correctIcon() {
  // Gold (brand) target with a pulsing halo — the emotional focal point of the reveal.
  return L.divIcon({
    html: `<div style="position:relative;width:40px;height:40px">
      <span style="position:absolute;inset:0;border-radius:50%;background:rgba(245,158,11,.45);animation:geo-ping 1.8s ease-out infinite"></span>
      <span style="position:absolute;inset:0;border-radius:50%;background:rgba(245,158,11,.30);animation:geo-ping 1.8s ease-out .6s infinite"></span>
      <div style="
        position:absolute;inset:4px;
        background:radial-gradient(circle at 35% 30%, #fcd34d, #f59e0b);
        border-radius:50%;
        border:3px solid #fff;
        display:flex;align-items:center;justify-content:center;
        font-size:16px;
        box-shadow:0 4px 14px rgba(245,158,11,.55)">📍</div>
    </div>`,
    className: "",
    iconSize: [40, 40],
    iconAnchor: [20, 20],
  });
}

function pendingIcon() {
  // Teal (interactive) pin with a soft ring + subtle bob.
  return L.divIcon({
    html: `<div style="position:relative;width:34px;height:34px;animation:geo-bob 2.4s ease-in-out infinite">
      <span style="position:absolute;inset:0;border-radius:50%;background:rgba(20,184,166,.35);animation:geo-ping 2s ease-out infinite"></span>
      <div style="
        position:absolute;inset:6px;
        background:radial-gradient(circle at 35% 30%, #5eead4, #14b8a6);
        border-radius:50%;
        border:3px solid #fff;
        box-shadow:0 3px 10px rgba(20,184,166,.5)"></div>
    </div>`,
    className: "",
    iconSize: [34, 34],
    iconAnchor: [17, 17],
  });
}

const PLAYER_COLORS = [
  "#ef4444",
  "#3b82f6",
  "#22c55e",
  "#f59e0b",
  "#8b5cf6",
  "#ec4899",
  "#14b8a6",
  "#f97316",
];

function playerIcon(color: string, initials: string) {
  return L.divIcon({
    html: `<div style="
      width:34px;height:34px;
      background:${color};
      border-radius:50% 50% 50% 2px;
      border:2.5px solid rgba(255,255,255,.92);
      display:flex;align-items:center;justify-content:center;
      font-size:11px;font-weight:800;color:#fff;letter-spacing:.02em;
      box-shadow:0 4px 12px rgba(0,0,0,.55)">${initials}</div>`,
    className: "",
    iconSize: [34, 34],
    iconAnchor: [17, 17],
  });
}

function abbrev(name: string) {
  const caps = name.replace(/[^A-Za-z]/g, "").match(/[A-Z]/g);
  if (caps && caps.length >= 2) return (caps[0] + caps[1]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

// ── Click handler sub-component ─────────────────────────────────────────────

function ClickCapture({
  onMapClick,
}: {
  onMapClick: (lat: number, lng: number) => void;
}) {
  useMapEvents({
    click(e) {
      onMapClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

// ── Auto-fit bounds during reveal ───────────────────────────────────────────

function BoundsFitter({
  points,
}: {
  points: Array<[number, number]>;
}) {
  const map = useMap();
  const fitted = useRef(false);

  useEffect(() => {
    if (fitted.current || points.length === 0) return;
    fitted.current = true;
    const bounds = L.latLngBounds(points.map(([lat, lng]) => [lat, lng]));
    map.fitBounds(bounds, { padding: [48, 48], maxZoom: 8 });
  }, [map, points]);

  return null;
}

// ── Public component ─────────────────────────────────────────────────────────

export type PlayerPin = {
  handle: string;
  lat: number;
  lng: number;
  score: number;
};

type GuessingProps = {
  mode: "guessing";
  pendingPin: { lat: number; lng: number } | null;
  onMapClick: (lat: number, lng: number) => void;
};

type RevealingProps = {
  mode: "revealing";
  correctLat: number;
  correctLng: number;
  playerPins: PlayerPin[];
};

type MapViewProps = GuessingProps | RevealingProps;

export function MapView(props: MapViewProps) {
  if (props.mode === "guessing") {
    return (
      <MapContainer
        center={[20, 0]}
        zoom={2}
        style={{ width: "100%", height: "100%" }}
        worldCopyJump
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          subdomains="abcd"
          detectRetina
        />
        <ClickCapture onMapClick={props.onMapClick} />
        {props.pendingPin && (
          <Marker
            position={[props.pendingPin.lat, props.pendingPin.lng]}
            icon={pendingIcon()}
          />
        )}
      </MapContainer>
    );
  }

  // Revealing mode
  const { correctLat, correctLng, playerPins } = props;
  const allPoints: Array<[number, number]> = [
    [correctLat, correctLng],
    ...playerPins
      .filter((p) => p.lat !== 0 || p.lng !== 0)
      .map((p): [number, number] => [p.lat, p.lng]),
  ];

  return (
    <MapContainer
      center={[20, 0]}
      zoom={2}
      style={{ width: "100%", height: "100%" }}
      worldCopyJump
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        subdomains="abcd"
        detectRetina
      />
      <BoundsFitter points={allPoints} />

      {/* Correct location */}
      <Marker position={[correctLat, correctLng]} icon={correctIcon()} />

      {/* Player guesses */}
      {playerPins.map((pin, idx) => {
        const hasGuess = pin.lat !== 0 || pin.lng !== 0;
        if (!hasGuess) return null;
        const color = PLAYER_COLORS[idx % PLAYER_COLORS.length];
        return (
          <Marker
            key={pin.handle}
            position={[pin.lat, pin.lng]}
            icon={playerIcon(color, abbrev(pin.handle))}
          />
        );
      })}

      {/* Lines from each pin to correct location */}
      {playerPins.map((pin, idx) => {
        const hasGuess = pin.lat !== 0 || pin.lng !== 0;
        if (!hasGuess) return null;
        const color = PLAYER_COLORS[idx % PLAYER_COLORS.length];
        return (
          <Polyline
            key={`line-${pin.handle}`}
            positions={[
              [pin.lat, pin.lng],
              [correctLat, correctLng],
            ]}
            pathOptions={{
              color,
              weight: 2.5,
              opacity: 0.85,
              dashArray: "1 8",
              lineCap: "round",
            }}
          />
        );
      })}
    </MapContainer>
  );
}
