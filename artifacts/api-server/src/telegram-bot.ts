import { Bot, InlineKeyboard } from "grammy";
import { db, accessCodesTable } from "@workspace/db";
import { eq, count, and, isNotNull } from "drizzle-orm";
import { logger } from "./lib/logger";

// ── Config ────────────────────────────────────────────────────────────────────

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ADMIN_IDS = (process.env.TELEGRAM_ADMIN_IDS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

// ── Code generation ──────────────────────────────────────────────────────────

function generateAccessCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 8; i++) {
    if (i === 4) code += "-";
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

async function issueCodeForTelegramUser(
  telegramUserId: string,
): Promise<{ code: string; alreadyHad: boolean }> {
  // Check if this Telegram user already has a code
  const [existing] = await db
    .select()
    .from(accessCodesTable)
    .where(eq(accessCodesTable.telegramUserId, telegramUserId));

  if (existing) {
    return { code: existing.code, alreadyHad: true };
  }

  // Generate a unique code (retry on collision)
  let code = generateAccessCode();
  let attempts = 0;
  while (attempts < 5) {
    try {
      await db.insert(accessCodesTable).values({
        code,
        telegramUserId,
      });
      return { code, alreadyHad: false };
    } catch {
      code = generateAccessCode();
      attempts++;
    }
  }
  throw new Error("Failed to generate a unique code after 5 attempts");
}

// ── Bot setup ────────────────────────────────────────────────────────────────

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
        `This is a private calling app — *only for two*.\n\n` +
        `You need an access code to get in. Use /getcode to receive your personal code.\n\n` +
        `Each person gets *one unique code*. Don't share it — it can only be used once.`,
      { parse_mode: "Markdown" },
    );
  });

  // ── /getcode ──────────────────────────────────────────────────────────────
  bot.command("getcode", async (ctx) => {
    const telegramUserId = String(ctx.from?.id);
    if (!telegramUserId) {
      await ctx.reply("Could not identify your Telegram account. Please try again.");
      return;
    }

    try {
      const { code, alreadyHad } = await issueCodeForTelegramUser(telegramUserId);

      const appUrl = process.env.REPLIT_DEV_DOMAIN
        ? `https://${process.env.REPLIT_DEV_DOMAIN}`
        : "https://lovers-calling.replit.app";

      if (alreadyHad) {
        await ctx.reply(
          `🔑 You already have a code:\n\n` +
            `\`${code}\`\n\n` +
            `Go to the app and enter it on the Subscribe page to unlock access.\n${appUrl}`,
          { parse_mode: "Markdown" },
        );
      } else {
        await ctx.reply(
          `✨ *Here's your personal access code:*\n\n` +
            `\`${code}\`\n\n` +
            `⚠️ This code is *yours only* — it can only be used once.\n\n` +
            `Go to the app and enter it on the Subscribe page:\n${appUrl}`,
          { parse_mode: "Markdown" },
        );
        logger.info({ telegramUserId, code }, "Access code issued via Telegram");
      }
    } catch (err) {
      logger.error({ err, telegramUserId }, "Failed to issue access code");
      await ctx.reply("Sorry, something went wrong. Please try again in a moment.");
    }
  });

  // ── /stats (admin only) ───────────────────────────────────────────────────
  bot.command("stats", async (ctx) => {
    const userId = String(ctx.from?.id);
    if (ADMIN_IDS.length > 0 && !ADMIN_IDS.includes(userId)) {
      await ctx.reply("⛔ Admin only.");
      return;
    }

    const [{ total }] = await db
      .select({ total: count() })
      .from(accessCodesTable);

    const [{ used }] = await db
      .select({ used: count() })
      .from(accessCodesTable)
      .where(eq(accessCodesTable.isUsed, true));

    const [{ issued }] = await db
      .select({ issued: count() })
      .from(accessCodesTable)
      .where(isNotNull(accessCodesTable.telegramUserId));

    await ctx.reply(
      `📊 *Access Code Stats*\n\n` +
        `Total codes generated: ${total}\n` +
        `Issued via Telegram: ${issued}\n` +
        `Redeemed in app: ${used}\n` +
        `Unredeemed: ${Number(total) - Number(used)}`,
      { parse_mode: "Markdown" },
    );
  });

  // ── /revoke <code> (admin only) ───────────────────────────────────────────
  bot.command("revoke", async (ctx) => {
    const userId = String(ctx.from?.id);
    if (ADMIN_IDS.length > 0 && !ADMIN_IDS.includes(userId)) {
      await ctx.reply("⛔ Admin only.");
      return;
    }

    const code = ctx.match?.trim().toUpperCase();
    if (!code) {
      await ctx.reply("Usage: /revoke CODE");
      return;
    }

    const [existing] = await db
      .select()
      .from(accessCodesTable)
      .where(eq(accessCodesTable.code, code));

    if (!existing) {
      await ctx.reply(`Code \`${code}\` not found.`, { parse_mode: "Markdown" });
      return;
    }

    if (existing.isUsed) {
      await ctx.reply(`Code \`${code}\` has already been redeemed — cannot revoke.`, {
        parse_mode: "Markdown",
      });
      return;
    }

    await db
      .delete(accessCodesTable)
      .where(and(eq(accessCodesTable.code, code)));

    await ctx.reply(`✅ Code \`${code}\` has been revoked.`, { parse_mode: "Markdown" });
    logger.info({ code, adminId: userId }, "Access code revoked by admin");
  });

  // ── /help ─────────────────────────────────────────────────────────────────
  bot.command("help", async (ctx) => {
    const userId = String(ctx.from?.id);
    const isAdmin = ADMIN_IDS.includes(userId);

    let msg =
      `🤍 *Lovers Calling Bot*\n\n` +
      `/start — Welcome message\n` +
      `/getcode — Get your personal access code\n` +
      `/help — Show this message\n`;

    if (isAdmin) {
      msg += `\n*Admin commands:*\n/stats — Code usage statistics\n/revoke CODE — Revoke an unused code`;
    }

    await ctx.reply(msg, { parse_mode: "Markdown" });
  });

  // ── Error handler ─────────────────────────────────────────────────────────
  bot.catch((err) => {
    logger.error({ err: err.error, ctx: err.ctx?.update }, "Telegram bot error");
  });

  // Start polling
  bot.start({
    onStart: () => logger.info("Telegram bot started (long polling)"),
  });
}
