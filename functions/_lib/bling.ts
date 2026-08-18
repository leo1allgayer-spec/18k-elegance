import type { Env, SessionCustomer } from "./types";
import { apiError, json } from "./http";

const AUTHORIZE_URL = "https://www.bling.com.br/Api/v3/oauth/authorize";
const TOKEN_URL = "https://api.bling.com.br/Api/v3/oauth/token";

type BlingToken = {
  access_token: string;
  refresh_token: string;
  token_type?: string;
  expires_in: number;
  scope?: string;
};

const configured = (env: Env) => Boolean(env.BLING_CLIENT_ID?.trim() && env.BLING_CLIENT_SECRET?.trim());

async function ensureTables(env: Env): Promise<void> {
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS bling_oauth_states (
      state TEXT PRIMARY KEY,
      admin_customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS bling_tokens (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      access_token TEXT NOT NULL,
      refresh_token TEXT NOT NULL,
      token_type TEXT NOT NULL DEFAULT 'Bearer',
      expires_at TEXT NOT NULL,
      scope TEXT,
      connected_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
  ]);
}

function callbackUrl(request: Request): string {
  return `${new URL(request.url).origin}/api/integrations/bling/callback`;
}

function basicCredentials(env: Env): string {
  return btoa(`${env.BLING_CLIENT_ID}:${env.BLING_CLIENT_SECRET}`);
}

async function exchange(env: Env, body: URLSearchParams): Promise<BlingToken> {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Authorization": `Basic ${basicCredentials(env)}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "Accept": "application/json",
    },
    body,
  });
  const data: Partial<BlingToken> & { error?: string; error_description?: string } = await response
    .json<Partial<BlingToken> & { error?: string; error_description?: string }>().catch(() => ({}));
  if (!response.ok || !data.access_token || !data.refresh_token) {
    console.error("Bling token error", response.status, data.error, data.error_description);
    throw new Error("O Bling recusou a autorização.");
  }
  return data as BlingToken;
}

async function saveToken(env: Env, token: BlingToken): Promise<void> {
  const expiresAt = new Date(Date.now() + Math.max(60, Number(token.expires_in || 21600) - 60) * 1000).toISOString();
  await env.DB.prepare(`INSERT INTO bling_tokens(id,access_token,refresh_token,token_type,expires_at,scope)
    VALUES(1,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET access_token=excluded.access_token,
    refresh_token=excluded.refresh_token,token_type=excluded.token_type,expires_at=excluded.expires_at,
    scope=excluded.scope,updated_at=CURRENT_TIMESTAMP`)
    .bind(token.access_token, token.refresh_token, token.token_type || "Bearer", expiresAt, token.scope || null).run();
}

export async function blingConnect(request: Request, env: Env, admin: SessionCustomer): Promise<Response> {
  if (!configured(env)) return apiError("Cadastre BLING_CLIENT_ID e BLING_CLIENT_SECRET no Cloudflare.", 503, "BLING_NOT_CONFIGURED");
  await ensureTables(env);
  const state = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  await env.DB.prepare("DELETE FROM bling_oauth_states WHERE expires_at < CURRENT_TIMESTAMP").run();
  await env.DB.prepare("INSERT INTO bling_oauth_states(state,admin_customer_id,expires_at) VALUES(?,?,?)")
    .bind(state, admin.id, expiresAt).run();
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", env.BLING_CLIENT_ID!);
  url.searchParams.set("state", state);
  return Response.redirect(url.toString(), 302);
}

export async function blingCallback(request: Request, env: Env): Promise<Response> {
  if (!configured(env)) return Response.redirect(`${new URL(request.url).origin}/admin-demo.html?bling=not_configured`, 302);
  await ensureTables(env);
  const url = new URL(request.url);
  const code = url.searchParams.get("code") || "";
  const state = url.searchParams.get("state") || "";
  const record = state ? await env.DB.prepare(`SELECT state FROM bling_oauth_states
    WHERE state=? AND expires_at >= CURRENT_TIMESTAMP`).bind(state).first() : null;
  if (!code || !record) return Response.redirect(`${url.origin}/admin-demo.html?bling=invalid_state`, 302);
  await env.DB.prepare("DELETE FROM bling_oauth_states WHERE state=?").bind(state).run();
  try {
    const token = await exchange(env, new URLSearchParams({ grant_type: "authorization_code", code }));
    await saveToken(env, token);
    return Response.redirect(`${url.origin}/admin-demo.html?bling=connected`, 302);
  } catch {
    return Response.redirect(`${url.origin}/admin-demo.html?bling=error`, 302);
  }
}

export async function blingStatus(env: Env): Promise<Response> {
  await ensureTables(env);
  const token = await env.DB.prepare("SELECT connected_at,updated_at,expires_at,scope FROM bling_tokens WHERE id=1").first();
  return json({ ok: true, configured: configured(env), connected: Boolean(token), token });
}

export async function disconnectBling(env: Env): Promise<Response> {
  await ensureTables(env);
  await env.DB.prepare("DELETE FROM bling_tokens WHERE id=1").run();
  return json({ ok: true });
}

export async function blingAccessToken(env: Env): Promise<string> {
  await ensureTables(env);
  const stored = await env.DB.prepare("SELECT access_token,refresh_token,expires_at FROM bling_tokens WHERE id=1")
    .first<{ access_token: string; refresh_token: string; expires_at: string }>();
  if (!stored) throw new Error("Bling não conectado.");
  if (new Date(stored.expires_at).getTime() > Date.now()) return stored.access_token;
  const token = await exchange(env, new URLSearchParams({ grant_type: "refresh_token", refresh_token: stored.refresh_token }));
  await saveToken(env, token);
  return token.access_token;
}
