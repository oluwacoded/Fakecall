import { useEffect, useRef, useState, useCallback } from "react";
import { useRoute } from "wouter";
import { motion } from "framer-motion";
import { io, Socket } from "socket.io-client";
import { Mic, MicOff, PhoneOff, Heart } from "lucide-react";
import { useGetRoomByCode } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";

const HEART_EMOJIS = ["💕", "💗", "💖", "💓", "💝", "💘", "🩷", "❤️", "💞", "💌", "🫀", "💟"];

const hearts = Array.from({ length: 18 }, (_, i) => ({
  id: i,
  emoji: HEART_EMOJIS[i % HEART_EMOJIS.length],
  left: `${Math.random() * 95}%`,
  size: `${Math.random() * 1.5 + 1.2}rem`,
  duration: Math.random() * 10 + 8,
  delay: Math.random() * 8,
}));

export default function GuestCallPage() {
  const [, params] = useRoute("/call/:code");
  const code = params?.code;
  const { toast } = useToast();

  const { data: room, isLoading, isError } = useGetRoomByCode(code || "");

  const [isConnected, setIsConnected] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [peersCount, setPeersCount] = useState(0);
  const [hasLeft, setHasLeft] = useState(false);

  const socketRef = useRef<Socket | null>(null);
  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
  const audioRefs = useRef<Map<string, HTMLAudioElement>>(new Map());

  const initAudio = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: false,
      });
      localStreamRef.current = stream;
      return true;
    } catch {
      toast({ variant: "destructive", title: "Microphone Required", description: "Allow microphone access to join the call." });
      return false;
    }
  }, [toast]);

  useEffect(() => {
    if (!code || !room) return;
    let active = true;

    const setup = async () => {
      const ok = await initAudio();
      if (!ok || !active) return;

      const socket = io({ path: "/api/socket.io" });
      socketRef.current = socket;

      socket.on("connect", () => {
        setIsConnected(true);
        socket.emit("join-room", code);
      });

      socket.on("disconnect", () => setIsConnected(false));

      const createPeer = (targetId: string) => {
        const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
        localStreamRef.current?.getTracks().forEach((t) => pc.addTrack(t, localStreamRef.current!));
        pc.onicecandidate = (e) => { if (e.candidate) socket.emit("ice-candidate", { candidate: e.candidate, targetId }); };
        pc.ontrack = (e) => {
          let el = audioRefs.current.get(targetId);
          if (!el) { el = new Audio(); el.autoplay = true; audioRefs.current.set(targetId, el); }
          el.srcObject = e.streams[0];
          // Browsers block autoplay without user gesture — explicitly play
          el.play().catch(() => {});
        };
        peersRef.current.set(targetId, pc);
        return pc;
      };

      socket.on("room-peers", async (peerIds: string[]) => {
        setPeersCount(peerIds.length);
        for (const id of peerIds) {
          const pc = createPeer(id);
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          socket.emit("webrtc-offer", { offer, targetId: id });
        }
      });

      socket.on("peer-joined", async (targetId: string) => {
        setPeersCount((n) => n + 1);
        const pc = createPeer(targetId);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit("webrtc-offer", { offer, targetId });
      });

      socket.on("webrtc-offer", async ({ offer, targetId }: { offer: RTCSessionDescriptionInit; targetId: string }) => {
        let pc = peersRef.current.get(targetId);
        if (!pc) pc = createPeer(targetId);
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit("webrtc-answer", { answer, targetId });
      });

      socket.on("webrtc-answer", async ({ answer, targetId }: { answer: RTCSessionDescriptionInit; targetId: string }) => {
        const pc = peersRef.current.get(targetId);
        if (pc) await pc.setRemoteDescription(new RTCSessionDescription(answer));
      });

      socket.on("ice-candidate", async ({ candidate, targetId }: { candidate: RTCIceCandidateInit; targetId: string }) => {
        const pc = peersRef.current.get(targetId);
        if (pc) { try { await pc.addIceCandidate(new RTCIceCandidate(candidate)); } catch { /* ignore */ } }
      });

      socket.on("peer-left", (targetId: string) => {
        setPeersCount((n) => Math.max(0, n - 1));
        peersRef.current.get(targetId)?.close();
        peersRef.current.delete(targetId);
        const el = audioRefs.current.get(targetId);
        if (el) { el.srcObject = null; audioRefs.current.delete(targetId); }
      });
    };

    setup();

    return () => {
      active = false;
      socketRef.current?.emit("leave-room", code);
      socketRef.current?.disconnect();
      peersRef.current.forEach((pc) => pc.close());
      peersRef.current.clear();
      audioRefs.current.forEach((el) => { el.srcObject = null; });
      audioRefs.current.clear();
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [code, room, initAudio]);

  const toggleMute = () => {
    const next = !isMuted;
    setIsMuted(next);
    localStreamRef.current?.getAudioTracks().forEach((t) => { t.enabled = !next; });
  };

  const endCall = () => {
    setHasLeft(true);
    socketRef.current?.emit("leave-room", code);
    socketRef.current?.disconnect();
    peersRef.current.forEach((pc) => pc.close());
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
  };

  if (hasLeft) {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-gradient-to-br from-pink-100 via-rose-50 to-fuchsia-100">
        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="text-6xl mb-6">💕</motion.div>
        <h1 className="text-3xl font-serif text-pink-600 mb-2">Until next time</h1>
        <p className="text-pink-400 text-sm">The call has ended. Share the link to reconnect.</p>
      </div>
    );
  }

  if (isError || (!isLoading && !room)) {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-gradient-to-br from-pink-100 via-rose-50 to-fuchsia-100">
        <div className="text-5xl mb-4">💔</div>
        <h1 className="text-2xl font-serif text-pink-600 mb-2">Link not found</h1>
        <p className="text-pink-400 text-sm">This call link may have expired or is invalid.</p>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] relative overflow-hidden flex flex-col items-center justify-center"
      style={{ background: "linear-gradient(135deg, #ff9acd 0%, #ffb3d9 25%, #ff85c8 50%, #ff69b4 75%, #e75480 100%)" }}>

      {/* Floating hearts background */}
      {hearts.map((h) => (
        <motion.div
          key={h.id}
          className="absolute pointer-events-none select-none"
          style={{ left: h.left, bottom: "-10%", fontSize: h.size }}
          initial={{ y: 0, opacity: 0 }}
          animate={{ y: "-120vh", opacity: [0, 0.9, 0.9, 0] }}
          transition={{ duration: h.duration, repeat: Infinity, delay: h.delay, ease: "easeOut" }}
        >
          {h.emoji}
        </motion.div>
      ))}

      {/* Soft glow layers */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_40%,rgba(255,255,255,0.35)_0%,transparent_70%)] pointer-events-none" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_80%_80%,rgba(231,84,128,0.3)_0%,transparent_60%)] pointer-events-none" />

      {/* Header */}
      <div className="absolute top-0 left-0 right-0 flex justify-between items-center p-5 z-10">
        <div className="flex items-center gap-2">
          <Heart className="w-5 h-5 text-white fill-white" />
          <span className="text-white font-semibold text-lg tracking-wide drop-shadow">Love Site</span>
        </div>
        <div className="flex items-center gap-2 bg-white/20 backdrop-blur-sm rounded-full px-3 py-1">
          <div className={`w-2 h-2 rounded-full ${isConnected ? "bg-white animate-pulse" : "bg-white/40"}`} />
          <span className="text-white text-xs font-mono">
            {isLoading ? "Loading…" : isConnected ? (peersCount > 0 ? `${peersCount + 1} connected` : "Waiting…") : "Connecting…"}
          </span>
        </div>
      </div>

      {/* Main content */}
      <div className="relative z-10 flex flex-col items-center gap-8 px-6">
        {/* Pulsing heart orb */}
        <div className="relative flex items-center justify-center">
          <motion.div
            animate={{ scale: [1, 1.12, 1], opacity: [0.3, 0.6, 0.3] }}
            transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
            className="absolute w-48 h-48 rounded-full"
            style={{ background: "radial-gradient(circle, rgba(255,255,255,0.5) 0%, rgba(255,105,180,0.2) 70%, transparent 100%)" }}
          />
          <motion.div
            animate={{ scale: [1, 1.08, 1] }}
            transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut", delay: 0.4 }}
            className="absolute w-36 h-36 rounded-full border-2 border-white/40"
          />
          <motion.div
            animate={{ scale: [1, 1.15, 1] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut", delay: 0.2 }}
          >
            <Heart className="w-20 h-20 text-white fill-white drop-shadow-[0_0_20px_rgba(255,255,255,0.8)]" />
          </motion.div>
        </div>

        {/* Branding */}
        <div className="text-center">
          <h1 className="text-4xl font-serif text-white drop-shadow-lg mb-1">Love Site</h1>
          <p className="text-white/80 text-sm tracking-widest uppercase">
            {peersCount > 0 ? "💕 You're connected" : "Waiting for your partner…"}
          </p>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-6 mt-4">
          <motion.button
            whileTap={{ scale: 0.92 }}
            onClick={toggleMute}
            className={`w-16 h-16 rounded-full border-2 border-white/60 flex items-center justify-center backdrop-blur-sm transition-all shadow-lg ${
              isMuted
                ? "bg-white/30 text-white/50"
                : "bg-white/20 text-white hover:bg-white/30"
            }`}
          >
            {isMuted ? <MicOff className="w-7 h-7" /> : <Mic className="w-7 h-7" />}
          </motion.button>

          <motion.button
            whileTap={{ scale: 0.92 }}
            onClick={endCall}
            className="w-20 h-20 rounded-full bg-white/90 flex items-center justify-center shadow-xl hover:bg-white transition-all"
          >
            <PhoneOff className="w-8 h-8 text-pink-600" />
          </motion.button>
        </div>

        {isMuted && (
          <motion.p
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-white/70 text-xs font-mono"
          >
            🔇 You're muted
          </motion.p>
        )}
      </div>

      {/* Bottom badge */}
      <div className="absolute bottom-5 left-0 right-0 flex justify-center">
        <div className="text-white/50 text-xs font-mono tracking-widest flex items-center gap-1">
          <Heart className="w-3 h-3 fill-white/40" /> Lovers Calling · Private &amp; Encrypted
        </div>
      </div>
    </div>
  );
}
