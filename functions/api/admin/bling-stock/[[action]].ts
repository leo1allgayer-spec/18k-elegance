import { currentCustomer } from "../../../_lib/auth";
import { json, apiError } from "../../../_lib/http";
import type { Env } from "../../../_lib/types";
import { stockStatus, stockCatalog, stockSchema, linkStock, exportStockProduct, resolveStock, runStockSync } from "../../../_lib/bling-stock";

export const onRequest: PagesFunction<Env> = async ({ request, env, params }) => {
  const admin = await currentCustomer(request, env);
  if (admin?.role !== "admin") return apiError("Acesso restrito.", 403);
  const action = Array.isArray(params.action) ? params.action.join("/") : params.action;
  try {
    if (request.method === "GET" && action === "status") return json({ ok: true, ...await stockStatus(env) });
    if (request.method === "GET" && action === "catalog") return json({ ok: true, ...await stockCatalog(env) });
    if (request.method !== "POST") return apiError("Rota não encontrada.", 404);
    // These operations change stock configuration; reject cross-site submissions.
    if (request.headers.get("origin") && request.headers.get("origin") !== new URL(request.url).origin) return apiError("Origem inválida.", 403);
    if (action === "run") return json({ ok: true, ...await runStockSync(env) });
    const body = await request.json<Record<string, unknown>>();
    if (action === "enabled") {
      if (typeof body.enabled !== "boolean") return apiError("Informe o estado da sincronização.");
      await stockSchema(env);
      await env.DB.prepare("UPDATE bling_stock_control SET enabled=? WHERE id=1").bind(body.enabled ? 1 : 0).run();
    } else if (action === "link") {
      const ids = [body.variant_id, body.bling_id, body.deposit_id];
      if (!ids.every(id => typeof id === "number" && Number.isSafeInteger(id) && id > 0)) return apiError("Identificadores inválidos.");
      await linkStock(env, Number(body.variant_id), Number(body.bling_id), Number(body.deposit_id));
    } else if (action === "export") {
      if (![body.variant_id, body.deposit_id].every(id => typeof id === "number" && Number.isSafeInteger(id) && id > 0)) return apiError("Identificadores inválidos.");
      await exportStockProduct(env, Number(body.variant_id), Number(body.deposit_id));
    } else if (action === "resolve") {
      if (!Number.isSafeInteger(body.variant_id) || (body.source !== "site" && body.source !== "bling")) return apiError("Escolha qual saldo manter.");
      await resolveStock(env, Number(body.variant_id), body.source);
    } else return apiError("Rota não encontrada.", 404);
    return json({ ok: true, ...await stockStatus(env) });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "Não foi possível concluir a integração.", 409, "STOCK_SYNC_ERROR");
  }
};
