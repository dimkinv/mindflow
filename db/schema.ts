import { sql } from "drizzle-orm";
import { index, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const mindMaps = sqliteTable("mind_maps", {
  id: text("id").primaryKey(),
  ownerEmail: text("owner_email"),
  title: text("title").notNull(),
  data: text("data").notNull(),
  viewToken: text("view_token").notNull().unique(),
  editToken: text("edit_token").notNull().unique(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("mind_maps_owner_updated_idx").on(table.ownerEmail, table.updatedAt)]);
