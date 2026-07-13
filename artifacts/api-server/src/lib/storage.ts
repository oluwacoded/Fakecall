import { db, usersTable, roomsTable } from "@workspace/db";
import { eq, sql, desc, count } from "drizzle-orm";
import type { User, Room } from "@workspace/db";

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

  async updateUserStripeInfo(
    userId: string,
    info: {
      stripeCustomerId?: string;
      stripeSubscriptionId?: string;
      isSubscribed?: boolean;
    },
  ): Promise<User> {
    const [user] = await db
      .update(usersTable)
      .set(info)
      .where(eq(usersTable.id, userId))
      .returning();
    return user;
  }

  async updateSubscriptionStatus(
    stripeCustomerId: string,
    isSubscribed: boolean,
    subscriptionId?: string,
  ): Promise<void> {
    await db
      .update(usersTable)
      .set({
        isSubscribed,
        stripeSubscriptionId: subscriptionId ?? null,
      })
      .where(eq(usersTable.stripeCustomerId, stripeCustomerId));
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

  // ── Stripe (via stripe schema) ───────────────────────────────────────────────

  async getSubscription(subscriptionId: string) {
    const result = await db.execute(
      sql`SELECT * FROM stripe.subscriptions WHERE id = ${subscriptionId}`,
    );
    return result.rows[0] ?? null;
  }

  async getProductsWithPrices() {
    const result = await db.execute(sql`
      SELECT
        p.id as product_id,
        p.name as product_name,
        p.description as product_description,
        pr.id as price_id,
        pr.unit_amount,
        pr.currency,
        pr.recurring
      FROM stripe.products p
      JOIN stripe.prices pr ON pr.product = p.id AND pr.active = true
      WHERE p.active = true
      ORDER BY pr.unit_amount ASC
    `);
    return result.rows;
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
