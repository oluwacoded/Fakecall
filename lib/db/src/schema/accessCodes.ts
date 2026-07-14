import {
  pgTable,
  text,
  boolean,
  timestamp,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const accessCodesTable = pgTable("access_codes", {
  code: text("code").primaryKey(),
  isUsed: boolean("is_used").notNull().default(false),
  usedByUserId: text("used_by_user_id").references(() => usersTable.id, {
    onDelete: "set null",
  }),
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type AccessCode = typeof accessCodesTable.$inferSelect;
export type NewAccessCode = typeof accessCodesTable.$inferInsert;
