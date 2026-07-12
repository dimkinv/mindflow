"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type LineShape = "curve" | "straight" | "elbow";
type LineDash = "solid" | "dashed" | "dotted";
type NodeItem = { id: string; text: string; x: number; y: number; color: string; parentId?: string };
type EdgeItem = { id: string; from: string; to: string; color: string; shape: LineShape; dash: LineDash; manual?: boolean };
type BoardData = { nodes: NodeItem[]; edges: EdgeItem[] };

const COLORS = ["#ff5c35", "#ffad1f", "#ffd43b", "#6fd83d", "#26c6b7", "#20b8e5", "#4d7df3", "#7a4cff", "#c64ee8", "#f43fa4"];
const NODE_W = 176;
const NODE_H = 48;

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

export function MindMapApp() {
  const [board, setBoard] = useState<BoardData>(cloneStarter);
  const [title, setTitle] = useState("Product launch plan");
  const [selectedNode, setSelectedNode] = useState<string | null>("root");
  const [selectedEdge, setSelectedEdge] = useState<string | null>(null);
  const [editingNode, setEditingNode] = useState<string | null>(null);
  const [lineOpen, setLineOpen] = useState(false);
  const [colorOpen, setColorOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number; nodeId: string } | null>(null);
  const [connectFrom, setConnectFrom] = useState<string | null>(null);
  const [mapId, setMapId] = useState<string | null>(null);
  const [editToken, setEditToken] = useState<string | null>(null);
  const [viewToken, setViewToken] = useState<string | null>(null);
  const [permission, setPermission] = useState<"edit" | "view">("edit");
  const [saveState, setSaveState] = useState<"saved" | "saving" | "unsaved" | "error">("unsaved");
  const [toast, setToast] = useState("");
  const [zoom, setZoom] = useState(0.9);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [loading, setLoading] = useState(true);
  const canvasRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ id?: string; startX: number; startY: number; nodeX?: number; nodeY?: number; panX?: number; panY?: number } | null>(null);
  const canEdit = permission === "edit";

  const flash = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2200);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("map");
    const token = params.get("token");
    if (!id || !token) { setLoading(false); return; }
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
    setConnectFrom(nodeId ?? selectedNode); setMenu(null); setSelectedEdge(null);
    flash(nodeId || selectedNode ? "Now choose a second node" : "Choose the first node to connect");
  };

  const selectNode = (nodeId: string) => {
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

  const save = async () => {
    if (!canEdit) return;
    setSaveState("saving");
    try {
      const res = await fetch("/api/maps", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: mapId, token: editToken, title, data: board }) });
      const body = await res.json(); if (!res.ok) throw new Error(body.error);
      const result = body.map; setMapId(result.id); setEditToken(result.editToken); setViewToken(result.viewToken); setSaveState("saved");
      const next = `?map=${encodeURIComponent(result.id)}&token=${encodeURIComponent(result.editToken)}`;
      window.history.replaceState({}, "", next); flash("Board saved");
    } catch (error) { setSaveState("error"); flash(error instanceof Error ? error.message : "Could not save this board."); }
  };

  const newBoard = () => {
    if (!canEdit || (saveState === "unsaved" && !window.confirm("Start a new board and discard unsaved changes?"))) return;
    setBoard({ nodes: [{ id: "root", text: "Central idea", x: 650, y: 360, color: "#7a4cff" }], edges: [] });
    setTitle("Untitled mind map"); setMapId(null); setEditToken(null); setViewToken(null); setSelectedNode("root"); setSaveState("unsaved");
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
      if (event.key === "Escape") { setMenu(null); setConnectFrom(null); setEditingNode(null); }
      if (event.key === "Tab" && selectedNode && !editingNode && canEdit) { event.preventDefault(); addChild(selectedNode); }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") { event.preventDefault(); save(); }
      if ((event.key === "Delete" || event.key === "Backspace") && selectedNode && !editingNode && canEdit) deleteNode(selectedNode);
    };
    window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey);
  });

  const onNodePointerDown = (event: React.PointerEvent, node: NodeItem) => {
    if (!canEdit || editingNode) return;
    event.stopPropagation();
    dragRef.current = { id: node.id, startX: event.clientX, startY: event.clientY, nodeX: node.x, nodeY: node.y };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: React.PointerEvent) => {
    const drag = dragRef.current; if (!drag) return;
    if (drag.id) {
      const dx = (event.clientX - drag.startX) / zoom; const dy = (event.clientY - drag.startY) / zoom;
      updateNodes((nodes) => nodes.map((n) => n.id === drag.id ? { ...n, x: (drag.nodeX ?? 0) + dx, y: (drag.nodeY ?? 0) + dy } : n));
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

  if (loading) return <main className="loading"><div className="brand-mark">M</div><p>Opening your board…</p></main>;

  return (
    <main className="app-shell" data-permission={permission}>
      <header className="topbar">
        <div className="brand-mark" aria-label="Mindflow">M</div>
        <button className="icon-button" onClick={newBoard} disabled={!canEdit} aria-label="New mind map" title="New mind map">＋</button>
        <div className="title-wrap">
          <input aria-label="Board title" value={title} disabled={!canEdit} onChange={(e) => { setTitle(e.target.value); markChanged(); }} />
          <span className={`save-status ${saveState}`}>{saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved" : saveState === "error" ? "Save failed" : "Unsaved"}</span>
        </div>
        <div className="top-actions">
          {!canEdit && <span className="view-badge">View only</span>}
          <button className="secondary-button" onClick={save} disabled={!canEdit || saveState === "saving"}>{saveState === "saving" ? "Saving…" : "Save"}</button>
          <button className="share-button" onClick={() => setShareOpen(true)}>Share</button>
        </div>
      </header>

      {canEdit && <aside className="left-tools" aria-label="Canvas tools">
        <button className="tool active" aria-label="Select tool" title="Select">↖</button>
        <button className={`tool ${connectFrom !== null ? "active" : ""}`} onClick={() => startConnect()} aria-label="Connect two nodes" title="Connect nodes">⌁</button>
        <button className="tool" onClick={() => selectedNode && addChild(selectedNode)} disabled={!selectedNode} aria-label="Add child node" title="Add child (Tab)">＋</button>
      </aside>}

      {canEdit && (selectedNode || selectedEdge) && <div className="format-bar">
        <button className="format-button" onClick={() => { setLineOpen(!lineOpen); setColorOpen(false); }} aria-expanded={lineOpen}><span className="line-sample" /> Line</button>
        <button className="format-button" onClick={() => { setColorOpen(!colorOpen); setLineOpen(false); }} disabled={!selectedNode} aria-expanded={colorOpen}><span className="color-dot" style={{ background: board.nodes.find((n) => n.id === selectedNode)?.color }} /> Branch</button>
        <button className="format-button" onClick={() => selectedNode && setEditingNode(selectedNode)} disabled={!selectedNode}>T Text</button>
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

      <section ref={canvasRef} className={`canvas ${connectFrom ? "connecting" : ""}`} onPointerDown={onCanvasPointerDown} onPointerMove={onPointerMove} onPointerUp={() => { dragRef.current = null; }} onPointerCancel={() => { dragRef.current = null; }} onContextMenu={(e) => e.preventDefault()}>
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
            return <div key={node.id} className={`mind-node ${selected ? "selected" : ""} ${connectFrom === node.id ? "connect-source" : ""}`} data-testid={`node-${node.id}`} style={{ left: node.x, top: node.y, "--node-color": node.color } as React.CSSProperties}
              onPointerDown={(e) => onNodePointerDown(e, node)} onClick={(e) => { e.stopPropagation(); selectNode(node.id); }} onDoubleClick={(e) => { e.stopPropagation(); if (canEdit) setEditingNode(node.id); }}
              onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); if (canEdit) { setSelectedNode(node.id); setMenu({ x: e.clientX, y: e.clientY, nodeId: node.id }); } }}>
              {editing ? <input autoFocus value={node.text} aria-label="Node text" onChange={(e) => updateNodes((nodes) => nodes.map((n) => n.id === node.id ? { ...n, text: e.target.value } : n))} onBlur={() => setEditingNode(null)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === "Escape") { e.preventDefault(); setEditingNode(null); } }} /> : <span>{node.text}</span>}
              {canEdit && <button className="node-plus" aria-label={`Add child to ${node.text}`} title="Add child" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); addChild(node.id); }}>＋</button>}
            </div>;
          })}
        </div>
        <div className="canvas-hint">{connectFrom ? "Choose a node to finish the connection · Esc to cancel" : canEdit ? "Select a node and press Tab to add a branch" : "You’re viewing this board"}</div>
      </section>

      <div className="zoom-controls"><button onClick={() => setZoom((z) => Math.max(.45, z - .1))} aria-label="Zoom out">−</button><span>{Math.round(zoom * 100)}%</span><button onClick={() => setZoom((z) => Math.min(1.5, z + .1))} aria-label="Zoom in">＋</button><button onClick={() => { setPan({ x: 0, y: 0 }); setZoom(.9); }} aria-label="Reset view">⌂</button></div>

      {menu && <div className="context-menu" style={{ left: menu.x, top: menu.y }} role="menu" onPointerDown={(e) => e.stopPropagation()}>
        <button role="menuitem" onClick={() => addChild(menu.nodeId)}><span>＋</span>Add child <kbd>Tab</kbd></button>
        <button role="menuitem" onClick={() => duplicateNode(menu.nodeId)}><span>▣</span>Duplicate <kbd>Ctrl D</kbd></button>
        <button role="menuitem" onClick={() => startConnect(menu.nodeId)}><span>⌁</span>Connect to…</button>
        <div className="menu-divider" />
        <button role="menuitem" onClick={() => { setSelectedNode(menu.nodeId); setMenu(null); setColorOpen(true); }}><span>●</span>Branch color</button>
        <button className="danger" role="menuitem" onClick={() => deleteNode(menu.nodeId)}><span>⌫</span>Delete <kbd>Del</kbd></button>
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

      {toast && <div className="toast" role="status">✓ {toast}</div>}
    </main>
  );
}
