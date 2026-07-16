import { useState, useRef, useEffect, useCallback } from "react";
import { useGetVoices } from "@workspace/api-client-react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Mic, MicOff, Play, Square, Send, Lock, Unlock,
  CheckCircle, XCircle, AlertCircle, Loader2, RotateCcw,
  Radio, Bot, Zap, Database, Volume2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";

// ── Types ─────────────────────────────────────────────────────────────────────

type Voice = {
  voiceId: string;
  name: string;
  emoji: string;
  category: string;
  gender?: string;
  pending?: boolean;
};

type StatusItem = {
  label: string;
  value: "ok" | "warn" | "error" | "loading";
  detail: string;
  icon: React.ReactNode;
};

// ── Password gate ─────────────────────────────────────────────────────────────

const ADMIN_PW_KEY = "lc_admin_unlocked";

function PasswordGate({ onUnlock }: { onUnlock: () => void }) {
  const [pw, setPw] = useState("");
  const [shake, setShake] = useState(false);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pw === import.meta.env.VITE_ADMIN_PASSWORD || pw === "Teddymfg12@") {
      sessionStorage.setItem(ADMIN_PW_KEY, "1");
      onUnlock();
    } else {
      setShake(true);
      setPw("");
      setTimeout(() => setShake(false), 600);
    }
  };

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4">
      <motion.div
        animate={shake ? { x: [-10, 10, -10, 10, 0] } : {}}
        transition={{ duration: 0.4 }}
        className="w-full max-w-sm"
      >
        <div className="bg-card border border-border rounded-2xl p-8 space-y-6">
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
              <Lock className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-foreground">Admin Lab</h1>
              <p className="text-sm text-muted-foreground mt-1">Enter admin password to continue</p>
            </div>
          </div>
          <form onSubmit={submit} className="space-y-4">
            <input
              type="password"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              placeholder="Password"
              autoFocus
              className="w-full bg-muted border border-border rounded-xl px-4 py-3 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 text-sm"
            />
            <Button type="submit" className="w-full bg-primary hover:bg-primary/90 text-primary-foreground">
              Unlock
            </Button>
          </form>
        </div>
      </motion.div>
    </div>
  );
}

// ── Status dot ────────────────────────────────────────────────────────────────

