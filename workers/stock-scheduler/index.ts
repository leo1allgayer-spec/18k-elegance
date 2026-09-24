import { signStockTick } from "../../functions/_lib/stock-signature";

export default {
  async scheduled(_controller, env) {
    const control = await env.DB.prepare("SELECT secret FROM bling_stock_control WHERE id=1").first<{ secret: string }>();
    if (!control) return;
    const timestamp = String(Date.now());
    // Pages cannot be a Service Binding target (Wrangler explicitly rejects it).
    // Only this fixed same-project URL is called. HMAC never exposes the secret.
    const response = await fetch("https://elegance18k.com/api/integrations/bling-stock-tick", {
      method: "POST", headers: { "X-Stock-Time": timestamp, "X-Stock-Signature": await signStockTick(control.secret, timestamp) },
      signal: AbortSignal.timeout(115000), redirect: "error",
    });
    await response.body?.cancel();
    if (!response.ok) throw new Error(`Stock synchronization HTTP ${response.status}; see admin settings.`);
  },
} satisfies ExportedHandler<StockSchedulerEnv>;
