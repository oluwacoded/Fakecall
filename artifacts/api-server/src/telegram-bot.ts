import { Bot, InlineKeyboard } from "grammy";
import { db, accessCodesTable, tokenRequestsTable, topupCodesTable, usersTable } from "@workspace/db";
import { eq, count, isNotNull } from "drizzle-orm";
import { storage } from "./lib/storage";
import { logger } from "./lib/logger";
import type { TokenRequest } from "@workspace/db/schema";
import { TOKEN_PACKAGES } from "@workspace/db/schema";

// ── Config ────────────────────────────────────────────────────────────────────

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ADMIN_CHAT_ID = process.env.TELEGRAM_ADMIN_CHAT_ID;

// Payment details shown to users when they request tokens
const PAYMENT_NAME   = process.env.PAYMENT_ACCOUNT_NAME   ?? "Account Name";
const PAYMENT_NUMBER = process.env.PAYMENT_ACCOUNT_NUMBER ?? "0000000000";
const PAYMENT_BANK   = process.env.PAYMENT_BANK           ?? "Bank Name";

// ── Types ─────────────────────────────────────────────────────────────────────

type UserInfo = { id: string; email: string; name?: string | null; tokens?: number };

// ── Notify admin of new token request ─────────────────────────────────────────

export async function notifyAdminTokenRequest(
  requestId: string,
  user: UserInfo,
  pkg: { id: string; label: string; tokens: number },
): Promise<void> {
  if (!TOKEN || !ADMIN_CHAT_ID) {
    logger.warn("TELEGRAM_ADMIN_CHAT_ID not set — skipping admin notification");
    return;
  }

  const bot = new Bot(TOKEN);

  const keyboard = new InlineKeyboard()
    .text("✅ Approve", `approve:${requestId}`)
    .text("❌ Decline", `decline:${requestId}`)
    .row()
    .text("🔑 Generate Code Instead", `gencode:${requestId}`);

  const msg = await bot.api.sendMessage(
    ADMIN_CHAT_ID,
    `💰 *New Token Request*\n\n` +
    `👤 User: ${user.name ?? "Unknown"} (${user.email})\n` +
    `📦 Package: ${pkg.label} — ${pkg.tokens} tokens\n` +
    `💳 Current balance: ${user.tokens ?? 0} tokens\n\n` +
    `📍 *Payment Instructions to share:*\n` +
    `Bank: ${PAYMENT_BANK}\n` +
    `Name: ${PAYMENT_NAME}\n` +
    `Account: \`${PAYMENT_NUMBER}\`\n\n` +
    `Once payment is confirmed, tap Approve to add ${pkg.tokens} tokens.`,
    { parse_mode: "Markdown", reply_markup: keyboard },
  );

  // Store the message ID so we can edit it after approval/decline
  await storage.setTokenRequestMessageId(requestId, msg.message_id);
}

// ── Bot setup ─────────────────────────────────────────────────────────────────

