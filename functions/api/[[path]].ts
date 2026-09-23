import type { Env } from "../_lib/types";
import { apiError, json, normalizeEmail, readJson } from "../_lib/http";
import { clearSessionCookie, createSession, currentCustomer, deleteCurrentSession, hashPassword, sessionCookie, sha256, verifyPassword } from "../_lib/auth";
import { createMercadoPagoCheckout, mercadoPagoDiagnostic, mercadoPagoWebhook, publicPaymentStatus, validateCartCoupon } from "../_lib/mercado-pago";
import { correiosConfigured, publicCorreiosQuote } from "../_lib/correios";
import { blingCallback, blingConnect, blingStatus, disconnectBling } from "../_lib/bling";
import { adminPersonalizationImage, publicProductImage, uploadPersonalization, uploadProductImage } from "../_lib/personalization";
import { normalizeBrazilPhone, sendWhatsAppMessage, whatsappConfigured } from "../_lib/whatsapp";

type RegisterBody = { name?: string; email?: string; phone?: string; birth_date?: string; password?: string };
type AccountBody = { name?: string; phone?: string; birth_date?: string };
type AddressBody = { postal_code?: string; street?: string; number?: string; complement?: string; neighborhood?: string; city?: string; state?: string };
type LoginBody = { email?: string; password?: string };
type ForgotPasswordBody = { phone?: string };
type ResetPasswordBody = { token?: string; password?: string };
type RecoveryCartItem = {
  name?: string; price?: number; image?: string; qty?: number;
  product_id?: number | null; variant_id?: number | null;
  personalization?: { engraving_text?: string; image_upload_id?: string; image_name?: string; size?: string } | null;
};
type CartRecoveryBody = { phone?: string; cart?: RecoveryCartItem[] };
type ProductBody = {
  name?: string; category_id?: number | null; sku?: string; description?: string;
  price_cents?: number; pix_price_cents?: number | null; stock?: number;
  image_url?: string; active?: boolean; featured?: boolean; personalizable?: boolean; finish?: string;
  weight_grams?: number; width_cm?: number; height_cm?: number; length_cm?: number;
  piece_length?: string; material?: string; coating?: string; warranty_months?: number;
  engraving_text_enabled?: boolean; engraving_text_price_cents?: number;
  engraving_image_enabled?: boolean; engraving_image_price_cents?: number;
};
type CategoryBody = { name?: string; description?: string; sort_order?: number; active?: boolean };
type CouponBody = { code?: string; type?: "percent" | "fixed"; value?: number; minimum_cents?: number; starts_at?: string | null; expires_at?: string | null; max_uses?: number | null; active?: boolean };

const slugify = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const integer = (value: unknown, fallback = 0) => Number.isFinite(Number(value)) ? Math.round(Number(value)) : fallback;
const flag = (value: unknown, fallback = true) => value === undefined ? (fallback ? 1 : 0) : (value ? 1 : 0);
const sqlDate = (value: Date) => value.toISOString().slice(0, 19).replace("T", " ");

function secureToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function publicUrl(request: Request, page: string, token: string): string {
  const url = new URL(`/${page.replace(/^\/+/, "")}`, request.url);
  url.searchParams.set(page.startsWith("carrinho") ? "recuperar" : "redefinir", token);
  return url.toString();
}

