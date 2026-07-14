import { Router } from "express";
import { getAuth } from "@clerk/express";
import { storage } from "../lib/storage";

const router = Router();

// GET /me — get current user
router.get("/me", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const user = await storage.getUser(userId);
  if (!user) return res.status(404).json({ error: "User not found" });

  res.json({
    id: user.id,
    email: user.email,
    name: user.name,
    isSubscribed: user.isSubscribed,
    tokens: user.tokens ?? 0,
    createdAt: user.createdAt.toISOString(),
  });
});

// POST /me — sync Clerk user to DB
router.post("/me", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const { email, name } = req.body;
  if (!email) return res.status(400).json({ error: "email is required" });

  const user = await storage.upsertUser({ id: userId, email, name });

  res.json({
    id: user.id,
    email: user.email,
    name: user.name,
    isSubscribed: user.isSubscribed,
    tokens: user.tokens ?? 0,
    createdAt: user.createdAt.toISOString(),
  });
});

// GET /dashboard
router.get("/dashboard", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const user = await storage.getUser(userId);
  if (!user) return res.status(404).json({ error: "User not found" });

  const stats = await storage.getDashboardStats(userId);

  res.json({
    totalRooms: stats.totalRooms,
    activeRooms: stats.activeRooms,
    recentRooms: stats.recentRooms.map((r) => ({
      id: r.id,
      hostUserId: r.hostUserId,
      callCode: r.callCode,
      isActive: r.isActive,
      createdAt: r.createdAt.toISOString(),
      endedAt: r.endedAt?.toISOString() ?? null,
    })),
    isSubscribed: user.isSubscribed,
    tokens: user.tokens ?? 0,
  });
});

export default router;
