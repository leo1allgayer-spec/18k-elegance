import type { Env } from "../../_lib/types";
import { apiError, json } from "../../_lib/http";
import { runStockSync } from "../../_lib/bling-stock";
import { verifyStockTick } from "../../_lib/stock-signature";

export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  if (request.method !== "POST") return apiError("Método não permitido.", 405);
  const timestamp = request.headers.get("X-Stock-Time") || "";
  const signature = request.headers.get("X-Stock-Signature") || "";
  if (!timestamp || !signature) return apiError("Acesso restrito.", 403);
  try {
    const control = await env.DB.prepare("SELECT secret FROM bling_stock_control WHERE id=1").first<{ secret: string }>();
    if (!control || !await verifyStockTick(control.secret, timestamp, signature)) return apiError("Acesso restrito.", 403);
    await env.DB.prepare("UPDATE bling_stock_control SET last_tick=CURRENT_TIMESTAMP WHERE id=1").run();
    return json({ ok: true, ...await runStockSync(env) });
  } catch {
    return apiError("Sincronização indisponível. Consulte o painel administrativo.", 503);
  }
};
