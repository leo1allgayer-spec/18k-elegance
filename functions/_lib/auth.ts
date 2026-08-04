import type { Env, SessionCustomer } from "./types";
import { parseCookies } from "./http";

const encoder = new TextEncoder();
// Custo compatível com o limite de CPU do Cloudflare Pages gratuito.
const ITERATIONS = 10_000;

function toBase64(bytes: Uint8Array<ArrayBufferLike>): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

export async function hashPassword(password: string, salt: Uint8Array<ArrayBufferLike> = crypto.getRandomValues(new Uint8Array(16))): Promise<{ hash: string; salt: string }> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const saltBuffer = new Uint8Array(salt).buffer;
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: saltBuffer, iterations: ITERATIONS }, key, 256);
  return { hash: toBase64(new Uint8Array(bits)), salt: toBase64(salt) };
}

export async function verifyPassword(password: string, salt: string, expectedHash: string): Promise<boolean> {
  const candidate = await hashPassword(password, fromBase64(salt));
  const left = encoder.encode(candidate.hash);
  const right = encoder.encode(expectedHash);
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index++) mismatch |= left[index] ^ right[index];
  return mismatch === 0;
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return toBase64(new Uint8Array(digest));
}

export async function createSession(env: Env, customerId: number): Promise<{ token: string; expiresAt: string }> {
  const token = toBase64(crypto.getRandomValues(new Uint8Array(32))).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
  const tokenHash = await sha256(token);
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString();
  await env.DB.prepare("INSERT INTO sessions(customer_id, token_hash, expires_at) VALUES (?, ?, ?)")
    .bind(customerId, tokenHash, expiresAt).run();
  return { token, expiresAt };
}

export function sessionCookie(token: string, expiresAt: string): string {
  return `elegance_session=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Expires=${new Date(expiresAt).toUTCString()}`;
}

export function clearSessionCookie(): string {
  return "elegance_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0";
}

export async function currentCustomer(request: Request, env: Env): Promise<SessionCustomer | null> {
  const token = parseCookies(request).elegance_session;
  if (!token) return null;
  const tokenHash = await sha256(token);
  return env.DB.prepare(`SELECT c.id, c.name, c.email, c.phone, c.birth_date, c.role
    FROM sessions s JOIN customers c ON c.id = s.customer_id
    WHERE s.token_hash = ? AND s.expires_at > CURRENT_TIMESTAMP AND c.active = 1`)
    .bind(tokenHash).first<SessionCustomer>();
}

export async function deleteCurrentSession(request: Request, env: Env): Promise<void> {
  const token = parseCookies(request).elegance_session;
  if (token) await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await sha256(token)).run();
}
