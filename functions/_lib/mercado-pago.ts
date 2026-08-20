import type { Env } from "./types";
import { apiError, json, normalizeEmail, readJson } from "./http";
import { hashPassword } from "./auth";
import { calculateCorreiosQuotes } from "./correios";

type CheckoutItem = { product_id?: number; variant_id?: number; quantity?: number; personalization?: { engraving_text?: string; image_upload_id?: string; image_name?: string } };
type CheckoutBody = {
  customer?: { name?: string; email?: string; phone?: string; cpf?: string };
  shipping?: {
    method?: "correios" | "motoboy" | "pickup"; service_code?: string;
    postal_code?: string; street?: string; number?: string; complement?: string;
    neighborhood?: string; city?: string; state?: string;
  };
  items?: CheckoutItem[];
  coupon?: string;
};

type ProductRow = {
  product_id: number; variant_id: number; name: string; sku: string;
  unit_price_cents: number; stock: number; category_slug: string | null;
  personalization_json: string | null; personalization_fee_cents: number; image_upload_id: string | null;
};

type MercadoPagoPreference = { id: string; init_point?: string; sandbox_init_point?: string };
type MercadoPagoPayment = {
  id: number; status: string; transaction_amount: number; external_reference?: string;
  metadata?: { order_id?: number; order_number?: string };
};
type MercadoPagoMethod = { id?: string; name?: string; payment_type_id?: string; status?: string };

const encoder = new TextEncoder();
const cents = (value: number) => Math.round(Number(value) * 100);

function validEmail(value: string) { return /^\S+@\S+\.\S+$/.test(value); }
function digits(value: string) { return value.replace(/\D/g, ""); }

