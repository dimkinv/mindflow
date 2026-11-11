import { addChild, cloneBoard, colorBranch, connectNodes, createBoard, deleteNode, descendantIds, duplicateNode, NODE_H, NODE_W, normalizeBoard, pathFor, reparentNode } from "./model.js";
import type { BoardData, LineDash, LineShape } from "./model.js";
import { styles } from "./styles.js";

export type MindMapOptions = {
  data?: BoardData;
  readOnly?: boolean;
  /** Called for local edits only. setData never emits a change. */
  onChange?: (data: BoardData) => void;
  /** The host owns persistence and decides how to handle this shortcut. */
  onSaveRequest?: () => void;
};
export type MindMapEditor = {
  getData(): BoardData;
  setData(data: BoardData): void;
  setReadOnly(readOnly: boolean): void;
  centerOnRoot(): void;
  focus(): void;
  destroy(): void;
};
const COLORS = ["#ff5c35", "#ffad1f", "#ffd43b", "#6fd83d", "#26c6b7", "#20b8e5", "#4d7df3", "#7a4cff", "#c64ee8", "#f43fa4"];
const escape = (value: string) => value.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);

/** Mounts an isolated DOM/SVG editor. The container must have a defined height. */
export function createMindMap(container: HTMLElement, options: MindMapOptions = {}): MindMapEditor {
  let board = normalizeBoard(options.data ?? createBoard());
  let readOnly = options.readOnly ?? false;
  let selectedNode: string | null = null, selectedEdge: string | null = null;
  let editingNode: string | null = null, connectFrom: string | null = null, reparentingNode: string | null = null;
  let lineOpen = false, colorOpen = false, connecting = false;
  let menu: { x: number; y: number; id: string } | null = null;
  let zoom = .9, pan = { x: 0, y: 0 }, destroyed = false;
  let drag: { startX: number; startY: number; positions?: Map<string, { x: number; y: number }>; pan: { x: number; y: number } } | null = null;
  let pinch: { distance: number; zoom: number; worldX: number; worldY: number } | null = null;
  const document = container.ownerDocument;
  const host = document.createElement("div");
  host.style.cssText = "width:100%;height:100%;";
  const shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style"); style.textContent = styles;
  const root = document.createElement("div"); root.className = "editor";
  const canvas = document.createElement("section"); canvas.className = "canvas"; canvas.tabIndex = 0; canvas.setAttribute("aria-label", "Mindmap editor");
  const world = document.createElement("div"); world.className = "canvas-world";
  const overlay = document.createElement("div");
  canvas.append(world); root.append(canvas, overlay); shadow.append(style, root); container.append(host);
  const listeners: (() => void)[] = [];
  let noticeTimeout: ReturnType<typeof setTimeout> | undefined;
  function listen<K extends keyof HTMLElementEventMap>(type: K, handler: (event: HTMLElementEventMap[K]) => void, passive = false) {
    root.addEventListener(type, handler, { passive });
    listeners.push(() => root.removeEventListener(type, handler));
  }
  function notify() { options.onChange?.(cloneBoard(board)); }
  function commit(next: BoardData) { board = next; render(); notify(); }
  function notice(message: string) {
    root.querySelector(".notice")?.remove();
    const element = document.createElement("div"); element.className = "notice"; element.setAttribute("role", "status"); element.textContent = message; root.append(element);
    clearTimeout(noticeTimeout); noticeTimeout = setTimeout(() => element.remove(), 2200);
  }
  const button = (action: string, text: string, label = text, extra = "") => `<button type="button" data-action="${action}" aria-label="${escape(label)}" ${extra}>${text}</button>`;
  function transform() { world.style.transform = `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`; }
  function render() {
    if (destroyed) return;
    if (!board.nodes.some(n => n.id === selectedNode)) selectedNode = null;
    if (!board.edges.some(e => e.id === selectedEdge)) selectedEdge = null;
    canvas.classList.toggle("connecting", !!(connecting || reparentingNode));
    const nodesById = new Map(board.nodes.map(n => [n.id, n]));
    let svg = world.querySelector("svg");
    if (!svg) {
      svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("class", "edges"); svg.setAttribute("width", "1600"); svg.setAttribute("height", "900"); svg.setAttribute("aria-label", "Mind map connections"); world.prepend(svg);
    }
    svg.innerHTML = board.edges.map(edge => {
      const from = nodesById.get(edge.from), to = nodesById.get(edge.to);
      if (!from || !to) return "";
      const path = pathFor(edge, from, to);
      const dash = edge.dash === "dashed" ? "10 7" : edge.dash === "dotted" ? "2 8" : "";
      return `<g class="${selectedEdge === edge.id ? "edge-selected" : ""}"><path d="${path}" fill="none" stroke="${escape(edge.color)}" stroke-width="${selectedEdge === edge.id ? 4 : 2.5}" stroke-dasharray="${dash}" stroke-linecap="round" stroke-linejoin="round"/><path class="edge-hit" data-edge="${escape(edge.id)}" d="${path}" fill="none" stroke="transparent" stroke-width="18"/></g>`;
    }).join("");
    const elements = new Map(Array.from(world.querySelectorAll<HTMLElement>("[data-node]")).map(element => [element.dataset.node!, element]));
    for (const [id, element] of elements) if (!nodesById.has(id)) element.remove();
    for (const node of board.nodes) {
      let element = elements.get(node.id);
      if (!element) { element = document.createElement("div"); element.dataset.node = node.id; element.dataset.testid = `node-${node.id}`; world.append(element); }
      element.className = `mind-node ${selectedNode === node.id ? "selected" : ""} ${connectFrom === node.id || reparentingNode === node.id ? "connect-source" : ""}`;
      element.style.left = `${node.x}px`; element.style.top = `${node.y}px`;
      element.style.setProperty("--node-color", node.color);
      const shouldEdit = editingNode === node.id && !readOnly;
      let input = element.querySelector("input");
      if (shouldEdit) {
        if (!input) {
          element.querySelector("span")?.remove(); input = document.createElement("input"); input.setAttribute("aria-label", "Node text"); input.value = node.text; element.prepend(input);
          input.focus(); if (node.text === "New idea") input.select();
        }
      } else {
        input?.remove(); let span = element.querySelector("span");
        if (!span) { span = document.createElement("span"); element.prepend(span); }
        span.textContent = node.text;
      }
      const plus = element.querySelector("button");
      if (readOnly) plus?.remove();
      else if (!plus) element.insertAdjacentHTML("beforeend", button("add", "＋", `Add child to ${node.text}`, 'class="node-plus" title="Add child"'));
      else plus.setAttribute("aria-label", `Add child to ${node.text}`);
    }
    transform();
    const selected = selectedNode !== null || selectedEdge !== null;
    overlay.innerHTML = `${readOnly ? "" : `<aside class="left-tools" aria-label="Canvas tools">${button("select", "↖", "Select tool", 'class="tool"')}${button("connect", "⌁", "Connect two nodes", 'class="tool"')}${button("add", "＋", "Add child node", `class="tool" ${selectedNode ? "" : "disabled"}`)}${button("center", "⊙", "Center on root note", 'class="tool"')}</aside>`}
      ${!readOnly && selected ? `<div class="format-bar">${button("line", "Line", "Line", 'class="format-button"')}${button("color", "Branch", "Branch color", `class="format-button" ${selectedNode ? "" : "disabled"}`)}${button("text", "T Text", "Edit node text", `class="format-button" ${selectedNode ? "" : "disabled"}`)}${board.edges.some(e => e.id === selectedEdge && e.manual) ? button("delete-edge", "Delete connection", "Delete connection", 'class="format-button danger"') : ""}
      ${lineOpen ? `<div class="popover line-popover"><div class="popover-label">Connector</div><div class="segmented">${button("shape-curve", "Curved")}${button("shape-straight", "Straight")}${button("shape-elbow", "Elbow")}</div><div class="popover-label">Stroke</div><div class="segmented">${button("dash-solid", "Solid")}${button("dash-dashed", "Dashed")}${button("dash-dotted", "Dotted")}</div></div>` : ""}
      ${colorOpen ? `<div class="popover color-popover"><div class="popover-label">Branch color</div><div class="swatches">${COLORS.map(color => button(`color-${color}`, "", `Set branch color ${color}`, `style="background:${color}"`)).join("")}</div><p>Applies to this node and its branch</p></div>` : ""}</div>` : ""}
      <div class="canvas-hint">${reparentingNode ? "Choose a new parent node · Esc to cancel" : connecting ? "Choose nodes to finish the connection · Esc to cancel" : readOnly ? "You’re viewing this board" : "Select a node and press Tab to add a branch"}</div>
      <div class="zoom-controls">${button("zoom-out", "−", "Zoom out")}<span>${Math.round(zoom * 100)}%</span>${button("zoom-in", "＋", "Zoom in")}${button("reset", "⌂", "Reset view")}</div>
      ${menu && !readOnly ? `<div class="context-menu" style="left:${menu.x}px;top:${menu.y}px" role="menu">${button("add", "Add child")}${button("duplicate", "Duplicate")}${button("connect", "Connect to…")}${board.nodes.find(n => n.id === menu!.id)?.parentId ? button("reparent", "Change parent…") : ""}${button("color", "Branch color")}${button("delete", "Delete")}</div>` : ""}`;

  }
  function centerOnRoot() {
    const node = board.nodes.find(n => !n.parentId) ?? board.nodes[0];
    if (!node) return;
    pan = { x: canvas.clientWidth / 2 - (node.x + NODE_W / 2) * zoom, y: canvas.clientHeight / 2 - (node.y + NODE_H / 2) * zoom }; transform();
  }
  function zoomAt(next: number, clientX: number, clientY: number) {
    const bounds = canvas.getBoundingClientRect();
    const x = clientX - bounds.left, y = clientY - bounds.top;
    next = Math.min(1.5, Math.max(.45, next));
    pan = { x: x - (x - pan.x) / zoom * next, y: y - (y - pan.y) / zoom * next }; zoom = next; render();
  }
  function selectNode(id: string) {
    if (readOnly) { selectedNode = id; selectedEdge = null; render(); return; }
    if (reparentingNode) {
      try { const next = reparentNode(board, reparentingNode, id); reparentingNode = null; commit(next); }
      catch (error) { notice((error as Error).message); }
      return;
    }
    if (connecting && !connectFrom) { connectFrom = id; render(); return; }
    if (connectFrom) { const next = connectNodes(board, connectFrom, id); connectFrom = null; connecting = false; selectedNode = id; commit(next); return; }
    selectedNode = id; selectedEdge = null; menu = null; render();
  }
  function action(name: string, id = menu?.id ?? selectedNode) {
    canvas.focus();
    if (name.startsWith("zoom-")) {
      const bounds = canvas.getBoundingClientRect(); zoomAt(zoom + (name === "zoom-in" ? .1 : -.1), bounds.left + bounds.width / 2, bounds.top + bounds.height / 2); return;
    }
    if (name === "center") { centerOnRoot(); return; }
    if (name === "reset") { zoom = .9; centerOnRoot(); render(); return; }
    if (readOnly) return;
    if (name === "add" && id) { const result = addChild(board, id); selectedNode = result.nodeId; editingNode = result.nodeId; menu = null; commit(result.board); return; }
    if (name === "duplicate" && id) { const result = duplicateNode(board, id); selectedNode = result.nodeId; menu = null; commit(result.board); return; }
    if (name === "delete" && id) { menu = null; editingNode = null; commit(deleteNode(board, id)); return; }
    if (name === "connect") { connectFrom = id; connecting = true; reparentingNode = null; notice(id ? "Now choose a second node" : "Choose the first node to connect"); }
    if (name === "reparent" && id) { reparentingNode = id; connectFrom = null; connecting = false; notice("Choose a new parent node"); }
    if (name === "select") { connectFrom = null; connecting = false; reparentingNode = null; }
    if (name === "text" && id) editingNode = id;
    if (name === "line") { lineOpen = !lineOpen; colorOpen = false; }
    if (name === "color") { selectedNode = id; colorOpen = !colorOpen; lineOpen = false; }
    if (name.startsWith("color-") && id) { colorOpen = false; commit(colorBranch(board, id, name.slice(6))); return; }
    if (name === "delete-edge") { commit({ ...board, edges: board.edges.filter(e => e.id !== selectedEdge || !e.manual) }); return; }
    if (name.startsWith("shape-") || name.startsWith("dash-")) {
      commit({ ...board, edges: board.edges.map(e => (selectedEdge ? e.id === selectedEdge : e.from === selectedNode) ? { ...e, ...(name.startsWith("shape-") ? { shape: name.slice(6) as LineShape } : { dash: name.slice(5) as LineDash }) } : e) }); return;
    }
    menu = null; render();
  }
  const target = (event: Event) => event.target as HTMLElement;
  listen("click", event => {
    const element = target(event), control = element.closest<HTMLElement>("[data-action]");
    if (control) { action(control.dataset.action!, element.closest<HTMLElement>("[data-node]")?.dataset.node); return; }
    const node = element.closest<HTMLElement>("[data-node]");
    if (node && element.tagName !== "INPUT") { selectNode(node.dataset.node!); }
  });
  listen("dblclick", event => { const node = target(event).closest<HTMLElement>("[data-node]"); if (node && !readOnly) { editingNode = node.dataset.node!; render(); } });
  listen("contextmenu", event => {
    event.preventDefault(); const node = target(event).closest<HTMLElement>("[data-node]");
    if (!node || readOnly) return;
    const bounds = root.getBoundingClientRect(); selectedNode = node.dataset.node!;
    menu = { id: selectedNode, x: Math.max(0, Math.min(event.clientX - bounds.left, root.clientWidth - 240)), y: Math.max(0, Math.min(event.clientY - bounds.top, root.clientHeight - 210)) }; render();
  });
  listen("input", event => {
    if (readOnly || !editingNode || target(event).tagName !== "INPUT") return;
    const text = (event.target as HTMLInputElement).value;
    board = { ...board, nodes: board.nodes.map(n => n.id === editingNode ? { ...n, text } : n) }; notify();
  });
  listen("focusout", event => {
    if (target(event).tagName !== "INPUT" || !editingNode) return;
    const node = board.nodes.find(n => n.id === editingNode);
    editingNode = null;
    const span = document.createElement("span"); span.textContent = node?.text ?? "";
    target(event).replaceWith(span);
  });
  listen("keydown", event => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s" && options.onSaveRequest) { event.preventDefault(); options.onSaveRequest(); return; }
    if (target(event).tagName === "INPUT") { if (event.key === "Enter" || event.key === "Escape") { event.preventDefault(); editingNode = null; render(); canvas.focus(); } return; }
    if (event.key === "Escape") { menu = null; connectFrom = null; connecting = false; reparentingNode = null; editingNode = null; render(); }
    if (target(event).closest("button")) return;
    if (event.key === "Tab" && selectedNode && !readOnly) { event.preventDefault(); action("add"); }
    if ((event.key === "Delete" || event.key === "Backspace") && selectedNode && !readOnly) { event.preventDefault(); action("delete"); }
  });
  listen("pointerdown", event => {
    const element = target(event);
    if (event.button !== 0 || element.closest("button,input,.context-menu,.format-bar,.left-tools,.zoom-controls")) return;
    canvas.focus();
    const edge = element.closest<HTMLElement>("[data-edge]");
    if (edge) { selectedEdge = edge.dataset.edge!; selectedNode = null; lineOpen = true; render(); return; }
    const node = element.closest<HTMLElement>("[data-node]");
    if (node) {
      if (readOnly || editingNode || connecting || reparentingNode) return;
      selectedNode = node.dataset.node!; selectedEdge = null; menu = null;
      const ids = descendantIds(board, node.dataset.node!);
      drag = { startX: event.clientX, startY: event.clientY, positions: new Map(board.nodes.filter(n => ids.has(n.id)).map(n => [n.id, { x: n.x, y: n.y }])), pan: { ...pan } };
    } else { selectedNode = null; selectedEdge = null; menu = null; lineOpen = false; colorOpen = false; render(); drag = { startX: event.clientX, startY: event.clientY, pan: { ...pan } }; }
    (node ?? root).setPointerCapture(event.pointerId);
    if (node) render();
  });
  listen("pointermove", event => {
    const node = target(event).closest<HTMLElement>("[data-node]");
    if (node) { const bounds = node.getBoundingClientRect(); node.dataset.plusSide = event.clientX < bounds.left + bounds.width / 2 ? "left" : "right"; }
    if (!drag || pinch) return;
    const dx = event.clientX - drag.startX, dy = event.clientY - drag.startY;
    if (drag.positions && !readOnly) {
      board = { ...board, nodes: board.nodes.map(n => { const position = drag!.positions!.get(n.id); return position ? { ...n, x: position.x + dx / zoom, y: position.y + dy / zoom } : n; }) }; render(); notify();
    } else { pan = { x: drag.pan.x + dx, y: drag.pan.y + dy }; transform(); }
  });
  listen("pointerup", event => { drag = null; const element = target(event); if (element.hasPointerCapture(event.pointerId)) element.releasePointerCapture(event.pointerId); });
  listen("pointercancel", () => { drag = null; });
  listen("wheel", event => { if (!canvas.contains(target(event))) return; event.preventDefault(); zoomAt(zoom * Math.exp(-event.deltaY * .0015), event.clientX, event.clientY); });
  listen("touchstart", event => {
    if (event.touches.length !== 2 || !canvas.contains(target(event))) return;
    const [a, b] = Array.from(event.touches), bounds = canvas.getBoundingClientRect();
    pinch = { distance: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), zoom, worldX: ((a.clientX + b.clientX) / 2 - bounds.left - pan.x) / zoom, worldY: ((a.clientY + b.clientY) / 2 - bounds.top - pan.y) / zoom }; drag = null;
  });
  listen("touchmove", event => {
    if (!pinch || event.touches.length !== 2) return;
    event.preventDefault(); const [a, b] = Array.from(event.touches), bounds = canvas.getBoundingClientRect();
    zoom = Math.min(1.5, Math.max(.45, pinch.zoom * Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) / Math.max(1, pinch.distance)));
    pan = { x: (a.clientX + b.clientX) / 2 - bounds.left - pinch.worldX * zoom, y: (a.clientY + b.clientY) / 2 - bounds.top - pinch.worldY * zoom }; render();
  });
  listen("touchend", () => { pinch = null; }); listen("touchcancel", () => { pinch = null; });
  const resizeObserver = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => { if (!drag && !pinch) centerOnRoot(); }) : null;
  resizeObserver?.observe(host);
  render(); centerOnRoot();
  return {
    getData: () => cloneBoard(board),
    setData(data) { const next = normalizeBoard(data); editingNode = null; connectFrom = null; connecting = false; reparentingNode = null; menu = null; drag = null; pinch = null; board = next; render(); },
    setReadOnly(value) { readOnly = value; if (value) { editingNode = null; connectFrom = null; connecting = false; reparentingNode = null; menu = null; drag = null; pinch = null; } render(); },
    centerOnRoot,
    focus() { canvas.focus(); },
    destroy() { destroyed = true; clearTimeout(noticeTimeout); resizeObserver?.disconnect(); listeners.forEach(remove => remove()); host.remove(); },
  };
}
