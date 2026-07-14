import { Router } from "express";
import { requireAuth } from "@clerk/express";
import { storage } from "../lib/storage";

const router = Router();

/**
 * GET /subscription
 * Returns the current user's subscription status.
 */
router.get("/subscription", requireAuth(), async (req, res) => {
  const userId = req.auth?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const user = await storage.getUser(userId);
  res.json({
    isSubscribed: user?.isSubscribed ?? false,
    status: user?.isSubscribed ? "active" : "inactive",
    planName: user?.isSubscribed ? "Lovers Calling Access" : null,
  });
});

export default router;
