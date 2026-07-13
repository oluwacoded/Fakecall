import { useEffect, useRef, useState, useCallback } from "react";
import { useLocation, useRoute } from "wouter";
import { motion } from "framer-motion";
import { io, Socket } from "socket.io-client";
import { Mic, MicOff, PhoneOff, Ear, Fingerprint, Waves, User, UserRound } from "lucide-react";
import { useGetRoomByCode, useGetMe } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

type VoiceMode = "natural" | "male" | "female";

export default function CallRoomPage() {
  const [, params] = useRoute("/call/:code");
  const code = params?.code;
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const { data: room, isLoading: isLoadingRoom, isError: isRoomError } = useGetRoomByCode(code || "");
  const { data: user } = useGetMe();

  const [isConnected, setIsConnected] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [voiceMode, setVoiceMode] = useState<VoiceMode>("natural");
  const [peerVoiceMode, setPeerVoiceMode] = useState<VoiceMode>("natural");
  const [peersCount, setPeersCount] = useState(0);

  const socketRef = useRef<Socket | null>(null);
  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
  const processedStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  
  // Elements
  const audioRefs = useRef<Map<string, HTMLAudioElement>>(new Map());
  const waveformCanvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number>(0);

  // Initialize Audio processing
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
      applyVoiceProcessing("natural", source, destination, audioCtx);
      
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

  const applyVoiceProcessing = (mode: VoiceMode, source: MediaStreamAudioSourceNode, destination: MediaStreamAudioDestinationNode, ctx: AudioContext) => {
    // Disconnect previous connections
    source.disconnect();
    
    if (mode === "natural") {
      source.connect(analyserRef.current!).connect(destination);
    } else if (mode === "male") {
      // Bass boost approximation for male
      const filter = ctx.createBiquadFilter();
      filter.type = "lowshelf";
      filter.frequency.value = 300;
      filter.gain.value = 8;
      
      source.connect(filter).connect(analyserRef.current!).connect(destination);
    } else if (mode === "female") {
      // Treble boost approximation for female
      const filter = ctx.createBiquadFilter();
      filter.type = "highshelf";
      filter.frequency.value = 3000;
      filter.gain.value = 6;
      
      source.connect(filter).connect(analyserRef.current!).connect(destination);
    }
  };

  const handleVoiceModeChange = (mode: VoiceMode) => {
    setVoiceMode(mode);
    if (audioContextRef.current && localStreamRef.current && processedStreamRef.current) {
      const source = audioContextRef.current.createMediaStreamSource(localStreamRef.current);
      // Wait, we can't recreate source from same stream easily without errors sometimes.
      // Actually we just need to rebuild the graph, but keeping it simple: we can just reconstruct the processing nodes.
      // For safety, let's just re-init or maintain the source globally.
    }
    
    // Easier way: just re-init everything to change voice mode cleanly
    if (localStreamRef.current) {
      const tracks = localStreamRef.current.getTracks();
      tracks.forEach(t => t.stop());
    }
    
    initAudio().then(() => {
      // Replace tracks in existing peers
      if (processedStreamRef.current) {
        const audioTrack = processedStreamRef.current.getAudioTracks()[0];
        audioTrack.enabled = !isMuted;
        peersRef.current.forEach(pc => {
          const sender = pc.getSenders().find(s => s.track?.kind === 'audio');
          if (sender) {
            sender.replaceTrack(audioTrack);
          }
        });
      }
      if (socketRef.current) {
        socketRef.current.emit('voice-mode-change', { roomCode: code, mode });
      }
    });
  };

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

      socket.on('voice-mode-change', ({ mode }: { mode: VoiceMode }) => {
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
  }, [code]);

  // Waveform Animation
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
      ctx.strokeStyle = '#c2856a'; // primary
      ctx.beginPath();

      const sliceWidth = width * 1.0 / bufferLength;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const v = dataArray[i] / 128.0;
        const y = v * height / 2;

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }

        x += sliceWidth;
      }

      ctx.lineTo(canvas.width, canvas.height / 2);
      ctx.stroke();
    };

    draw();
    
    return () => {
      cancelAnimationFrame(animationFrameRef.current);
    };
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

  return (
    <div className="min-h-[100dvh] bg-background flex flex-col relative overflow-hidden">
      {/* Background Ambience */}
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

      <main className="flex-1 flex flex-col items-center justify-center relative z-10 p-6 w-full max-w-4xl mx-auto">
        
        {/* Visualizer / Centerpiece */}
        <div className="relative w-64 h-64 md:w-80 md:h-80 flex items-center justify-center mb-16">
          <motion.div 
            animate={{ 
              scale: isConnected ? [1, 1.05, 1] : 1,
              opacity: isConnected ? [0.5, 0.8, 0.5] : 0.2
            }}
            transition={{ 
              duration: 4, 
              repeat: Infinity,
              ease: "easeInOut" 
            }}
            className="absolute inset-0 rounded-full border border-primary/20 bg-primary/5"
          />
          <motion.div 
            animate={{ 
              scale: isConnected ? [1, 1.1, 1] : 1,
            }}
            transition={{ 
              duration: 3, 
              repeat: Infinity,
              ease: "easeInOut",
              delay: 0.5
            }}
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

        {/* Controls */}
        <div className="w-full max-w-md bg-card/80 backdrop-blur-xl border border-card-border rounded-3xl p-6 shadow-2xl">
          <div className="grid grid-cols-3 gap-2 bg-[#120e15] rounded-xl p-1 mb-8 border border-border">
            {(["natural", "male", "female"] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => handleVoiceModeChange(mode)}
                className={`py-3 flex flex-col items-center justify-center gap-1 rounded-lg transition-all ${
                  voiceMode === mode 
                    ? "bg-primary/20 text-primary shadow-[0_0_10px_rgba(194,133,106,0.1)]" 
                    : "text-muted-foreground hover:bg-card hover:text-foreground"
                }`}
              >
                {mode === "natural" && <Fingerprint className="w-4 h-4" />}
                {mode === "male" && <User className="w-4 h-4" />}
                {mode === "female" && <UserRound className="w-4 h-4" />}
                <span className="text-[10px] uppercase font-mono tracking-widest">{mode}</span>
              </button>
            ))}
          </div>

          <div className="flex items-center justify-center gap-6">
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
    </div>
  );
}