function sanitizeCart(items: RecoveryCartItem[]): RecoveryCartItem[] | null {
  if (!Array.isArray(items) || items.length < 1 || items.length > 50) return null;
  const sanitized = items.map(item => {
    const qty = Math.max(1, Math.min(99, integer(item.qty, 1)));
    const price = Number(item.price);
    const name = String(item.name || "").trim().slice(0, 160);
    const rawImage = String(item.image || "").trim().slice(0, 500);
    const image = /^(https:\/\/|\/|assets\/)[^"'<>]+$/i.test(rawImage) ? rawImage : "";
    if (!name || !Number.isFinite(price) || price < 0 || price > 1_000_000 || !image) return null;
    const personalization = item.personalization ? {
      engraving_text: String(item.personalization.engraving_text || "").slice(0, 80) || undefined,
      image_upload_id: String(item.personalization.image_upload_id || "").slice(0, 120) || undefined,
      image_name: String(item.personalization.image_name || "").slice(0, 160) || undefined,
      size: String(item.personalization.size || "").slice(0, 20) || undefined,
    } : null;
    return {
      name, price, image, qty,
      product_id: item.product_id ? integer(item.product_id) : null,
      variant_id: item.variant_id ? integer(item.variant_id) : null,
      personalization,
    };
  });
  return sanitized.some(item => item === null) ? null : sanitized as RecoveryCartItem[];
}

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
    p.weight_grams, p.width_cm, p.height_cm, p.length_cm, p.piece_length, p.material, p.coating, p.warranty_months,
    p.engraving_text_enabled, p.engraving_text_price_cents, p.engraving_image_enabled, p.engraving_image_price_cents,
    p.active, p.featured, p.personalizable, c.name AS category_name,
    (SELECT finish FROM product_variants WHERE product_id=p.id ORDER BY id LIMIT 1) AS finish,
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

async function uniqueSku(env: Env, name: string) {
  const words = slugify(name).split("-").filter(Boolean);
  const prefix = (words.slice(0, 3).map(word => word.slice(0, 4)).join("-") || "PRODUTO").toUpperCase().slice(0, 22);
  let sku = prefix;
  for (let suffix = 2; suffix < 1000; suffix++) {
    const found = await env.DB.prepare("SELECT id FROM products WHERE sku=?").bind(sku).first();
    if (!found) return sku;
    sku = prefix + "-" + suffix;
  }
  return prefix + "-" + Date.now().toString(36).toUpperCase();
}

async function saveProduct(request: Request, env: Env, id?: number): Promise<Response> {
  const body = await readJson<ProductBody>(request);
  const name = body.name?.trim() || "";
  const sku = body.sku?.trim().toUpperCase() || await uniqueSku(env, name);
  const price = integer(body.price_cents, -1);
  const stock = integer(body.stock, 0);
  if (name.length < 2) return apiError("Informe o nome do produto.");

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
    Number(body.height_cm) || 0, Number(body.length_cm) || 0, body.piece_length?.trim() || null, body.material?.trim() || null,
    body.coating?.trim() || null, Math.max(0, integer(body.warranty_months, 12)), flag(body.engraving_text_enabled, false),
    Math.max(0, integer(body.engraving_text_price_cents, 2990)), flag(body.engraving_image_enabled, false),
    Math.max(0, integer(body.engraving_image_price_cents, 4990)), flag(body.featured, false),
    flag(Boolean(body.personalizable || body.engraving_text_enabled || body.engraving_image_enabled), false), flag(body.active)];
  let productId = id;
  if (id) {
    const exists = await env.DB.prepare("SELECT id FROM products WHERE id = ?").bind(id).first();
    if (!exists) return apiError("Produto não encontrado.", 404, "NOT_FOUND");
    await env.DB.prepare(`UPDATE products SET category_id=?, name=?, slug=?, sku=?, description=?, price_cents=?, pix_price_cents=?,
      weight_grams=?, width_cm=?, height_cm=?, length_cm=?, piece_length=?, material=?, coating=?, warranty_months=?,
      engraving_text_enabled=?, engraving_text_price_cents=?, engraving_image_enabled=?, engraving_image_price_cents=?,
      featured=?, personalizable=?, active=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(...values, id).run();
  } else {
    const result = await env.DB.prepare(`INSERT INTO products(category_id,name,slug,sku,description,price_cents,pix_price_cents,
      weight_grams,width_cm,height_cm,length_cm,piece_length,material,coating,warranty_months,engraving_text_enabled,
      engraving_text_price_cents,engraving_image_enabled,engraving_image_price_cents,featured,personalizable,active)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(...values).run();
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
  return json({ ok: true, id: productId, slug, sku }, id ? 200 : 201);
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

async function adminOrderDetail(env: Env, id: number): Promise<Response> {
  const order = await env.DB.prepare(`SELECT o.id, o.order_number, o.status, o.subtotal_cents, o.discount_cents,
    o.shipping_cents, o.total_cents, o.shipping_method, o.shipping_address_json, o.tracking_code, o.created_at,
    c.name AS customer_name, c.email AS customer_email, c.phone AS customer_phone
    FROM orders o JOIN customers c ON c.id = o.customer_id WHERE o.id = ?`).bind(id).first();
  if (!order) return apiError("Pedido não encontrado.", 404, "NOT_FOUND");
  const items = await env.DB.prepare(`SELECT product_name, sku, unit_price_cents, quantity, personalization_json, personalization_fee_cents
    FROM order_items WHERE order_id = ? ORDER BY id`).bind(id).all();
  return json({ ok: true, order, items: items.results });
}

async function adminCustomers(env: Env): Promise<Response> {
  const result = await env.DB.prepare(`SELECT c.id, c.name, c.email, c.phone, c.birth_date, c.active, c.created_at,
    COUNT(o.id) AS order_count,
    COALESCE(SUM(CASE WHEN o.status IN ('paid','preparing','shipped','delivered') THEN o.total_cents ELSE 0 END), 0) AS total_spent_cents,
    COALESCE(SUM(CASE WHEN o.status = 'pending_payment' THEN o.total_cents ELSE 0 END), 0) AS total_pending_cents
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
  const sort = url.searchParams.get("sort") || "popular";
  const orderBy: Record<string, string> = {
    popular: "p.featured DESC, p.created_at DESC, p.id DESC",
    newest: "p.created_at DESC, p.id DESC",
    "price-asc": "p.price_cents ASC, p.id DESC",
    "price-desc": "p.price_cents DESC, p.id DESC",
  };
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
    WHERE ${conditions.join(" AND ")} ORDER BY ${orderBy[sort] || orderBy.popular} LIMIT 100`).bind(...bindings);
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
  const existing = await env.DB.prepare("SELECT id,account_claimed FROM customers WHERE email = ?").bind(email).first<{ id: number; account_claimed: number }>();
  const credentials = await hashPassword(password);
  let customerId: number;
  if (existing?.account_claimed) return apiError("Já existe uma conta com este e-mail.", 409, "EMAIL_EXISTS");
  if (existing) {
    customerId = existing.id;
    await env.DB.prepare("UPDATE customers SET name=?,phone=?,birth_date=?,password_hash=?,password_salt=?,account_claimed=1,active=1,updated_at=CURRENT_TIMESTAMP WHERE id=?")
      .bind(name, body.phone?.trim() || null, body.birth_date || null, credentials.hash, credentials.salt, customerId).run();
  } else {
    const result = await env.DB.prepare(`INSERT INTO customers(name,email,phone,birth_date,password_hash,password_salt,account_claimed)
      VALUES(?,?,?,?,?,?,1)`).bind(name, email, body.phone?.trim() || null, body.birth_date || null, credentials.hash, credentials.salt).run();
    customerId = Number(result.meta.last_row_id);
    await env.DB.batch([env.DB.prepare("INSERT INTO carts(customer_id) VALUES (?)").bind(customerId),env.DB.prepare("INSERT INTO loyalty_accounts(customer_id) VALUES (?)").bind(customerId)]);
  }
  const session = await createSession(env, customerId);
  return json({ ok: true, customer: { id: customerId, name, email, role: "customer" } }, 201, { "Set-Cookie": sessionCookie(session.token, session.expiresAt) });
}

async function accountOverview(request: Request, env: Env): Promise<Response> {
  const customer = await currentCustomer(request, env);
  if (!customer || customer.role !== "customer") return apiError("Entre na sua conta para continuar.", 401, "UNAUTHENTICATED");
  const [address, orders, loyalty, paid] = await Promise.all([
    env.DB.prepare("SELECT id,postal_code,street,number,complement,neighborhood,city,state FROM addresses WHERE customer_id=? ORDER BY is_default DESC,id DESC LIMIT 1").bind(customer.id).first(),
    env.DB.prepare("SELECT order_number,status,total_cents,shipping_method,tracking_code,created_at FROM orders WHERE customer_id=? ORDER BY created_at DESC LIMIT 30").bind(customer.id).all(),
    env.DB.prepare("SELECT purchase_count,rewards_issued FROM loyalty_accounts WHERE customer_id=?").bind(customer.id).first(),
    env.DB.prepare("SELECT id FROM orders WHERE customer_id=? AND status IN ('paid','preparing','shipped','delivered','refunded') LIMIT 1").bind(customer.id).first(),
  ]);
  return json({ ok: true, customer, address: address || null, orders: orders.results, loyalty: loyalty || { purchase_count: 0, rewards_issued: 0 }, first_purchase_eligible: !paid });
}

async function updateAccount(request: Request, env: Env): Promise<Response> {
  const customer = await currentCustomer(request, env);
  if (!customer || customer.role !== "customer") return apiError("Entre na sua conta para continuar.", 401, "UNAUTHENTICATED");
  const body = await readJson<AccountBody>(request), name = body.name?.trim() || "";
  if (name.length < 2) return apiError("Informe seu nome completo.");
  if (body.birth_date && !/^\d{4}-\d{2}-\d{2}$/.test(body.birth_date)) return apiError("Informe uma data de nascimento válida.");
  await env.DB.prepare("UPDATE customers SET name=?,phone=?,birth_date=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(name, body.phone?.trim() || null, body.birth_date || null, customer.id).run();
  return json({ ok: true });
}

async function saveAccountAddress(request: Request, env: Env): Promise<Response> {
  const customer = await currentCustomer(request, env);
  if (!customer || customer.role !== "customer") return apiError("Entre na sua conta para continuar.", 401, "UNAUTHENTICATED");
  const body = await readJson<AddressBody>(request);
  const postalCode = String(body.postal_code || "").replace(/\D/g, ""), state = body.state?.trim().toUpperCase() || "";
  if (postalCode.length !== 8 || !body.street?.trim() || !body.number?.trim() || !body.neighborhood?.trim() || !body.city?.trim() || !/^[A-Z]{2}$/.test(state)) return apiError("Preencha o endereço completo.");
  const existing = await env.DB.prepare("SELECT id FROM addresses WHERE customer_id=? ORDER BY is_default DESC,id DESC LIMIT 1").bind(customer.id).first<{ id: number }>();
  if (existing) await env.DB.prepare("UPDATE addresses SET recipient=?,postal_code=?,street=?,number=?,complement=?,neighborhood=?,city=?,state=?,is_default=1 WHERE id=? AND customer_id=?")
    .bind(customer.name, postalCode, body.street.trim(), body.number.trim(), body.complement?.trim() || null, body.neighborhood.trim(), body.city.trim(), state, existing.id, customer.id).run();
  else await env.DB.prepare("INSERT INTO addresses(customer_id,label,recipient,postal_code,street,number,complement,neighborhood,city,state,is_default) VALUES(?,'Principal',?,?,?,?,?,?,?,?,1)")
    .bind(customer.id, customer.name, postalCode, body.street.trim(), body.number.trim(), body.complement?.trim() || null, body.neighborhood.trim(), body.city.trim(), state).run();
  return json({ ok: true });
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

async function forgotPassword(request: Request, env: Env): Promise<Response> {
  if (!whatsappConfigured(env)) return apiError("A recuperação por WhatsApp ainda não está configurada.", 503, "WHATSAPP_NOT_CONFIGURED");
  const body = await readJson<ForgotPasswordBody>(request);
  const phone = normalizeBrazilPhone(body.phone || "");
  if (!phone) return apiError("Informe um celular válido com DDD.");
  const localPhone = phone.slice(2);
  const customer = await env.DB.prepare(`SELECT id, name FROM customers
    WHERE active=1 AND account_claimed=1 AND
    REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(phone,'(',''),')',''),'-',''),' ',''),'+','') IN (?,?)
    LIMIT 1`).bind(phone, localPhone).first<{ id: number; name: string }>();
  const genericMessage = "Se esse celular estiver cadastrado, enviaremos as instruções pelo WhatsApp.";
  if (!customer) return json({ ok: true, message: genericMessage });
  const recent = await env.DB.prepare(`SELECT COUNT(*) AS total FROM password_reset_tokens
    WHERE customer_id=? AND created_at >= datetime('now','-15 minutes')`).bind(customer.id).first<{ total: number }>();
  if ((recent?.total || 0) >= 3) return apiError("Aguarde alguns minutos antes de pedir outro link.", 429, "RATE_LIMITED");
  const token = secureToken();
  const tokenHash = await sha256(token);
  const expiresAt = sqlDate(new Date(Date.now() + 30 * 60 * 1000));
  await env.DB.batch([
    env.DB.prepare("UPDATE password_reset_tokens SET used_at=CURRENT_TIMESTAMP WHERE customer_id=? AND used_at IS NULL").bind(customer.id),
    env.DB.prepare("INSERT INTO password_reset_tokens(customer_id,token_hash,expires_at) VALUES(?,?,?)").bind(customer.id, tokenHash, expiresAt),
  ]);
  try {
    const firstName = customer.name.trim().split(/\s+/)[0];
    const resetUrl = publicUrl(request, "conta.html", token);
    await sendWhatsAppMessage(env, phone, `Olá, ${firstName}!\n\nVocê solicitou a recuperação da sua senha da *Elegance 18K*.\n\nCrie uma nova senha pelo link abaixo:\n${resetUrl}\n\nO link expira em 30 minutos. Se você não fez essa solicitação, ignore esta mensagem.`);
  } catch {
    await env.DB.prepare("DELETE FROM password_reset_tokens WHERE token_hash=?").bind(tokenHash).run();
    return apiError("Não foi possível enviar a mensagem agora. Tente novamente em instantes.", 502, "WHATSAPP_SEND_FAILED");
  }
  return json({ ok: true, message: genericMessage });
}

async function resetPassword(request: Request, env: Env): Promise<Response> {
  const body = await readJson<ResetPasswordBody>(request);
  const token = String(body.token || "");
  const password = String(body.password || "");
  if (token.length < 30) return apiError("Este link de recuperação é inválido.", 400, "INVALID_TOKEN");
  if (password.length < 8) return apiError("A senha deve ter pelo menos 8 caracteres.");
  const tokenHash = await sha256(token);
  const record = await env.DB.prepare(`SELECT id, customer_id FROM password_reset_tokens
    WHERE token_hash=? AND used_at IS NULL AND expires_at > CURRENT_TIMESTAMP`).bind(tokenHash).first<{ id: number; customer_id: number }>();
  if (!record) return apiError("Este link expirou ou já foi utilizado.", 400, "INVALID_TOKEN");
  const credentials = await hashPassword(password);
  const claimed = await env.DB.prepare(`UPDATE password_reset_tokens SET used_at=CURRENT_TIMESTAMP
    WHERE id=? AND used_at IS NULL AND expires_at > CURRENT_TIMESTAMP`).bind(record.id).run();
  if (!claimed.meta.changes) return apiError("Este link expirou ou já foi utilizado.", 400, "INVALID_TOKEN");
  await env.DB.batch([
    env.DB.prepare("UPDATE customers SET password_hash=?,password_salt=?,updated_at=CURRENT_TIMESTAMP WHERE id=?")
      .bind(credentials.hash, credentials.salt, record.customer_id),
    env.DB.prepare("DELETE FROM sessions WHERE customer_id=?").bind(record.customer_id),
  ]);
  return json({ ok: true, message: "Senha alterada com sucesso. Você já pode entrar." });
}

async function createCartRecovery(request: Request, env: Env): Promise<Response> {
  if (!whatsappConfigured(env)) return apiError("O envio do carrinho por WhatsApp ainda não está configurado.", 503, "WHATSAPP_NOT_CONFIGURED");
  const body = await readJson<CartRecoveryBody>(request);
  const phone = normalizeBrazilPhone(body.phone || "");
  const cart = sanitizeCart(body.cart || []);
  if (!phone) return apiError("Informe um celular válido com DDD.");
  if (!cart) return apiError("O carrinho está vazio ou contém itens inválidos.");
  const cartJson = JSON.stringify(cart);
  if (cartJson.length > 50_000) return apiError("O carrinho é grande demais para ser recuperado.");
  const recent = await env.DB.prepare(`SELECT COUNT(*) AS total FROM cart_recovery_links
    WHERE phone=? AND created_at >= datetime('now','-15 minutes')`).bind(phone).first<{ total: number }>();
  if ((recent?.total || 0) >= 3) return apiError("Aguarde alguns minutos antes de enviar novamente.", 429, "RATE_LIMITED");
  const token = secureToken();
  const tokenHash = await sha256(token);
  const expiresAt = sqlDate(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));
  await env.DB.prepare("INSERT INTO cart_recovery_links(phone,token_hash,cart_json,expires_at) VALUES(?,?,?,?)")
    .bind(phone, tokenHash, cartJson, expiresAt).run();
  try {
    const cartUrl = publicUrl(request, "carrinho.html", token);
    await sendWhatsAppMessage(env, phone, `Seu carrinho da *Elegance 18K* está guardado ✨\n\nVolte para suas joias pelo link:\n${cartUrl}\n\nO link fica disponível por 7 dias.`);
  } catch {
    await env.DB.prepare("DELETE FROM cart_recovery_links WHERE token_hash=?").bind(tokenHash).run();
    return apiError("Não foi possível enviar o carrinho agora. Tente novamente em instantes.", 502, "WHATSAPP_SEND_FAILED");
  }
  return json({ ok: true, message: "Carrinho enviado para o seu WhatsApp." }, 201);
}

async function recoverCart(request: Request, env: Env): Promise<Response> {
  const token = new URL(request.url).searchParams.get("token") || "";
  if (token.length < 30) return apiError("Link de carrinho inválido.", 400, "INVALID_TOKEN");
  const tokenHash = await sha256(token);
  const record = await env.DB.prepare(`SELECT id, cart_json FROM cart_recovery_links
    WHERE token_hash=? AND expires_at > CURRENT_TIMESTAMP`).bind(tokenHash).first<{ id: number; cart_json: string }>();
  if (!record) return apiError("Este link de carrinho expirou.", 404, "INVALID_TOKEN");
  await env.DB.prepare("UPDATE cart_recovery_links SET opened_at=COALESCE(opened_at,CURRENT_TIMESTAMP) WHERE id=?").bind(record.id).run();
  return json({ ok: true, cart: JSON.parse(record.cart_json) });
}

async function route(request: Request, env: Env): Promise<Response> {
  const method = request.method.toUpperCase();
  const parts = pathParts(request);
  if (method === "GET" && (parts[0] === "carrinho.html" || parts[0] === "conta.html")) {
    const source = new URL(request.url);
    const target = new URL(`/${parts[0]}`, source.origin);
    target.search = source.search;
    return Response.redirect(target.toString(), 302);
  }
  const correiosMissing = [
    ["CORREIOS_USER", env.CORREIOS_USER],
    ["CORREIOS_ACCESS_CODE", env.CORREIOS_ACCESS_CODE],
    ["CORREIOS_POSTING_CARD", env.CORREIOS_POSTING_CARD],
    ["CORREIOS_CONTRACT", env.CORREIOS_CONTRACT],
    ["CORREIOS_DR", env.CORREIOS_DR],
    ["CORREIOS_ORIGIN_ZIP", env.CORREIOS_ORIGIN_ZIP],
    ["CORREIOS_PAC_CODE", env.CORREIOS_PAC_CODE],
    ["CORREIOS_SEDEX_CODE", env.CORREIOS_SEDEX_CODE],
  ].filter(([, value]) => !String(value || "").trim()).map(([name]) => name);
  if (env.CORREIOS_ORIGIN_ZIP && env.CORREIOS_ORIGIN_ZIP.replace(/\D/g, "").length !== 8) {
    correiosMissing.push("CORREIOS_ORIGIN_ZIP_INVALID");
  }
  if (method === "GET" && parts[0] === "health") return json({
    ok: true,
    service: "elegance-api",
    database: "connected",
    integrations: {
      mercado_pago: Boolean(env.MERCADO_PAGO_ACCESS_TOKEN),
      mercado_pago_webhook: Boolean(env.MERCADO_PAGO_WEBHOOK_SECRET),
      correios: correiosConfigured(env),
      correios_missing: correiosMissing,
      bling: Boolean(env.BLING_CLIENT_ID && env.BLING_CLIENT_SECRET),
      whatsapp: whatsappConfigured(env),
      evolution_api: whatsappConfigured(env),
    },
  });
  if (method === "GET" && parts[0] === "categories") return categories(env);
  if (method === "GET" && parts.join("/") === "integrations/bling/callback") return blingCallback(request, env);
  if (method === "GET" && parts[0] === "products" && !parts[1]) return products(request, env);
  if (method === "GET" && parts[0] === "products" && parts[1]) return productBySlug(parts[1], env);
  if (method === "POST" && parts.join("/") === "checkout/mercado-pago") return createMercadoPagoCheckout(request, env);
  if (method === "POST" && parts.join("/") === "coupons/validate") return validateCartCoupon(request, env);
  if (method === "POST" && parts.join("/") === "personalization/upload") return uploadPersonalization(request, env);
  if (method === "GET" && parts[0] === "product-images" && parts[1] && parts[2]) return publicProductImage(env, integer(parts[1]), parts[2]);
  if (method === "POST" && parts.join("/") === "shipping/correios/quote") return publicCorreiosQuote(request, env);
  if (method === "POST" && parts.join("/") === "payments/mercado-pago/webhook") return mercadoPagoWebhook(request, env);
  if (method === "GET" && parts.join("/") === "payments/mercado-pago/diagnostic") return mercadoPagoDiagnostic(env);
  if (method === "GET" && parts.join("/") === "payments/status") return publicPaymentStatus(request, env);
  if (method === "POST" && parts.join("/") === "auth/register") return register(request, env);
  if (method === "POST" && parts.join("/") === "auth/login") return login(request, env);
  if (method === "POST" && parts.join("/") === "auth/password/forgot") return forgotPassword(request, env);
  if (method === "POST" && parts.join("/") === "auth/password/reset") return resetPassword(request, env);
  if (method === "POST" && parts.join("/") === "cart-recovery") return createCartRecovery(request, env);
  if (method === "GET" && parts.join("/") === "cart-recovery") return recoverCart(request, env);
  if (method === "POST" && parts.join("/") === "auth/logout") {
    await deleteCurrentSession(request, env);
    return json({ ok: true }, 200, { "Set-Cookie": clearSessionCookie() });
  }
  if (method === "GET" && parts.join("/") === "auth/me") {
    const customer = await currentCustomer(request, env);
    return customer ? json({ ok: true, customer }) : apiError("Faça login para continuar.", 401, "UNAUTHENTICATED");
  }
  if (method === "GET" && parts.join("/") === "account") return accountOverview(request, env);
  if (method === "PUT" && parts.join("/") === "account") return updateAccount(request, env);
  if (method === "PUT" && parts.join("/") === "account/address") return saveAccountAddress(request, env);
  if (parts[0] === "admin") {
    const admin = await requireAdmin(request, env);
    if (!admin) return apiError("Acesso restrito à administração.", 403, "FORBIDDEN");
    if (method === "GET" && parts[1] === "dashboard") return adminDashboard(env);
    if (method === "GET" && parts.join("/") === "admin/integrations/bling/connect") return blingConnect(request, env, admin);
    if (method === "GET" && parts.join("/") === "admin/integrations/bling/status") return blingStatus(env);
    if (method === "DELETE" && parts.join("/") === "admin/integrations/bling") return disconnectBling(env);
    if (method === "GET" && parts[1] === "products") return adminProducts(env);
    if (method === "POST" && parts[1] === "products" && !parts[2]) return saveProduct(request, env);
    if (method === "POST" && parts[1] === "products" && parts[2] && parts[3] === "image") return uploadProductImage(request, env, integer(parts[2]));
    if (method === "PUT" && parts[1] === "products" && parts[2]) return saveProduct(request, env, integer(parts[2]));
    if (method === "DELETE" && parts[1] === "products" && parts[2]) return deleteProduct(env, integer(parts[2]));
    if (method === "GET" && parts[1] === "categories") return adminCategories(env);
    if (method === "POST" && parts[1] === "categories" && !parts[2]) return saveCategory(request, env);
    if (method === "PUT" && parts[1] === "categories" && parts[2]) return saveCategory(request, env, integer(parts[2]));
    if (method === "GET" && parts[1] === "orders" && parts[2]) return adminOrderDetail(env, integer(parts[2]));
    if (method === "GET" && parts[1] === "personalization" && parts[2]) return adminPersonalizationImage(env, parts[2]);
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
