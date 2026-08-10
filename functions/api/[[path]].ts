import type { Env } from "../_lib/types";
import { apiError, json, normalizeEmail, readJson } from "../_lib/http";
import { clearSessionCookie, createSession, currentCustomer, deleteCurrentSession, hashPassword, sessionCookie, verifyPassword } from "../_lib/auth";
import { createMercadoPagoCheckout, mercadoPagoDiagnostic, mercadoPagoWebhook, publicPaymentStatus } from "../_lib/mercado-pago";
import { correiosConfigured, publicCorreiosQuote } from "../_lib/correios";

type RegisterBody = { name?: string; email?: string; phone?: string; birth_date?: string; password?: string };
type LoginBody = { email?: string; password?: string };
type ProductBody = {
  name?: string; category_id?: number | null; sku?: string; description?: string;
  price_cents?: number; pix_price_cents?: number | null; stock?: number;
  image_url?: string; active?: boolean; featured?: boolean; finish?: string;
  weight_grams?: number; width_cm?: number; height_cm?: number; length_cm?: number;
};
type CategoryBody = { name?: string; description?: string; sort_order?: number; active?: boolean };
type CouponBody = { code?: string; type?: "percent" | "fixed"; value?: number; minimum_cents?: number; starts_at?: string | null; expires_at?: string | null; max_uses?: number | null; active?: boolean };

const slugify = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const integer = (value: unknown, fallback = 0) => Number.isFinite(Number(value)) ? Math.round(Number(value)) : fallback;
const flag = (value: unknown, fallback = true) => value === undefined ? (fallback ? 1 : 0) : (value ? 1 : 0);

async function requireAdmin(request: Request, env: Env) {
  const customer = await currentCustomer(request, env);
  return customer?.role === "admin" ? customer : null;
}

async function adminDashboard(env: Env): Promise<Response> {
  const [products, orders, customers, revenue, recentOrders] = await Promise.all([
    env.DB.prepare("SELECT COUNT(*) AS total FROM products WHERE active = 1").first<{ total: number }>(),
    env.DB.prepare("SELECT COUNT(*) AS total FROM orders").first<{ total: number }>(),
    env.DB.prepare("SELECT COUNT(*) AS total FROM customers WHERE active = 1").first<{ total: number }>(),
    env.DB.prepare("SELECT COALESCE(SUM(total_cents), 0) AS total FROM orders WHERE status NOT IN ('cancelled','refunded')").first<{ total: number }>(),
    env.DB.prepare(`SELECT o.id, o.order_number, o.status, o.total_cents, o.created_at, c.name AS customer_name
      FROM orders o JOIN customers c ON c.id = o.customer_id ORDER BY o.created_at DESC LIMIT 8`).all(),
  ]);
  return json({ ok: true, stats: { products: products?.total || 0, orders: orders?.total || 0, customers: customers?.total || 0, revenue_cents: revenue?.total || 0 }, recent_orders: recentOrders.results });
}

async function adminProducts(env: Env): Promise<Response> {
  const result = await env.DB.prepare(`SELECT p.id, p.name, p.category_id, p.sku, p.description, p.price_cents, p.pix_price_cents,
    p.weight_grams, p.width_cm, p.height_cm, p.length_cm, p.active, p.featured, c.name AS category_name,
    (SELECT url FROM product_images WHERE product_id = p.id ORDER BY sort_order, id LIMIT 1) AS image_url,
    COALESCE(SUM(v.stock), 0) AS stock
    FROM products p LEFT JOIN categories c ON c.id = p.category_id
    LEFT JOIN product_variants v ON v.product_id = p.id AND v.active = 1
    GROUP BY p.id ORDER BY p.created_at DESC LIMIT 200`).all();
  return json({ ok: true, products: result.results });
}

