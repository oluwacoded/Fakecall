import { Router } from "express";
import { getAuth } from "@clerk/express";
import { storage } from "../lib/storage";
import { logger } from "../lib/logger";

const router = Router();

/**
 * POST /redeem
 * Body: { code: string }
 * Validates and redeems an access code, granting the user subscription access.
 */
router.post("/redeem", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) {
    logger.warn({ headers: Object.keys(req.headers) }, "Redeem attempted without valid auth");
    res.status(401).json({ error: "Please sign in before redeeming a code.", notAuthenticated: true });
    return;
  }

  const { code } = req.body as { code?: string };
  if (!code || typeof code !== "string" || code.trim().length === 0) {
    res.status(400).json({ error: "A code is required." });
    return;
  }

  try {
    // Check if user is already subscribed
    const user = await storage.getUser(userId);
    if (user?.isSubscribed) {
      res.status(200).json({
        success: true,
        message: "You already have access.",
        alreadySubscribed: true,
      });
      return;
    }

    const result = await storage.redeemCode(code, userId);

    if (!result.success) {
      res.status(400).json({ success: false, error: result.error });
      return;
    }

    logger.info({ userId, code: code.trim().toUpperCase() }, "Access code redeemed");
    res.status(200).json({
      success: true,
      message: "Code accepted. Welcome to Lovers Calling.",
    });
  } catch (err) {
    logger.error({ err }, "Error redeeming access code");
    res.status(500).json({ error: "Something went wrong. Please try again." });
  }
});

export default router;
