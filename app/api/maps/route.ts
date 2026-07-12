import { and, eq, or, sql } from "drizzle-orm";
import { getDb } from "../../../db";
import { mindMaps } from "../../../db/schema";

const MAX_DATA_BYTES = 750_000;

function token() {
  return `${crypto.randomUUID()}-${crypto.randomUUID()}`;
}

function cleanTitle(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 120) : "Untitled mind map";
}

function validData(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const json = JSON.stringify(value);
  return new TextEncoder().encode(json).length <= MAX_DATA_BYTES ? json : null;
}

function errorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "Unexpected error";
  if (message.includes("no such table")) return "Mind map storage is still being prepared. Please try again shortly.";
  return "The board could not be saved right now.";
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id") ?? "";
  const accessToken = url.searchParams.get("token") ?? "";
  if (!id || !accessToken) return Response.json({ error: "A board link is required." }, { status: 400 });

  try {
    const db = getDb();
    const [row] = await db.select().from(mindMaps)
      .where(and(eq(mindMaps.id, id), or(eq(mindMaps.viewToken, accessToken), eq(mindMaps.editToken, accessToken))))
      .limit(1);
    if (!row) return Response.json({ error: "This board link is invalid or no longer available." }, { status: 404 });
    const permission = row.editToken === accessToken ? "edit" : "view";
    return Response.json({
      map: { id: row.id, title: row.title, data: JSON.parse(row.data), updatedAt: row.updatedAt, viewToken: permission === "edit" ? row.viewToken : undefined },
      permission,
    });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const payload = await request.json() as { id?: string; token?: string; title?: unknown; data?: unknown };
    const data = validData(payload.data);
    if (!data) return Response.json({ error: "This board is too large or invalid." }, { status: 400 });
    const title = cleanTitle(payload.title);
    const db = getDb();

    if (payload.id) {
      if (!payload.token) return Response.json({ error: "Edit permission is required." }, { status: 403 });
      const updated = await db.update(mindMaps)
        .set({ title, data, updatedAt: sql`CURRENT_TIMESTAMP` })
        .where(and(eq(mindMaps.id, payload.id), eq(mindMaps.editToken, payload.token)))
        .returning({ id: mindMaps.id, viewToken: mindMaps.viewToken, editToken: mindMaps.editToken });
      if (!updated.length) return Response.json({ error: "You only have view access to this board." }, { status: 403 });
      return Response.json({ map: updated[0] });
    }

    const id = crypto.randomUUID();
    const viewToken = token();
    const editToken = token();
    await db.insert(mindMaps).values({ id, title, data, viewToken, editToken });
    return Response.json({ map: { id, viewToken, editToken } }, { status: 201 });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}
