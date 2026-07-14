import { createServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import app from "./app";
import { logger } from "./lib/logger";

const rawPort = process.env["PORT"];
if (!rawPort) throw new Error("PORT environment variable is required");
const port = Number(rawPort);
if (Number.isNaN(port) || port <= 0)
  throw new Error(`Invalid PORT value: "${rawPort}"`);

// ── HTTP server ───────────────────────────────────────────────────────────────
const httpServer = createServer(app);

// ── Socket.IO (WebRTC signaling) ──────────────────────────────────────────────
const io = new SocketIOServer(httpServer, {
  path: "/api/socket.io",
  cors: { origin: "*", methods: ["GET", "POST"] },
});

// Track participants per room: roomCode -> Set of socket IDs
const roomParticipants = new Map<string, Set<string>>();

io.on("connection", (socket) => {
  logger.info({ socketId: socket.id }, "Socket connected");

  // Join a call room
  socket.on("join-room", (roomCode: string) => {
    socket.join(roomCode);
    if (!roomParticipants.has(roomCode)) {
      roomParticipants.set(roomCode, new Set());
    }
    roomParticipants.get(roomCode)!.add(socket.id);

    const peers = [...(roomParticipants.get(roomCode) ?? [])].filter(
      (id) => id !== socket.id,
    );
    // Tell the new joiner who's already in the room
    socket.emit("room-peers", peers);
    // Tell existing peers someone joined
    socket.to(roomCode).emit("peer-joined", socket.id);

    logger.info({ socketId: socket.id, roomCode, peers }, "Joined room");
  });

  // WebRTC offer
  socket.on(
    "webrtc-offer",
    (data: { offer: RTCSessionDescriptionInit; targetId: string }) => {
      io.to(data.targetId).emit("webrtc-offer", {
        offer: data.offer,
        fromId: socket.id,
      });
    },
  );

  // WebRTC answer
  socket.on(
    "webrtc-answer",
    (data: { answer: RTCSessionDescriptionInit; targetId: string }) => {
      io.to(data.targetId).emit("webrtc-answer", {
        answer: data.answer,
        fromId: socket.id,
      });
    },
  );

  // ICE candidate
  socket.on(
    "ice-candidate",
    (data: { candidate: RTCIceCandidateInit; targetId: string }) => {
      io.to(data.targetId).emit("ice-candidate", {
        candidate: data.candidate,
        fromId: socket.id,
      });
    },
  );

  // Voice mode change (so other peer can display the mode)
  socket.on(
    "voice-mode-change",
    (data: { roomCode: string; mode: string }) => {
      socket.to(data.roomCode).emit("peer-voice-mode", {
        fromId: socket.id,
        mode: data.mode,
      });
    },
  );

  // Leave room / cleanup
  socket.on("leave-room", (roomCode: string) => {
    handleLeave(socket, roomCode);
  });

  socket.on("disconnect", () => {
    for (const [roomCode, participants] of roomParticipants.entries()) {
      if (participants.has(socket.id)) {
        handleLeave(socket, roomCode);
      }
    }
    logger.info({ socketId: socket.id }, "Socket disconnected");
  });

  function handleLeave(sock: typeof socket, roomCode: string) {
    sock.leave(roomCode);
    roomParticipants.get(roomCode)?.delete(sock.id);
    if (roomParticipants.get(roomCode)?.size === 0) {
      roomParticipants.delete(roomCode);
    }
    sock.to(roomCode).emit("peer-left", sock.id);
  }
});

// ── Start ─────────────────────────────────────────────────────────────────────
httpServer.listen(port, () => {
  logger.info({ port }, "Server listening");
});
