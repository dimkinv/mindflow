import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile, readdir } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { transform } from "esbuild";
import { drizzle } from "drizzle-orm/sqlite-proxy";
import * as model from "@mindflow/mindmap/model";

const require = createRequire(import.meta.url);

async function loadTypescript(path, imports = {}) {
  const source = await readFile(new URL(path, import.meta.url), "utf8");
  const { code } = await transform(source, { loader: "ts", format: "cjs" });
  const loadedModule = { exports: {} };
  runInNewContext(code, { module: loadedModule, exports: loadedModule.exports, require: (name) => imports[name] ?? require(name), Request, Response, Headers, URL, TextEncoder, crypto });
  return loadedModule.exports;
}

async function fixture() {
  const sqlite = new DatabaseSync(":memory:");
  const migrations = (await readdir(new URL("../drizzle/", import.meta.url))).filter((file) => file.endsWith(".sql")).sort();
  for (const file of migrations) sqlite.exec(await readFile(new URL(`../drizzle/${file}`, import.meta.url), "utf8"));
  const schema = await loadTypescript("../db/schema.ts");
  const db = drizzle(async (query, params, method) => {
    const statement = sqlite.prepare(query);
    if (method === "run") { statement.run(...params); return { rows: [] }; }
    if (method === "get") {
      const row = statement.get(...params);
      return { rows: row ? Object.values(row) : [] };
    }
    return { rows: statement.all(...params).map((row) => Object.values(row)) };
  });
  const owner = { id: "owner", email: "owner@example.com", name: "Owner" };
  let user = owner;
  sqlite.prepare("INSERT INTO users (id, email, name, password_hash, password_salt) VALUES (?, ?, ?, ?, ?)").run(owner.id, owner.email, owner.name, "hash", "salt");
  const board = model.createBoard();
  const data = JSON.stringify(board);
  const insert = sqlite.prepare("INSERT INTO mind_maps (id, owner_user_id, owner_email, title, data, view_token, edit_token) VALUES (?, ?, ?, ?, ?, ?, ?)");
  insert.run("map", owner.id, owner.email, "My map", data, "view", "edit");
  insert.run("legacy", null, "OWNER@EXAMPLE.COM", "Legacy map", data, "legacy-view", "legacy-edit");
  const route = await loadTypescript("../app/api/maps/route.ts", {
    "../../../db": { getDb: () => db },
    "../../../db/schema": schema,
    "../../auth": { getCurrentUser: async () => user },
    "@mindflow/mindmap/model": model,
  });
  const request = (query = "", method = "GET", payload) => new Request(`https://mindflow.test/api/maps${query}`, {
    method, ...(payload ? { headers: { "content-type": "application/json" }, body: JSON.stringify(payload) } : {}),
  });
  return { sqlite, route, request, board, data, setUser: (value) => { user = value; } };
}

test("soft removal retains data but hides the map and revokes shared reads and saves", async (t) => {
  const { sqlite, route, request, board, data } = await fixture();
  t.after(() => sqlite.close());
  assert.equal((await route.DELETE(request("?id=map", "DELETE"))).status, 200);
  const stored = sqlite.prepare("SELECT data, deleted_at FROM mind_maps WHERE id = 'map'").get();
  assert.equal(stored.data, data);
  assert.ok(stored.deleted_at);
  const { maps } = await (await route.GET(request())).json();
  assert.deepEqual(maps.map((map) => map.id), ["legacy"]);
  for (const token of ["view", "edit"]) assert.equal((await route.GET(request(`?id=map&token=${token}`))).status, 404);
  assert.equal((await route.POST(request("", "POST", { id: "map", token: "edit", title: "Changed", data: board }))).status, 403);
  assert.equal(sqlite.prepare("SELECT data, title FROM mind_maps WHERE id = 'map'").get().title, "My map");
  assert.equal((await route.DELETE(request("?id=map", "DELETE"))).status, 404);
  assert.equal((await route.GET(request("?id=legacy&token=legacy-view"))).status, 200);
});

test("removal requires the owner session and supports unclaimed legacy ownership", async (t) => {
  const { sqlite, route, request, setUser } = await fixture();
  t.after(() => sqlite.close());
  setUser(null);
  assert.equal((await route.DELETE(request("?id=map&token=edit", "DELETE"))).status, 401);
  setUser({ id: "other", email: "other@example.com", name: "Other" });
  assert.equal((await route.DELETE(request("?id=map&token=edit", "DELETE"))).status, 404);
  assert.equal(sqlite.prepare("SELECT deleted_at FROM mind_maps WHERE id = 'map'").get().deleted_at, null);
  setUser({ id: "other", email: "owner@example.com", name: "Other" });
  assert.equal((await route.DELETE(request("?id=map", "DELETE"))).status, 404);
  assert.equal((await route.DELETE(request("?id=legacy", "DELETE"))).status, 200);
  assert.equal((await route.DELETE(request("", "DELETE"))).status, 400);
});

test("removed maps reject new collaboration connections", async (t) => {
  const { sqlite, route, request } = await fixture();
  t.after(() => sqlite.close());
  await route.DELETE(request("?id=map", "DELETE"));
  let connections = 0;
  const worker = await loadTypescript("../worker/index.ts", {
    "vinext/server/app-router-entry": { fetch: () => new Response("App") },
    "./collaboration-room": { CollaborationRoom: class {} },
  });
  const env = {
    DB: { prepare: (query) => ({ bind: (id) => ({ first: async () => sqlite.prepare(query).get(id) }) }) },
    COLLABORATION: { idFromName: (id) => id, get: () => ({ fetch: async () => { connections++; return new Response("Connected"); } }) },
  };
  const connect = (id, token) => worker.default.fetch(new Request(`https://mindflow.test/api/collaboration?map=${id}&token=${token}`, { headers: { Upgrade: "websocket" } }), env, {});
  assert.equal((await connect("map", "edit")).status, 403);
  assert.equal((await connect("map", "view")).status, 403);
  assert.equal(connections, 0);
  assert.equal((await connect("legacy", "legacy-edit")).status, 200);
  assert.equal(connections, 1);
});
