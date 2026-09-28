import type { Env, SessionCustomer } from "./types";
import { parseCookies } from "./http";

const encoder = new TextEncoder();
// Versioned hashes allow upgrading existing accounts after a successful login.
// workerd limits an individual PBKDF2 operation to 100,000 iterations.
const ITERATIONS = 100_000;

function toBase64(bytes: Uint8Array<ArrayBufferLike>): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

export async function hashPassword(password: string, salt: Uint8Array<ArrayBufferLike> = crypto.getRandomValues(new Uint8Array(16)), iterations = ITERATIONS): Promise<{ hash: string; salt: string }> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const saltBuffer = new Uint8Array(salt).buffer;
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: saltBuffer, iterations }, key, 256);
  return { hash: `pbkdf2-sha256$${iterations}$${toBase64(new Uint8Array(bits))}`, salt: toBase64(salt) };
}

export async function verifyPassword(password: string, salt: string, expectedHash: string): Promise<boolean> {
  if (typeof password !== 'string' || password.length > 128) return false;
  const parts = expectedHash.split('$');
  const iterations = parts.length === 1 ? 10000 : Number(parts[1]);
  if (![10000, ITERATIONS].includes(iterations) || (parts.length !== 1 && (parts.length !== 3 || parts[0] !== 'pbkdf2-sha256'))) return false;
  let candidate;
  try { candidate = await hashPassword(password, fromBase64(salt), iterations); } catch { return false; }
  const left = encoder.encode(candidate.hash.split('$')[2]);
  const right = encoder.encode(parts.length === 1 ? expectedHash : parts[2]);
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index++) mismatch |= left[index] ^ right[index];
  return mismatch === 0;
}

export async function upgradePassword(env: Env, id: number, password: string, oldHash: string): Promise<void> {
  if (oldHash.startsWith(`pbkdf2-sha256$${ITERATIONS}$`)) return;
  const updated = await hashPassword(password);
  await env.DB.prepare('UPDATE customers SET password_hash=?,password_salt=? WHERE id=? AND password_hash=?')
    .bind(updated.hash, updated.salt, id, oldHash).run();
}

export async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return toBase64(new Uint8Array(digest));
}

export async function createSession(env: Env, customerId: number, mfaVerified = false): Promise<{ token: string; expiresAt: string }> {
  if (!mfaVerified && await env.DB.prepare("SELECT customer_id FROM admin_mfa WHERE customer_id=? AND enabled=1").bind(customerId).first()) throw new Error("MFA_REQUIRED");
  const token = toBase64(crypto.getRandomValues(new Uint8Array(32))).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
  const tokenHash = await sha256(token);
  const customer = await env.DB.prepare('SELECT role FROM customers WHERE id=?').bind(customerId).first<{role:string}>();
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * (customer?.role === 'admin' ? 8 : 24 * 30)).toISOString();
  await env.DB.prepare("INSERT INTO sessions(customer_id, token_hash, expires_at, mfa_verified) VALUES (?, ?, ?, ?)")
    .bind(customerId, tokenHash, expiresAt, mfaVerified ? 1 : 0).run();
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
    WHERE s.token_hash = ? AND datetime(s.expires_at) > CURRENT_TIMESTAMP AND c.active = 1
    AND (c.role!='admin' OR datetime(s.created_at)>datetime('now','-8 hours'))
    AND (s.mfa_verified=1 OR NOT EXISTS(SELECT 1 FROM admin_mfa m WHERE m.customer_id=c.id AND m.enabled=1))`)
    .bind(tokenHash).first<SessionCustomer>();
}

export async function deleteCurrentSession(request: Request, env: Env): Promise<void> {
  const token = parseCookies(request).elegance_session;
  if (token) await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await sha256(token)).run();
}
