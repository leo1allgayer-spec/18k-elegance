import type { Env } from "../_lib/types";
import { apiError, json, normalizeEmail, readJson } from "../_lib/http";
import { clearSessionCookie, createSession, currentCustomer, deleteCurrentSession, hashPassword, sessionCookie, verifyPassword } from "../_lib/auth";

type RegisterBody = { name?: string; email?: string; phone?: string; birth_date?: string; password?: string };
type LoginBody = { email?: string; password?: string };

function pathParts(request: Request): string[] {
  const path = new URL(request.url).pathname.replace(/^\/api\/?/, "");
  return path ? path.split("/").map(decodeURIComponent) : [];
}

async function categories(env: Env): Promise<Response> {
  const result = await env.DB.prepare("SELECT id, name, slug, description FROM categories WHERE active = 1 ORDER BY sort_order, name").all();
  return json({ ok: true, categories: result.results }, 200, { "Cache-Control": "public, max-age=300" });
}

async function products(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const category = url.searchParams.get("category");
  const search = url.searchParams.get("q")?.trim();
  const featured = url.searchParams.get("featured");
  const conditions = ["p.active = 1"];
  const bindings: unknown[] = [];
  if (category) { conditions.push("c.slug = ?"); bindings.push(category); }
  if (search) { conditions.push("(p.name LIKE ? OR p.description LIKE ? OR p.sku LIKE ?)"); bindings.push(`%${search}%`, `%${search}%`, `%${search}%`); }
  if (featured === "1") conditions.push("p.featured = 1");
  const statement = env.DB.prepare(`SELECT p.id, p.name, p.slug, p.sku, p.description, p.price_cents, p.pix_price_cents,
    p.featured, c.name AS category_name, c.slug AS category_slug,
    (SELECT url FROM product_images WHERE product_id = p.id ORDER BY sort_order, id LIMIT 1) AS image_url,
    COALESCE((SELECT SUM(stock) FROM product_variants WHERE product_id = p.id AND active = 1), 0) AS stock
    FROM products p LEFT JOIN categories c ON c.id = p.category_id
    WHERE ${conditions.join(" AND ")} ORDER BY p.featured DESC, p.created_at DESC LIMIT 100`).bind(...bindings);
  const result = await statement.all();
  return json({ ok: true, products: result.results }, 200, { "Cache-Control": "public, max-age=60" });
}

async function productBySlug(slug: string, env: Env): Promise<Response> {
  const product = await env.DB.prepare(`SELECT p.*, c.name AS category_name, c.slug AS category_slug
    FROM products p LEFT JOIN categories c ON c.id = p.category_id WHERE p.slug = ? AND p.active = 1`).bind(slug).first<Record<string, unknown>>();
  if (!product) return apiError("Produto não encontrado.", 404, "NOT_FOUND");
  const [variants, images] = await Promise.all([
    env.DB.prepare("SELECT id, name, sku, finish, price_cents, stock FROM product_variants WHERE product_id = ? AND active = 1 ORDER BY id").bind(product.id).all(),
    env.DB.prepare("SELECT id, url, alt_text, sort_order FROM product_images WHERE product_id = ? ORDER BY sort_order, id").bind(product.id).all(),
  ]);
  return json({ ok: true, product: { ...product, variants: variants.results, images: images.results } }, 200, { "Cache-Control": "public, max-age=60" });
}

async function register(request: Request, env: Env): Promise<Response> {
  const body = await readJson<RegisterBody>(request);
  const name = body.name?.trim() || "";
  const email = normalizeEmail(body.email || "");
  const password = body.password || "";
  if (name.length < 2) return apiError("Informe seu nome completo.");
  if (!/^\S+@\S+\.\S+$/.test(email)) return apiError("Informe um e-mail válido.");
  if (password.length < 8) return apiError("A senha deve ter pelo menos 8 caracteres.");
  if (body.birth_date && !/^\d{4}-\d{2}-\d{2}$/.test(body.birth_date)) return apiError("Informe uma data de nascimento válida.");
  const existing = await env.DB.prepare("SELECT id FROM customers WHERE email = ?").bind(email).first();
  if (existing) return apiError("Já existe um cadastro com este e-mail.", 409, "EMAIL_EXISTS");
  const credentials = await hashPassword(password);
  const result = await env.DB.prepare(`INSERT INTO customers(name, email, phone, birth_date, password_hash, password_salt)
    VALUES (?, ?, ?, ?, ?, ?)`)
    .bind(name, email, body.phone?.trim() || null, body.birth_date || null, credentials.hash, credentials.salt).run();
  const customerId = Number(result.meta.last_row_id);
  await env.DB.batch([
    env.DB.prepare("INSERT INTO carts(customer_id) VALUES (?)").bind(customerId),
    env.DB.prepare("INSERT INTO loyalty_accounts(customer_id) VALUES (?)").bind(customerId),
  ]);
  const session = await createSession(env, customerId);
  return json({ ok: true, customer: { id: customerId, name, email, role: "customer" } }, 201, { "Set-Cookie": sessionCookie(session.token, session.expiresAt) });
}

async function login(request: Request, env: Env): Promise<Response> {
  const body = await readJson<LoginBody>(request);
  const email = normalizeEmail(body.email || "");
  const record = await env.DB.prepare("SELECT id, name, email, phone, birth_date, role, password_hash, password_salt FROM customers WHERE email = ? AND active = 1")
    .bind(email).first<Record<string, string | number | null>>();
  if (!record || !body.password || !(await verifyPassword(body.password, String(record.password_salt), String(record.password_hash)))) {
    return apiError("E-mail ou senha incorretos.", 401, "INVALID_CREDENTIALS");
  }
  const session = await createSession(env, Number(record.id));
  const { password_hash, password_salt, ...customer } = record;
  return json({ ok: true, customer }, 200, { "Set-Cookie": sessionCookie(session.token, session.expiresAt) });
}

async function route(request: Request, env: Env): Promise<Response> {
  const method = request.method.toUpperCase();
  const parts = pathParts(request);
  if (method === "GET" && parts[0] === "health") return json({ ok: true, service: "elegance-api", database: "connected" });
  if (method === "GET" && parts[0] === "categories") return categories(env);
  if (method === "GET" && parts[0] === "products" && !parts[1]) return products(request, env);
  if (method === "GET" && parts[0] === "products" && parts[1]) return productBySlug(parts[1], env);
  if (method === "POST" && parts.join("/") === "auth/register") return register(request, env);
  if (method === "POST" && parts.join("/") === "auth/login") return login(request, env);
  if (method === "POST" && parts.join("/") === "auth/logout") {
    await deleteCurrentSession(request, env);
    return json({ ok: true }, 200, { "Set-Cookie": clearSessionCookie() });
  }
  if (method === "GET" && parts.join("/") === "auth/me") {
    const customer = await currentCustomer(request, env);
    return customer ? json({ ok: true, customer }) : apiError("Faça login para continuar.", 401, "UNAUTHENTICATED");
  }
  return apiError("Rota não encontrada.", 404, "NOT_FOUND");
}

export const onRequest: PagesFunction<Env> = async (context) => {
  try {
    if (!context.env.DB) return apiError("O banco D1 ainda não foi vinculado ao projeto.", 503, "DATABASE_NOT_CONFIGURED");
    return await route(context.request, context.env);
  } catch (error) {
    console.error("API error", error);
    const message = error instanceof Error && error.message.includes("JSON") ? "Os dados enviados são inválidos." : "Não foi possível concluir a solicitação.";
    return apiError(message, 500, "INTERNAL_ERROR");
  }
};
