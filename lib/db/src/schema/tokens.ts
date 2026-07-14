import { pgTable, text, integer, boolean, timestamp, uuid } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

// Token packages a user can request
export const TOKEN_PACKAGES = [
  { id: "spark",   label: "Spark",   tokens: 5,  description: "5 calls" },
  { id: "flame",   label: "Flame",   tokens: 15, description: "15 calls" },
  { id: "inferno", label: "Inferno", tokens: 30, description: "30 calls" },
] as const;
export type PackageId = typeof TOKEN_PACKAGES[number]["id"];

// Pending / resolved top-up requests
export const tokenRequestsTable = pgTable("token_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  packageId: text("package_id").notNull(),
  tokenAmount: integer("token_amount").notNull(),
  status: text("status").notNull().default("pending"), // pending | approved | declined
  // Telegram message ID so the bot can edit the message after admin acts
  telegramMessageId: integer("telegram_message_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at"),
});

export type TokenRequest = typeof tokenRequestsTable.$inferSelect;

// Admin-generated one-time codes for manual top-ups
export const topupCodesTable = pgTable("topup_codes", {
  code: text("code").primaryKey(),
  tokenAmount: integer("token_amount").notNull(),
  isUsed: boolean("is_used").notNull().default(false),
  usedByUserId: text("used_by_user_id").references(() => usersTable.id, { onDelete: "set null" }),
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type TopupCode = typeof topupCodesTable.$inferSelect;
