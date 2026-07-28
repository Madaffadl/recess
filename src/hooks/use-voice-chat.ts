"use client";

/**
 * Room-scoped WebRTC voice chat hook.
 *
 * Nothing is stored:
 *   • Audio travels peer-to-peer via WebRTC — never touches any server.
 *   • Supabase Realtime Broadcast is used only for the WebRTC handshake
 *     (SDP offers/answers + ICE candidates).  Broadcast messages are relayed
 *     in-memory by Supabase and are never written to Postgres.
 *   • Supabase Presence tracks who is currently in the voice channel.
 *     Presence state is ephemeral and evicted when clients disconnect.
 *
 * Offer-glare prevention:
 *   For every pair (A, B), the peer whose uid is lexicographically LARGER
 *   sends the WebRTC offer.  The other side waits to receive one.
 *   This guarantees exactly one side initiates per pair, even when both
 *   clients join the channel simultaneously.
 */

import { useEffect, useRef, useState } from "react";
import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";

const ICE: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

type Signal =
  | { type: "offer";  from: string; to: string; sdp: string }
  | { type: "answer"; from: string; to: string; sdp: string }
  | { type: "ice";    from: string; to: string; candidate: RTCIceCandidateInit | null };

type PeerRecord = {
  pc:       RTCPeerConnection;
  audioEl:  HTMLAudioElement;
  analyser: AnalyserNode | null;
  buf:      Uint8Array<ArrayBuffer>;
};

export type VoicePeerState = { speaking: boolean; connected: boolean };

export type VoiceChatReturn = {
  joining:       boolean;
  joined:        boolean;
  hasMic:        boolean;
  muted:         boolean;
  localSpeaking: boolean;
  peers:         Map<string, VoicePeerState>;
  join:          (opts?: { withMic?: boolean }) => Promise<void>;
  leave:         () => void;
  toggleMute:    () => void;
  /** Fully stops the microphone stream and releases the OS permission. */
  disableMic:    () => void;
  /** Re-requests the microphone and adds it to existing peer connections. */
  enableMic:     () => Promise<void>;
  voiceError:    string | null;
};

