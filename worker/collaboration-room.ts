type CollaborationBoard = { nodes: unknown[]; edges: unknown[] };
type RoomState = { board: CollaborationBoard; title: string };
type SocketAttachment = { canEdit: boolean };

const MAX_BOARD_BYTES = 750_000;

function validState(value: unknown): value is RoomState {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { board?: unknown; title?: unknown };
  if (!candidate.board || typeof candidate.board !== "object" || !Array.isArray((candidate.board as CollaborationBoard).nodes) || !Array.isArray((candidate.board as CollaborationBoard).edges) || typeof candidate.title !== "string") return false;
  return new TextEncoder().encode(JSON.stringify(candidate)).length <= MAX_BOARD_BYTES;
}

export class CollaborationRoom implements DurableObject {
  constructor(private readonly ctx: DurableObjectState) {}

  async fetch(request: Request) {
    if (request.headers.get("Upgrade") !== "websocket") return new Response("WebSocket upgrade required", { status: 426 });
    const canEdit = request.headers.get("x-mindflow-can-edit") === "true";
    const pair = new WebSocketPair(); const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ canEdit } satisfies SocketAttachment);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(socket: WebSocket, message: string | ArrayBuffer) {
    const attachment = socket.deserializeAttachment() as SocketAttachment | null;
    if (typeof message !== "string") return;
    try {
      const payload = JSON.parse(message) as { type?: string; board?: unknown; title?: unknown };
      const state = { board: payload.board, title: payload.title };
      if (payload.type === "join") return;
      if (payload.type !== "board" || !attachment?.canEdit || !validState(state)) return;
      const update = JSON.stringify({ type: "board", ...state });
      for (const peer of this.ctx.getWebSockets()) if (peer !== socket) peer.send(update);
    } catch {
      // Ignore malformed collaboration messages without terminating the session.
    }
  }
}
