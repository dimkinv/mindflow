export type LineShape = "curve" | "straight" | "elbow";
export type LineDash = "solid" | "dashed" | "dotted";
export type NodeItem = { id: string; text: string; x: number; y: number; color: string; parentId?: string };
export type EdgeItem = { id: string; from: string; to: string; color: string; shape: LineShape; dash: LineDash; manual?: boolean };
export type BoardData = { nodes: NodeItem[]; edges: EdgeItem[] };
export const NODE_W = 176;
export const NODE_H = 48;
const uid = () => crypto.randomUUID();
export const cloneBoard = (board: BoardData): BoardData => structuredClone(board);
export function createBoard(text = "Central idea"): BoardData {
  return { nodes: [{ id: "root", text, x: 650, y: 360, color: "#7a4cff" }], edges: [] };
}

/** Checks the JSON shape and graph invariants, including parent/edge consistency. */
export function isBoardData(value: unknown): value is BoardData {
  if (!value || typeof value !== "object") return false;
  const { nodes, edges } = value as BoardData;
  if (!Array.isArray(nodes) || !Array.isArray(edges)) return false;
  if (!nodes.every(n => n && typeof n.id === "string" && n.id.length > 0 && typeof n.text === "string" && Number.isFinite(n.x) && Number.isFinite(n.y) && typeof n.color === "string" && (n.parentId === undefined || typeof n.parentId === "string"))) return false;
  const ids = new Set(nodes.map(n => n.id));
  if (ids.size !== nodes.length || new Set(edges.map(e => e?.id)).size !== edges.length) return false;
  if (!edges.every(e => e && typeof e.id === "string" && e.id.length > 0 && ids.has(e.from) && ids.has(e.to) && e.from !== e.to && typeof e.color === "string" && ["curve", "straight", "elbow"].includes(e.shape) && ["solid", "dashed", "dotted"].includes(e.dash) && (e.manual === undefined || typeof e.manual === "boolean"))) return false;
  const parents = new Map(nodes.map(n => [n.id, n.parentId]));
  for (const node of nodes) {
    const visited = new Set([node.id]);
    let parent = node.parentId;
    while (parent !== undefined) {
      if (!ids.has(parent) || visited.has(parent)) return false;
      visited.add(parent); parent = parents.get(parent);
    }
    if (node.parentId && !edges.some(e => !e.manual && e.from === node.parentId && e.to === node.id)) return false;
  }
  return edges.every(e => e.manual || parents.get(e.to) === e.from);
}

/** Repairs stale hierarchy references left by older versions of the application. */
export function normalizeBoard(board: BoardData): BoardData {
  const result = cloneBoard(board);
  const ids = new Set(result.nodes.map(n => n.id));
  result.edges = result.edges.filter(e => ids.has(e.from) && ids.has(e.to));
  for (const node of result.nodes) if (node.parentId && !ids.has(node.parentId)) delete node.parentId;
  if (!isBoardData(result)) throw new TypeError("Invalid mindmap data");
  return result;
}

export function descendantIds(board: BoardData, id: string): Set<string> {
  const ids = new Set([id]);
  let added = true;
  while (added) {
    added = false;
    for (const node of board.nodes) if (node.parentId && ids.has(node.parentId) && !ids.has(node.id)) { ids.add(node.id); added = true; }
  }
  return ids;
}
export function addChild(board: BoardData, parentId: string): { board: BoardData; nodeId: string } {
  const parent = board.nodes.find(n => n.id === parentId);
  if (!parent) throw new Error("Parent node does not exist");
  const siblings = board.nodes.filter(n => n.parentId === parentId);
  const grandparent = board.nodes.find(n => n.id === parent.parentId);
  const left = siblings.filter(n => n.x < parent.x).length;
  const direction = grandparent ? (parent.x >= grandparent.x ? 1 : -1) : (left <= siblings.length - left ? -1 : 1);
  const x = parent.x + direction * 260;
  const y = [0, 82, -82, 164, -164, 246, -246, 328, -328].map(offset => parent.y + offset).find(candidate => !board.nodes.some(n => Math.abs(n.x - x) < NODE_W + 22 && Math.abs(n.y - candidate) < NODE_H + 22)) ?? parent.y + siblings.length * 82;
  const nodeId = uid();
  return { nodeId, board: { nodes: [...board.nodes, { id: nodeId, text: "New idea", x, y, color: parent.color, parentId }], edges: [...board.edges, { id: uid(), from: parentId, to: nodeId, color: parent.color, shape: "curve", dash: "solid" }] } };
}
export function deleteNode(board: BoardData, id: string): BoardData {
  return { nodes: board.nodes.filter(n => n.id !== id).map(n => n.parentId === id ? { ...n, parentId: undefined } : n), edges: board.edges.filter(e => e.from !== id && e.to !== id) };
}
export function duplicateNode(board: BoardData, id: string): { board: BoardData; nodeId: string } {
  const node = board.nodes.find(n => n.id === id);
  if (!node) throw new Error("Node does not exist");
  const nodeId = uid();
  return { nodeId, board: { ...board, nodes: [...board.nodes, { ...node, id: nodeId, text: `${node.text} copy`, x: node.x + 34, y: node.y + 74, parentId: undefined }] } };
}
export function reparentNode(board: BoardData, id: string, parentId: string): BoardData {
  if (!board.nodes.some(n => n.id === id) || !board.nodes.some(n => n.id === parentId)) throw new Error("Node does not exist");
  if (descendantIds(board, id).has(parentId)) throw new Error("A node cannot become the parent of its own branch");
  const parent = board.nodes.find(n => n.id === parentId)!;
  return { nodes: board.nodes.map(n => n.id === id ? { ...n, parentId } : n), edges: [...board.edges.filter(e => !(e.to === id && !e.manual) && !(e.from === parentId && e.to === id)), { id: uid(), from: parentId, to: id, color: parent.color, shape: "curve", dash: "solid" }] };
}
export function connectNodes(board: BoardData, from: string, to: string): BoardData {
  if (from === to || board.edges.some(e => (e.from === from && e.to === to) || (e.from === to && e.to === from))) return board;
  const source = board.nodes.find(n => n.id === from);
  if (!source || !board.nodes.some(n => n.id === to)) throw new Error("Node does not exist");
  return { ...board, edges: [...board.edges, { id: uid(), from, to, color: source.color, shape: "curve", dash: "dashed", manual: true }] };
}
export function colorBranch(board: BoardData, id: string, color: string): BoardData {
  const ids = descendantIds(board, id);
  return { nodes: board.nodes.map(n => ids.has(n.id) ? { ...n, color } : n), edges: board.edges.map(e => ids.has(e.from) && ids.has(e.to) ? { ...e, color } : e) };
}
export function pathFor(edge: EdgeItem, from: NodeItem, to: NodeItem): string {
  const right = to.x >= from.x;
  const sx = from.x + (right ? NODE_W : 0), sy = from.y + NODE_H / 2;
  const tx = to.x + (right ? 0 : NODE_W), ty = to.y + NODE_H / 2;
  if (edge.shape === "straight") return `M ${sx} ${sy} L ${tx} ${ty}`;
  if (edge.shape === "elbow") { const mid = (sx + tx) / 2; return `M ${sx} ${sy} L ${mid} ${sy} L ${mid} ${ty} L ${tx} ${ty}`; }
  const bend = Math.max(80, Math.abs(tx - sx) * .45);
  return `M ${sx} ${sy} C ${sx + (right ? bend : -bend)} ${sy}, ${tx - (right ? bend : -bend)} ${ty}, ${tx} ${ty}`;
}
