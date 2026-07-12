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
  assert.match(client, /Share/);
  assert.match(client, /My mind maps/);
  assert.match(client, /loadLibrary/);
  assert.match(styles, /\.canvas/);
  assert.doesNotMatch(`${page}${layout}${client}`, /codex-preview|Your site is taking shape|react-loading-skeleton/);
});

test("ships durable user-owned multi-document storage and permissioned sharing", async () => {
  const [hosting, schema, route, client, migration, ownershipMigration] = await Promise.all([
    readFile(new URL("../.openai/hosting.json", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/maps/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/mind-map-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0000_early_joystick.sql", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0001_clumsy_union_jack.sql", import.meta.url), "utf8"),
  ]);
  assert.match(hosting, /"d1": "DB"/);
  assert.match(schema, /viewToken/);
  assert.match(schema, /editToken/);
  assert.match(schema, /ownerEmail/);
  assert.match(route, /eq\(mindMaps\.ownerEmail, user\.email\)/);
  assert.match(route, /eq\(mindMaps\.editToken, payload\.token\)/);
  assert.match(client, /event\.key === "Tab"/);
  assert.match(client, /startConnect/);
  assert.match(migration, /CREATE TABLE `mind_maps`/);
  assert.match(ownershipMigration, /ADD `owner_email`/);
});
