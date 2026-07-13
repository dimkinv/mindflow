import { sql } from "drizzle-orm";
import { index, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  passwordSalt: text("password_salt").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const sessions = sqliteTable("sessions", {
  tokenHash: text("token_hash").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("sessions_user_idx").on(table.userId),
  index("sessions_expiry_idx").on(table.expiresAt),
]);

export const mindMaps = sqliteTable("mind_maps", {
  id: text("id").primaryKey(),
  ownerUserId: text("owner_user_id").references(() => users.id, { onDelete: "set null" }),
  ownerEmail: text("owner_email"),
  title: text("title").notNull(),
  data: text("data").notNull(),
  viewToken: text("view_token").notNull().unique(),
  editToken: text("edit_token").notNull().unique(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("mind_maps_owner_updated_idx").on(table.ownerEmail, table.updatedAt),
  index("mind_maps_owner_user_updated_idx").on(table.ownerUserId, table.updatedAt),
]);
