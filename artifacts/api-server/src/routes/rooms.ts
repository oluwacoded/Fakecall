import { Router } from "express";
import { getAuth } from "@clerk/express";
import { storage } from "../lib/storage";

const router = Router();

function formatRoom(r: {
  id: string;
  hostUserId: string;
  callCode: string;
  isActive: boolean;
  createdAt: Date;
  endedAt: Date | null;
}) {
  return {
    id: r.id,
    hostUserId: r.hostUserId,
    callCode: r.callCode,
    isActive: r.isActive,
    createdAt: r.createdAt.toISOString(),
    endedAt: r.endedAt?.toISOString() ?? null,
  };
}

// GET /rooms — list user's rooms
router.get("/rooms", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const rooms = await storage.listRoomsByUser(userId);
  res.json({ rooms: rooms.map(formatRoom) });
});

// POST /rooms — create room (requires subscription)
router.post("/rooms", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const user = await storage.getUser(userId);
  if (!user) return res.status(404).json({ error: "User not found" });
  if ((user.tokens ?? 0) < 1) {
    return res.status(403).json({ error: "Not enough tokens. Buy tokens to start a call.", noTokens: true });
  }

  await storage.deductTokens(userId, 1);
  const room = await storage.createRoom(userId);
  res.status(201).json(formatRoom(room));
});

// GET /rooms/code/:code — get room by join code (public, for joining)
router.get("/rooms/code/:code", async (req, res) => {
  const room = await storage.getRoomByCode(req.params.code);
  if (!room) return res.status(404).json({ error: "Room not found" });
  res.json(formatRoom(room));
});

// GET /rooms/:id — get room by ID
router.get("/rooms/:id", async (req, res) => {
  const room = await storage.getRoomById(req.params.id);
  if (!room) return res.status(404).json({ error: "Room not found" });
  res.json(formatRoom(room));
});

// DELETE /rooms/:id — end/delete room
router.delete("/rooms/:id", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const room = await storage.getRoomById(req.params.id);
  if (!room) return res.status(404).json({ error: "Room not found" });
  if (room.hostUserId !== userId)
    return res.status(403).json({ error: "Forbidden" });

  await storage.deactivateRoom(req.params.id);
  res.json({ success: true, message: "Room ended" });
});

export default router;