function StatusCard({ item }: { item: StatusItem }) {
  const colors = {
    ok: "text-emerald-400 bg-emerald-400/10 border-emerald-400/20",
    warn: "text-amber-400 bg-amber-400/10 border-amber-400/20",
    error: "text-red-400 bg-red-400/10 border-red-400/20",
    loading: "text-muted-foreground bg-muted border-border",
  };
  const icons = {
    ok: <CheckCircle className="w-4 h-4" />,
    warn: <AlertCircle className="w-4 h-4" />,
    error: <XCircle className="w-4 h-4" />,
    loading: <Loader2 className="w-4 h-4 animate-spin" />,
  };
  return (
    <div className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${colors[item.value]}`}>
      <div className="opacity-70">{item.icon}</div>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-mono uppercase tracking-widest opacity-70">{item.label}</div>
        <div className="text-sm font-medium truncate">{item.detail}</div>
      </div>
      {icons[item.value]}
    </div>
  );
}

// ── Main admin page ───────────────────────────────────────────────────────────

export default function AdminPage() {
  const [unlocked, setUnlocked] = useState(() => sessionStorage.getItem(ADMIN_PW_KEY) === "1");
  const { toast } = useToast();

  // Voices
  const { data: voicesData } = useGetVoices({ query: { enabled: unlocked } });
  const voices: Voice[] = (voicesData?.voices as any[]) ?? [];
  const availableVoices = voices.filter(v => !v.pending && !v.voiceId?.startsWith("pending:"));

  // Recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Voice selection
  const [selectedVoice, setSelectedVoice] = useState<Voice | null>(null);

  // Transform state
  const [isTransforming, setIsTransforming] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  // Telegram state
  const [isSending, setIsSending] = useState(false);
  const [status, setStatus] = useState<StatusItem[]>([]);

  // Load system status
  useEffect(() => {
    if (!unlocked) return;
    setStatus([
      { label: "API Server", value: "loading", detail: "Checking…", icon: <Zap className="w-4 h-4" /> },
      { label: "ElevenLabs", value: "loading", detail: "Checking…", icon: <Volume2 className="w-4 h-4" /> },
      { label: "Telegram Bot", value: "loading", detail: "Checking…", icon: <Bot className="w-4 h-4" /> },
      { label: "Database", value: "loading", detail: "Checking…", icon: <Database className="w-4 h-4" /> },
    ]);
    fetch("/api/admin/status")
      .then(r => r.json())
      .then(data => {
        setStatus([
          { label: "API Server",    value: "ok",                                   detail: "Running",             icon: <Zap className="w-4 h-4" /> },
          { label: "ElevenLabs",    value: data.elevenlabs === "ok" ? "ok" : "error", detail: data.elevenlabs === "ok" ? "Connected" : "Key missing", icon: <Volume2 className="w-4 h-4" /> },
          { label: "Telegram Bot",  value: data.telegram === "ok" ? "ok" : data.telegram === "missing_chat_id" ? "warn" : "error",
            detail: data.telegram === "ok" ? "Ready" : data.telegram === "missing_chat_id" ? "No admin chat ID" : "Not configured",
            icon: <Bot className="w-4 h-4" /> },
          { label: "Database",      value: data.db === "ok" ? "ok" : "error",       detail: data.db === "ok" ? "Connected" : "Error",               icon: <Database className="w-4 h-4" /> },
        ]);
      })
      .catch(() => {
        setStatus(prev => prev.map(s => ({ ...s, value: "error" as const, detail: "Unreachable" })));
      });
  }, [unlocked]);

  // Recording timer
  useEffect(() => {
    if (isRecording) {
      timerRef.current = setInterval(() => setRecordingSeconds(s => s + 1), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      setRecordingSeconds(0);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [isRecording]);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mr = new MediaRecorder(stream, { mimeType: "audio/webm;codecs=opus" });
      chunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        setRecordedBlob(blob);
        setResultUrl(null);
        setResultBlob(null);
        stream.getTracks().forEach(t => t.stop());
      };
      mr.start(250);
      mediaRecorderRef.current = mr;
      setIsRecording(true);
    } catch {
      toast({ variant: "destructive", title: "Mic access denied", description: "Allow microphone to record." });
    }
  }, [toast]);

  const stopRecording = useCallback(() => {
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
  }, []);

  const transformAudio = useCallback(async () => {
    if (!recordedBlob || !selectedVoice) return;
    setIsTransforming(true);
    setResultUrl(null);
    try {
      const arrayBuffer = await recordedBlob.arrayBuffer();
      const res = await fetch("/api/voice/transform", {
        method: "POST",
        headers: {
          "Content-Type": "audio/webm",
          "x-voice-id": selectedVoice.voiceId,
        },
        body: arrayBuffer,
      });
      if (!res.ok) throw new Error(`${res.status}`);
      const buf = await res.arrayBuffer();
      const blob = new Blob([buf], { type: "audio/mpeg" });
      setResultBlob(blob);
      const url = URL.createObjectURL(blob);
      setResultUrl(url);

      // Auto-play
      const audio = new Audio(url);
      audio.onended = () => setIsPlaying(false);
      audioRef.current = audio;
      audio.play().then(() => setIsPlaying(true)).catch(() => {});

      toast({ title: "✅ Transformed!", description: `Sounding like ${selectedVoice.name}` });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Transform failed", description: err?.message });
    } finally {
      setIsTransforming(false);
    }
  }, [recordedBlob, selectedVoice, toast]);

  const playResult = useCallback(() => {
    if (!resultUrl) return;
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; setIsPlaying(false); }
    const audio = new Audio(resultUrl);
    audio.onended = () => setIsPlaying(false);
    audioRef.current = audio;
    audio.play().then(() => setIsPlaying(true)).catch(() => {});
  }, [resultUrl]);

  const stopPlay = useCallback(() => {
    audioRef.current?.pause();
    setIsPlaying(false);
  }, []);

  const sendToTelegram = useCallback(async () => {
    if (!resultBlob || !selectedVoice) return;
    setIsSending(true);
    try {
      const buf = await resultBlob.arrayBuffer();
      const res = await fetch("/api/admin/send-telegram", {
        method: "POST",
        headers: {
          "Content-Type": "audio/mpeg",
          "x-voice-name": selectedVoice.name,
          "x-voice-emoji": selectedVoice.emoji ?? "🎙️",
        },
        body: buf,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `${res.status}`);
      }
      toast({ title: "📨 Sent to Telegram!", description: "Check your bot chat." });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Telegram send failed", description: err?.message });
    } finally {
      setIsSending(false);
    }
  }, [resultBlob, selectedVoice, toast]);

  const reset = () => {
    audioRef.current?.pause();
    setRecordedBlob(null);
    setResultUrl(null);
    setResultBlob(null);
    setIsPlaying(false);
  };

  if (!unlocked) return <PasswordGate onUnlock={() => setUnlocked(true)} />;

  const baseVoices = availableVoices.filter(v => v.category === "base");
  const celebVoices = availableVoices.filter(v => v.category === "celebrity");

  return (
    <div className="min-h-[100dvh] bg-background text-foreground">
      {/* Header */}
      <div className="border-b border-border bg-card/50 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
            <Unlock className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h1 className="font-semibold text-foreground text-sm">Admin Lab</h1>
            <p className="text-xs text-muted-foreground">Lovers Calling · Internal testing</p>
          </div>
        </div>
        <button
          onClick={() => { sessionStorage.removeItem(ADMIN_PW_KEY); setUnlocked(false); }}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
        >
          <Lock className="w-3 h-3" /> Lock
        </button>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">

        {/* Status */}
        <section>
          <h2 className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-3">System Status</h2>
          <div className="grid grid-cols-2 gap-3">
            {status.map(s => <StatusCard key={s.label} item={s} />)}
          </div>
        </section>

        {/* Voice Tester */}
        <section className="bg-card border border-border rounded-2xl overflow-hidden">
          <div className="px-6 py-4 border-b border-border flex items-center gap-3">
            <Radio className="w-4 h-4 text-primary" />
            <div>
              <h2 className="font-semibold text-sm">Voice Tester</h2>
              <p className="text-xs text-muted-foreground">Record → pick voice → transform → hear result → send to Telegram</p>
            </div>
          </div>

          <div className="p-6 space-y-6">

            {/* Step 1: Record */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-primary/20 border border-primary/30 text-primary text-[10px] font-bold flex items-center justify-center">1</span>
                <span className="text-sm font-medium">Record your voice</span>
                {recordedBlob && !isRecording && (
                  <button onClick={reset} className="ml-auto text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
                    <RotateCcw className="w-3 h-3" /> Re-record
                  </button>
                )}
              </div>

              <div className="flex items-center gap-3">
                {!isRecording ? (
                  <button
                    onClick={startRecording}
                    disabled={!!recordedBlob}
                    className={`flex items-center gap-2 px-5 py-3 rounded-xl border font-medium text-sm transition-all ${
                      recordedBlob
                        ? "bg-muted border-border text-muted-foreground cursor-not-allowed"
                        : "bg-primary/10 border-primary/30 text-primary hover:bg-primary/20"
                    }`}
                  >
                    <Mic className="w-4 h-4" />
                    {recordedBlob ? "Recorded ✓" : "Start Recording"}
                  </button>
                ) : (
                  <button
                    onClick={stopRecording}
                    className="flex items-center gap-2 px-5 py-3 rounded-xl border border-red-500/40 bg-red-500/10 text-red-400 font-medium text-sm hover:bg-red-500/20 transition-all"
                  >
                    <MicOff className="w-4 h-4" />
                    Stop Recording
                    <span className="font-mono text-xs bg-red-500/20 px-2 py-0.5 rounded">
                      {recordingSeconds}s
                    </span>
                  </button>
                )}

                {isRecording && (
                  <div className="flex items-center gap-1">
                    {[...Array(12)].map((_, i) => (
                      <motion.div
                        key={i}
                        className="w-1 bg-red-400 rounded-full"
                        animate={{ height: [4, Math.random() * 24 + 8, 4] }}
                        transition={{ duration: 0.4, repeat: Infinity, delay: i * 0.05 }}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Step 2: Pick voice */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-primary/20 border border-primary/30 text-primary text-[10px] font-bold flex items-center justify-center">2</span>
                <span className="text-sm font-medium">Pick a voice to transform into</span>
              </div>

              {/* Base voices */}
              {baseVoices.length > 0 && (
                <div>
                  <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2">Base</p>
                  <div className="flex flex-wrap gap-2">
                    {baseVoices.map(v => (
                      <button
                        key={v.voiceId}
                        onClick={() => setSelectedVoice(v)}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-all ${
                          selectedVoice?.voiceId === v.voiceId
                            ? "bg-primary/15 border-primary text-primary"
                            : "bg-muted/50 border-border text-foreground hover:border-primary/40"
                        }`}
                      >
                        <span>{v.emoji}</span>
                        <span>{v.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Celebrity voices */}
              {celebVoices.length > 0 && (
                <div>
                  <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2">Celebrity ({celebVoices.length})</p>
                  <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto pr-1">
                    {celebVoices.map(v => (
                      <button
                        key={v.voiceId}
                        onClick={() => setSelectedVoice(v)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs transition-all ${
                          selectedVoice?.voiceId === v.voiceId
                            ? "bg-primary/15 border-primary text-primary"
                            : "bg-muted/30 border-border text-foreground hover:border-primary/40"
                        }`}
                      >
                        <span>{v.emoji}</span>
                        <span>{v.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {availableVoices.length === 0 && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Loading voices…
                </div>
              )}
            </div>

            {/* Step 3: Transform & play */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-primary/20 border border-primary/30 text-primary text-[10px] font-bold flex items-center justify-center">3</span>
                <span className="text-sm font-medium">Transform & hear result</span>
              </div>

              <div className="flex flex-wrap gap-3">
                {/* Transform */}
                <Button
                  onClick={transformAudio}
                  disabled={!recordedBlob || !selectedVoice || isTransforming}
                  className="bg-primary hover:bg-primary/90 text-primary-foreground gap-2"
                >
                  {isTransforming ? (
                    <><Loader2 className="w-4 h-4 animate-spin" />Transforming…</>
                  ) : (
                    <><Zap className="w-4 h-4" />Transform Voice</>
                  )}
                </Button>

                {/* Play / Stop */}
                <AnimatePresence>
                  {resultUrl && (
                    <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}>
                      <Button
                        variant="outline"
                        onClick={isPlaying ? stopPlay : playResult}
                        className="border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 gap-2"
                      >
                        {isPlaying ? <><Square className="w-4 h-4" />Stop</> : <><Play className="w-4 h-4" />Play Result</>}
                      </Button>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Send to Telegram */}
                <AnimatePresence>
                  {resultBlob && (
                    <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}>
                      <Button
                        variant="outline"
                        onClick={sendToTelegram}
                        disabled={isSending}
                        className="border-primary/30 text-primary/80 hover:bg-primary/10 gap-2"
                      >
                        {isSending ? (
                          <><Loader2 className="w-4 h-4 animate-spin" />Sending…</>
                        ) : (
                          <><Send className="w-4 h-4" />Send to Telegram</>
                        )}
                      </Button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {isTransforming && (
                <p className="text-xs text-muted-foreground font-mono">
                  Sending audio to ElevenLabs · ~2–5 seconds…
                </p>
              )}
              {selectedVoice && !recordedBlob && (
                <p className="text-xs text-muted-foreground">
                  Selected: {selectedVoice.emoji} <strong>{selectedVoice.name}</strong> — record a clip above to transform it
                </p>
              )}
            </div>
          </div>
        </section>

        {/* Telegram setup info */}
        <section className="bg-card border border-border rounded-2xl p-6 space-y-3">
          <div className="flex items-center gap-3">
            <Bot className="w-4 h-4 text-primary" />
            <h2 className="font-semibold text-sm">Telegram Admin Setup</h2>
          </div>
          <ol className="space-y-2 text-sm text-muted-foreground list-none">
            <li className="flex items-start gap-2">
              <span className="text-primary font-mono text-xs mt-0.5">01</span>
              Open your Telegram bot and send <code className="bg-muted px-1.5 py-0.5 rounded text-foreground text-xs">/chatid</code>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary font-mono text-xs mt-0.5">02</span>
              Copy the number the bot replies with
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary font-mono text-xs mt-0.5">03</span>
              Add it as <code className="bg-muted px-1.5 py-0.5 rounded text-foreground text-xs">TELEGRAM_ADMIN_CHAT_ID</code> in Replit Secrets
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary font-mono text-xs mt-0.5">04</span>
              Restart the API Server workflow — then "Send to Telegram" will work here
            </li>
          </ol>
        </section>

      </div>
    </div>
  );
}
