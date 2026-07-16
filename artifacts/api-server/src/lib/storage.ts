import { db, usersTable, roomsTable, accessCodesTable, tokenRequestsTable, topupCodesTable } from "@workspace/db";
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

  // ── Tokens ───────────────────────────────────────────────────────────────────

  async addTokens(userId: string, amount: number): Promise<number> {
    const [user] = await db
      .update(usersTable)
      .set({ tokens: sql<number>`${usersTable.tokens} + ${amount}` })
      .where(eq(usersTable.id, userId))
      .returning();
    return user.tokens;
  }

  async deductTokens(userId: string, amount: number): Promise<{ success: boolean; remaining: number }> {
    const user = await this.getUser(userId);
    if (!user || (user.tokens ?? 0) < amount) {
      return { success: false, remaining: user?.tokens ?? 0 };
    }
    const [updated] = await db
      .update(usersTable)
      .set({ tokens: sql<number>`${usersTable.tokens} - ${amount}` })
      .where(and(eq(usersTable.id, userId), sql`${usersTable.tokens} >= ${amount}`))
      .returning();
    if (!updated) return { success: false, remaining: user.tokens };
    return { success: true, remaining: updated.tokens };
  }

  async createTokenRequest(userId: string, packageId: string, tokenAmount: number) {
    const [req] = await db
      .insert(tokenRequestsTable)
      .values({ userId, packageId, tokenAmount })
      .returning();
    return req;
  }

  async approveTokenRequest(requestId: string): Promise<{ success: boolean; tokens?: number }> {
    const [request] = await db
      .select()
      .from(tokenRequestsTable)
      .where(eq(tokenRequestsTable.id, requestId));
    if (!request || request.status !== "pending") return { success: false };

    await db.transaction(async (tx) => {
      await tx
        .update(tokenRequestsTable)
        .set({ status: "approved", resolvedAt: new Date() })
        .where(eq(tokenRequestsTable.id, requestId));
      await tx
        .update(usersTable)
        .set({ tokens: sql<number>`${usersTable.tokens} + ${request.tokenAmount}` })
        .where(eq(usersTable.id, request.userId));
    });

    const user = await this.getUser(request.userId);
    return { success: true, tokens: user?.tokens };
  }

  async declineTokenRequest(requestId: string): Promise<boolean> {
    const [updated] = await db
      .update(tokenRequestsTable)
      .set({ status: "declined", resolvedAt: new Date() })
      .where(and(eq(tokenRequestsTable.id, requestId), eq(tokenRequestsTable.status, "pending")))
      .returning();
    return !!updated;
  }

  async setTokenRequestMessageId(requestId: string, messageId: number): Promise<void> {
    await db
      .update(tokenRequestsTable)
      .set({ telegramMessageId: messageId })
      .where(eq(tokenRequestsTable.id, requestId));
  }

  async getTokenRequest(requestId: string) {
    const [req] = await db.select().from(tokenRequestsTable).where(eq(tokenRequestsTable.id, requestId));
    return req;
  }

  // Topup codes (admin-generated)
  async createTopupCode(tokenAmount: number): Promise<string> {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code = "";
    for (let i = 0; i < 8; i++) {
      if (i === 4) code += "-";
      code += chars[Math.floor(Math.random() * chars.length)];
    }
    await db.insert(topupCodesTable).values({ code, tokenAmount });
    return code;
  }

  async redeemTopupCode(code: string, userId: string): Promise<{ success: boolean; error?: string; tokens?: number }> {
    const [existing] = await db.select().from(topupCodesTable).where(eq(topupCodesTable.code, code));
    if (!existing) return { success: false, error: "Invalid code. Please check and try again." };
    if (existing.isUsed) return { success: false, error: "This code has already been used." };

    let newBalance = 0;
    await db.transaction(async (tx) => {
      await tx.update(topupCodesTable)
        .set({ isUsed: true, usedByUserId: userId, usedAt: new Date() })
        .where(and(eq(topupCodesTable.code, code), eq(topupCodesTable.isUsed, false)));
      const [user] = await tx.update(usersTable)
        .set({ tokens: sql<number>`${usersTable.tokens} + ${existing.tokenAmount}` })
        .where(eq(usersTable.id, userId))
        .returning();
      newBalance = user.tokens;
    });

    return { success: true, tokens: newBalance };
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