async function adminCategories(env: Env): Promise<Response> {
  const result = await env.DB.prepare(`SELECT c.id, c.name, c.slug, c.description, c.sort_order, c.active,
    COUNT(p.id) AS product_count FROM categories c LEFT JOIN products p ON p.category_id = c.id
    GROUP BY c.id ORDER BY c.sort_order, c.name`).all();
  return json({ ok: true, categories: result.results });
}

async function uniqueSlug(env: Env, table: "products" | "categories", name: string, exceptId?: number) {
  const base = slugify(name) || `item-${Date.now()}`;
  let slug = base;
  for (let suffix = 2; suffix < 100; suffix++) {
    const found = await env.DB.prepare(`SELECT id FROM ${table} WHERE slug = ?${exceptId ? " AND id != ?" : ""}`)
      .bind(...(exceptId ? [slug, exceptId] : [slug])).first();
    if (!found) return slug;
    slug = `${base}-${suffix}`;
  }
  return `${base}-${Date.now()}`;
}

async function saveProduct(request: Request, env: Env, id?: number): Promise<Response> {
  const body = await readJson<ProductBody>(request);
  const name = body.name?.trim() || "";
  const sku = body.sku?.trim().toUpperCase() || "";
  const price = integer(body.price_cents, -1);
  const stock = integer(body.stock, 0);
  if (name.length < 2) return apiError("Informe o nome do produto.");
  if (!sku) return apiError("Informe o SKU do produto.");
  if (price < 0) return apiError("Informe um preço válido.");
  if (stock < 0) return apiError("O estoque não pode ser negativo.");
  if (body.category_id) {
    const category = await env.DB.prepare("SELECT id FROM categories WHERE id = ?").bind(integer(body.category_id)).first();
    if (!category) return apiError("Categoria não encontrada.");
  }
  const duplicate = await env.DB.prepare(`SELECT id FROM products WHERE sku = ?${id ? " AND id != ?" : ""}`)
    .bind(...(id ? [sku, id] : [sku])).first();
  if (duplicate) return apiError("Já existe um produto com este SKU.", 409, "SKU_EXISTS");
  const slug = await uniqueSlug(env, "products", name, id);
  const values = [body.category_id ? integer(body.category_id) : null, name, slug, sku, body.description?.trim() || null,
    price, body.pix_price_cents == null ? null : integer(body.pix_price_cents), integer(body.weight_grams), Number(body.width_cm) || 0,
    Number(body.height_cm) || 0, Number(body.length_cm) || 0, flag(body.featured, false), flag(body.active)];
  let productId = id;
  if (id) {
    const exists = await env.DB.prepare("SELECT id FROM products WHERE id = ?").bind(id).first();
    if (!exists) return apiError("Produto não encontrado.", 404, "NOT_FOUND");
    await env.DB.prepare(`UPDATE products SET category_id=?, name=?, slug=?, sku=?, description=?, price_cents=?, pix_price_cents=?,
      weight_grams=?, width_cm=?, height_cm=?, length_cm=?, featured=?, active=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(...values, id).run();
  } else {
    const result = await env.DB.prepare(`INSERT INTO products(category_id,name,slug,sku,description,price_cents,pix_price_cents,
      weight_grams,width_cm,height_cm,length_cm,featured,active) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(...values).run();
    productId = Number(result.meta.last_row_id);
  }
  const variant = await env.DB.prepare("SELECT id FROM product_variants WHERE product_id = ? ORDER BY id LIMIT 1").bind(productId).first<{id:number}>();
  if (variant) await env.DB.prepare("UPDATE product_variants SET name=?, sku=?, finish=?, price_cents=?, stock=?, active=?, updated_at=CURRENT_TIMESTAMP WHERE id=?")
    .bind("Padrão", `${sku}-PADRAO`, body.finish?.trim() || "Dourado 18K", price, stock, flag(body.active), variant.id).run();
  else await env.DB.prepare("INSERT INTO product_variants(product_id,name,sku,finish,price_cents,stock,active) VALUES(?,?,?,?,?,?,?)")
    .bind(productId, "Padrão", `${sku}-PADRAO`, body.finish?.trim() || "Dourado 18K", price, stock, flag(body.active)).run();
  if (body.image_url !== undefined) {
    await env.DB.prepare("DELETE FROM product_images WHERE product_id = ?").bind(productId).run();
    if (body.image_url.trim()) await env.DB.prepare("INSERT INTO product_images(product_id,url,alt_text,sort_order) VALUES(?,?,?,0)")
      .bind(productId, body.image_url.trim(), name).run();
  }
  return json({ ok: true, id: productId, slug }, id ? 200 : 201);
}

async function deleteProduct(env: Env, id: number): Promise<Response> {
  const result = await env.DB.prepare("UPDATE products SET active=0, updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(id).run();
  return result.meta.changes ? json({ ok: true }) : apiError("Produto não encontrado.", 404, "NOT_FOUND");
}

async function saveCategory(request: Request, env: Env, id?: number): Promise<Response> {
  const body = await readJson<CategoryBody>(request);
  const name = body.name?.trim() || "";
  if (name.length < 2) return apiError("Informe o nome da categoria.");
  const slug = await uniqueSlug(env, "categories", name, id);
  if (id) {
    const result = await env.DB.prepare("UPDATE categories SET name=?,slug=?,description=?,sort_order=?,active=?,updated_at=CURRENT_TIMESTAMP WHERE id=?")
      .bind(name, slug, body.description?.trim() || null, integer(body.sort_order), flag(body.active), id).run();
    return result.meta.changes ? json({ ok: true, id, slug }) : apiError("Categoria não encontrada.", 404, "NOT_FOUND");
  }
  const result = await env.DB.prepare("INSERT INTO categories(name,slug,description,sort_order,active) VALUES(?,?,?,?,?)")
    .bind(name, slug, body.description?.trim() || null, integer(body.sort_order), flag(body.active)).run();
  return json({ ok: true, id: Number(result.meta.last_row_id), slug }, 201);
}

async function adminCoupons(env: Env): Promise<Response> {
  const result = await env.DB.prepare("SELECT * FROM coupons ORDER BY id DESC LIMIT 200").all();
  return json({ ok: true, coupons: result.results });
}

async function saveCoupon(request: Request, env: Env): Promise<Response> {
  const body = await readJson<CouponBody>(request);
  const code = body.code?.trim().toUpperCase() || "";
  if (!code || !["percent", "fixed"].includes(body.type || "")) return apiError("Informe código e tipo do cupom.");
  if (integer(body.value) <= 0 || (body.type === "percent" && integer(body.value) > 100)) return apiError("Informe um desconto válido.");
  try {
    const result = await env.DB.prepare(`INSERT INTO coupons(code,type,value,minimum_cents,starts_at,expires_at,max_uses,active)
      VALUES(?,?,?,?,?,?,?,?)`).bind(code, body.type, integer(body.value), integer(body.minimum_cents), body.starts_at || null,
      body.expires_at || null, body.max_uses == null ? null : integer(body.max_uses), flag(body.active)).run();
    return json({ ok: true, id: Number(result.meta.last_row_id) }, 201);
  } catch (error) {
    if (String(error).includes("UNIQUE")) return apiError("Este cupom já existe.", 409, "CODE_EXISTS");
    throw error;
  }
}

async function updateOrder(request: Request, env: Env, id: number): Promise<Response> {
  const body = await readJson<{ status?: string; tracking_code?: string | null }>(request);
  const statuses = ["pending_payment","paid","preparing","shipped","delivered","cancelled","refunded"];
  if (!body.status || !statuses.includes(body.status)) return apiError("Status do pedido inválido.");
  const result = await env.DB.prepare("UPDATE orders SET status=?,tracking_code=?,updated_at=CURRENT_TIMESTAMP WHERE id=?")
    .bind(body.status, body.tracking_code?.trim() || null, id).run();
  return result.meta.changes ? json({ ok: true }) : apiError("Pedido não encontrado.", 404, "NOT_FOUND");
}

async function adminOrders(env: Env): Promise<Response> {
  const result = await env.DB.prepare(`SELECT o.id, o.order_number, o.status, o.total_cents, o.shipping_method,
    o.tracking_code, o.created_at, c.name AS customer_name, c.email AS customer_email
    FROM orders o JOIN customers c ON c.id = o.customer_id ORDER BY o.created_at DESC LIMIT 200`).all();
  return json({ ok: true, orders: result.results });
}

async function adminCustomers(env: Env): Promise<Response> {
  const result = await env.DB.prepare(`SELECT c.id, c.name, c.email, c.phone, c.birth_date, c.active, c.created_at,
    COUNT(o.id) AS order_count, COALESCE(SUM(o.total_cents), 0) AS total_spent_cents
    FROM customers c LEFT JOIN orders o ON o.customer_id = c.id
    GROUP BY c.id ORDER BY c.created_at DESC LIMIT 200`).all();
  return json({ ok: true, customers: result.results });
}

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
  if (method === "GET" && parts[0] === "health") return json({
    ok: true,
    service: "elegance-api",
    database: "connected",
    integrations: {
      mercado_pago: Boolean(env.MERCADO_PAGO_ACCESS_TOKEN),
      mercado_pago_webhook: Boolean(env.MERCADO_PAGO_WEBHOOK_SECRET),
      correios: correiosConfigured(env),
    },
  });
  if (method === "GET" && parts[0] === "categories") return categories(env);
  if (method === "GET" && parts[0] === "products" && !parts[1]) return products(request, env);
  if (method === "GET" && parts[0] === "products" && parts[1]) return productBySlug(parts[1], env);
  if (method === "POST" && parts.join("/") === "checkout/mercado-pago") return createMercadoPagoCheckout(request, env);
  if (method === "POST" && parts.join("/") === "shipping/correios/quote") return publicCorreiosQuote(request, env);
  if (method === "POST" && parts.join("/") === "payments/mercado-pago/webhook") return mercadoPagoWebhook(request, env);
  if (method === "GET" && parts.join("/") === "payments/mercado-pago/diagnostic") return mercadoPagoDiagnostic(env);
  if (method === "GET" && parts.join("/") === "payments/status") return publicPaymentStatus(request, env);
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
  if (parts[0] === "admin") {
    const admin = await requireAdmin(request, env);
    if (!admin) return apiError("Acesso restrito à administração.", 403, "FORBIDDEN");
    if (method === "GET" && parts[1] === "dashboard") return adminDashboard(env);
    if (method === "GET" && parts[1] === "products") return adminProducts(env);
    if (method === "POST" && parts[1] === "products" && !parts[2]) return saveProduct(request, env);
    if (method === "PUT" && parts[1] === "products" && parts[2]) return saveProduct(request, env, integer(parts[2]));
    if (method === "DELETE" && parts[1] === "products" && parts[2]) return deleteProduct(env, integer(parts[2]));
    if (method === "GET" && parts[1] === "categories") return adminCategories(env);
    if (method === "POST" && parts[1] === "categories" && !parts[2]) return saveCategory(request, env);
    if (method === "PUT" && parts[1] === "categories" && parts[2]) return saveCategory(request, env, integer(parts[2]));
    if (method === "GET" && parts[1] === "orders") return adminOrders(env);
    if (method === "PATCH" && parts[1] === "orders" && parts[2]) return updateOrder(request, env, integer(parts[2]));
    if (method === "GET" && parts[1] === "customers") return adminCustomers(env);
    if (method === "GET" && parts[1] === "coupons") return adminCoupons(env);
    if (method === "POST" && parts[1] === "coupons") return saveCoupon(request, env);
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
