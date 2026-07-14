import {
  pgTable,
  text,
  boolean,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const accessCodesTable = pgTable(
  "access_codes",
  {
    code: text("code").primaryKey(),
    isUsed: boolean("is_used").notNull().default(false),
    usedByUserId: text("used_by_user_id").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    usedAt: timestamp("used_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    // Telegram user who requested this code — enforces one code per person
    telegramUserId: text("telegram_user_id"),
  },
  (t) => [uniqueIndex("uq_telegram_user_id").on(t.telegramUserId)],
);

export type AccessCode = typeof accessCodesTable.$inferSelect;
export type NewAccessCode = typeof accessCodesTable.$inferInsert;
