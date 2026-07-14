import { db, usersTable, roomsTable, accessCodesTable } from "@workspace/db";
import { eq, sql, desc, count, and } from "drizzle-orm";
import type { User, Room, AccessCode } from "@workspace/db";

export class Storage {
  // ── Users ────────────────────────────────────────────────────────────────────

  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, id));
    return user;
  }

  async upsertUser(data: {
    id: string;
    email: string;
    name?: string | null;
  }): Promise<User> {
    const [user] = await db
      .insert(usersTable)
      .values({ id: data.id, email: data.email, name: data.name ?? null })
      .onConflictDoUpdate({
        target: usersTable.id,
        set: { email: data.email, name: data.name ?? null },
      })
      .returning();
    return user;
  }

  async markUserSubscribed(userId: string): Promise<User> {
    const [user] = await db
      .update(usersTable)
      .set({ isSubscribed: true })
      .where(eq(usersTable.id, userId))
      .returning();
    return user;
  }

  // ── Access Codes ─────────────────────────────────────────────────────────────

  async redeemCode(
    code: string,
    userId: string,
  ): Promise<{ success: boolean; error?: string }> {
    const [existing] = await db
      .select()
      .from(accessCodesTable)
      .where(eq(accessCodesTable.code, code.trim().toUpperCase()));

    if (!existing) {
      return { success: false, error: "Invalid code. Please check and try again." };
    }

    if (existing.isUsed) {
      return { success: false, error: "This code has already been used." };
    }

    // Mark code as used and subscribe user — in a transaction
    await db.transaction(async (tx) => {
      await tx
        .update(accessCodesTable)
        .set({ isUsed: true, usedByUserId: userId, usedAt: new Date() })
        .where(
          and(
            eq(accessCodesTable.code, code.trim().toUpperCase()),
            eq(accessCodesTable.isUsed, false),
          ),
        );

      await tx
        .update(usersTable)
        .set({ isSubscribed: true })
        .where(eq(usersTable.id, userId));
    });

    return { success: true };
  }

  async getCodeStatus(code: string): Promise<AccessCode | undefined> {
    const [row] = await db
      .select()
      .from(accessCodesTable)
      .where(eq(accessCodesTable.code, code.trim().toUpperCase()));
    return row;
  }

  // ── Rooms ────────────────────────────────────────────────────────────────────

  async getRoomById(id: string): Promise<Room | undefined> {
    const [room] = await db
      .select()
      .from(roomsTable)
      .where(eq(roomsTable.id, id));
    return room;
  }

  async getRoomByCode(code: string): Promise<Room | undefined> {
    const [room] = await db
      .select()
      .from(roomsTable)
      .where(eq(roomsTable.callCode, code));
    return room;
  }

  async listRoomsByUser(userId: string): Promise<Room[]> {
    return db
      .select()
      .from(roomsTable)
      .where(eq(roomsTable.hostUserId, userId))
      .orderBy(desc(roomsTable.createdAt));
  }

  async createRoom(userId: string): Promise<Room> {
    const callCode = generateCallCode();
    const [room] = await db
      .insert(roomsTable)
      .values({ hostUserId: userId, callCode })
      .returning();
    return room;
  }

  async deactivateRoom(id: string): Promise<Room | undefined> {
    const [room] = await db
      .update(roomsTable)
      .set({ isActive: false, endedAt: new Date() })
      .where(eq(roomsTable.id, id))
      .returning();
    return room;
  }

  async deleteRoom(id: string): Promise<void> {
    await db.delete(roomsTable).where(eq(roomsTable.id, id));
  }

  // ── Dashboard ────────────────────────────────────────────────────────────────

  async getDashboardStats(userId: string): Promise<{
    totalRooms: number;
    activeRooms: number;
    recentRooms: Room[];
  }> {
    const [totals] = await db
      .select({
        total: count(),
        active: sql<number>`SUM(CASE WHEN ${roomsTable.isActive} THEN 1 ELSE 0 END)`,
      })
      .from(roomsTable)
      .where(eq(roomsTable.hostUserId, userId));

    const recentRooms = await db
      .select()
      .from(roomsTable)
      .where(eq(roomsTable.hostUserId, userId))
      .orderBy(desc(roomsTable.createdAt))
      .limit(5);

    return {
      totalRooms: Number(totals?.total ?? 0),
      activeRooms: Number(totals?.active ?? 0),
      recentRooms,
    };
  }
}

export const storage = new Storage();

// ── Helpers ─────────────────────────────────────────────────────────────────────

function generateCallCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 8; i++) {
    if (i === 4) code += "-";
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}
