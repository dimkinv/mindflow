import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { createMindMap, createBoard, addChild } from "../dist/index.js";

function setup(options = {}) {
  const dom = new JSDOM('<div id="one"></div><div id="two"></div><input id="outside">');
  const container = dom.window.document.querySelector("#one");
  let changes = [];
  const editor = createMindMap(container, { data: createBoard(), onChange: data => changes.push(data), ...options });
  const shadow = container.firstChild.shadowRoot;
  const click = selector => shadow.querySelector(selector).click();
  const key = (element, key) => element.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
  return { dom, container, shadow, editor, changes, click, key };
}

test("mounts without a framework, edits text safely, and returns detached snapshots", () => {
  const { dom, shadow, editor, changes, click } = setup();
  click('[data-node="root"]'); click('[data-action="add"]');
  assert.equal(editor.getData().nodes.length, 2);
  const input = shadow.querySelector("input");
  input.value = '<img src=x onerror=alert(1)> & "text"';
  input.dispatchEvent(new dom.window.Event("input", { bubbles: true })); input.blur();
  assert.equal(shadow.querySelector("img"), null);
  assert.ok(shadow.textContent.includes(input.value));
  assert.equal(changes.at(-1).nodes.at(-1).text, input.value);
  const snapshot = editor.getData(); snapshot.nodes[0].text = "mutated";
  assert.equal(editor.getData().nodes[0].text, "Central idea");
  editor.destroy(); assert.equal(shadow.host.isConnected, false);
});

test("external updates emit no changes and read-only mode blocks editing", () => {
  const { editor, shadow, changes, click, key } = setup();
  editor.setData(addChild(createBoard(), "root").board);
  assert.equal(changes.length, 0);
  editor.setReadOnly(true);
  click('[data-node="root"]'); key(shadow.querySelector(".canvas"), "Delete");
  shadow.querySelector('[data-node="root"]').dispatchEvent(new shadow.host.ownerDocument.defaultView.MouseEvent("dblclick", { bubbles: true }));
  assert.equal(editor.getData().nodes.length, 2); assert.equal(shadow.querySelector("input"), null);
  assert.equal(shadow.querySelector('[data-action="add"]'), null);
  editor.setReadOnly(false); key(shadow.querySelector(".canvas"), "Delete");
  assert.equal(editor.getData().nodes.length, 1);
  editor.destroy();
});

test("two instances and host controls have isolated shortcuts and lifecycle", () => {
  const { dom, editor, shadow, key } = setup();
  const second = createMindMap(dom.window.document.querySelector("#two"));
  shadow.querySelector('[data-node="root"]').click();
  key(dom.window.document.querySelector("#outside"), "Tab");
  assert.equal(editor.getData().nodes.length, 1);
  key(shadow.querySelector(".canvas"), "Tab");
  assert.equal(editor.getData().nodes.length, 2); assert.equal(second.getData().nodes.length, 1);
  editor.destroy(); second.destroy();
  const remounted = createMindMap(dom.window.document.querySelector("#one")); remounted.destroy();
});

test("connect mode works with no initial selection and cycle prevention leaves data intact", () => {
  const child = addChild(createBoard(), "root"); const grandchild = addChild(child.board, child.nodeId);
  const { editor, shadow, click } = setup({ data: grandchild.board });
  click('[data-action="connect"]'); click('[data-node="root"]'); click(`[data-node="${grandchild.nodeId}"]`);
  assert.ok(editor.getData().edges.some(e => e.manual && e.to === grandchild.nodeId));
  const before = editor.getData();
  shadow.querySelector(`[data-node="${child.nodeId}"]`).dispatchEvent(new shadow.host.ownerDocument.defaultView.MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
  click('[data-action="reparent"]'); click(`[data-node="${grandchild.nodeId}"]`);
  assert.deepEqual(editor.getData(), before);
  assert.match(shadow.querySelector(".notice").textContent, /own branch/);
  const root = shadow.querySelector('[data-node="root"]');
  root.dispatchEvent(new shadow.host.ownerDocument.defaultView.MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
  assert.equal(shadow.querySelector('[data-action="reparent"]'), null);
  editor.destroy();
});

test("drag moves a complete branch, zoom does not change the document, and nodes keep their DOM identity", () => {
  const child = addChild(createBoard(), "root");
  const { dom, shadow, editor, changes } = setup({ data: child.board });
  const root = shadow.querySelector(".editor");
  dom.window.HTMLElement.prototype.setPointerCapture = () => {};
  dom.window.HTMLElement.prototype.hasPointerCapture = () => false;
  const node = shadow.querySelector('[data-node="root"]');
  const before = editor.getData();
  node.dispatchEvent(new dom.window.MouseEvent("pointerdown", { bubbles: true, button: 0, clientX: 100, clientY: 100 }));
  root.dispatchEvent(new dom.window.MouseEvent("pointermove", { bubbles: true, clientX: 190, clientY: 145 }));
  root.dispatchEvent(new dom.window.MouseEvent("pointerup", { bubbles: true }));
  assert.equal(shadow.querySelector('[data-node="root"]'), node);
  for (const original of before.nodes) {
    const after = editor.getData().nodes.find(n => n.id === original.id);
    assert.equal(after.x, original.x + 100); assert.equal(after.y, original.y + 50);
  }
  const count = changes.length, snapshot = editor.getData();
  shadow.querySelector(".canvas").dispatchEvent(new dom.window.WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: -100, clientX: 200, clientY: 200 }));
  assert.deepEqual(editor.getData(), snapshot); assert.equal(changes.length, count);
  assert.match(shadow.querySelector(".zoom-controls").textContent, /105%/);
  editor.destroy();
});

test("changing permissions or receiving external data cancels a gesture", () => {
  const { dom, shadow, editor, changes } = setup();
  dom.window.HTMLElement.prototype.setPointerCapture = () => {};
  dom.window.HTMLElement.prototype.hasPointerCapture = () => false;
  const start = () => shadow.querySelector('[data-node="root"]').dispatchEvent(new dom.window.MouseEvent("pointerdown", { bubbles: true, button: 0, clientX: 10, clientY: 10 }));
  start(); editor.setReadOnly(true);
  shadow.querySelector(".editor").dispatchEvent(new dom.window.MouseEvent("pointermove", { bubbles: true, clientX: 100, clientY: 100 }));
  assert.equal(changes.length, 0);
  editor.setReadOnly(false); start(); editor.setData(createBoard("Remote replacement"));
  shadow.querySelector(".editor").dispatchEvent(new dom.window.MouseEvent("pointermove", { bubbles: true, clientX: 100, clientY: 100 }));
  assert.equal(changes.length, 0); assert.equal(editor.getData().nodes[0].text, "Remote replacement");
  editor.destroy();
});
