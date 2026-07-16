import { getDb } from "../../../db";
import { feedback } from "../../../db/schema";

const MAX_FEEDBACK_LENGTH = 200;

function parseFeedback(payload: unknown) {
  if (!payload || typeof payload !== "object") return null;
  const { sentiment, message } = payload as { sentiment?: unknown; message?: unknown };
  if (sentiment !== "like" && sentiment !== "dislike") return null;
  if (typeof message !== "string") return null;
  const cleanMessage = message.trim();
  if (cleanMessage.length > MAX_FEEDBACK_LENGTH) return null;
  return { sentiment, message: cleanMessage };
}

export async function POST(request: Request) {
  try {
    const payload = parseFeedback(await request.json());
    if (!payload) return Response.json({ error: "Choose a rating and keep feedback to 200 characters or fewer." }, { status: 400 });
    await getDb().insert(feedback).values({ id: crypto.randomUUID(), ...payload });
    return Response.json({ ok: true }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error && error.message.includes("no such table")
      ? "Feedback storage is still being prepared. Please try again shortly."
      : "Your feedback could not be submitted right now.";
    return Response.json({ error: message }, { status: 500 });
  }
}
