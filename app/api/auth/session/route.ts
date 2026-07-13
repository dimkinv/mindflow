import { destroySession, getCurrentUser } from "../../../auth";

const noStore = { "cache-control": "no-store" };

export async function GET(request: Request) {
  try { return Response.json({ user: await getCurrentUser(request) }, { headers: noStore }); }
  catch { return Response.json({ error: "Account services are unavailable." }, { status: 500, headers: noStore }); }
}

export async function DELETE(request: Request) {
  try {
    const cookie = await destroySession(request);
    return Response.json({ ok: true }, { headers: { ...noStore, "set-cookie": cookie } });
  } catch { return Response.json({ error: "You could not be signed out." }, { status: 500, headers: noStore }); }
}
