import type { Env } from "./types";
import { apiError, json, readJson } from "./http";

type CartItem = { product_id?: number; variant_id?: number; quantity?: number };
type PackageRow = { weight_grams: number; width_cm: number; height_cm: number; length_cm: number; stock: number };
export type ShippingQuote = { code: string; name: string; price_cents: number; delivery_days: number };
type CorreiosTokenResponse = { token?: string; expiraEm?: string };

let tokenCache: { value: string; expiresAt: number } | null = null;

const digits = (value: string) => value.replace(/\D/g, "");
const amount = (value: unknown) => Math.round(Number(String(value || "0").replace(".", "").replace(",", ".")) * 100);
const hasAutomaticCredentials = (env: Env) => Boolean(env.CORREIOS_USER && env.CORREIOS_ACCESS_CODE && env.CORREIOS_POSTING_CARD && env.CORREIOS_CONTRACT && env.CORREIOS_DR);
export const correiosConfigured = (env: Env) => Boolean((env.CORREIOS_API_TOKEN || hasAutomaticCredentials(env)) && digits(env.CORREIOS_ORIGIN_ZIP || "").length === 8 && env.CORREIOS_PAC_CODE && env.CORREIOS_SEDEX_CODE);

async function correiosToken(env: Env) {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 30 * 60 * 1000) return tokenCache.value;
  if (!hasAutomaticCredentials(env)) {
    if (env.CORREIOS_API_TOKEN) return env.CORREIOS_API_TOKEN;
    throw new Error("CORREIOS_NOT_CONFIGURED");
  }
  const basic = btoa(`${env.CORREIOS_USER}:${env.CORREIOS_ACCESS_CODE}`);
  const response = await fetch("https://api.correios.com.br/token/v1/autentica/cartaopostagem", {
    method: "POST",
    headers: { Authorization: `Basic ${basic}`, Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ numero: env.CORREIOS_POSTING_CARD, contrato: env.CORREIOS_CONTRACT, dr: Number(env.CORREIOS_DR) }),
  });
  const payload: CorreiosTokenResponse = await response.json<CorreiosTokenResponse>().catch(() => ({}));
  if (!response.ok || !payload.token) {
    console.error(JSON.stringify({ event: "correios_token_error", status: response.status }));
    throw new Error(response.status === 401 ? "CORREIOS_AUTH" : "CORREIOS_PROVIDER");
  }
  const parsedExpiry = Date.parse(payload.expiraEm || "");
  tokenCache = { value: payload.token, expiresAt: Number.isFinite(parsedExpiry) ? parsedExpiry : Date.now() + 23 * 60 * 60 * 1000 };
  return tokenCache.value;
}

async function packageFor(env: Env, items: CartItem[]) {
  let weight = 0, width = 11, height = 2, length = 16;
  for (const item of items.slice(0, 50)) {
    const quantity = Math.trunc(Number(item.quantity));
    if (!item.product_id || !item.variant_id || quantity < 1 || quantity > 20) throw new Error("INVALID_CART");
    const row = await env.DB.prepare(`SELECT p.weight_grams,p.width_cm,p.height_cm,p.length_cm,v.stock
      FROM products p JOIN product_variants v ON v.product_id=p.id
      WHERE p.id=? AND v.id=? AND p.active=1 AND v.active=1`).bind(item.product_id, item.variant_id).first<PackageRow>();
    if (!row || row.stock < quantity) throw new Error("OUT_OF_STOCK");
    weight += Math.max(1, row.weight_grams) * quantity;
    width = Math.max(width, row.width_cm || 0); length = Math.max(length, row.length_cm || 0);
    height += Math.max(1, row.height_cm || 0) * quantity;
  }
  if (!weight) throw new Error("EMPTY_CART");
  return { weight: Math.max(300, weight), width: Math.ceil(width), height: Math.ceil(height), length: Math.ceil(length) };
}

async function correiosGet(env: Env, base: string, service: string, params: URLSearchParams) {
  const token = await correiosToken(env);
  const response = await fetch(`https://api.correios.com.br/${base}/v1/nacional/${encodeURIComponent(service)}?${params}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  const payload: Record<string, unknown> = await response.json<Record<string, unknown>>().catch(() => ({}));
  if (!response.ok) {
    console.error(JSON.stringify({ event: "correios_error", base, service, status: response.status }));
    throw new Error(response.status === 401 || response.status === 403 ? "CORREIOS_AUTH" : "CORREIOS_PROVIDER");
  }
  return payload;
}

export async function calculateCorreiosQuotes(env: Env, destination: string, items: CartItem[]): Promise<ShippingQuote[]> {
  if (!correiosConfigured(env)) throw new Error("CORREIOS_NOT_CONFIGURED");
  const cepDestino = digits(destination);
  if (cepDestino.length !== 8) throw new Error("INVALID_POSTAL_CODE");
  const box = await packageFor(env, items), origin = digits(env.CORREIOS_ORIGIN_ZIP || "");
  const services = [{ code: env.CORREIOS_PAC_CODE!, name: "PAC" }, { code: env.CORREIOS_SEDEX_CODE!, name: "SEDEX" }];
  return Promise.all(services.map(async service => {
    const priceParams = new URLSearchParams({ cepDestino, cepOrigem: origin, psObjeto: String(box.weight), tpObjeto: "2", largura: String(box.width), altura: String(box.height), comprimento: String(box.length) });
    if (env.CORREIOS_CONTRACT) priceParams.set("nuContrato", env.CORREIOS_CONTRACT);
    if (env.CORREIOS_DR) priceParams.set("nuDR", env.CORREIOS_DR);
    const [price, deadline] = await Promise.all([
      correiosGet(env, "preco", service.code, priceParams),
      correiosGet(env, "prazo/v3", service.code, new URLSearchParams({ cepOrigem: origin, cepDestino })),
    ]);
    const priceCents = amount(price.pcFinal ?? price.pcBase ?? price.preco ?? price.valor);
    const deliveryDays = Number(deadline.prazoEntrega ?? deadline.prazo ?? deadline.diasUteis ?? 0);
    if (priceCents < 1 || deliveryDays < 1) throw new Error("CORREIOS_INVALID_RESPONSE");
    return { code: service.code, name: service.name, price_cents: priceCents, delivery_days: deliveryDays };
  }));
}

export async function publicCorreiosQuote(request: Request, env: Env): Promise<Response> {
  if (!correiosConfigured(env)) return apiError("O frete dos Correios ainda não está configurado.", 503, "CORREIOS_NOT_CONFIGURED");
  const body = await readJson<{ postal_code?: string; items?: CartItem[] }>(request);
  try { return json({ ok: true, quotes: await calculateCorreiosQuotes(env, body.postal_code || "", body.items || []) }); }
  catch (error) {
    const code = error instanceof Error ? error.message : "CORREIOS_PROVIDER";
    if (code === "INVALID_POSTAL_CODE") return apiError("Digite um CEP válido.", 400, code);
    if (["INVALID_CART", "EMPTY_CART", "OUT_OF_STOCK"].includes(code)) return apiError("Não foi possível calcular o pacote da sacola.", 400, code);
    return apiError("Os Correios não retornaram uma cotação agora. Tente novamente.", 502, code);
  }
}
