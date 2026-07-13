import { Router } from "express";
import { getAuth } from "@clerk/express";
import { storage } from "../lib/storage";
import { stripeService } from "../lib/stripeService";
import { logger } from "../lib/logger";

const router = Router();

// GET /subscription — current subscription status
router.get("/subscription", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const user = await storage.getUser(userId);
  if (!user) {
    return res.json({
      isSubscribed: false,
      status: null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      planName: null,
    });
  }

  if (!user.isSubscribed || !user.stripeSubscriptionId) {
    return res.json({
      isSubscribed: false,
      status: null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      planName: null,
    });
  }

  try {
    const sub = await storage.getSubscription(user.stripeSubscriptionId);
    const planName =
      sub?.items?.[0]?.price?.product?.name ?? "Premium Access";

    res.json({
      isSubscribed: true,
      status: sub?.status ?? "active",
      currentPeriodEnd: sub?.current_period_end
        ? new Date(Number(sub.current_period_end) * 1000).toISOString()
        : null,
      cancelAtPeriodEnd: sub?.cancel_at_period_end ?? false,
      planName,
    });
  } catch (err) {
    logger.error({ err }, "Failed to fetch subscription details");
    res.json({
      isSubscribed: user.isSubscribed,
      status: "active",
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      planName: null,
    });
  }
});

// GET /plans — available subscription plans
router.get("/plans", async (_req, res) => {
  try {
    const rows = await storage.getProductsWithPrices();

    const plans = rows.map((r: any) => ({
      priceId: r.price_id,
      productId: r.product_id,
      name: r.product_name,
      description: r.product_description ?? null,
      amount: Number(r.unit_amount) / 100,
      currency: r.currency,
      interval: r.recurring?.interval ?? "month",
    }));

    res.json({ plans });
  } catch (err) {
    // Stripe not yet connected or no products — return empty
    logger.warn({ err }, "Could not fetch plans from Stripe");
    res.json({ plans: [] });
  }
});

// POST /checkout — create Stripe checkout session
router.post("/checkout", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const { priceId } = req.body;
  if (!priceId) return res.status(400).json({ error: "priceId is required" });

  const user = await storage.getUser(userId);
  if (!user) return res.status(404).json({ error: "User not found" });

  const customerId = await stripeService.getOrCreateCustomer(
    userId,
    user.email,
  );

  const origin =
    process.env.REPLIT_DOMAINS
      ? `https://${process.env.REPLIT_DOMAINS.split(",")[0]}`
      : `${req.protocol}://${req.get("host")}`;

  const session = await stripeService.createCheckoutSession(
    customerId,
    priceId,
    `${origin}/dashboard?checkout=success`,
    `${origin}/subscribe?checkout=cancelled`,
  );

  res.json({ url: session.url });
});

// POST /portal — create Stripe customer portal session
router.post("/portal", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const user = await storage.getUser(userId);
  if (!user?.stripeCustomerId) {
    return res.status(400).json({ error: "No billing account found" });
  }

  const origin =
    process.env.REPLIT_DOMAINS
      ? `https://${process.env.REPLIT_DOMAINS.split(",")[0]}`
      : `${req.protocol}://${req.get("host")}`;

  const session = await stripeService.createPortalSession(
    user.stripeCustomerId,
    `${origin}/dashboard`,
  );

  res.json({ url: session.url });
});

export default router;
