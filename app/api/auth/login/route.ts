import { and, eq, isNull, sql } from "drizzle-orm";
import { getDb } from "../../../../db";
import { mindMaps, users } from "../../../../db/schema";
import { createSession, normalizeEmail, verifyPassword } from "../../../auth";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { email?: unknown; password?: unknown };
    const email = normalizeEmail(body.email); const password = typeof body.password === "string" ? body.password : "";
    const db = getDb(); const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    const passwordMatches = await verifyPassword(password, user?.passwordHash ?? "0".repeat(64), user?.passwordSalt ?? "0".repeat(32));
    if (!user || !passwordMatches) return Response.json({ error: "Email or password is incorrect." }, { status: 401 });
    await db.update(mindMaps).set({ ownerUserId: user.id }).where(and(isNull(mindMaps.ownerUserId), sql`lower(${mindMaps.ownerEmail}) = ${user.email}`));
    const cookie = await createSession(request, user.id);
    return Response.json({ user: { id: user.id, email: user.email, name: user.name } }, { headers: { "cache-control": "no-store", "set-cookie": cookie } });
  } catch { return Response.json({ error: "You could not be signed in." }, { status: 500 }); }
}
