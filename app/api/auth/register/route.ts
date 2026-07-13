import { and, eq, isNull, sql } from "drizzle-orm";
import { getDb } from "../../../../db";
import { mindMaps, users } from "../../../../db/schema";
import { createSession, hashPassword, normalizeEmail, validEmail } from "../../../auth";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { name?: unknown; email?: unknown; password?: unknown };
    const name = typeof body.name === "string" ? body.name.trim().slice(0, 80) : "";
    const email = normalizeEmail(body.email);
    const password = typeof body.password === "string" ? body.password : "";
    if (!name) return Response.json({ error: "Enter your name." }, { status: 400 });
    if (!validEmail(email)) return Response.json({ error: "Enter a valid email address." }, { status: 400 });
    if (password.length < 8 || password.length > 128) return Response.json({ error: "Use a password between 8 and 128 characters." }, { status: 400 });

    const db = getDb();
    const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
    if (existing) return Response.json({ error: "An account with this email already exists." }, { status: 409 });
    const id = crypto.randomUUID(); const passwordRecord = await hashPassword(password);
    await db.insert(users).values({ id, email, name, passwordHash: passwordRecord.hash, passwordSalt: passwordRecord.salt });
    await db.update(mindMaps).set({ ownerUserId: id }).where(and(isNull(mindMaps.ownerUserId), sql`lower(${mindMaps.ownerEmail}) = ${email}`));
    const cookie = await createSession(request, id);
    return Response.json({ user: { id, email, name } }, { status: 201, headers: { "cache-control": "no-store", "set-cookie": cookie } });
  } catch (error) {
    if (error instanceof Error && error.message.includes("UNIQUE constraint failed")) return Response.json({ error: "An account with this email already exists." }, { status: 409 });
    return Response.json({ error: "Your account could not be created." }, { status: 500 });
  }
}
