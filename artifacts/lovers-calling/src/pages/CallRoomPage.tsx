import { useEffect, useRef, useState, useCallback } from "react";
import { useLocation, useRoute } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { io, Socket } from "socket.io-client";
import { Mic, MicOff, PhoneOff, Ear, Fingerprint, Sparkles } from "lucide-react";
import { useGetRoomByCode, useGetMe, useGetVoices } from "@workspace/api-client-react";
import { useAuth } from "@clerk/react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

type VoiceMode = { voiceId: string; name: string; emoji: string; category: string; gender?: string; description?: string };

export default function CallRoomPage() {
  const [, params] = useRoute("/call/:code");
  const code = params?.code;
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { getToken } = useAuth();

  const { data: room, isLoading: isLoadingRoom, isError: isRoomError } = useGetRoomByCode(code || "");
  const { data: user } = useGetMe();
  const { data: voicesData, isLoading: isLoadingVoices } = useGetVoices();

  const [isConnected, setIsConnected] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [voiceMode, setVoiceMode] = useState<VoiceMode>({ voiceId: 'natural', name: 'Natural', emoji: '🎙', category: 'base' });
  const [peerVoiceMode, setPeerVoiceMode] = useState<string>("natural");
  const [peersCount, setPeersCount] = useState(0);
  const [activeTab, setActiveTab] = useState<"base" | "celebrity">("base");
  const [celebGender, setCelebGender] = useState<"male" | "female">("male");

  const socketRef = useRef<Socket | null>(null);
  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
  const processedStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  
  // Celebrity voice refs
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const sampleBufferRef = useRef<Float32Array[]>([]);
  const isTransformingRef = useRef(false);
  const celebDestinationRef = useRef<MediaStreamDestinationNode | null>(null);
  const authTokenRef = useRef<string>("");

  // Elements
  const audioRefs = useRef<Map<string, HTMLAudioElement>>(new Map());
  const waveformCanvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number>(0);

  useEffect(() => {
    getToken().then(t => { if (t) authTokenRef.current = t; });
  }, [getToken]);

  const initAudio = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, 
        video: false 
      });
      localStreamRef.current = stream;
      
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioContextRef.current = audioCtx;
      
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      analyserRef.current = analyser;
      
      const destination = audioCtx.createMediaStreamDestination();
      processedStreamRef.current = destination.stream;

      // Apply initial processing (natural = just pass through)
      source.connect(analyser).connect(destination);
      
      return true;
    } catch (err) {
      console.error("Microphone access denied:", err);
      toast({
        variant: "destructive",
        title: "Microphone Required",
        description: "Please allow microphone access to join the room.",
      });
      return false;
    }
  }, [toast]);

  const startCelebrityTransform = useCallback((voiceId: string) => {
    if (!audioContextRef.current || !localStreamRef.current) return;
    const ctx = audioContextRef.current;
    const sampleRate = ctx.sampleRate;
    const chunkSeconds = 2.0;
    const chunkSamples = Math.floor(sampleRate * chunkSeconds);

    const source = ctx.createMediaStreamSource(localStreamRef.current);
    const processor = ctx.createScriptProcessor(4096, 1, 1);
    const celebDest = ctx.createMediaStreamDestination();
    celebDestinationRef.current = celebDest;

    source.connect(analyserRef.current!);
    source.connect(processor);
    processor.connect(ctx.destination);

    sampleBufferRef.current = [];
    let totalSamples = 0;

    processor.onaudioprocess = (e) => {
      const channelData = e.inputBuffer.getChannelData(0);
      sampleBufferRef.current.push(new Float32Array(channelData));
      totalSamples += channelData.length;

      if (totalSamples >= chunkSamples && !isTransformingRef.current) {
        isTransformingRef.current = true;
        const combined = new Float32Array(totalSamples);
        let offset = 0;
        for (const chunk of sampleBufferRef.current) {
          combined.set(chunk, offset);
          offset += chunk.length;
        }
        sampleBufferRef.current = [];
        totalSamples = 0;

        const wavBuffer = encodeWAV(combined, sampleRate);

        fetch('/api/voice/transform', {
          method: 'POST',
          headers: {
            'Content-Type': 'audio/wav',
            'x-voice-id': voiceId,
            'Authorization': `Bearer ${authTokenRef.current}`,
          },
          body: wavBuffer,
        })
          .then(async (res) => {
            if (!res.ok) throw new Error('Transform failed');
            const arrayBuf = await res.arrayBuffer();
            const decoded = await ctx.decodeAudioData(arrayBuf);
            const bufSrc = ctx.createBufferSource();
            bufSrc.buffer = decoded;
            bufSrc.connect(celebDest);
            bufSrc.start();
          })
          .catch(console.error)
          .finally(() => { isTransformingRef.current = false; });
      }
    };

    scriptProcessorRef.current = processor;

    const audioTrack = celebDest.stream.getAudioTracks()[0];
    if (audioTrack) {
      processedStreamRef.current = celebDest.stream;
      peersRef.current.forEach(pc => {
        const sender = pc.getSenders().find(s => s.track?.kind === 'audio');
        if (sender) sender.replaceTrack(audioTrack);
      });
    }
  }, []);

  const stopCelebrityTransform = useCallback(() => {
    if (scriptProcessorRef.current) {
      scriptProcessorRef.current.disconnect();
      scriptProcessorRef.current.onaudioprocess = null;
      scriptProcessorRef.current = null;
    }
    celebDestinationRef.current = null;
    sampleBufferRef.current = [];
    isTransformingRef.current = false;
  }, []);

  const handleVoiceModeChange = useCallback(async (voice: VoiceMode) => {
    setVoiceMode(voice);
    stopCelebrityTransform();

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop());
    }
    const audioReady = await initAudio();
    if (!audioReady) return;

    // All non-natural voices go through ElevenLabs STS for maximum realism
    if (voice.voiceId !== 'natural') {
      startCelebrityTransform(voice.voiceId);
    } else {
      // Natural — pass audio straight through
      if (audioContextRef.current && localStreamRef.current) {
        const ctx = audioContextRef.current;
        const source = ctx.createMediaStreamSource(localStreamRef.current);
        const dest = ctx.createMediaStreamDestination();
        processedStreamRef.current = dest.stream;
        source.connect(analyserRef.current!).connect(dest);

        const audioTrack = dest.stream.getAudioTracks()[0];
        if (audioTrack) {
          peersRef.current.forEach(pc => {
            const sender = pc.getSenders().find(s => s.track?.kind === 'audio');
            if (sender) sender.replaceTrack(audioTrack);
          });
        }
      }
    }

    if (socketRef.current) {
      socketRef.current.emit('voice-mode-change', { roomCode: code, mode: voice.voiceId });
    }
  }, [stopCelebrityTransform, startCelebrityTransform, initAudio, code]);

  const toggleMute = () => {
    const newMuted = !isMuted;
    setIsMuted(newMuted);
    if (processedStreamRef.current) {
      processedStreamRef.current.getAudioTracks().forEach(track => {
        track.enabled = !newMuted;
      });
    }
  };

  const endCall = () => {
    setLocation("/dashboard");
  };

  useEffect(() => {
    if (!code) return;
    let isSubscribed = true;
    
    const setup = async () => {
      const audioReady = await initAudio();
      if (!audioReady || !isSubscribed) return;

      const socket = io({ path: '/api/socket.io' });
      socketRef.current = socket;

      socket.on('connect', () => {
        setIsConnected(true);
        socket.emit('join-room', code);
      });

      const createPeerConnection = (targetId: string) => {
        const pc = new RTCPeerConnection({
          iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
        });

        if (processedStreamRef.current) {
          processedStreamRef.current.getTracks().forEach(track => {
            pc.addTrack(track, processedStreamRef.current!);
          });
        }

        pc.onicecandidate = (event) => {
          if (event.candidate) {
            socket.emit('ice-candidate', { candidate: event.candidate, targetId });
          }
        };

        pc.ontrack = (event) => {
          let audioEl = audioRefs.current.get(targetId);
          if (!audioEl) {
            audioEl = new Audio();
            audioEl.autoplay = true;
            audioRefs.current.set(targetId, audioEl);
          }
          audioEl.srcObject = event.streams[0];
        };

        peersRef.current.set(targetId, pc);
        return pc;
      };

      socket.on('room-peers', async (peerIds: string[]) => {
        setPeersCount(peerIds.length);
        for (const targetId of peerIds) {
          const pc = createPeerConnection(targetId);
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          socket.emit('webrtc-offer', { offer, targetId });
        }
      });

      socket.on('peer-joined', async (targetId: string) => {
        setPeersCount(prev => prev + 1);
        const pc = createPeerConnection(targetId);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit('webrtc-offer', { offer, targetId });
      });

      socket.on('webrtc-offer', async ({ offer, targetId }: { offer: RTCSessionDescriptionInit, targetId: string }) => {
        let pc = peersRef.current.get(targetId);
        if (!pc) {
          pc = createPeerConnection(targetId);
        }
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('webrtc-answer', { answer, targetId });
      });

      socket.on('webrtc-answer', async ({ answer, targetId }: { answer: RTCSessionDescriptionInit, targetId: string }) => {
        const pc = peersRef.current.get(targetId);
        if (pc) {
          await pc.setRemoteDescription(new RTCSessionDescription(answer));
        }
      });

      socket.on('ice-candidate', async ({ candidate, targetId }: { candidate: RTCIceCandidateInit, targetId: string }) => {
        const pc = peersRef.current.get(targetId);
        if (pc) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
          } catch (e) {
            console.error('Error adding ICE candidate', e);
          }
        }
      });

      socket.on('voice-mode-change', ({ mode }: { mode: string }) => {
        setPeerVoiceMode(mode);
      });

      socket.on('peer-left', (targetId: string) => {
        setPeersCount(prev => Math.max(0, prev - 1));
        const pc = peersRef.current.get(targetId);
        if (pc) {
          pc.close();
          peersRef.current.delete(targetId);
        }
        const audioEl = audioRefs.current.get(targetId);
        if (audioEl) {
          audioEl.srcObject = null;
          audioRefs.current.delete(targetId);
        }
      });
    };

    setup();

    return () => {
      isSubscribed = false;
      stopCelebrityTransform();
      if (socketRef.current) {
        socketRef.current.emit('leave-room', code);
        socketRef.current.disconnect();
      }
      peersRef.current.forEach(pc => pc.close());
      peersRef.current.clear();
      audioRefs.current.forEach(audio => { audio.srcObject = null; });
      audioRefs.current.clear();
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.stop());
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
      cancelAnimationFrame(animationFrameRef.current);
    };
  }, [code, initAudio, stopCelebrityTransform]);

  useEffect(() => {
    const canvas = waveformCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const draw = () => {
      animationFrameRef.current = requestAnimationFrame(draw);
      const width = canvas.width;
      const height = canvas.height;
      ctx.clearRect(0, 0, width, height);

      if (!analyserRef.current) return;
      
      const bufferLength = analyserRef.current.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      analyserRef.current.getByteTimeDomainData(dataArray);

      ctx.lineWidth = 2;
      ctx.strokeStyle = '#c2856a';
      ctx.beginPath();

      const sliceWidth = width * 1.0 / bufferLength;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const v = dataArray[i] / 128.0;
        const y = v * height / 2;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
        x += sliceWidth;
      }
      ctx.lineTo(canvas.width, canvas.height / 2);
      ctx.stroke();
    };
    draw();
    return () => cancelAnimationFrame(animationFrameRef.current);
  }, []);

  if (isRoomError || !room) {
    return (
      <div className="min-h-[100dvh] bg-background flex flex-col items-center justify-center text-center p-6">
        <h1 className="text-2xl font-serif text-foreground mb-2">Signal Lost</h1>
        <p className="text-muted-foreground mb-6">This frequency no longer exists or the code is invalid.</p>
        <Button onClick={() => setLocation("/dashboard")} className="bg-primary text-primary-foreground hover:bg-secondary">
          Return to Dashboard
        </Button>
      </div>
    );
  }

  const voices = (voicesData?.voices as any[]) ?? [];
  const baseVoices = voices.filter(v => v.category === 'base');
  const celebVoices = voices.filter(v => v.category === 'celebrity');
  const maleCelebs = celebVoices.filter(v => v.gender === 'male');
  const femaleCelebs = celebVoices.filter(v => v.gender === 'female');

  return (
    <div className="min-h-[100dvh] bg-background flex flex-col relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(194,133,106,0.05)_0%,rgba(13,10,16,1)_70%)] pointer-events-none"></div>
      
      <header className="absolute top-0 w-full p-6 flex justify-between items-center z-10">
        <div className="font-mono text-xs tracking-widest text-muted-foreground flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-primary animate-pulse' : 'bg-destructive'}`}></div>
          {isConnected ? 'CONNECTED' : 'CONNECTING...'}
        </div>
        <div className="font-mono text-sm tracking-widest text-foreground bg-card/50 backdrop-blur-sm border border-card-border px-4 py-2 rounded-full">
          {code}
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center relative z-10 p-6 w-full max-w-4xl mx-auto pt-24 pb-8">
        
        <div className="relative w-48 h-48 md:w-64 md:h-64 flex items-center justify-center mb-8 shrink-0">
          <motion.div 
            animate={{ scale: isConnected ? [1, 1.05, 1] : 1, opacity: isConnected ? [0.5, 0.8, 0.5] : 0.2 }}
            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
            className="absolute inset-0 rounded-full border border-primary/20 bg-primary/5"
          />
          <motion.div 
            animate={{ scale: isConnected ? [1, 1.1, 1] : 1 }}
            transition={{ duration: 3, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
            className="absolute inset-4 rounded-full border border-primary/30"
          />
          <div className="absolute w-full h-full rounded-full flex items-center justify-center z-10">
            {peersCount === 0 ? (
              <div className="text-center">
                <Ear className="w-8 h-8 text-primary/50 mx-auto mb-2" />
                <p className="text-xs text-primary/50 font-mono uppercase tracking-widest">Waiting</p>
              </div>
            ) : (
              <canvas ref={waveformCanvasRef} width={200} height={100} className="w-48 h-24" />
            )}
          </div>
        </div>

        <div className="w-full max-w-md bg-card/80 backdrop-blur-xl border border-card-border rounded-3xl p-6 shadow-2xl flex flex-col min-h-[350px]">
          
          {/* Main Tabs */}
          <div className="flex bg-[#120e15] rounded-xl p-1 mb-4 border border-border shrink-0">
            <button
              onClick={() => setActiveTab("base")}
              className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${
                activeTab === "base" ? "bg-primary/20 text-primary shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Voices
            </button>
            <button
              onClick={() => setActiveTab("celebrity")}
              className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${
                activeTab === "celebrity" ? "bg-primary/20 text-primary shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Celebrity {celebVoices.length > 0 && <span className="text-[10px] opacity-60">({celebVoices.length})</span>}
            </button>
          </div>

          {/* Celebrity gender sub-tabs */}
          {activeTab === "celebrity" && (
            <div className="flex gap-2 mb-4 shrink-0">
              <button
                onClick={() => setCelebGender("male")}
                className={`flex-1 py-1.5 text-xs font-medium rounded-lg border transition-all ${
                  celebGender === "male" ? "border-primary/50 text-primary bg-primary/10" : "border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                👨 Male ({maleCelebs.length})
              </button>
              <button
                onClick={() => setCelebGender("female")}
                className={`flex-1 py-1.5 text-xs font-medium rounded-lg border transition-all ${
                  celebGender === "female" ? "border-primary/50 text-primary bg-primary/10" : "border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                👩 Female ({femaleCelebs.length})
              </button>
            </div>
          )}

          {/* Voice Picker Grid */}
          <div className="flex-1 overflow-y-auto mb-6 pr-1 custom-scrollbar">
            {isLoadingVoices ? (
              <div className="grid grid-cols-2 gap-3">
                {[1,2,3,4].map(i => (
                  <div key={i} className="h-24 bg-muted/20 animate-pulse rounded-xl border border-border/50"></div>
                ))}
              </div>
            ) : (
              <AnimatePresence mode="wait">
                {activeTab === "base" && (
                  <motion.div 
                    key="base"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="grid grid-cols-2 gap-3"
                  >
                    {baseVoices.map((v: any) => {
                      const isSelected = voiceMode.voiceId === v.voiceId;
                      return (
                        <button
                          key={v.voiceId}
                          onClick={() => handleVoiceModeChange({ voiceId: v.voiceId, name: v.name, emoji: v.emoji || '🎙️', category: 'base', gender: v.gender, description: v.description })}
                          className={`flex flex-col items-center justify-center gap-1.5 p-4 rounded-xl border transition-all ${
                            isSelected 
                              ? "bg-primary/10 border-primary text-primary shadow-[0_0_15px_rgba(194,133,106,0.15)]" 
                              : "bg-[#120e15] border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
                          }`}
                        >
                          <span className="text-2xl">{v.emoji}</span>
                          <span className={`text-xs font-semibold text-center ${isSelected ? 'text-primary' : 'text-foreground'}`}>{v.name}</span>
                          {v.description && <span className="text-[9px] text-muted-foreground text-center font-mono">{v.description}</span>}
                          {isSelected && v.voiceId !== 'natural' && (
                            <div className="flex items-center gap-1 text-[8px] font-mono text-primary mt-0.5">
                              <div className="w-1 h-1 rounded-full bg-primary animate-pulse"></div> AI LIVE
                            </div>
                          )}
                        </button>
                      );
                    })}
                    <div className="col-span-2 text-center mt-1">
                      <p className="text-[9px] text-muted-foreground font-mono">All non-natural voices processed by ElevenLabs AI · ~2s delay</p>
                    </div>
                  </motion.div>
                )}
                
                {activeTab === "celebrity" && (
                  <motion.div 
                    key={`celebrity-${celebGender}`}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="grid grid-cols-2 gap-3"
                  >
                    {(celebGender === "male" ? maleCelebs : femaleCelebs).map((v: any) => {
                      const isSelected = voiceMode.voiceId === v.voiceId;
                      return (
                        <button
                          key={v.voiceId}
                          onClick={() => handleVoiceModeChange({ voiceId: v.voiceId, name: v.name, emoji: v.emoji || '👤', category: 'celebrity', gender: v.gender })}
                          className={`relative flex flex-col items-center justify-center p-4 rounded-xl border transition-all overflow-hidden group ${
                            isSelected 
                              ? "bg-primary/10 border-primary shadow-[0_0_20px_rgba(194,133,106,0.2)]" 
                              : "bg-[#120e15] border-border hover:border-primary/50"
                          }`}
                        >
                          <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                          <span className="text-3xl mb-2">{v.emoji || '👤'}</span>
                          <span className={`text-sm font-medium mb-1 text-center leading-tight ${isSelected ? 'text-primary' : 'text-foreground'}`}>{v.name}</span>
                          <div className="flex items-center gap-1 text-[9px] uppercase tracking-widest text-muted-foreground font-mono">
                            <Sparkles className="w-3 h-3 text-secondary" /> AI Voice
                          </div>
                          {isSelected && (
                            <div className="absolute top-2 right-2 flex items-center gap-1 px-1.5 py-0.5 rounded text-[8px] font-mono tracking-widest uppercase bg-primary/20 text-primary border border-primary/30">
                              <div className="w-1 h-1 rounded-full bg-primary animate-pulse"></div>
                              LIVE
                            </div>
                          )}
                        </button>
                      );
                    })}
                    {celebVoices.length === 0 && (
                      <div className="col-span-2 flex flex-col items-center justify-center py-8 text-muted-foreground">
                        <Sparkles className="w-6 h-6 mb-2 opacity-40" />
                        <p className="text-xs font-mono">Loading celebrity voices…</p>
                      </div>
                    )}
                    {celebVoices.length > 0 && (
                      <div className="col-span-2 text-center mt-1">
                        <p className="text-[9px] text-muted-foreground font-mono">Powered by ElevenLabs AI · ~2s processing delay</p>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            )}
          </div>

          <div className="flex items-center justify-center gap-6 mt-auto pt-4 border-t border-border shrink-0">
            <Button
              variant="outline"
              size="icon"
              onClick={toggleMute}
              className={`w-16 h-16 rounded-full border-2 ${
                isMuted 
                  ? "border-destructive text-destructive bg-destructive/10 hover:bg-destructive/20" 
                  : "border-card-border text-foreground hover:border-primary/50 hover:text-primary"
              }`}
            >
              {isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
            </Button>
            
            <Button
              variant="destructive"
              size="icon"
              onClick={endCall}
              className="w-16 h-16 rounded-full bg-destructive hover:bg-destructive/90 text-destructive-foreground shadow-[0_0_20px_rgba(198,40,40,0.3)]"
            >
              <PhoneOff className="w-6 h-6" />
            </Button>
          </div>
        </div>
      </main>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: rgba(0, 0, 0, 0.1);
          border-radius: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: var(--color-border);
          border-radius: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: var(--color-primary);
        }
      `}</style>
    </div>
  );
}

// WAV Encoder Utility
function encodeWAV(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const writeString = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };
  writeString(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }
  return buffer;
}
