"use client";

import { Headphones, Mic, MicOff, PhoneOff } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useVoiceChat } from "@/hooks/use-voice-chat";
import { UserAvatar } from "@/components/user-avatar";

type Props = {
  roomKey: string;
  uid: string | null;
  /** The local user's display handle. */
  handle: string;
  /** uid → handle map built from room presence (best-effort — falls back to uid prefix). */
  peerHandles?: Map<string, string>;
};

export function RoomVoicePanel({ roomKey, uid, handle, peerHandles }: Props) {
  const {
    joining,
    joined,
    hasMic,
    muted,
    localSpeaking,
    peers,
    join,
    leave,
    toggleMute,
    disableMic,
    enableMic,
    voiceError,
  } = useVoiceChat({ roomKey, uid });

  const resolve = (peerUid: string) =>
    peerHandles?.get(peerUid) ?? peerUid.slice(0, 8);

  const connectedCount = Array.from(peers.values()).filter((p) => p.connected).length;

  return (
    <div className="flex h-[360px] flex-col overflow-hidden rounded-2xl border border-border bg-card p-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="font-display text-xs font-semibold uppercase tracking-wider text-muted">
          Voice
        </h2>
        {joined && (
          <span className="flex items-center gap-1 rounded-md border border-accent/30 bg-accent/10 px-1.5 py-0.5 text-[10px] font-medium text-accent/80">
            <span className="size-1.5 rounded-full bg-accent" />
            {connectedCount + 1} live
          </span>
        )}
      </div>

      {/* Content */}
      {!joined ? (
        /* ── Not in voice ── */
        <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
          <div className="grid size-10 place-items-center rounded-xl border border-border bg-elevated">
            <Mic className="size-4 text-muted" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">Voice chat</p>
            <p className="mt-0.5 text-xs text-muted">
              Talk with everyone in this room
            </p>
          </div>
          <button
            type="button"
            onClick={() => { void join(); }}
            disabled={joining || !uid}
            className="flex items-center justify-center gap-1.5 rounded-lg border border-border bg-elevated px-4 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-accent/50 hover:bg-accent/10 hover:text-accent disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Mic className="size-3.5" />
            {joining ? "Joining…" : "Join voice"}
          </button>
          {voiceError && (
            <p className="text-[11px] text-red-400">{voiceError}</p>
          )}
        </div>
      ) : (
        /* ── In voice ── */
        <>
          <ul className="mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto">
            {/* Local user */}
            <li className="flex items-center gap-2">
              <div className="relative shrink-0">
                <UserAvatar name={handle} className="size-6" />
                <AnimatePresence>
                  {hasMic && localSpeaking && (
                    <motion.span
                      key="local-ring"
                      className="absolute inset-0 rounded-full ring-2 ring-accent"
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: [0.6, 1, 0.6], scale: [1, 1.15, 1] }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.6, repeat: Infinity }}
                    />
                  )}
                </AnimatePresence>
              </div>
              <span className="flex-1 truncate text-xs text-foreground">
                {handle}{" "}
                <span className="text-subtle">(you)</span>
              </span>
              {!hasMic ? (
                <Headphones className="size-3 text-subtle" />
              ) : muted ? (
                <MicOff className="size-3 text-subtle" />
              ) : localSpeaking ? (
                <motion.span
                  animate={{ opacity: [0.5, 1, 0.5] }}
                  transition={{ duration: 0.55, repeat: Infinity }}
                >
                  <Mic className="size-3 text-accent" />
                </motion.span>
              ) : (
                <Mic className="size-3 text-subtle/40" />
              )}
            </li>

            {/* Remote peers */}
            {Array.from(peers.entries()).map(([peerUid, state]) => (
              <li key={peerUid} className="flex items-center gap-2">
                <div className="relative shrink-0">
                  <UserAvatar name={resolve(peerUid)} className="size-6" />
                  <AnimatePresence>
                    {state.speaking && (
                      <motion.span
                        key="ring"
                        className="absolute inset-0 rounded-full ring-2 ring-accent"
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: [0.6, 1, 0.6], scale: [1, 1.15, 1] }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.6, repeat: Infinity }}
                      />
                    )}
                  </AnimatePresence>
                </div>
                <span className="flex-1 truncate text-xs text-foreground">
                  {resolve(peerUid)}
                </span>
                {!state.connected ? (
                  <span className="text-[10px] text-subtle">connecting…</span>
                ) : state.speaking ? (
                  <motion.span
                    animate={{ opacity: [0.5, 1, 0.5] }}
                    transition={{ duration: 0.55, repeat: Infinity }}
                  >
                    <Mic className="size-3 text-accent" />
                  </motion.span>
                ) : (
                  <Mic className="size-3 text-subtle/40" />
                )}
              </li>
            ))}

            {peers.size === 0 && (
              <li className="pt-2 text-center text-[11px] text-subtle">
                No one else yet — share the room link!
              </li>
            )}
          </ul>

          {/* Controls */}
          <div className="mt-3 flex gap-2">
            {hasMic ? (
              <>
                <button
                  type="button"
                  onClick={toggleMute}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border bg-elevated py-1.5 text-xs font-medium text-foreground transition-colors hover:border-accent/40 hover:text-accent"
                >
                  {muted ? (
                    <><MicOff className="size-3.5" /> Unmute</>
                  ) : (
                    <><Mic className="size-3.5" /> Mute</>
                  )}
                </button>
                <button
                  type="button"
                  onClick={disableMic}
                  title="Disable microphone"
                  className="grid size-8 shrink-0 place-items-center rounded-lg border border-border bg-elevated text-subtle transition-colors hover:border-red-500/30 hover:bg-red-500/10 hover:text-red-400"
                >
                  <MicOff className="size-3.5" />
                </button>
              </>
            ) : (
              <>
                <div className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border bg-elevated py-1.5 text-xs text-subtle">
                  <Headphones className="size-3.5" /> Listening
                </div>
                <button
                  type="button"
                  onClick={() => { void enableMic(); }}
                  title="Enable microphone"
                  className="grid size-8 shrink-0 place-items-center rounded-lg border border-border bg-elevated text-subtle transition-colors hover:border-accent/40 hover:bg-accent/10 hover:text-accent"
                >
                  <Mic className="size-3.5" />
                </button>
              </>
            )}
            <button
              type="button"
              onClick={leave}
              title="Leave voice"
              className="grid size-8 shrink-0 place-items-center rounded-lg border border-red-500/30 bg-red-500/10 text-red-400 transition-colors hover:border-red-500/50 hover:bg-red-500/20"
            >
              <PhoneOff className="size-3.5" />
            </button>
          </div>
        </>
      )}
    </div>
  );
}
