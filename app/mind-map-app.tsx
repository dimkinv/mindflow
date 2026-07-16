"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LocateFixed } from "lucide-react";

type LineShape = "curve" | "straight" | "elbow";
type LineDash = "solid" | "dashed" | "dotted";
type NodeItem = { id: string; text: string; x: number; y: number; color: string; parentId?: string };
type EdgeItem = { id: string; from: string; to: string; color: string; shape: LineShape; dash: LineDash; manual?: boolean };
type BoardData = { nodes: NodeItem[]; edges: EdgeItem[] };
type MapSummary = { id: string; title: string; updatedAt: string; editToken: string };
type AuthUser = { id: string; name: string; email: string };
type CollaborationMessage = { type?: "board"; board?: BoardData; title?: string };

const COLORS = ["#ff5c35", "#ffad1f", "#ffd43b", "#6fd83d", "#26c6b7", "#20b8e5", "#4d7df3", "#7a4cff", "#c64ee8", "#f43fa4"];
const NODE_W = 176;
const NODE_H = 48;
const AUTOSAVE_DELAY_MS = 1500;
const MAX_FEEDBACK_LENGTH = 200;

const starter: BoardData = {
  nodes: [
    { id: "root", text: "Product launch", x: 650, y: 360, color: "#7a4cff" },
    { id: "research", text: "Research", x: 355, y: 175, color: "#ff5c35", parentId: "root" },
    { id: "audience", text: "Target audience", x: 85, y: 105, color: "#ff5c35", parentId: "research" },
    { id: "insights", text: "Customer insights", x: 85, y: 215, color: "#ff5c35", parentId: "research" },
    { id: "strategy", text: "Strategy", x: 950, y: 170, color: "#20b8e5", parentId: "root" },
    { id: "position", text: "Positioning", x: 1210, y: 105, color: "#20b8e5", parentId: "strategy" },
    { id: "channels", text: "Channels", x: 1210, y: 215, color: "#20b8e5", parentId: "strategy" },
    { id: "delivery", text: "Delivery", x: 950, y: 555, color: "#f43fa4", parentId: "root" },
    { id: "timeline", text: "Timeline", x: 1210, y: 500, color: "#f43fa4", parentId: "delivery" },
    { id: "owners", text: "Owners", x: 1210, y: 610, color: "#f43fa4", parentId: "delivery" },
  ],
  edges: [
    ["root", "research", "#ff5c35"], ["research", "audience", "#ff5c35"], ["research", "insights", "#ff5c35"],
    ["root", "strategy", "#20b8e5"], ["strategy", "position", "#20b8e5"], ["strategy", "channels", "#20b8e5"],
    ["root", "delivery", "#f43fa4"], ["delivery", "timeline", "#f43fa4"], ["delivery", "owners", "#f43fa4"],
  ].map(([from, to, color], index) => ({ id: `edge-${index}`, from, to, color, shape: "curve", dash: "solid" } as EdgeItem)),
};

const cloneStarter = () => JSON.parse(JSON.stringify(starter)) as BoardData;
const uid = () => crypto.randomUUID();

function isBoardData(value: unknown): value is BoardData {
  return Boolean(value && typeof value === "object" && Array.isArray((value as BoardData).nodes) && Array.isArray((value as BoardData).edges));
}

function pathFor(edge: EdgeItem, from: NodeItem, to: NodeItem) {
  const leftToRight = to.x >= from.x;
  const sx = from.x + (leftToRight ? NODE_W : 0);
  const sy = from.y + NODE_H / 2;
  const tx = to.x + (leftToRight ? 0 : NODE_W);
  const ty = to.y + NODE_H / 2;
  if (edge.shape === "straight") return `M ${sx} ${sy} L ${tx} ${ty}`;
  if (edge.shape === "elbow") {
    const mid = (sx + tx) / 2;
    return `M ${sx} ${sy} L ${mid} ${sy} L ${mid} ${ty} L ${tx} ${ty}`;
  }
  const bend = Math.max(80, Math.abs(tx - sx) * 0.45);
  const c1 = sx + (leftToRight ? bend : -bend);
  const c2 = tx - (leftToRight ? bend : -bend);
  return `M ${sx} ${sy} C ${c1} ${sy}, ${c2} ${ty}, ${tx} ${ty}`;
}

