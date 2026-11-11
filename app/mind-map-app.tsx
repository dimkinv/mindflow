"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isBoardData, createBoard, type BoardData, type EdgeItem } from "@mindflow/mindmap";
import { MindMapCanvas } from "./mind-map-canvas";

type MapSummary = { id: string; title: string; updatedAt: string; editToken: string };
type AuthUser = { id: string; name: string; email: string };
type CollaborationMessage = { type?: "board"; board?: BoardData; title?: string };

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
  const [shareOpen, setShareOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [maps, setMaps] = useState<MapSummary[]>([]);
  const [removingMapId, setRemovingMapId] = useState<string | null>(null);
  const removedMapIdsRef = useRef(new Set<string>());
  const [libraryState, setLibraryState] = useState<"idle" | "loading" | "error">("idle");
  const [mapId, setMapId] = useState<string | null>(null);
  const [editToken, setEditToken] = useState<string | null>(null);
  const [viewToken, setViewToken] = useState<string | null>(null);
  const [permission, setPermission] = useState<"edit" | "view">("edit");
  const [saveState, setSaveState] = useState<"idle" | "saved" | "saving" | "unsaved" | "error">("idle");
  const [toast, setToast] = useState("");
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
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackSentiment, setFeedbackSentiment] = useState<"like" | "dislike" | null>(null);
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const [feedbackError, setFeedbackError] = useState("");
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false);
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
        setSaveState("saved");
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

  const onBoardChange = useCallback((data: BoardData) => {
    setBoard(data); setSaveState("unsaved");
  }, []);

  const loadLibrary = async () => {
    setLibraryOpen(true); setLibraryState("loading");
    try {
      const res = await fetch("/api/maps");
      const body = await res.json();
      if (res.status === 401) { setLibraryOpen(false); setLibraryState("idle"); setAuthMode("login"); setAuthOpen(true); flash("Sign in to see your saved maps"); return; }
      if (!res.ok) throw new Error(body.error);
      setMaps(body.maps.filter((map: MapSummary) => !removedMapIdsRef.current.has(map.id))); setLibraryState("idle");
    } catch (error) {
      setLibraryState("error"); flash(error instanceof Error ? error.message : "Could not load your mind maps.");
    }
  };

  const openMap = (map: MapSummary) => {
    if (saveState === "unsaved" && !window.confirm("Open this mind map and discard unsaved changes?")) return;
    window.location.assign(`${window.location.pathname}?map=${encodeURIComponent(map.id)}&token=${encodeURIComponent(map.editToken)}`);
  };

  const removeMap = async (map: MapSummary) => {
    if (removingMapId || removedMapIdsRef.current.has(map.id)) return;
    removedMapIdsRef.current.add(map.id);
    setRemovingMapId(map.id);
    try {
      const response = await fetch(`/api/maps?id=${encodeURIComponent(map.id)}`, { method: "DELETE" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      setMaps((current) => current.filter((item) => item.id !== map.id));
      if (map.id === mapId) {
        collaborationSocketRef.current?.close();
        setBoard(createBoard()); setTitle("Untitled mind map");
        setMapId(null); setEditToken(null); setViewToken(null); setPermission("edit");
        setSaveState("saved"); setShareOpen(false);
        window.history.replaceState({}, "", window.location.pathname);
      }
      flash("Mind map removed");
    } catch (error) {
      removedMapIdsRef.current.delete(map.id);
      if (map.id === mapId) setSaveState("unsaved");
      flash(error instanceof Error ? error.message : "Could not remove this mind map.");
    } finally {
      setRemovingMapId(null);
    }
  };

  const save = useCallback(async (announce = true) => {
    if (!canEdit || saveState === "saving") return;
    if (loading || !authReady) return;
    if (mapId && removedMapIdsRef.current.has(mapId)) return;
    setSaveState("saving");
    try {
      const res = await fetch("/api/maps", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: mapId, token: editToken, title, data: board }) });
      const body = await res.json();
      if (mapId && removedMapIdsRef.current.has(mapId)) return;
      if (res.status === 401) { setSaveState("unsaved"); setAuthMode("login"); setAuthOpen(true); flash("Sign in to save this board"); return; }
      if (!res.ok) throw new Error(body.error);
      const result = body.map; setMapId(result.id); setEditToken(result.editToken); setViewToken(result.viewToken); setSaveState("saved");
      setMaps((current) => [{ id: result.id, title, updatedAt: new Date().toISOString(), editToken: result.editToken }, ...current.filter((map) => map.id !== result.id)]);
      const next = `?map=${encodeURIComponent(result.id)}&token=${encodeURIComponent(result.editToken)}`;
      window.history.replaceState({}, "", next); if (announce) flash("Board saved");
    } catch (error) {
      if (mapId && removedMapIdsRef.current.has(mapId)) return;
      setSaveState("error"); flash(error instanceof Error ? error.message : "Could not save this board.");
    }
  }, [authReady, board, canEdit, editToken, flash, loading, mapId, saveState, title]);

  useEffect(() => {
    if (!canEdit || saveState !== "unsaved") return;
    if (loading || !authReady || (!authUser && !mapId)) return;
    const timeout = window.setTimeout(() => { void save(false); }, AUTOSAVE_DELAY_MS);
    return () => window.clearTimeout(timeout);
  }, [authReady, authUser, canEdit, loading, mapId, save, saveState]);

  useEffect(() => {
    const socket = collaborationSocketRef.current;
    if (!canEdit || !mapId || socket?.readyState !== WebSocket.OPEN) return;
    if (receivedRemoteUpdateRef.current) { receivedRemoteUpdateRef.current = false; return; }
    socket.send(JSON.stringify({ type: "board", board, title }));
  }, [board, canEdit, mapId, title]);

  const newBoard = () => {
    if (removingMapId) return;
    if (!canEdit || (saveState === "unsaved" && !window.confirm("Start a new board and discard unsaved changes?"))) return;
    setBoard(createBoard());
    setTitle("Untitled mind map"); setMapId(null); setEditToken(null); setViewToken(null); setSaveState("unsaved");
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
            <span className={`save-status ${saveState}`}>{saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved" : saveState === "error" ? "Save failed" : saveState === "idle" ? "Not saved" : "Unsaved"}</span>
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

      <div className="mindmap-container">
        <MindMapCanvas data={board} readOnly={!canEdit} onChange={onBoardChange} onSaveRequest={() => { void save(); }} />
      </div>

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

      {libraryOpen && <div className="library-backdrop" onMouseDown={() => setLibraryOpen(false)}>
        <aside className="library-panel" aria-label="My mind maps" onMouseDown={(e) => e.stopPropagation()}>
          <div className="library-header"><div><span>Your workspace</span><h2>My mind maps</h2></div><button onClick={() => setLibraryOpen(false)} aria-label="Close mind map list">×</button></div>
          <button className="new-map-card" onClick={newBoard} disabled={!canEdit || removingMapId !== null}><span>＋</span><div><strong>New mind map</strong><small>Start with a central idea</small></div></button>
          <div className="library-label">Saved mind maps</div>
          {libraryState === "loading" && <div className="library-message">Loading your maps…</div>}
          {libraryState === "error" && <div className="library-message"><p>We couldn’t load your maps.</p><button onClick={loadLibrary}>Try again</button></div>}
          {libraryState === "idle" && maps.length === 0 && <div className="library-empty"><div>◇</div><strong>No saved maps yet</strong><p>Your changes save automatically after a short pause.</p></div>}
          {libraryState === "idle" && maps.length > 0 && <div className="map-list">{maps.map((map) => <div key={map.id} className={`map-row${map.id === mapId ? " current" : ""}`}>
            <button className="map-open" onClick={() => openMap(map)} disabled={removingMapId !== null}>
            <span className="map-thumbnail"><i /><i /><i /></span><span className="map-details"><strong>{map.title}</strong><small>{map.id === mapId ? "Open now" : `Updated ${new Date(map.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: new Date(map.updatedAt).getFullYear() !== new Date().getFullYear() ? "numeric" : undefined })}`}</small></span><span className="map-arrow">›</span>
            </button>
            <button className="map-remove" onClick={() => { void removeMap(map); }} disabled={removingMapId !== null || (map.id === mapId && saveState === "saving")} aria-label={`Remove ${map.title}`} title="Remove mind map">×</button>
          </div>)}</div>}
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
