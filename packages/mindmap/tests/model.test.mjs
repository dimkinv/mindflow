import assert from "node:assert/strict";
import test from "node:test";
import { addChild, cloneBoard, colorBranch, connectNodes, createBoard, deleteNode, duplicateNode, isBoardData, normalizeBoard, reparentNode } from "../dist/model.js";

test("graph operations preserve the schema and leave their input unchanged", () => {
  const initial = createBoard(); const before = cloneBoard(initial);
  const child = addChild(initial, "root"); const grandchild = addChild(child.board, child.nodeId);
  assert.deepEqual(initial, before);
  assert.ok(isBoardData(grandchild.board));
  const colored = colorBranch(grandchild.board, child.nodeId, "red");
  assert.equal(colored.nodes.find(n => n.id === grandchild.nodeId).color, "red");
  assert.equal(colored.nodes.find(n => n.id === "root").color, "#7a4cff");
  assert.throws(() => reparentNode(colored, "root", grandchild.nodeId), /own branch/);
  const copy = duplicateNode(colored, child.nodeId);
  const moved = reparentNode(copy.board, grandchild.nodeId, copy.nodeId);
  assert.ok(isBoardData(moved));
  const linked = connectNodes(moved, "root", grandchild.nodeId);
  assert.ok(linked.edges.some(e => e.manual));
  assert.ok(isBoardData(linked));
});

test("deleting a parent detaches surviving children and removes incident edges", () => {
  const child = addChild(createBoard(), "root"); const grandchild = addChild(child.board, child.nodeId);
  const result = deleteNode(grandchild.board, child.nodeId);
  assert.equal(result.nodes.find(n => n.id === grandchild.nodeId).parentId, undefined);
  assert.ok(isBoardData(result));
  assert.ok(isBoardData(normalizeBoard({ ...result, nodes: result.nodes.map(n => n.id === grandchild.nodeId ? { ...n, parentId: "deleted-parent" } : n) })));
});

test("invalid geometry, cycles, duplicate IDs, and inconsistent edges are rejected", () => {
  assert.equal(isBoardData({ nodes: [{}], edges: [] }), false);
  const initial = createBoard();
  assert.equal(isBoardData({ ...initial, nodes: [...initial.nodes, initial.nodes[0]] }), false);
  assert.equal(isBoardData({ ...initial, nodes: [{ ...initial.nodes[0], x: Infinity }] }), false);
  assert.equal(isBoardData({ ...initial, nodes: [{ ...initial.nodes[0], parentId: "root" }] }), false);
  const child = addChild(initial, "root");
  assert.equal(isBoardData({ ...child.board, edges: [] }), false);
  assert.throws(() => normalizeBoard({ nodes: [{}], edges: [] }), /Invalid mindmap/);
});