function AuthDialog({ user, initialMode, onClose, onSignedIn, onSignedOut }: {
  user: AuthUser | null; initialMode: "login" | "register"; onClose: () => void;
  onSignedIn: (user: AuthUser) => void; onSignedOut: () => void;
}) {
  const [mode, setMode] = useState(initialMode); const [name, setName] = useState("");
  const [email, setEmail] = useState(""); const [password, setPassword] = useState("");
  const [working, setWorking] = useState(false); const [error, setError] = useState("");
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setWorking(true); setError("");
    try {
      const res = await fetch(`/api/auth/${mode}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, email, password }) });
      const body = await res.json(); if (!res.ok) throw new Error(body.error); onSignedIn(body.user);
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : "Please try again."); }
    finally { setWorking(false); }
  };
  const signOut = async () => {
    setWorking(true); setError("");
    try { const res = await fetch("/api/auth/session", { method: "DELETE" }); if (!res.ok) throw new Error("You could not be signed out."); onSignedOut(); }
    catch (requestError) { setError(requestError instanceof Error ? requestError.message : "Please try again."); }
    finally { setWorking(false); }
  };
  return <div className="modal-backdrop" onMouseDown={onClose}><div className="auth-modal" role="dialog" aria-modal="true" aria-labelledby="auth-title" onMouseDown={(event) => event.stopPropagation()}>
    <button className="modal-close" onClick={onClose} aria-label="Close account dialog">×</button><div className="brand-mark">M</div>
    {user ? <><h2 id="auth-title">Your account</h2><p>Signed in as <strong>{user.name}</strong></p><span className="account-email">{user.email}</span>
      {error && <div className="auth-error" role="alert">{error}</div>}<button className="auth-submit secondary" onClick={signOut} disabled={working}>Sign out</button></> : <>
      <h2 id="auth-title">{mode === "login" ? "Welcome back" : "Create your account"}</h2><p>{mode === "login" ? "Sign in to save and manage your mind maps." : "Create an account to keep your mind maps together."}</p>
      <form onSubmit={submit}>{mode === "register" && <label>Name<input autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} required maxLength={80} /></label>}
        <label>Email<input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
        <label>Password<input type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} value={password} onChange={(event) => setPassword(event.target.value)} required minLength={8} maxLength={128} /></label>
        {error && <div className="auth-error" role="alert">{error}</div>}<button className="auth-submit" type="submit" disabled={working}>{working ? "Please wait..." : mode === "login" ? "Sign in" : "Create account"}</button></form>
      <button className="auth-switch" onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); }}>{mode === "login" ? "New to Mindflow? Create an account" : "Already have an account? Sign in"}</button></>}
  </div></div>;
}

export function MindMapApp() {
  const [board, setBoard] = useState<BoardData>(cloneStarter);
  const [title, setTitle] = useState("Product launch plan");
  const [selectedNode, setSelectedNode] = useState<string | null>("root");
  const [selectedEdge, setSelectedEdge] = useState<string | null>(null);
  const [editingNode, setEditingNode] = useState<string | null>(null);
  const [lineOpen, setLineOpen] = useState(false);
  const [colorOpen, setColorOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [maps, setMaps] = useState<MapSummary[]>([]);
  const [libraryState, setLibraryState] = useState<"idle" | "loading" | "error">("idle");
  const [menu, setMenu] = useState<{ x: number; y: number; nodeId: string } | null>(null);
  const [connectFrom, setConnectFrom] = useState<string | null>(null);
  const [reparentingNode, setReparentingNode] = useState<string | null>(null);
  const [mapId, setMapId] = useState<string | null>(null);
  const [editToken, setEditToken] = useState<string | null>(null);
  const [viewToken, setViewToken] = useState<string | null>(null);
  const [permission, setPermission] = useState<"edit" | "view">("edit");
  const [saveState, setSaveState] = useState<"saved" | "saving" | "unsaved" | "error">("unsaved");
  const [toast, setToast] = useState("");
  const [zoom, setZoom] = useState(0.9);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [loading, setLoading] = useState(true);
  const [authReady, setAuthReady] = useState(false);
  const [hasSharedMap] = useState(() => {
    if (typeof window === "undefined") return false;
    const params = new URLSearchParams(window.location.search);
    return Boolean(params.get("map") && params.get("token"));
  });
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [nodePlusSide, setNodePlusSide] = useState<{ id: string; side: "left" | "right" } | null>(null);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackSentiment, setFeedbackSentiment] = useState<"like" | "dislike" | null>(null);
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const [feedbackError, setFeedbackError] = useState("");
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ id?: string; startX: number; startY: number; nodePositions?: Record<string, { x: number; y: number }>; panX?: number; panY?: number } | null>(null);
  const pinchRef = useRef<{ distance: number; zoom: number; baseX: number; baseY: number; worldX: number; worldY: number } | null>(null);
  const collaborationSocketRef = useRef<WebSocket | null>(null);
  const receivedRemoteUpdateRef = useRef(false);
  const canEdit = permission === "edit";

  const flash = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2200);
  }, []);

  const submitFeedback = async (event: React.FormEvent) => {
    event.preventDefault();
    const message = feedbackMessage.trim();
    if (!feedbackSentiment) { setFeedbackError("Choose like or dislike before submitting."); return; }
    if (message.length > MAX_FEEDBACK_LENGTH) { setFeedbackError("Feedback must be 200 characters or fewer."); return; }
    setFeedbackSubmitting(true); setFeedbackError("");
    try {
      const response = await fetch("/api/feedback", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sentiment: feedbackSentiment, message }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      setFeedbackOpen(false); setFeedbackSentiment(null); setFeedbackMessage(""); flash("Thanks for your feedback");
    } catch (error) { setFeedbackError(error instanceof Error ? error.message : "Your feedback could not be submitted."); }
    finally { setFeedbackSubmitting(false); }
  };

  useEffect(() => {
    fetch("/api/auth/session", { cache: "no-store" }).then(async (res) => res.ok ? res.json() : { user: null })
      .then((body) => setAuthUser(body.user ?? null)).catch(() => setAuthUser(null)).finally(() => setAuthReady(true));
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("map");
    const token = params.get("token");
    if (!id || !token) { queueMicrotask(() => setLoading(false)); return; }
    fetch(`/api/maps?id=${encodeURIComponent(id)}&token=${encodeURIComponent(token)}`)
      .then(async (res) => { const body = await res.json(); if (!res.ok) throw new Error(body.error); return body; })
      .then((body) => {
        setBoard(body.map.data); setTitle(body.map.title); setMapId(body.map.id); setPermission(body.permission);
        if (body.permission === "edit") { setEditToken(token); setViewToken(body.map.viewToken); } else setViewToken(token);
        setSelectedNode(null); setSaveState("saved");
      })
      .catch((error) => flash(error.message || "Could not open this board."))
      .finally(() => setLoading(false));
  }, [flash]);

  useEffect(() => {
    const token = canEdit ? editToken : viewToken;
    if (!mapId || !token) return;
    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const socket = new WebSocket(`${protocol}://${window.location.host}/api/collaboration?map=${encodeURIComponent(mapId)}&token=${encodeURIComponent(token)}`);
    collaborationSocketRef.current = socket;
    socket.onopen = () => socket.send(JSON.stringify({ type: "join" }));
    socket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data) as CollaborationMessage;
        if (message.type === "board" && isBoardData(message.board)) {
          receivedRemoteUpdateRef.current = true;
          setBoard(message.board);
          if (typeof message.title === "string") setTitle(message.title);
        }
      } catch {
        // Ignore an invalid collaboration update and keep the current board intact.
      }
    };
    return () => { if (collaborationSocketRef.current === socket) collaborationSocketRef.current = null; socket.close(); };
  }, [canEdit, editToken, mapId, viewToken]);

  const markChanged = () => { if (canEdit) setSaveState("unsaved"); };

  const updateNodes = (fn: (nodes: NodeItem[]) => NodeItem[]) => {
    setBoard((current) => ({ ...current, nodes: fn(current.nodes) })); markChanged();
  };

  const addChild = useCallback((parentId: string) => {
    if (!canEdit) return;
    setBoard((current) => {
      const parent = current.nodes.find((node) => node.id === parentId);
      if (!parent) return current;
      const siblings = current.nodes.filter((node) => node.parentId === parentId);
      const parentOfParent = parent.parentId ? current.nodes.find((node) => node.id === parent.parentId) : undefined;
      const leftChildren = siblings.filter((node) => node.x < parent.x).length;
      const rightChildren = siblings.length - leftChildren;
      const direction = parentOfParent ? (parent.x >= parentOfParent.x ? 1 : -1) : (leftChildren <= rightChildren ? -1 : 1);
      const id = uid();
      const targetX = parent.x + direction * 260;
      const offsets = [0, 82, -82, 164, -164, 246, -246, 328, -328];
      const targetY = offsets.map((offset) => parent.y + offset).find((candidate) => !current.nodes.some((node) => Math.abs(node.x - targetX) < NODE_W + 22 && Math.abs(node.y - candidate) < NODE_H + 22)) ?? parent.y + siblings.length * 82;
      const child: NodeItem = { id, text: "New idea", x: targetX, y: targetY, color: parent.color, parentId };
      window.setTimeout(() => { setSelectedNode(id); setEditingNode(id); }, 0);
      return { nodes: [...current.nodes, child], edges: [...current.edges, { id: uid(), from: parentId, to: id, color: parent.color, shape: "curve", dash: "solid" }] };
    });
    setSaveState("unsaved"); setMenu(null);
  }, [canEdit]);

  const deleteNode = (nodeId: string) => {
    if (!canEdit) return;
    setBoard((current) => ({ nodes: current.nodes.filter((n) => n.id !== nodeId), edges: current.edges.filter((e) => e.from !== nodeId && e.to !== nodeId) }));
    setSelectedNode(null); setMenu(null); markChanged();
  };

  const duplicateNode = (nodeId: string) => {
    if (!canEdit) return;
    setBoard((current) => {
      const original = current.nodes.find((n) => n.id === nodeId); if (!original) return current;
      const copy = { ...original, id: uid(), text: `${original.text} copy`, x: original.x + 34, y: original.y + 74, parentId: undefined };
      window.setTimeout(() => setSelectedNode(copy.id), 0);
      return { ...current, nodes: [...current.nodes, copy] };
    }); setMenu(null); markChanged();
  };

  const startConnect = (nodeId?: string) => {
    if (!canEdit) return;
    setConnectFrom(nodeId ?? selectedNode); setReparentingNode(null); setMenu(null); setSelectedEdge(null);
    flash(nodeId || selectedNode ? "Now choose a second node" : "Choose the first node to connect");
  };

  const deleteCustomConnection = () => {
    if (!canEdit || !selectedEdge || !board.edges.find((edge) => edge.id === selectedEdge)?.manual) return;
    setBoard((current) => ({ ...current, edges: current.edges.filter((edge) => edge.id !== selectedEdge) }));
    setSelectedEdge(null); setLineOpen(false); markChanged();
  };

  const startChangeParent = (nodeId: string) => {
    if (!canEdit || !board.nodes.find((node) => node.id === nodeId)?.parentId) return;
    setReparentingNode(nodeId); setConnectFrom(null); setMenu(null); setSelectedNode(nodeId); setSelectedEdge(null);
    flash("Choose a new parent node");
  };

  const changeParent = (nextParentId: string) => {
    const nodeId = reparentingNode; if (!nodeId || nodeId === nextParentId) return;
    const descendants = new Set<string>([nodeId]); let foundChild = true;
    while (foundChild) {
      foundChild = false;
      board.nodes.forEach((node) => {
        if (node.parentId && descendants.has(node.parentId) && !descendants.has(node.id)) { descendants.add(node.id); foundChild = true; }
      });
    }
    if (descendants.has(nextParentId)) { flash("A node cannot become the parent of its own branch"); return; }
    const nextParent = board.nodes.find((node) => node.id === nextParentId); if (!nextParent) return;
    setBoard((current) => ({
      nodes: current.nodes.map((node) => node.id === nodeId ? { ...node, parentId: nextParentId } : node),
      edges: [
        ...current.edges.filter((edge) => !(edge.to === nodeId && !edge.manual) && !(edge.from === nextParentId && edge.to === nodeId)),
        { id: uid(), from: nextParentId, to: nodeId, color: nextParent.color, shape: "curve", dash: "solid" },
      ],
    }));
    setReparentingNode(null); setSelectedNode(nodeId); markChanged(); flash("Parent updated");
  };

  const selectNode = (nodeId: string) => {
    if (reparentingNode) { changeParent(nodeId); return; }
    if (connectFrom) {
      if (connectFrom !== nodeId && !board.edges.some((e) => (e.from === connectFrom && e.to === nodeId) || (e.to === connectFrom && e.from === nodeId))) {
        const source = board.nodes.find((n) => n.id === connectFrom)!;
        setBoard((current) => ({ ...current, edges: [...current.edges, { id: uid(), from: connectFrom, to: nodeId, color: source.color, shape: "curve", dash: "dashed", manual: true }] }));
        markChanged(); flash("Nodes connected");
      }
      setConnectFrom(null); setSelectedNode(nodeId); return;
    }
    setSelectedNode(nodeId); setSelectedEdge(null); setMenu(null);
  };

  const changeColor = (color: string) => {
    if (!canEdit || !selectedNode) return;
    const descendants = new Set<string>([selectedNode]);
    let added = true;
    while (added) { added = false; board.nodes.forEach((n) => { if (n.parentId && descendants.has(n.parentId) && !descendants.has(n.id)) { descendants.add(n.id); added = true; } }); }
    setBoard((current) => ({
      nodes: current.nodes.map((n) => descendants.has(n.id) ? { ...n, color } : n),
      edges: current.edges.map((e) => descendants.has(e.from) && descendants.has(e.to) ? { ...e, color } : e),
    }));
    setColorOpen(false); markChanged();
  };

  const changeLine = (changes: Partial<Pick<EdgeItem, "shape" | "dash">>) => {
    if (!canEdit) return;
    setBoard((current) => ({ ...current, edges: current.edges.map((edge) => {
      if (selectedEdge ? edge.id === selectedEdge : selectedNode ? edge.from === selectedNode : false) return { ...edge, ...changes };
      return edge;
    }) }));
    markChanged();
  };

  const loadLibrary = async () => {
    setLibraryOpen(true); setLibraryState("loading");
    try {
      const res = await fetch("/api/maps");
      const body = await res.json();
      if (res.status === 401) { setLibraryOpen(false); setLibraryState("idle"); setAuthMode("login"); setAuthOpen(true); flash("Sign in to see your saved maps"); return; }
      if (!res.ok) throw new Error(body.error);
      setMaps(body.maps); setLibraryState("idle");
    } catch (error) {
      setLibraryState("error"); flash(error instanceof Error ? error.message : "Could not load your mind maps.");
    }
  };

  const openMap = (map: MapSummary) => {
    if (saveState === "unsaved" && !window.confirm("Open this mind map and discard unsaved changes?")) return;
    window.location.assign(`${window.location.pathname}?map=${encodeURIComponent(map.id)}&token=${encodeURIComponent(map.editToken)}`);
  };

  const save = useCallback(async (announce = true) => {
    if (!canEdit || saveState === "saving") return;
    setSaveState("saving");
    try {
      const res = await fetch("/api/maps", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: mapId, token: editToken, title, data: board }) });
      const body = await res.json();
      if (res.status === 401) { setSaveState("unsaved"); setAuthMode("login"); setAuthOpen(true); flash("Sign in to save this board"); return; }
      if (!res.ok) throw new Error(body.error);
      const result = body.map; setMapId(result.id); setEditToken(result.editToken); setViewToken(result.viewToken); setSaveState("saved");
      setMaps((current) => [{ id: result.id, title, updatedAt: new Date().toISOString(), editToken: result.editToken }, ...current.filter((map) => map.id !== result.id)]);
      const next = `?map=${encodeURIComponent(result.id)}&token=${encodeURIComponent(result.editToken)}`;
      window.history.replaceState({}, "", next); if (announce) flash("Board saved");
    } catch (error) { setSaveState("error"); flash(error instanceof Error ? error.message : "Could not save this board."); }
  }, [board, canEdit, editToken, flash, mapId, saveState, title]);

  useEffect(() => {
    if (!canEdit || saveState !== "unsaved") return;
    const timeout = window.setTimeout(() => { void save(false); }, AUTOSAVE_DELAY_MS);
    return () => window.clearTimeout(timeout);
  }, [canEdit, save, saveState]);

  useEffect(() => {
    const socket = collaborationSocketRef.current;
    if (!canEdit || !mapId || socket?.readyState !== WebSocket.OPEN) return;
    if (receivedRemoteUpdateRef.current) { receivedRemoteUpdateRef.current = false; return; }
    socket.send(JSON.stringify({ type: "board", board, title }));
  }, [board, canEdit, mapId, title]);

  const newBoard = () => {
    if (!canEdit || (saveState === "unsaved" && !window.confirm("Start a new board and discard unsaved changes?"))) return;
    setBoard({ nodes: [{ id: "root", text: "Central idea", x: 650, y: 360, color: "#7a4cff" }], edges: [] });
    setTitle("Untitled mind map"); setMapId(null); setEditToken(null); setViewToken(null); setSelectedNode("root"); setSaveState("unsaved");
    setLibraryOpen(false);
    window.history.replaceState({}, "", window.location.pathname);
  };

  const shareLinks = useMemo(() => {
    if (!mapId) return { view: "Save the board to create a link", edit: "Save the board to create a link" };
    const base = typeof window === "undefined" ? "" : `${window.location.origin}${window.location.pathname}`;
    return {
      view: viewToken ? `${base}?map=${mapId}&token=${viewToken}` : "Save again to refresh this link",
      edit: editToken ? `${base}?map=${mapId}&token=${editToken}` : "This is a view-only board",
    };
  }, [mapId, viewToken, editToken]);

  const copyLink = async (kind: "view" | "edit") => {
    const link = shareLinks[kind]; if (!link.startsWith("http")) return;
    await navigator.clipboard.writeText(link); flash(`${kind === "view" ? "View" : "Edit"} link copied`);
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target;
      if (target instanceof HTMLElement && target.closest("input, textarea, select, button, [contenteditable='true'], [role='dialog']")) return;
      if (event.key === "Escape") { setMenu(null); setConnectFrom(null); setReparentingNode(null); setEditingNode(null); }
      if (event.key === "Tab" && selectedNode && !editingNode && canEdit) { event.preventDefault(); addChild(selectedNode); }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") { event.preventDefault(); save(); }
      if ((event.key === "Delete" || event.key === "Backspace") && selectedNode && !editingNode && canEdit) deleteNode(selectedNode);
    };
    window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey);
  });

  const updateNodePlusSide = (event: React.PointerEvent<HTMLDivElement>, nodeId: string) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const side = event.clientX < bounds.left + bounds.width / 2 ? "left" : "right";
    setNodePlusSide((current) => current?.id === nodeId && current.side === side ? current : { id: nodeId, side });
  };

  const onNodePointerDown = (event: React.PointerEvent, node: NodeItem) => {
    if (!canEdit || editingNode) return;
    event.stopPropagation();
    const descendantIds = new Set<string>([node.id]); let foundChild = true;
    while (foundChild) {
      foundChild = false;
      board.nodes.forEach((candidate) => {
        if (candidate.parentId && descendantIds.has(candidate.parentId) && !descendantIds.has(candidate.id)) { descendantIds.add(candidate.id); foundChild = true; }
      });
    }
    const nodePositions = Object.fromEntries(board.nodes.filter((candidate) => descendantIds.has(candidate.id)).map((candidate) => [candidate.id, { x: candidate.x, y: candidate.y }]));
    dragRef.current = { id: node.id, startX: event.clientX, startY: event.clientY, nodePositions };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: React.PointerEvent) => {
    const drag = dragRef.current; if (!drag) return;
    if (drag.id) {
      const dx = (event.clientX - drag.startX) / zoom; const dy = (event.clientY - drag.startY) / zoom;
      updateNodes((nodes) => nodes.map((n) => {
        const position = drag.nodePositions?.[n.id];
        return position ? { ...n, x: position.x + dx, y: position.y + dy } : n;
      }));
    } else {
      setPan({ x: (drag.panX ?? 0) + event.clientX - drag.startX, y: (drag.panY ?? 0) + event.clientY - drag.startY });
    }
  };

  const onCanvasPointerDown = (event: React.PointerEvent) => {
    if (event.button !== 0 || (event.target as HTMLElement).closest("button,input,.mind-node")) return;
    setSelectedNode(null); setSelectedEdge(null); setMenu(null); setColorOpen(false); setLineOpen(false);
    dragRef.current = { startX: event.clientX, startY: event.clientY, panX: pan.x, panY: pan.y };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  };

  const zoomAtPointer = (nextZoom: number, clientX: number, clientY: number) => {
    const canvas = canvasRef.current; const world = canvas?.querySelector<HTMLElement>(".canvas-world");
    if (!canvas || !world) { setZoom(nextZoom); return; }
    const worldBounds = world.getBoundingClientRect();
    const baseX = worldBounds.left - pan.x; const baseY = worldBounds.top - pan.y;
    // Measure from the world's current on-screen position. Omitting pan here
    // makes each zoom behave as if the canvas had never been moved.
    const worldX = (clientX - worldBounds.left) / zoom; const worldY = (clientY - worldBounds.top) / zoom;
    setPan({ x: clientX - baseX - worldX * nextZoom, y: clientY - baseY - worldY * nextZoom });
    setZoom(nextZoom);
  };

  const onCanvasWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    const nextZoom = Math.min(1.5, Math.max(.45, zoom * Math.exp(-event.deltaY * .0015)));
    if (nextZoom !== zoom) zoomAtPointer(nextZoom, event.clientX, event.clientY);
  };

  const zoomAtCanvasCenter = (change: number) => {
    const canvasBounds = canvasRef.current?.getBoundingClientRect();
    const nextZoom = Math.min(1.5, Math.max(.45, zoom + change));
    if (!canvasBounds || nextZoom === zoom) return;
    zoomAtPointer(nextZoom, canvasBounds.left + canvasBounds.width / 2, canvasBounds.top + canvasBounds.height / 2);
  };

  const onTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    if (event.touches.length !== 2) return;
    const [first, second] = Array.from(event.touches); const canvas = canvasRef.current; const world = canvas?.querySelector<HTMLElement>(".canvas-world");
    if (!world) return;
    const centerX = (first.clientX + second.clientX) / 2; const centerY = (first.clientY + second.clientY) / 2; const worldBounds = world.getBoundingClientRect();
    const baseX = worldBounds.left - pan.x; const baseY = worldBounds.top - pan.y;
    pinchRef.current = { distance: Math.hypot(first.clientX - second.clientX, first.clientY - second.clientY), zoom, baseX, baseY, worldX: (centerX - worldBounds.left) / zoom, worldY: (centerY - worldBounds.top) / zoom };
    dragRef.current = null;
  };

  const onTouchMove = (event: React.TouchEvent<HTMLDivElement>) => {
    const pinch = pinchRef.current; if (!pinch || event.touches.length !== 2) return;
    event.preventDefault();
    const [first, second] = Array.from(event.touches); const centerX = (first.clientX + second.clientX) / 2; const centerY = (first.clientY + second.clientY) / 2;
    const nextZoom = Math.min(1.5, Math.max(.45, pinch.zoom * Math.hypot(first.clientX - second.clientX, first.clientY - second.clientY) / pinch.distance));
    setPan({ x: centerX - pinch.baseX - pinch.worldX * nextZoom, y: centerY - pinch.baseY - pinch.worldY * nextZoom });
    setZoom(nextZoom);
  };

  const centerOnRoot = () => {
    const root = board.nodes.find((node) => !node.parentId) ?? board.nodes[0];
    const canvas = canvasRef.current; const world = canvas?.querySelector<HTMLElement>(".canvas-world");
    if (!root || !canvas || !world) return;
    const canvasBounds = canvas.getBoundingClientRect(); const worldBounds = world.getBoundingClientRect();
    const baseX = worldBounds.left - pan.x; const baseY = worldBounds.top - pan.y;
    setPan({ x: canvasBounds.left + canvasBounds.width / 2 - baseX - (root.x + NODE_W / 2) * zoom, y: canvasBounds.top + canvasBounds.height / 2 - baseY - (root.y + NODE_H / 2) * zoom });
  };

  if (loading || !authReady) return <main className="loading"><div className="brand-mark">M</div><p>Opening your board…</p></main>;

  if (!authUser && !hasSharedMap) return <main className="app-shell welcome-shell">
    <header className="topbar welcome-topbar">
      <div className="brand-mark" aria-label="Mindflow">M</div>
      <div className="top-actions"><button className="login-button" onClick={() => { setAuthMode("login"); setAuthOpen(true); }}>Log in</button></div>
    </header>
    <section className="welcome-screen" aria-label="Welcome to Mindflow">
      {/* The supplied full-bleed welcome artwork is intentionally rendered as-is. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/mindflow-welcome.png" alt="Welcome to Mindflow — organize ideas, plan with clarity, and execute with focus" />
    </section>
    {authOpen && <AuthDialog user={null} initialMode={authMode} onClose={() => setAuthOpen(false)}
      onSignedIn={(user) => { setAuthUser(user); setAuthOpen(false); }} onSignedOut={() => setAuthUser(null)} />}
  </main>;

  return (
    <main className="app-shell" data-permission={permission}>
      <header className="topbar">
        <div className="brand-mark" aria-label="Mindflow">M</div>
        {authUser ? <>
          <button className="library-button" onClick={loadLibrary} aria-label="My mind maps"><span>☷</span><span>My maps</span></button>
          <button className="icon-button" onClick={newBoard} disabled={!canEdit} aria-label="New mind map" title="New mind map">＋</button>
          <div className="title-wrap">
            <input aria-label="Board title" value={title} disabled={!canEdit} onChange={(e) => { setTitle(e.target.value); markChanged(); }} />
            <span className={`save-status ${saveState}`}>{saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved" : saveState === "error" ? "Save failed" : "Unsaved"}</span>
          </div>
          <div className="top-actions">
            {!canEdit && <span className="view-badge">View only</span>}
            <button className="share-button" onClick={() => setShareOpen(true)}>Share</button>
            <button className="account-button" onClick={() => { setAuthMode("login"); setAuthOpen(true); }} aria-label={`Account for ${authUser.name}`}>
              {authUser.name.slice(0, 1).toUpperCase()}
            </button>
          </div>
        </> : <div className="top-actions"><button className="login-button" onClick={() => { setAuthMode("login"); setAuthOpen(true); }}>Log in</button></div>}
      </header>

      {canEdit && <aside className="left-tools" aria-label="Canvas tools">
        <button className="tool active" aria-label="Select tool" title="Select">↖</button>
        <button className={`tool ${connectFrom !== null ? "active" : ""}`} onClick={() => startConnect()} aria-label="Connect two nodes" title="Connect nodes">⌁</button>
        <button className="tool" onClick={() => selectedNode && addChild(selectedNode)} disabled={!selectedNode} aria-label="Add child node" title="Add child (Tab)">＋</button>
        <button className="tool center-root-button" onClick={centerOnRoot} aria-label="Center on root note" title="Center on root note"><LocateFixed size={19} strokeWidth={2.25} aria-hidden="true" /></button>
      </aside>}

      {canEdit && (selectedNode || selectedEdge) && <div className="format-bar">
        <button className="format-button" onClick={() => { setLineOpen(!lineOpen); setColorOpen(false); }} aria-expanded={lineOpen}><span className="line-sample" /> Line</button>
        <button className="format-button" onClick={() => { setColorOpen(!colorOpen); setLineOpen(false); }} disabled={!selectedNode} aria-expanded={colorOpen}><span className="color-dot" style={{ background: board.nodes.find((n) => n.id === selectedNode)?.color }} /> Branch</button>
        <button className="format-button" onClick={() => selectedNode && setEditingNode(selectedNode)} disabled={!selectedNode}>T Text</button>
        {selectedEdge && board.edges.find((edge) => edge.id === selectedEdge)?.manual && <button className="format-button danger" onClick={deleteCustomConnection}>Delete connection</button>}
        {lineOpen && <div className="popover line-popover">
          <div className="popover-label">Connector</div>
          <div className="segmented">
            <button onClick={() => changeLine({ shape: "curve" })}>Curved</button><button onClick={() => changeLine({ shape: "straight" })}>Straight</button><button onClick={() => changeLine({ shape: "elbow" })}>Elbow</button>
          </div>
          <div className="popover-label">Stroke</div>
          <div className="segmented">
            <button onClick={() => changeLine({ dash: "solid" })}>Solid</button><button onClick={() => changeLine({ dash: "dashed" })}>Dashed</button><button onClick={() => changeLine({ dash: "dotted" })}>Dotted</button>
          </div>
        </div>}
        {colorOpen && <div className="popover color-popover">
          <div className="popover-label">Branch color</div>
          <div className="swatches">{COLORS.map((color) => <button key={color} aria-label={`Set branch color ${color}`} style={{ background: color }} onClick={() => changeColor(color)} />)}</div>
          <p>Applies to this node and its branch</p>
        </div>}
      </div>}

      <section ref={canvasRef} className={`canvas ${connectFrom || reparentingNode ? "connecting" : ""}`} onPointerDown={onCanvasPointerDown} onPointerMove={onPointerMove} onPointerUp={() => { dragRef.current = null; }} onPointerCancel={() => { dragRef.current = null; }} onWheel={onCanvasWheel} onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={() => { pinchRef.current = null; }} onTouchCancel={() => { pinchRef.current = null; }} onContextMenu={(e) => e.preventDefault()}>
        <div className="canvas-world" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}>
          <svg className="edges" width="1600" height="900" aria-label="Mind map connections">
            {board.edges.map((edge) => {
              const from = board.nodes.find((n) => n.id === edge.from); const to = board.nodes.find((n) => n.id === edge.to); if (!from || !to) return null;
              const path = pathFor(edge, from, to); const dash = edge.dash === "dashed" ? "10 7" : edge.dash === "dotted" ? "2 8" : undefined;
              return <g key={edge.id} className={selectedEdge === edge.id ? "edge-selected" : ""}>
                <path d={path} fill="none" stroke={edge.color} strokeWidth={selectedEdge === edge.id ? 4 : 2.5} strokeDasharray={dash} strokeLinecap="round" strokeLinejoin="round" />
                <path className="edge-hit" d={path} fill="none" stroke="transparent" strokeWidth="18" onPointerDown={(e) => { e.stopPropagation(); setSelectedEdge(edge.id); setSelectedNode(null); setLineOpen(true); }} />
              </g>;
            })}
          </svg>
          {board.nodes.map((node) => {
            const selected = selectedNode === node.id; const editing = editingNode === node.id;
            return <div key={node.id} className={`mind-node ${selected ? "selected" : ""} ${connectFrom === node.id || reparentingNode === node.id ? "connect-source" : ""}`} data-testid={`node-${node.id}`} data-plus-side={nodePlusSide?.id === node.id ? nodePlusSide.side : "right"} style={{ left: node.x, top: node.y, "--node-color": node.color } as React.CSSProperties}
              onPointerDown={(e) => onNodePointerDown(e, node)} onClick={(e) => { e.stopPropagation(); selectNode(node.id); }} onDoubleClick={(e) => { e.stopPropagation(); if (canEdit) setEditingNode(node.id); }}
              onPointerMove={(e) => updateNodePlusSide(e, node.id)}
              onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); if (canEdit) { setSelectedNode(node.id); setMenu({ x: e.clientX, y: e.clientY, nodeId: node.id }); } }}>
              {editing ? <input autoFocus value={node.text} aria-label="Node text" onFocus={(event) => { if (node.text === "New idea") event.currentTarget.select(); }} onChange={(e) => updateNodes((nodes) => nodes.map((n) => n.id === node.id ? { ...n, text: e.target.value } : n))} onBlur={() => setEditingNode(null)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === "Escape") { e.preventDefault(); setEditingNode(null); } }} /> : <span>{node.text}</span>}
              {canEdit && <button className="node-plus" aria-label={`Add child to ${node.text}`} title="Add child" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); addChild(node.id); }}>＋</button>}
            </div>;
          })}
        </div>
        <div className="canvas-hint">{reparentingNode ? "Choose a new parent node · Esc to cancel" : connectFrom ? "Choose a node to finish the connection · Esc to cancel" : canEdit ? "Select a node and press Tab to add a branch" : "You’re viewing this board"}</div>
      </section>

      <div className="zoom-controls"><button onClick={() => zoomAtCanvasCenter(-.1)} aria-label="Zoom out">−</button><span>{Math.round(zoom * 100)}%</span><button onClick={() => zoomAtCanvasCenter(.1)} aria-label="Zoom in">＋</button><button onClick={() => { setPan({ x: 0, y: 0 }); setZoom(.9); }} aria-label="Reset view">⌂</button></div>

      <div className="feedback-control">
        {feedbackOpen && <form className="feedback-popover" onSubmit={submitFeedback} role="dialog" aria-labelledby="feedback-title">
          <div className="feedback-heading"><h2 id="feedback-title">Share feedback</h2><button type="button" onClick={() => { setFeedbackOpen(false); setFeedbackError(""); }} aria-label="Close feedback form">×</button></div>
          <p>How is Mindflow working for you?</p>
          <div className="feedback-rating" aria-label="Feedback rating">
            <button type="button" className={feedbackSentiment === "like" ? "selected" : ""} aria-pressed={feedbackSentiment === "like"} onClick={() => { setFeedbackSentiment("like"); setFeedbackError(""); }}>👍 Like</button>
            <button type="button" className={feedbackSentiment === "dislike" ? "selected" : ""} aria-pressed={feedbackSentiment === "dislike"} onClick={() => { setFeedbackSentiment("dislike"); setFeedbackError(""); }}>👎 Dislike</button>
          </div>
          <label htmlFor="feedback-message">Additional feedback <span>(optional)</span></label>
          <textarea id="feedback-message" value={feedbackMessage} maxLength={MAX_FEEDBACK_LENGTH} onChange={(event) => { setFeedbackMessage(event.target.value); setFeedbackError(""); }} placeholder="Tell us more..." />
          <div className="feedback-footer"><span>{feedbackMessage.length}/{MAX_FEEDBACK_LENGTH}</span><button type="submit" disabled={feedbackSubmitting}>{feedbackSubmitting ? "Sending..." : "Submit"}</button></div>
          {feedbackError && <div className="feedback-error" role="alert">{feedbackError}</div>}
        </form>}
        <button className="feedback-button" onClick={() => { setFeedbackOpen((open) => !open); setFeedbackError(""); }} aria-expanded={feedbackOpen}>Feedback</button>
      </div>

      {menu && <div className="context-menu" style={{ left: menu.x, top: menu.y }} role="menu" onPointerDown={(e) => e.stopPropagation()}>
        <button role="menuitem" onClick={() => addChild(menu.nodeId)}><span>＋</span>Add child <kbd>Tab</kbd></button>
        <button role="menuitem" onClick={() => duplicateNode(menu.nodeId)}><span>▣</span>Duplicate <kbd>Ctrl D</kbd></button>
        <button role="menuitem" onClick={() => startConnect(menu.nodeId)}><span>⌁</span>Connect to…</button>
        {board.nodes.find((node) => node.id === menu.nodeId)?.parentId && <button role="menuitem" onClick={() => startChangeParent(menu.nodeId)}><span>↗</span>Change parent…</button>}
        <div className="menu-divider" />
        <button role="menuitem" onClick={() => { setSelectedNode(menu.nodeId); setMenu(null); setColorOpen(true); }}><span>●</span>Branch color</button>
        <button className="danger" role="menuitem" onClick={() => deleteNode(menu.nodeId)}><span>⌫</span>Delete <kbd>Del</kbd></button>
      </div>}

      {libraryOpen && <div className="library-backdrop" onMouseDown={() => setLibraryOpen(false)}>
        <aside className="library-panel" aria-label="My mind maps" onMouseDown={(e) => e.stopPropagation()}>
          <div className="library-header"><div><span>Your workspace</span><h2>My mind maps</h2></div><button onClick={() => setLibraryOpen(false)} aria-label="Close mind map list">×</button></div>
          <button className="new-map-card" onClick={newBoard} disabled={!canEdit}><span>＋</span><div><strong>New mind map</strong><small>Start with a central idea</small></div></button>
          <div className="library-label">Saved mind maps</div>
          {libraryState === "loading" && <div className="library-message">Loading your maps…</div>}
          {libraryState === "error" && <div className="library-message"><p>We couldn’t load your maps.</p><button onClick={loadLibrary}>Try again</button></div>}
          {libraryState === "idle" && maps.length === 0 && <div className="library-empty"><div>◇</div><strong>No saved maps yet</strong><p>Your changes save automatically after a short pause.</p></div>}
          {libraryState === "idle" && maps.length > 0 && <div className="map-list">{maps.map((map) => <button key={map.id} className={map.id === mapId ? "current" : ""} onClick={() => openMap(map)}>
            <span className="map-thumbnail"><i /><i /><i /></span><span className="map-details"><strong>{map.title}</strong><small>{map.id === mapId ? "Open now" : `Updated ${new Date(map.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: new Date(map.updatedAt).getFullYear() !== new Date().getFullYear() ? "numeric" : undefined })}`}</small></span><span className="map-arrow">›</span>
          </button>)}</div>}
        </aside>
      </div>}

      {shareOpen && <div className="modal-backdrop" onMouseDown={() => setShareOpen(false)}>
        <div className="share-modal" role="dialog" aria-modal="true" aria-labelledby="share-title" onMouseDown={(e) => e.stopPropagation()}>
          <button className="modal-close" onClick={() => setShareOpen(false)} aria-label="Close share dialog">×</button>
          <div className="share-icon">↗</div><h2 id="share-title">Share “{title}”</h2><p>Choose what people can do with each link.</p>
          {!mapId && canEdit && <button className="save-first" onClick={async () => { await save(); }}>Save board to create links</button>}
          <div className="link-card"><div><strong>Can view</strong><span>Anyone with this link can explore the map</span><input data-testid="view-share-url" aria-label="View-only share link" readOnly value={shareLinks.view} /></div><button onClick={() => copyLink("view")} disabled={!shareLinks.view.startsWith("http")}>Copy link</button></div>
          <div className="link-card"><div><strong>Can edit</strong><span>Anyone with this link can make changes</span><input data-testid="edit-share-url" aria-label="Editable share link" readOnly value={shareLinks.edit} /></div><button onClick={() => copyLink("edit")} disabled={!shareLinks.edit.startsWith("http")}>Copy link</button></div>
          <div className="share-note">Keep edit links private. Anyone who has one can change this board.</div>
        </div>
      </div>}

      {authOpen && <AuthDialog user={authUser} initialMode={authMode} onClose={() => setAuthOpen(false)}
        onSignedIn={(user) => { setAuthUser(user); setAuthOpen(false); flash(`Welcome, ${user.name}`); }}
        onSignedOut={() => { setAuthUser(null); setAuthOpen(false); setMaps([]); setLibraryOpen(false); flash("Signed out"); }} />}

      {toast && <div className="toast" role="status">✓ {toast}</div>}
    </main>
  );
}
