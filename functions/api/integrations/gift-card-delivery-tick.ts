import type { Env } from "../../_lib/types";
import { apiError, json } from "../../_lib/http";
import { sendScheduledGiftCards } from "../../_lib/gift-cards";
import { verifyStockTick } from "../../_lib/stock-signature";

export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  if (request.method !== "POST") return apiError("Método não permitido.", 405);
  const timestamp = request.headers.get("X-Stock-Time") || "";
  const signature = request.headers.get("X-Stock-Signature") || "";
  const control = await env.DB.prepare("SELECT secret FROM bling_stock_control WHERE id=1").first<{ secret: string }>();
  if (!control || !await verifyStockTick(control.secret, timestamp, signature)) return apiError("Acesso restrito.", 403);
  return json({ ok: true, ...await sendScheduledGiftCards(env) });
};
