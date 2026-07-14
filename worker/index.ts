import handler from "vinext/server/app-router-entry";
import { CollaborationRoom } from "./collaboration-room";

type Env = {
  DB: D1Database;
  COLLABORATION: DurableObjectNamespace<CollaborationRoom>;
};

function websocketUrl(request: Request) {
  const url = new URL(request.url);
  return url.pathname === "/api/collaboration" && request.headers.get("Upgrade") === "websocket" ? url : null;
}

async function connectCollaboration(request: Request, env: Env, url: URL) {
  const mapId = url.searchParams.get("map"); const token = url.searchParams.get("token");
  if (!mapId || !token) return Response.json({ error: "A board link is required." }, { status: 400 });
  const map = await env.DB.prepare("SELECT view_token, edit_token FROM mind_maps WHERE id = ?").bind(mapId).first<{ view_token: string; edit_token: string }>();
  if (!map || (token !== map.view_token && token !== map.edit_token)) return Response.json({ error: "This board link is invalid or no longer available." }, { status: 403 });
  const room = env.COLLABORATION.get(env.COLLABORATION.idFromName(mapId));
  const headers = new Headers(request.headers);
  headers.set("x-mindflow-can-edit", String(token === map.edit_token));
  return room.fetch(new Request(request, { headers }));
}

export { CollaborationRoom };

export default {
  fetch(request, env, ctx) {
    const url = websocketUrl(request);
    if (url) return connectCollaboration(request, env, url);
    return handler.fetch(request, env, ctx);
  },
} satisfies ExportedHandler<Env>;