export function useVoiceChat({
  roomKey,
  uid,
}: {
  roomKey: string;
  uid: string | null;
}): VoiceChatReturn {
  const [joining,       setJoining]       = useState(false);
  const [joined,        setJoined]        = useState(false);
  const [hasMic,        setHasMic]        = useState(false);
  const [muted,         setMuted]         = useState(false);
  const [localSpeaking, setLocalSpeaking] = useState(false);
  const [peers,         setPeers]         = useState<Map<string, VoicePeerState>>(new Map());
  const [voiceError,    setVoiceError]    = useState<string | null>(null);

  const channelRef     = useRef<RealtimeChannel | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const audioCtxRef    = useRef<AudioContext | null>(null);
  const peersRef       = useRef<Map<string, PeerRecord>>(new Map());
  const localAnRef     = useRef<{ node: AnalyserNode; buf: Uint8Array<ArrayBuffer> } | null>(null);
  const rafRef         = useRef<number>(0);
  const mutedRef       = useRef(false);
  const hasMicRef      = useRef(false);
  const speakingRef    = useRef<Map<string, boolean>>(new Map());
  const lSpeakingRef   = useRef(false);
  const uidRef         = useRef(uid);
  useEffect(() => { uidRef.current = uid; }, [uid]);

  function getAC(): AudioContext | null {
    if (!audioCtxRef.current) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      audioCtxRef.current = new Ctor();
    }
    if (audioCtxRef.current.state === "suspended") audioCtxRef.current.resume().catch(() => {});
    return audioCtxRef.current;
  }

  function sendSignal(sig: Signal): void {
    channelRef.current?.send({ type: "broadcast", event: "vchat", payload: sig });
  }

  function createPeer(remoteUid: string): PeerRecord {
    const pc = new RTCPeerConnection({ iceServers: ICE });
    localStreamRef.current?.getTracks().forEach((t) => pc.addTrack(t, localStreamRef.current!));

    const audioEl = new Audio();
    audioEl.autoplay = true;
    const record: PeerRecord = { pc, audioEl, analyser: null, buf: new Uint8Array(0) };
    peersRef.current.set(remoteUid, record);
    setPeers((prev) => { const n = new Map(prev); n.set(remoteUid, { speaking: false, connected: false }); return n; });
    speakingRef.current.set(remoteUid, false);

    pc.ontrack = (ev) => {
      const stream = ev.streams[0];
      if (!stream) return;
      audioEl.srcObject = stream;
      audioEl.play().catch(() => {});
      const ac = getAC();
      if (ac) {
        const src = ac.createMediaStreamSource(stream);
        const an = ac.createAnalyser();
        an.fftSize = 512;
        src.connect(an);
        record.analyser = an;
        record.buf = new Uint8Array(an.frequencyBinCount);
      }
    };

    pc.onconnectionstatechange = () => {
      const connected = pc.connectionState === "connected";
      setPeers((prev) => {
        const e = prev.get(remoteUid);
        if (!e || e.connected === connected) return prev;
        const n = new Map(prev); n.set(remoteUid, { ...e, connected }); return n;
      });
    };

    pc.onicecandidate = (ev) => {
      sendSignal({ type: "ice", from: uidRef.current!, to: remoteUid, candidate: ev.candidate?.toJSON() ?? null });
    };

    return record;
  }

  async function handleSignal(sig: Signal): Promise<void> {
    const me = uidRef.current;
    if (!me || sig.to !== me) return;
    const { from } = sig;
    if (sig.type === "offer") {
      const rec = peersRef.current.get(from) ?? createPeer(from);
      await rec.pc.setRemoteDescription({ type: "offer", sdp: sig.sdp });
      const answer = await rec.pc.createAnswer();
      await rec.pc.setLocalDescription(answer);
      sendSignal({ type: "answer", from: me, to: from, sdp: rec.pc.localDescription!.sdp });
    } else if (sig.type === "answer") {
      const rec = peersRef.current.get(from);
      if (rec) await rec.pc.setRemoteDescription({ type: "answer", sdp: sig.sdp });
    } else if (sig.type === "ice") {
      const rec = peersRef.current.get(from);
      if (rec && sig.candidate) await rec.pc.addIceCandidate(sig.candidate).catch(() => {});
    }
  }

  async function initiateTowards(remoteUid: string): Promise<void> {
    const me = uidRef.current;
    if (!me || me <= remoteUid || peersRef.current.has(remoteUid)) return;
    const rec = createPeer(remoteUid);
    const offer = await rec.pc.createOffer();
    await rec.pc.setLocalDescription(offer);
    sendSignal({ type: "offer", from: me, to: remoteUid, sdp: rec.pc.localDescription!.sdp });
  }

  function startMeterLoop(): void {
    const tick = () => {
      rafRef.current = requestAnimationFrame(tick);
      if (localAnRef.current && !mutedRef.current) {
        const { node, buf } = localAnRef.current;
        node.getByteTimeDomainData(buf);
        let s = 0; for (const v of buf) { const n = (v - 128) / 128; s += n * n; }
        const speaking = Math.sqrt(s / buf.length) > 0.012;
        if (speaking !== lSpeakingRef.current) { lSpeakingRef.current = speaking; setLocalSpeaking(speaking); }
      }
      for (const [rUid, rec] of peersRef.current) {
        if (!rec.analyser) continue;
        rec.analyser.getByteTimeDomainData(rec.buf);
        let s = 0; for (const v of rec.buf) { const n = (v - 128) / 128; s += n * n; }
        const speaking = Math.sqrt(s / rec.buf.length) > 0.012;
        if (speakingRef.current.get(rUid) !== speaking) {
          speakingRef.current.set(rUid, speaking);
          setPeers((prev) => { const e = prev.get(rUid); if (!e || e.speaking === speaking) return prev; const n = new Map(prev); n.set(rUid, { ...e, speaking }); return n; });
        }
      }
    };
    tick();
  }

  function removePeer(remoteUid: string): void {
    const rec = peersRef.current.get(remoteUid);
    if (!rec) return;
    rec.pc.close();
    rec.audioEl.srcObject = null;
    peersRef.current.delete(remoteUid);
    speakingRef.current.delete(remoteUid);
    setPeers((prev) => { const n = new Map(prev); n.delete(remoteUid); return n; });
  }

  const join = async ({ withMic = true }: { withMic?: boolean } = {}): Promise<void> => {
    if (joined || joining) return;
    if (!uid) { setVoiceError("Not logged in."); return; }
    if (!isSupabaseConfigured) { setVoiceError("Supabase not configured."); return; }

    setJoining(true);
    setVoiceError(null);

    if (withMic) {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      } catch {
        setVoiceError("Microphone access denied.");
        setJoining(false);
        return;
      }
      localStreamRef.current = stream;

      const ac = getAC();
      if (ac) {
        const src = ac.createMediaStreamSource(stream);
        const an = ac.createAnalyser();
        an.fftSize = 512;
        src.connect(an);
        localAnRef.current = { node: an, buf: new Uint8Array(an.frequencyBinCount) };
      }
    }

    hasMicRef.current = withMic;

    const supabase = getSupabaseClient();
    const ch = supabase.channel(`voice:${roomKey}`, { config: { presence: { key: uid } } });

    ch.on("broadcast", { event: "vchat" }, ({ payload }) => {
      handleSignal(payload as Signal).catch(console.error);
    });

    ch.on("presence", { event: "sync" }, () => {
      const state = ch.presenceState();
      for (const list of Object.values(state))
        for (const p of list as Array<Record<string, unknown>>) {
          const rUid = p.uid as string;
          if (rUid && rUid !== uid) initiateTowards(rUid).catch(console.error);
        }
    });

    ch.on("presence", { event: "join" }, ({ newPresences }) => {
      for (const p of newPresences as Array<Record<string, unknown>>) {
        const rUid = p.uid as string;
        if (rUid && rUid !== uid) initiateTowards(rUid).catch(console.error);
      }
    });

    ch.on("presence", { event: "leave" }, ({ leftPresences }) => {
      for (const p of leftPresences as Array<Record<string, unknown>>) {
        const rUid = p.uid as string;
        if (rUid) removePeer(rUid);
      }
    });

    ch.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        await ch.track({ uid });
        setHasMic(hasMicRef.current);
        setJoined(true);
        setJoining(false);
        startMeterLoop();
      }
    });

    channelRef.current = ch;
  };

  const leave = (): void => {
    cancelAnimationFrame(rafRef.current);
    for (const rec of peersRef.current.values()) { rec.pc.close(); rec.audioEl.srcObject = null; }
    peersRef.current.clear();
    speakingRef.current.clear();
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    localAnRef.current = null;
    channelRef.current?.untrack().catch(() => {});
    channelRef.current?.unsubscribe();
    channelRef.current = null;
    mutedRef.current = false;
    hasMicRef.current = false;
    lSpeakingRef.current = false;
    setJoined(false);
    setJoining(false);
    setHasMic(false);
    setMuted(false);
    setLocalSpeaking(false);
    setPeers(new Map());
  };

  const toggleMute = (): void => {
    const next = !mutedRef.current;
    mutedRef.current = next;
    setMuted(next);
    localStreamRef.current?.getAudioTracks().forEach((t) => { t.enabled = !next; });
    if (next) { lSpeakingRef.current = false; setLocalSpeaking(false); }
  };

  const disableMic = (): void => {
    if (!hasMicRef.current) return;
    // Remove all senders from every peer connection so remotes stop receiving audio
    for (const rec of peersRef.current.values()) {
      rec.pc.getSenders().forEach((sender) => { rec.pc.removeTrack(sender); });
    }
    // Stop and release the mic stream — OS indicator goes off
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    localAnRef.current = null;
    hasMicRef.current = false;
    mutedRef.current = false;
    lSpeakingRef.current = false;
    setHasMic(false);
    setMuted(false);
    setLocalSpeaking(false);
    setVoiceError(null);
  };

  const enableMic = async (): Promise<void> => {
    if (hasMicRef.current || !joined) return;
    setVoiceError(null);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    } catch {
      setVoiceError("Microphone access denied.");
      return;
    }
    localStreamRef.current = stream;
    // Add new tracks to every existing peer connection
    for (const rec of peersRef.current.values()) {
      stream.getTracks().forEach((t) => rec.pc.addTrack(t, stream));
    }
    const ac = getAC();
    if (ac) {
      const src = ac.createMediaStreamSource(stream);
      const an = ac.createAnalyser();
      an.fftSize = 512;
      src.connect(an);
      localAnRef.current = { node: an, buf: new Uint8Array(an.frequencyBinCount) };
    }
    hasMicRef.current = true;
    setHasMic(true);
  };

  useEffect(() => () => { leave(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return { joining, joined, hasMic, muted, localSpeaking, peers, join, leave, toggleMute, disableMic, enableMic, voiceError };
}
