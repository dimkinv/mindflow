import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { transform } from "esbuild";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import * as mindmap from "@mindflow/mindmap";

const require = createRequire(import.meta.url);
const user = { id: "owner", name: "Owner", email: "owner@example.com" };

async function fixture(t, signedIn = true, options = {}) {
  const dom = new JSDOM('<div id="root"></div>', { url: options.url ?? "https://mindflow.test/" });
  const previous = { window: globalThis.window, document: globalThis.document, act: globalThis.IS_REACT_ACT_ENVIRONMENT };
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const timers = new Map();
  let nextTimer = 0;
  dom.window.setTimeout = (callback, delay) => { timers.set(++nextTimer, { callback, delay }); return nextTimer; };
  dom.window.clearTimeout = (id) => timers.delete(id);
  const requests = [];
  let maps = options.maps ?? [{ id: "existing", title: "My project", updatedAt: "2026-11-11", editToken: "existing-edit" }, { id: "other", title: "My ideas", updatedAt: "2026-11-08", editToken: "other-edit" }];
  let listFailure = options.listFailure ?? false;
  let canvasProps;
  const fetch = async (url, options = {}) => {
    requests.push({ url, method: options.method ?? "GET", body: options.body && JSON.parse(options.body) });
    if (url === "/api/auth/session") return Response.json({ user: signedIn ? user : null });
    if (url === "/api/auth/login") return Response.json({ user });
    if (url === "/api/maps" && options.method === "POST") {
      const payload = JSON.parse(options.body);
      const id = payload.id ?? "saved";
      if (!payload.id) maps.push({ id, title: payload.title, updatedAt: "2026-11-11", editToken: "edit" });
      return Response.json({ map: { id, editToken: "edit", viewToken: "view" } });
    }
    if (url === "/api/maps") return listFailure ? Response.json({ error: "Storage unavailable" }, { status: 500 }) : Response.json({ maps });
    if (url.startsWith("/api/maps?id=")) {
      const params = new URL(url, "https://mindflow.test").searchParams;
      const map = maps.find((map) => map.id === params.get("id"));
      if (options.method === "DELETE") { maps = maps.filter((item) => item.id !== map.id); return Response.json({ id: map.id }); }
      return Response.json({ map: { ...map, data: mindmap.createBoard("Existing idea"), viewToken: "view" }, permission: params.get("token") === "view" ? "view" : "edit" });
    }
    throw new Error(`Unexpected request: ${url}`);
  };
  const { code } = await transform(await readFile(new URL("../app/mind-map-app.tsx", import.meta.url), "utf8"), { loader: "tsx", format: "cjs", jsx: "automatic" });
  const loadedModule = { exports: {} };
  runInNewContext(code, {
    module: loadedModule, exports: loadedModule.exports, window: dom.window, fetch, Response, URLSearchParams, queueMicrotask,
    WebSocket: class { static OPEN = 1; send() {} close() {} },
    require: (name) => name === "@mindflow/mindmap" ? mindmap : name === "./mind-map-canvas" ? {
      MindMapCanvas: (props) => { canvasProps = props; return React.createElement("div", { "data-testid": "canvas", "data-readonly": String(props.readOnly) }); },
    } : require(name),
  });
  const root = createRoot(dom.window.document.getElementById("root"));
  t.after(async () => {
    await act(async () => root.unmount());
    dom.window.close();
    globalThis.window = previous.window;
    globalThis.document = previous.document;
    globalThis.IS_REACT_ACT_ENVIRONMENT = previous.act;
  });
  await act(async () => root.render(React.createElement(loadedModule.exports.MindMapApp)));
  const click = async (selector) => {
    const button = dom.window.document.querySelector(selector);
    assert.ok(button, `Missing ${selector}`);
    await act(async () => button.click());
  };
  const runAutosave = async () => {
    for (const [id, timer] of [...timers]) if (timer.delay === 1500) {
      timers.delete(id);
      await act(async () => { await timer.callback(); });
    }
  };
  return { dom, requests, timers, click, runAutosave, setListFailure: (value) => { listFailure = value; }, edit: async () => {
    await act(async () => canvasProps.onChange(mindmap.createBoard("My idea")));
  } };
}

