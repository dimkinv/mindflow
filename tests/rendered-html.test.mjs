import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("ships the complete Mindflow editor surface", async () => {
  const [page, layout, client, styles] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/mind-map-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(page, /<MindMapApp \/>/);
  assert.match(layout, /Mindflow/);
  assert.match(client, /Product launch plan/);
  assert.match(client, /Add child to \$\{node\.text\}/);
  assert.match(styles, /data-plus-side="left"/);
  assert.match(client, /Share/);
  assert.match(client, /My mind maps/);
  assert.match(client, /loadLibrary/);
  assert.match(client, /mindflow-welcome\.png/);
  assert.match(client, /Welcome to Mindflow/);
  assert.match(client, /Log in/);
  assert.match(styles, /\.canvas/);
  assert.match(styles, /\.welcome-screen/);
  assert.doesNotMatch(`${page}${layout}${client}`, /codex-preview|Your site is taking shape|react-loading-skeleton/);
});

test("ships durable user-owned multi-document storage and permissioned sharing", async () => {
  const [wrangler, worker, collaborationRoom, schema, route, client, migration, ownershipMigration, authMigration, auth, login, register] = await Promise.all([
    readFile(new URL("../wrangler.jsonc", import.meta.url), "utf8"),
    readFile(new URL("../worker/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../worker/collaboration-room.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/maps/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/mind-map-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0000_early_joystick.sql", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0001_clumsy_union_jack.sql", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0002_breezy_jack_flag.sql", import.meta.url), "utf8"),
    readFile(new URL("../app/auth.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/auth/login/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/auth/register/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(wrangler, /"binding": "DB"/);
  assert.match(wrangler, /"main": "\.\/worker\/index\.ts"/);
  assert.match(wrangler, /COLLABORATION/);
  assert.match(worker, /api\/collaboration/);
  assert.match(worker, /CollaborationRoom/);
  assert.match(collaborationRoom, /WebSocketPair/);
  assert.match(collaborationRoom, /webSocketMessage/);
  assert.match(schema, /viewToken/);
  assert.match(schema, /editToken/);
  assert.match(schema, /ownerEmail/);
  assert.match(schema, /ownerUserId/);
  assert.match(schema, /passwordHash/);
  assert.match(schema, /tokenHash/);
  assert.match(route, /eq\(mindMaps\.ownerUserId, user\.id\)/);
  assert.match(route, /eq\(mindMaps\.editToken, payload\.token\)/);
  assert.match(auth, /PBKDF2/);
  assert.match(auth, /HttpOnly; SameSite=Lax/);
  assert.match(login, /verifyPassword/);
  assert.match(register, /hashPassword/);
  assert.match(authMigration, /CREATE TABLE `users`/);
  assert.match(authMigration, /CREATE TABLE `sessions`/);
  assert.match(client, /event\.key === "Tab"/);
  assert.match(client, /\[role='dialog'\]/);
  assert.match(client, /AUTOSAVE_DELAY_MS/);
  assert.match(client, /if \(!canEdit \|\| saveState !== "unsaved"\) return/);
  assert.match(client, /data-plus-side/);
  assert.match(client, /startConnect/);
  assert.match(client, /currentTarget\.select\(\)/);
  assert.match(client, /descendantIds/);
  assert.match(client, /nodePositions/);
  assert.match(client, /onCanvasWheel/);
  assert.match(client, /onTouchMove/);
  assert.match(client, /Center on root note/);
  assert.match(client, /LocateFixed/);
  assert.match(client, /Create your account/);
  assert.match(client, /new WebSocket/);
  assert.match(client, /collaborationSocketRef/);
  assert.match(migration, /CREATE TABLE `mind_maps`/);
  assert.match(ownershipMigration, /ADD `owner_email`/);
});