export function startTelegramBot(): void {
  if (!TOKEN) {
    logger.warn("TELEGRAM_BOT_TOKEN not set — Telegram bot disabled");
    return;
  }

  const bot = new Bot(TOKEN);

  // ── /start ────────────────────────────────────────────────────────────────
  bot.command("start", async (ctx) => {
    await ctx.reply(
      `💌 *Welcome to Lovers Calling*\n\n` +
      `A private calling app — *only for two*.\n\n` +
      `Each call costs 1 token. Buy tokens through the app.\n\n` +
      `Use /help to see all commands.`,
      { parse_mode: "Markdown" },
    );
  });

  // ── /help ─────────────────────────────────────────────────────────────────
  bot.command("help", async (ctx) => {
    const userId = String(ctx.from?.id);
    const isAdmin = ADMIN_CHAT_ID && (userId === ADMIN_CHAT_ID || ctx.chat.id.toString() === ADMIN_CHAT_ID);

    let msg =
      `🤍 *Lovers Calling Bot*\n\n` +
      `/start — Welcome\n` +
      `/help — This message\n`;

    if (isAdmin) {
      msg +=
        `\n*Admin commands:*\n` +
        `/approve <requestId> — Approve a token request\n` +
        `/decline <requestId> — Decline a token request\n` +
        `/gentoken <amount> — Generate a one-time topup code\n` +
        `/pending — List pending requests\n` +
        `/stats — Usage statistics\n`;
    }

    await ctx.reply(msg, { parse_mode: "Markdown" });
  });

  // ── /pending (admin) ──────────────────────────────────────────────────────
  bot.command("pending", async (ctx) => {
    if (!isAdmin(ctx)) { await ctx.reply("⛔ Admin only."); return; }

    const pending = await db
      .select()
      .from(tokenRequestsTable)
      .where(eq(tokenRequestsTable.status, "pending"))
      .limit(10);

    if (pending.length === 0) {
      await ctx.reply("✅ No pending token requests.");
      return;
    }

    const lines = pending.map((r) =>
      `• \`${r.id.slice(0, 8)}\` — ${r.tokenAmount} tokens — ${new Date(r.createdAt).toLocaleString()}`,
    );
    await ctx.reply(`📋 *Pending Requests (${pending.length}):*\n\n${lines.join("\n")}`, { parse_mode: "Markdown" });
  });

  // ── /approve <requestId> (admin) ──────────────────────────────────────────
  bot.command("approve", async (ctx) => {
    if (!isAdmin(ctx)) { await ctx.reply("⛔ Admin only."); return; }
    const requestId = ctx.match?.trim();
    if (!requestId) { await ctx.reply("Usage: /approve <requestId>"); return; }

    const result = await storage.approveTokenRequest(requestId);
    if (!result.success) {
      await ctx.reply(`❌ Could not approve request \`${requestId}\` — already resolved or not found.`, { parse_mode: "Markdown" });
      return;
    }
    await ctx.reply(`✅ Approved. User now has ${result.tokens} tokens.`);
    logger.info({ requestId }, "Token request approved via command");
  });

  // ── /decline <requestId> (admin) ──────────────────────────────────────────
  bot.command("decline", async (ctx) => {
    if (!isAdmin(ctx)) { await ctx.reply("⛔ Admin only."); return; }
    const requestId = ctx.match?.trim();
    if (!requestId) { await ctx.reply("Usage: /decline <requestId>"); return; }

    const ok = await storage.declineTokenRequest(requestId);
    await ctx.reply(ok ? "❌ Request declined." : `Could not decline \`${requestId}\`.`, { parse_mode: "Markdown" });
  });

  // ── /gentoken <amount> (admin) ────────────────────────────────────────────
  bot.command("gentoken", async (ctx) => {
    if (!isAdmin(ctx)) { await ctx.reply("⛔ Admin only."); return; }

    const amountStr = ctx.match?.trim();
    const amount = Number(amountStr);
    if (!amount || isNaN(amount) || amount <= 0) {
      await ctx.reply("Usage: /gentoken <amount>\nExample: /gentoken 15");
      return;
    }

    const code = await storage.createTopupCode(amount);
    await ctx.reply(
      `🔑 *Topup Code Generated*\n\n` +
      `Code: \`${code}\`\n` +
      `Value: ${amount} token${amount !== 1 ? "s" : ""}\n\n` +
      `Send this code to the user. It can only be redeemed once.`,
      { parse_mode: "Markdown" },
    );
    logger.info({ code, amount }, "Topup code generated by admin");
  });

  // ── /stats (admin) ────────────────────────────────────────────────────────
  bot.command("stats", async (ctx) => {
    if (!isAdmin(ctx)) { await ctx.reply("⛔ Admin only."); return; }

    const [{ approved }] = await db
      .select({ approved: count() })
      .from(tokenRequestsTable)
      .where(eq(tokenRequestsTable.status, "approved"));

    const [{ pending }] = await db
      .select({ pending: count() })
      .from(tokenRequestsTable)
      .where(eq(tokenRequestsTable.status, "pending"));

    const [{ usedCodes }] = await db
      .select({ usedCodes: count() })
      .from(topupCodesTable)
      .where(eq(topupCodesTable.isUsed, true));

    const [{ users }] = await db.select({ users: count() }).from(usersTable);

    await ctx.reply(
      `📊 *Lovers Calling Stats*\n\n` +
      `👥 Total users: ${users}\n` +
      `✅ Approved requests: ${approved}\n` +
      `⏳ Pending requests: ${pending}\n` +
      `🔑 Codes redeemed: ${usedCodes}`,
      { parse_mode: "Markdown" },
    );
  });

  // ── Inline keyboard callbacks (approve / decline / gencode) ───────────────
  bot.on("callback_query:data", async (ctx) => {
    if (!isAdmin(ctx)) { await ctx.answerCallbackQuery("⛔ Admin only"); return; }

    const data = ctx.callbackQuery.data;

    if (data.startsWith("approve:")) {
      const requestId = data.slice(8);
      const result = await storage.approveTokenRequest(requestId);
      if (!result.success) {
        await ctx.answerCallbackQuery("Already resolved.");
        return;
      }
      const request = await storage.getTokenRequest(requestId);
      await ctx.editMessageText(
        ctx.callbackQuery.message?.text + `\n\n✅ *APPROVED* — ${result.tokens} tokens added.`,
        { parse_mode: "Markdown" },
      );
      await ctx.answerCallbackQuery(`✅ Approved! User now has ${result.tokens} tokens.`);
      logger.info({ requestId }, "Token request approved via button");
    }

    else if (data.startsWith("decline:")) {
      const requestId = data.slice(8);
      const ok = await storage.declineTokenRequest(requestId);
      if (!ok) { await ctx.answerCallbackQuery("Already resolved."); return; }
      await ctx.editMessageText(
        ctx.callbackQuery.message?.text + `\n\n❌ *DECLINED*`,
        { parse_mode: "Markdown" },
      );
      await ctx.answerCallbackQuery("❌ Declined.");
    }

    else if (data.startsWith("gencode:")) {
      const requestId = data.slice(8);
      const request = await storage.getTokenRequest(requestId);
      if (!request || request.status !== "pending") {
        await ctx.answerCallbackQuery("Request already resolved.");
        return;
      }

      const code = await storage.createTopupCode(request.tokenAmount);
      // Also decline the original request so it's resolved
      await storage.declineTokenRequest(requestId);

      await ctx.editMessageText(
        ctx.callbackQuery.message?.text +
        `\n\n🔑 *Code Generated:* \`${code}\`\n_(${request.tokenAmount} tokens — send this to the user)_`,
        { parse_mode: "Markdown" },
      );
      await ctx.answerCallbackQuery(`Code: ${code}`);
      logger.info({ requestId, code }, "Topup code generated via button");
    }
  });

  // ── Error handler ─────────────────────────────────────────────────────────
  bot.catch((err) => {
    logger.error({ err: err.error, update: err.ctx?.update }, "Telegram bot error");
  });

  bot.start({ onStart: () => logger.info("Telegram bot started (long polling)") });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function isAdmin(ctx: { from?: { id: number }; chat: { id: number } }): boolean {
  if (!ADMIN_CHAT_ID) return true; // no admin set — allow all (dev mode)
  const fromId = String(ctx.from?.id ?? "");
  const chatId = String(ctx.chat.id);
  return fromId === ADMIN_CHAT_ID || chatId === ADMIN_CHAT_ID;
}
