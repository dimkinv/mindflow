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

async function fixture(t, signedIn = true) {
  const dom = new JSDOM('<div id="root"></div>', { url: "https://mindflow.test/" });
  const previous = { window: globalThis.window, document: globalThis.document, act: globalThis.IS_REACT_ACT_ENVIRONMENT };
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const timers = new Map();
  let nextTimer = 0;
  dom.window.setTimeout = (callback, delay) => { timers.set(++nextTimer, { callback, delay }); return nextTimer; };
  dom.window.clearTimeout = (id) => timers.delete(id);
  const requests = [];
  let canvasProps;
  const fetch = async (url, options = {}) => {
    requests.push({ url, method: options.method ?? "GET", body: options.body && JSON.parse(options.body) });
    if (url === "/api/auth/session") return Response.json({ user: signedIn ? user : null });
    if (url === "/api/auth/login") return Response.json({ user });
    if (url === "/api/maps" && options.method === "POST") return Response.json({ map: { id: "saved", editToken: "edit", viewToken: "view" } });
    throw new Error(`Unexpected request: ${url}`);
  };
  const { code } = await transform(await readFile(new URL("../app/mind-map-app.tsx", import.meta.url), "utf8"), { loader: "tsx", format: "cjs", jsx: "automatic" });
  const loadedModule = { exports: {} };
  runInNewContext(code, {
    module: loadedModule, exports: loadedModule.exports, window: dom.window, fetch, Response, URLSearchParams, queueMicrotask,
    WebSocket: class { static OPEN = 1; send() {} close() {} },
    require: (name) => name === "@mindflow/mindmap" ? mindmap : name === "./mind-map-canvas" ? {
      MindMapCanvas: (props) => { canvasProps = props; return React.createElement("div", { "data-testid": "canvas" }); },
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
  return { dom, requests, timers, click, runAutosave, edit: async () => {
    await act(async () => canvasProps.onChange(mindmap.createBoard("My idea")));
  } };
}

test("restoring a login session does not save the untouched starter, but editing still autosaves", async (t) => {
  const { dom, requests, timers, edit, runAutosave } = await fixture(t);
  assert.equal(dom.window.document.querySelector(".save-status").textContent, "Not saved");
  assert.equal([...timers.values()].filter((timer) => timer.delay === 1500).length, 0);
  await runAutosave();
  assert.equal(requests.filter((request) => request.url === "/api/maps").length, 0);
  await edit();
  await runAutosave();
  const saves = requests.filter((request) => request.method === "POST");
  assert.equal(saves.length, 1);
  assert.equal(saves[0].body.data.nodes[0].text, "My idea");
  assert.equal(dom.window.document.querySelector(".save-status").textContent, "Saved");
});

test("signing in does not create a map, while explicitly creating a new map still saves", async (t) => {
  const { dom, requests, click, runAutosave } = await fixture(t, false);
  assert.equal(requests.filter((request) => request.url === "/api/maps").length, 0);
  await click(".login-button");
  await act(async () => dom.window.document.querySelector(".auth-modal form").dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true })));
  await runAutosave();
  assert.equal(requests.filter((request) => request.url === "/api/maps").length, 0);
  assert.equal(dom.window.document.querySelector(".save-status").textContent, "Not saved");
  await click('[aria-label="New mind map"]');
  await runAutosave();
  const saves = requests.filter((request) => request.url === "/api/maps" && request.method === "POST");
  assert.equal(saves.length, 1);
  assert.equal(saves[0].body.title, "Untitled mind map");
});