async function mercadoPago<T>(env: Env, path: string, init: RequestInit = {}): Promise<T> {
  if (!env.MERCADO_PAGO_ACCESS_TOKEN) throw new Error("MERCADO_PAGO_NOT_CONFIGURED");
  const response = await fetch(`https://api.mercadopago.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${env.MERCADO_PAGO_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  const payload: Record<string, unknown> = await response.json<Record<string, unknown>>().catch(() => ({}));
  if (!response.ok) {
    console.error(JSON.stringify({ event: "mercado_pago_error", path, status: response.status, cause: payload.cause }));
    throw new Error(`MERCADO_PAGO_${response.status}`);
  }
  return payload as T;
}

async function customerId(env: Env, customer: NonNullable<CheckoutBody["customer"]>): Promise<number> {
  const email = normalizeEmail(customer.email || "");
  const existing = await env.DB.prepare("SELECT id FROM customers WHERE email = ? AND active = 1").bind(email).first<{ id: number }>();
  if (existing) {
    await env.DB.prepare("UPDATE customers SET name=?, phone=?, updated_at=CURRENT_TIMESTAMP WHERE id=?")
      .bind(customer.name!.trim(), customer.phone?.trim() || null, existing.id).run();
    return existing.id;
  }
  const temporaryCredentials = await hashPassword(crypto.randomUUID());
  try {
    const result = await env.DB.prepare(`INSERT INTO customers(name,email,phone,password_hash,password_salt)
      VALUES(?,?,?,?,?)`).bind(customer.name!.trim(), email, customer.phone?.trim() || null,
      temporaryCredentials.hash, temporaryCredentials.salt).run();
    const id = Number(result.meta.last_row_id);
    await env.DB.batch([
      env.DB.prepare("INSERT INTO carts(customer_id) VALUES(?)").bind(id),
      env.DB.prepare("INSERT INTO loyalty_accounts(customer_id) VALUES(?)").bind(id),
    ]);
    return id;
  } catch (error) {
    if (!String(error).includes("UNIQUE")) throw error;
    const concurrent = await env.DB.prepare("SELECT id FROM customers WHERE email=?").bind(email).first<{ id: number }>();
    if (!concurrent) throw error;
    return concurrent.id;
  }
}

async function resolveItems(env: Env, items: CheckoutItem[]): Promise<ProductRow[]> {
  const resolved: ProductRow[] = [];
  for (const item of items.slice(0, 50)) {
    const quantity = Math.trunc(Number(item.quantity));
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 20 || !item.product_id || !item.variant_id) {
      throw new Error("INVALID_CART");
    }
    const row = await env.DB.prepare(`SELECT p.id AS product_id, v.id AS variant_id, p.name, v.sku,
      COALESCE(v.price_cents,p.price_cents) AS unit_price_cents, v.stock, c.slug AS category_slug
      FROM products p JOIN product_variants v ON v.product_id=p.id LEFT JOIN categories c ON c.id=p.category_id
      WHERE p.id=? AND v.id=? AND p.active=1 AND v.active=1`).bind(item.product_id, item.variant_id).first<ProductRow>();
    if (!row || row.stock < quantity) throw new Error("OUT_OF_STOCK");
    const engravingText = item.personalization?.engraving_text?.trim() || "";
    const imageUploadId = item.personalization?.image_upload_id?.trim() || "";
    if ((engravingText || imageUploadId) && row.category_slug !== "fotogravacao") throw new Error("INVALID_PERSONALIZATION");
    if (engravingText.length > 80) throw new Error("INVALID_PERSONALIZATION");
    if (imageUploadId) {
      const upload = await env.DB.prepare("SELECT id FROM personalization_uploads WHERE id=? AND product_id=? AND order_id IS NULL")
        .bind(imageUploadId, row.product_id).first();
      if (!upload) throw new Error("INVALID_PERSONALIZATION_IMAGE");
    }
    const fee = (engravingText ? 2990 : 0) + (imageUploadId ? 4990 : 0);
    const personalization = engravingText || imageUploadId ? { engraving_text: engravingText || null, image_upload_id: imageUploadId || null, image_name: item.personalization?.image_name?.slice(0, 160) || null } : null;
    resolved.push({ ...row, unit_price_cents: row.unit_price_cents + fee, stock: quantity, personalization_json: personalization ? JSON.stringify(personalization) : null, personalization_fee_cents: fee, image_upload_id: imageUploadId || null });
  }
  if (!resolved.length) throw new Error("EMPTY_CART");
  return resolved;
}

async function calculateDiscount(env: Env, code: string | undefined, subtotal: number) {
  if (!code?.trim()) return { cents: 0, couponId: null as number | null };
  const coupon = await env.DB.prepare(`SELECT id,type,value,minimum_cents,max_uses,uses FROM coupons
    WHERE code=? COLLATE NOCASE AND active=1 AND (starts_at IS NULL OR starts_at<=CURRENT_TIMESTAMP)
    AND (expires_at IS NULL OR expires_at>=CURRENT_TIMESTAMP)`).bind(code.trim()).first<{
      id: number; type: "percent" | "fixed"; value: number; minimum_cents: number; max_uses: number | null; uses: number;
    }>();
  if (!coupon || subtotal < coupon.minimum_cents || (coupon.max_uses != null && coupon.uses >= coupon.max_uses)) throw new Error("INVALID_COUPON");
  const discount = coupon.type === "percent" ? Math.floor(subtotal * coupon.value / 100) : coupon.value;
  return { cents: Math.min(discount, subtotal), couponId: coupon.id };
}

export async function createMercadoPagoCheckout(request: Request, env: Env): Promise<Response> {
  if (!env.MERCADO_PAGO_ACCESS_TOKEN) return apiError("O Mercado Pago ainda não está configurado.", 503, "PAYMENT_NOT_CONFIGURED");
  const body = await readJson<CheckoutBody>(request);
  const customer = body.customer || {};
  const email = normalizeEmail(customer.email || "");
  if ((customer.name?.trim().length || 0) < 2 || !validEmail(email) || digits(customer.phone || "").length < 10 || digits(customer.cpf || "").length !== 11) {
    return apiError("Revise nome, e-mail, CPF e celular.", 400, "INVALID_CUSTOMER");
  }
  let products: ProductRow[];
  try { products = await resolveItems(env, body.items || []); }
  catch (error) {
    const code = error instanceof Error ? error.message : "INVALID_CART";
    if (code === "OUT_OF_STOCK") return apiError("Um produto ficou sem estoque. Atualize a sacola.", 409, code);
    if (code.startsWith("INVALID_PERSONALIZATION")) return apiError("Revise os dados da fotogravação.", 400, code);
    return apiError("A sacola contém itens inválidos.", 400, code);
  }
  const subtotal = products.reduce((sum, item) => sum + item.unit_price_cents * item.stock, 0);
  let discount: Awaited<ReturnType<typeof calculateDiscount>>;
  try { discount = await calculateDiscount(env, body.coupon, subtotal); }
  catch { return apiError("O cupom informado não é válido.", 400, "INVALID_COUPON"); }
  const shippingMethod = body.shipping?.method || "pickup";
  let shippingCents = 0;
  if (shippingMethod === "correios") {
    try {
      const quotes = await calculateCorreiosQuotes(env, body.shipping?.postal_code || "", body.items || []);
      const selected = quotes.find(quote => quote.code === body.shipping?.service_code);
      if (!selected) return apiError("Selecione PAC ou SEDEX novamente.", 400, "INVALID_SHIPPING_QUOTE");
      shippingCents = selected.price_cents;
    } catch {
      return apiError("Não foi possível confirmar o frete dos Correios.", 502, "SHIPPING_PROVIDER_ERROR");
    }
  }
  const total = subtotal - discount.cents + shippingCents;
  if (total < 1) return apiError("O total do pedido é inválido.");
  const id = await customerId(env, customer);
  const orderNumber = `ELG-${Date.now().toString(36).toUpperCase()}-${crypto.randomUUID().slice(0, 5).toUpperCase()}`;
  const address = shippingMethod === "pickup" ? null : JSON.stringify(body.shipping || {});
  const orderResult = await env.DB.prepare(`INSERT INTO orders(order_number,customer_id,status,subtotal_cents,discount_cents,shipping_cents,total_cents,shipping_method,shipping_address_json)
    VALUES(?,?,'pending_payment',?,?,?,?,?,?)`).bind(orderNumber, id, subtotal, discount.cents, shippingCents, total, shippingMethod, address).run();
  const orderId = Number(orderResult.meta.last_row_id);
  await env.DB.batch([
    ...products.map(item => env.DB.prepare(`INSERT INTO order_items(order_id,product_id,variant_id,product_name,sku,unit_price_cents,quantity,personalization_json,personalization_fee_cents)
      VALUES(?,?,?,?,?,?,?,?,?)`).bind(orderId, item.product_id, item.variant_id, item.name, item.sku, item.unit_price_cents, item.stock, item.personalization_json, item.personalization_fee_cents)),
    ...products.filter(item => item.image_upload_id).map(item => env.DB.prepare("UPDATE personalization_uploads SET order_id=? WHERE id=? AND order_id IS NULL").bind(orderId, item.image_upload_id)),
    env.DB.prepare("INSERT INTO payments(order_id,provider,status,amount_cents) VALUES(?,'mercado_pago','pending',?)").bind(orderId, total),
  ]);
  const origin = new URL(request.url).origin;
  const preferenceBody = {
    items: [
      ...products.map(item => ({ id: String(item.product_id), title: item.personalization_json ? `${item.name} - Personalizado` : item.name, quantity: item.stock, currency_id: "BRL", unit_price: item.unit_price_cents / 100 })),
      ...(shippingCents ? [{ id: "shipping", title: "Frete Correios", quantity: 1, currency_id: "BRL", unit_price: shippingCents / 100 }] : []),
    ],
    payer: { name: customer.name!.trim(), email, phone: { number: digits(customer.phone || "") }, identification: { type: "CPF", number: digits(customer.cpf || "") } },
    external_reference: orderNumber,
    metadata: { order_id: orderId, order_number: orderNumber },
    back_urls: {
      success: `${origin}/pagamento-retorno.html?status=success&pedido=${encodeURIComponent(orderNumber)}`,
      pending: `${origin}/pagamento-retorno.html?status=pending&pedido=${encodeURIComponent(orderNumber)}`,
      failure: `${origin}/pagamento-retorno.html?status=failure&pedido=${encodeURIComponent(orderNumber)}`,
    },
    auto_return: "approved",
    notification_url: `${origin}/api/payments/mercado-pago/webhook`,
    statement_descriptor: "ELEGANCE18K",
    payment_methods: { installments: 6 },
  };
  try {
    const preference = await mercadoPago<MercadoPagoPreference>(env, "/checkout/preferences", {
      method: "POST",
      headers: { "X-Idempotency-Key": crypto.randomUUID() },
      body: JSON.stringify(preferenceBody),
    });
    await env.DB.prepare("UPDATE payments SET provider_order_id=?,updated_at=CURRENT_TIMESTAMP WHERE order_id=?")
      .bind(preference.id, orderId).run();
    const checkoutUrl = env.MERCADO_PAGO_ACCESS_TOKEN.startsWith("TEST-") ? preference.sandbox_init_point : preference.init_point;
    if (!checkoutUrl) throw new Error("MERCADO_PAGO_WITHOUT_URL");
    return json({ ok: true, order_number: orderNumber, checkout_url: checkoutUrl }, 201);
  } catch (error) {
    await env.DB.batch([
      env.DB.prepare("UPDATE orders SET status='cancelled',updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(orderId),
      env.DB.prepare("UPDATE payments SET status='error',raw_status=?,updated_at=CURRENT_TIMESTAMP WHERE order_id=?")
        .bind(error instanceof Error ? error.message : "unknown", orderId),
    ]);
    return apiError("Não foi possível iniciar o pagamento. Tente novamente.", 502, "PAYMENT_PROVIDER_ERROR");
  }
}

function hex(bytes: ArrayBuffer) { return [...new Uint8Array(bytes)].map(value => value.toString(16).padStart(2, "0")).join(""); }

async function validWebhookSignature(request: Request, secret: string, dataId: string) {
  const signature = request.headers.get("x-signature") || "";
  const requestId = request.headers.get("x-request-id") || "";
  const values = Object.fromEntries(signature.split(",").map(part => part.trim().split("=", 2)));
  if (!values.ts || !values.v1 || !requestId) return false;
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const expected = hex(await crypto.subtle.sign("HMAC", key, encoder.encode(`id:${dataId};request-id:${requestId};ts:${values.ts};`)));
  const left = encoder.encode(expected.toLowerCase()), right = encoder.encode(values.v1.toLowerCase());
  if (left.length !== right.length) return false;
  let mismatch = 0; for (let index = 0; index < left.length; index++) mismatch |= left[index] ^ right[index];
  return mismatch === 0;
}

export async function mercadoPagoWebhook(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const body: { type?: string; data?: { id?: string | number } } = await request.clone()
    .json<{ type?: string; data?: { id?: string | number } }>().catch(() => ({}));
  const dataId = String(url.searchParams.get("data.id") || body.data?.id || "");
  const type = url.searchParams.get("type") || body.type || "";
  if (type !== "payment" || !/^\d+$/.test(dataId)) return json({ ok: true, ignored: true });
  if (env.MERCADO_PAGO_WEBHOOK_SECRET && !(await validWebhookSignature(request, env.MERCADO_PAGO_WEBHOOK_SECRET, dataId))) {
    return apiError("Assinatura inválida.", 401, "INVALID_SIGNATURE");
  }
  const payment = await mercadoPago<MercadoPagoPayment>(env, `/v1/payments/${dataId}`);
  const order = await env.DB.prepare("SELECT id,status,total_cents FROM orders WHERE order_number=?")
    .bind(payment.external_reference || "").first<{ id: number; status: string; total_cents: number }>();
  if (!order || cents(payment.transaction_amount) !== order.total_cents) return apiError("Pagamento não corresponde ao pedido.", 409, "PAYMENT_MISMATCH");
  const mapped = payment.status === "approved" ? "paid" : ["refunded", "charged_back"].includes(payment.status) ? "refunded" : ["cancelled", "rejected"].includes(payment.status) ? "cancelled" : "pending_payment";
  const paymentStatus = payment.status === "approved" ? "approved" : payment.status;
  await env.DB.prepare("UPDATE payments SET provider_payment_id=?,status=?,raw_status=?,updated_at=CURRENT_TIMESTAMP WHERE order_id=?")
    .bind(String(payment.id), paymentStatus, payment.status, order.id).run();
  if (mapped === "paid" && order.status !== "paid") {
    const changed = await env.DB.prepare("UPDATE orders SET status='paid',updated_at=CURRENT_TIMESTAMP WHERE id=? AND status!='paid'").bind(order.id).run();
    if (changed.meta.changes) {
      const items = await env.DB.prepare("SELECT variant_id,quantity FROM order_items WHERE order_id=? AND variant_id IS NOT NULL").bind(order.id).all<{ variant_id: number; quantity: number }>();
      await env.DB.batch(items.results.map(item => env.DB.prepare("UPDATE product_variants SET stock=MAX(0,stock-?),updated_at=CURRENT_TIMESTAMP WHERE id=?")
        .bind(item.quantity, item.variant_id)));
    }
  } else if (mapped !== "paid") {
    await env.DB.prepare("UPDATE orders SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status NOT IN ('shipped','delivered')").bind(mapped, order.id).run();
  }
  console.log(JSON.stringify({ event: "mercado_pago_webhook", payment_id: payment.id, order_id: order.id, status: payment.status }));
  return json({ ok: true });
}

export async function publicPaymentStatus(request: Request, env: Env): Promise<Response> {
  const orderNumber = new URL(request.url).searchParams.get("pedido")?.trim() || "";
  if (!/^ELG-[A-Z0-9-]+$/.test(orderNumber)) return apiError("Pedido inválido.");
  const order = await env.DB.prepare(`SELECT order_number,status,total_cents,shipping_method,tracking_code,created_at
    FROM orders WHERE order_number=?`).bind(orderNumber).first();
  return order ? json({ ok: true, order }) : apiError("Pedido não encontrado.", 404, "NOT_FOUND");
}

export async function mercadoPagoDiagnostic(env: Env): Promise<Response> {
  if (!env.MERCADO_PAGO_ACCESS_TOKEN) return apiError("O Mercado Pago ainda não está configurado.", 503, "PAYMENT_NOT_CONFIGURED");
  try {
    const methods = await mercadoPago<MercadoPagoMethod[]>(env, "/v1/payment_methods");
    const pix = methods.find(method => method.id === "pix" || method.payment_type_id === "bank_transfer");
    return json({ ok: true, pix: { available: Boolean(pix), status: pix?.status || null, id: pix?.id || null }, checkout_pro: true });
  } catch {
    return apiError("Não foi possível consultar os meios de pagamento.", 502, "PAYMENT_PROVIDER_ERROR");
  }
}
