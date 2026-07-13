import { and, eq, gt } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { getDb } from "../db";
import { sessions, users } from "../db/schema";

const SESSION_COOKIE = "mindflow_session";
const SESSION_DAYS = 30;
// Cloudflare's production workerd runtime rejects PBKDF2 counts above 100,000.
const PBKDF2_ITERATIONS = 100_000;

export type AuthUser = { id: string; email: string; name: string };

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(hex: string) {
  if (!/^[a-f0-9]+$/i.test(hex) || hex.length % 2 !== 0) return null;
  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index += 1) bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  return bytes;
}

async function derivePassword(password: string, salt: Uint8Array) {
  const pepper = (env as unknown as { PASSWORD_PEPPER?: string }).PASSWORD_PEPPER;
  if (!pepper) throw new Error("PASSWORD_PEPPER is not configured.");
  const keyMaterial = new TextEncoder().encode(`${password}\0${pepper}`);
  const key = await crypto.subtle.importKey("raw", keyMaterial, "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: PBKDF2_ITERATIONS }, key, 256);
  return new Uint8Array(bits);
}

export async function hashPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return { hash: bytesToHex(await derivePassword(password, salt)), salt: bytesToHex(salt) };
}

export async function verifyPassword(password: string, expectedHash: string, saltHex: string) {
  const salt = hexToBytes(saltHex); const expected = hexToBytes(expectedHash);
  if (!salt || !expected) return false;
  const actual = await derivePassword(password, salt);
  if (actual.length !== expected.length) return false;
  let difference = 0;
  for (let index = 0; index < actual.length; index += 1) difference |= actual[index] ^ expected[index];
  return difference === 0;
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return bytesToHex(new Uint8Array(digest));
}

function cookieValue(request: Request) {
  for (const part of (request.headers.get("cookie") ?? "").split(";")) {
    const [name, ...value] = part.trim().split("=");
    if (name === SESSION_COOKIE) {
      const token = value.join("=");
      return /^[a-f0-9]{64}$/.test(token) ? token : null;
    }
  }
  return null;
}

function cookieSecurity(request: Request) { return new URL(request.url).protocol === "https:" ? "; Secure" : ""; }

export async function createSession(request: Request, userId: string) {
  const token = bytesToHex(crypto.getRandomValues(new Uint8Array(32)));
  const expires = new Date(Date.now() + SESSION_DAYS * 86400000);
  await getDb().insert(sessions).values({ tokenHash: await sha256(token), userId, expiresAt: expires.toISOString() });
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}${cookieSecurity(request)}`;
}

export async function destroySession(request: Request) {
  const token = cookieValue(request);
  if (token) await getDb().delete(sessions).where(eq(sessions.tokenHash, await sha256(token)));
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${cookieSecurity(request)}`;
}

export async function getCurrentUser(request: Request): Promise<AuthUser | null> {
  const token = cookieValue(request); if (!token) return null;
  const tokenHash = await sha256(token);
  const [row] = await getDb().select({ id: users.id, email: users.email, name: users.name })
    .from(sessions).innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.tokenHash, tokenHash), gt(sessions.expiresAt, new Date().toISOString()))).limit(1);
  if (!row) await getDb().delete(sessions).where(eq(sessions.tokenHash, tokenHash));
  return row ?? null;
}

export function normalizeEmail(value: unknown) { return typeof value === "string" ? value.trim().toLowerCase() : ""; }
export function validEmail(email: string) { return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email); }
