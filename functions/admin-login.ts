import type { Env } from "./_lib/types";
import { createSession, sessionCookie, verifyPassword } from "./_lib/auth";

function redirect(location: string, cookie?: string): Response {
  const headers = new Headers({ Location: location, "Cache-Control": "no-store" });
  if (cookie) headers.set("Set-Cookie", cookie);
  return new Response(null, { status: 303, headers });
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
    return redirect("/admin?painel=1", sessionCookie(session.token, session.expiresAt));
  } catch (error) {
    console.error("Admin login error", error);
    return redirect("/admin?erro=servidor");
  }
};

export const onRequestGet: PagesFunction = async () => redirect("/admin");
