import { Router } from "express";
import { getAuth } from "@clerk/express";
import { storage } from "../lib/storage";
import { logger } from "../lib/logger";
import { TOKEN_PACKAGES, type PackageId } from "@workspace/db/schema";
import { notifyAdminTokenRequest } from "../telegram-bot";

const router = Router();

// GET /tokens/packages — list available packages
router.get("/tokens/packages", (_req, res) => {
  res.json({ packages: TOKEN_PACKAGES });
});

// GET /tokens/balance — current user's token balance
router.get("/tokens/balance", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const user = await storage.getUser(userId);
  if (!user) return res.status(404).json({ error: "User not found" });

  res.json({ tokens: user.tokens ?? 0 });
});

// POST /tokens/request — user requests a top-up
router.post("/tokens/request", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const { packageId } = req.body as { packageId?: string };
  const pkg = TOKEN_PACKAGES.find((p) => p.id === packageId);
  if (!pkg) {
    return res.status(400).json({ error: "Invalid package. Choose: spark, flame, or inferno." });
  }

  const user = await storage.getUser(userId);
  if (!user) return res.status(404).json({ error: "User not found" });

  try {
    const request = await storage.createTokenRequest(userId, pkg.id as PackageId, pkg.tokens);
    // Notify Telegram admin — fire and forget
    notifyAdminTokenRequest(request.id, user, pkg).catch((err) =>
      logger.error({ err }, "Failed to notify admin of token request"),
    );

    res.status(201).json({ success: true, requestId: request.id, message: "Request submitted. Admin will approve shortly." });
  } catch (err) {
    logger.error({ err }, "Failed to create token request");
    res.status(500).json({ error: "Failed to submit request." });
  }
});

// POST /tokens/redeem — user enters a topup code
router.post("/tokens/redeem", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) {
    return res.status(401).json({ error: "Please sign in before redeeming a code.", notAuthenticated: true });
  }

  const { code } = req.body as { code?: string };
  if (!code?.trim()) return res.status(400).json({ error: "A code is required." });

  const result = await storage.redeemTopupCode(code.trim().toUpperCase(), userId);
  if (!result.success) {
    return res.status(400).json({ success: false, error: result.error });
  }

  logger.info({ userId, code: code.trim().toUpperCase(), tokens: result.tokens }, "Topup code redeemed");
  res.json({ success: true, tokens: result.tokens, message: `${result.tokens} tokens added to your account.` });
});

export default router;
