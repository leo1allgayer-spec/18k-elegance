import type { Env } from "./_lib/types";
import { createSession, sessionCookie, verifyPassword } from "./_lib/auth";

function redirect(location: string, cookie?: string): Response {
  const headers = new Headers({ Location: location, "Cache-Control": "no-store" });
  if (cookie) headers.set("Set-Cookie", cookie);
  return new Response(null, { status: 303, headers });
}

function loginSuccess(cookie: string): Response {
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="1;url=/admin?painel=1"><title>Abrindo painel</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#030b18;color:#d7b774;font:14px Arial,sans-serif;text-align:center}strong{display:block;margin-bottom:10px;font-size:20px}a{color:#d7b774}</style></head><body><div><strong>Acesso confirmado</strong><p>Abrindo o painel administrativo…</p><a href="/admin?painel=1">Continuar</a></div><script>setTimeout(function(){location.replace('/admin?painel=1')},350)</script></body></html>`;
  return new Response(html, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Set-Cookie": cookie } });
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const form = await request.formData();
    const email = String(form.get("email") || "").trim().toLowerCase();
    const password = String(form.get("password") || "");
    const record = await env.DB.prepare(`SELECT id, role, password_hash, password_salt
      FROM customers WHERE email = ? AND active = 1`).bind(email).first<Record<string, string | number>>();
    if (!record || record.role !== "admin" || !(await verifyPassword(password, String(record.password_salt), String(record.password_hash)))) {
      return redirect("/admin?erro=credenciais");
    }
    const session = await createSession(env, Number(record.id));
    return loginSuccess(sessionCookie(session.token, session.expiresAt));
  } catch (error) {
    console.error("Admin login error", error);
    return redirect("/admin?erro=servidor");
  }
};

export const onRequestGet: PagesFunction = async () => redirect("/admin");