test("restored sessions open the workspace; selecting a map loads it and edits update that map", async (t) => {
  const { dom, requests, timers, click, edit, runAutosave } = await fixture(t);
  assert.equal(dom.window.document.querySelector("#workspace-title").textContent, "My mind maps");
  assert.equal(dom.window.document.querySelectorAll(".map-row").length, 2);
  assert.equal(dom.window.document.querySelector('[data-testid="canvas"]'), null);
  assert.equal(dom.window.document.querySelector('[aria-label="Board title"]'), null);
  assert.ok(!dom.window.document.body.textContent.includes("Product launch"));
  assert.equal([...timers.values()].filter((timer) => timer.delay === 1500).length, 0);
  await runAutosave();
  assert.equal(requests.filter((request) => request.method === "POST").length, 0);
  await click('[aria-label="Open My project"]');
  assert.ok(dom.window.document.querySelector('[data-testid="canvas"]'));
  assert.equal(dom.window.document.querySelector('[aria-label="Board title"]').value, "My project");
  assert.equal(dom.window.location.search, "?map=existing&token=existing-edit");
  await runAutosave();
  assert.equal(requests.filter((request) => request.method === "POST").length, 0);
  await edit();
  await runAutosave();
  const saves = requests.filter((request) => request.method === "POST");
  assert.equal(saves.length, 1);
  assert.equal(saves[0].body.id, "existing");
  assert.equal(saves[0].body.data.nodes[0].text, "My idea");
  assert.equal(dom.window.document.querySelector(".save-status").textContent, "Saved");
});

test("signing in opens the workspace; new maps start blank and returning to the list creates nothing", async (t) => {
  const { dom, requests, click, runAutosave } = await fixture(t, false);
  assert.equal(requests.filter((request) => request.url === "/api/maps").length, 0);
  await click(".login-button");
  await act(async () => dom.window.document.querySelector(".auth-modal form").dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true })));
  await runAutosave();
  assert.equal(requests.filter((request) => request.method === "POST" && request.url === "/api/maps").length, 0);
  assert.ok(dom.window.document.querySelector(".workspace-screen"));
  assert.equal(dom.window.document.querySelector('[data-testid="canvas"]'), null);
  await click('[aria-label="New mind map"]');
  await runAutosave();
  const saves = requests.filter((request) => request.url === "/api/maps" && request.method === "POST");
  assert.equal(saves.length, 1);
  assert.equal(saves[0].body.title, "Untitled mind map");
  assert.equal(saves[0].body.data.nodes.length, 1);
  assert.equal(saves[0].body.data.nodes[0].text, "Central idea");
  await click('[aria-label="My mind maps"]');
  assert.ok(dom.window.document.querySelector(".workspace-screen"));
  assert.equal(dom.window.document.querySelector('[data-testid="canvas"]'), null);
  assert.equal(dom.window.location.search, "");
  await runAutosave();
  assert.equal(requests.filter((request) => request.method === "POST" && request.url === "/api/maps").length, 1);
  await click('[aria-label="Remove My ideas"]');
  assert.equal(dom.window.document.querySelector('[aria-label="Open My ideas"]'), null);
});

test("an empty workspace waits for the user to create their first map", async (t) => {
  const { dom, requests, runAutosave } = await fixture(t, true, { maps: [] });
  assert.match(dom.window.document.body.textContent, /Create your first mind map/);
  assert.ok(dom.window.document.querySelector('[aria-label="New mind map"]'));
  assert.equal(dom.window.document.querySelector('[data-testid="canvas"]'), null);
  await runAutosave();
  assert.equal(requests.filter((request) => request.method === "POST").length, 0);
});

test("anonymous view links still open the shared map directly without saving", async (t) => {
  const { dom, requests, runAutosave } = await fixture(t, false, { url: "https://mindflow.test/?map=existing&token=view" });
  assert.equal(dom.window.document.querySelector('[data-testid="canvas"]').getAttribute("data-readonly"), "true");
  assert.equal(dom.window.document.querySelector(".workspace-screen"), null);
  await runAutosave();
  assert.equal(requests.filter((request) => request.method === "POST").length, 0);
});

test("signed-in viewers can return to the workspace and create their own editable map", async (t) => {
  const { dom, click, runAutosave } = await fixture(t, true, { url: "https://mindflow.test/?map=existing&token=view" });
  assert.equal(dom.window.document.querySelector('[data-testid="canvas"]').getAttribute("data-readonly"), "true");
  await click('[aria-label="My mind maps"]');
  assert.ok(dom.window.document.querySelector(".workspace-screen"));
  await click('[aria-label="New mind map"]');
  assert.equal(dom.window.document.querySelector('[data-testid="canvas"]').getAttribute("data-readonly"), "false");
  await runAutosave();
  assert.equal(dom.window.document.querySelector(".save-status").textContent, "Saved");
});

test("workspace loading errors can be retried without opening or creating a map", async (t) => {
  const { dom, requests, click, setListFailure } = await fixture(t, true, { listFailure: true });
  assert.match(dom.window.document.querySelector('[role="alert"]').textContent, /couldn’t load/);
  assert.equal(dom.window.document.querySelector('[data-testid="canvas"]'), null);
  setListFailure(false);
  await click(".library-message button");
  assert.equal(dom.window.document.querySelectorAll(".map-row").length, 2);
  assert.equal(requests.filter((request) => request.method === "POST").length, 0);
});
