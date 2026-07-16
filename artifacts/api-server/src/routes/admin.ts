import { Router } from "express";
import { getAuth } from "@clerk/express";
import { Bot, InputFile } from "grammy";
import { logger } from "../lib/logger";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

const router = Router();

function requireAuth(req: any, res: any, next: any) {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  next();
}

// ── GET /admin/status ─────────────────────────────────────────────────────────

router.get("/admin/status", requireAuth, async (_req, res) => {
  // Check ElevenLabs key
  const elevenlabs = process.env.ELEVENLABS_API_KEY ? "ok" : "missing";

  // Check Telegram
  const hasTelegramBot   = !!process.env.TELEGRAM_BOT_TOKEN;
  const hasTelegramAdmin = !!process.env.TELEGRAM_ADMIN_CHAT_ID;
  const telegram = hasTelegramBot
    ? hasTelegramAdmin ? "ok" : "missing_chat_id"
    : "missing";

  // Check DB
  let dbStatus = "ok";
  try {
    await db.execute(sql`SELECT 1`);
  } catch {
    dbStatus = "error";
  }

  res.json({ api: "ok", elevenlabs, telegram, db: dbStatus });
});

// ── POST /admin/send-telegram ─────────────────────────────────────────────────
// Accepts pre-transformed MP3 in the body and sends it to the admin Telegram chat.

router.post("/admin/send-telegram", requireAuth, async (req, res) => {
  const botToken   = process.env.TELEGRAM_BOT_TOKEN;
  const adminChatId = process.env.TELEGRAM_ADMIN_CHAT_ID;

  if (!botToken)    { res.status(503).json({ error: "Telegram bot not configured. Set TELEGRAM_BOT_TOKEN." }); return; }
  if (!adminChatId) { res.status(503).json({ error: "No admin chat ID. Send /chatid to your bot and add TELEGRAM_ADMIN_CHAT_ID to Secrets." }); return; }

  const audioBuffer = req.body as Buffer;
  if (!audioBuffer || audioBuffer.length < 100) {
    res.status(400).json({ error: "Audio data required in request body" });
    return;
  }

  const voiceName  = (req.headers["x-voice-name"]  as string) ?? "Unknown";
  const voiceEmoji = (req.headers["x-voice-emoji"] as string) ?? "🎙️";

  try {
    const bot = new Bot(botToken);
    await bot.api.sendAudio(
      adminChatId,
      new InputFile(audioBuffer, `voice-test.mp3`),
      {
        caption:
          `${voiceEmoji} *Voice test — ${voiceName}*\n` +
          `_Sent from Admin Lab · Lovers Calling_`,
        parse_mode: "Markdown",
      },
    );
    logger.info({ voiceName }, "Admin voice test sent to Telegram");
    res.json({ ok: true });
  } catch (err: any) {
    logger.error({ err }, "Admin Telegram send failed");
    res.status(502).json({ error: "Failed to send to Telegram", detail: err?.message });
  }
});

export default router;
