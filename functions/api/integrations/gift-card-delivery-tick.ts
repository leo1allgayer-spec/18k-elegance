import type { Env } from "../../_lib/types";
import { apiError, json } from "../../_lib/http";
import { sendScheduledGiftCards } from "../../_lib/gift-cards";
import { sendPendingLoyaltyNotifications } from '../../_lib/loyalty-notifications';
import { sendPendingStoreNotifications } from '../../_lib/store-notifications';
import { verifyStockTick } from "../../_lib/stock-signature";

export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  if (request.method !== "POST") return apiError("Método não permitido.", 405);
  const timestamp = request.headers.get("X-Stock-Time") || "";
  const signature = request.headers.get("X-Stock-Signature") || "";
  const control = await env.DB.prepare("SELECT secret FROM bling_stock_control WHERE id=1").first<{ secret: string }>();
  if (!control || !await verifyStockTick(control.secret, timestamp, signature)) return apiError("Acesso restrito.", 403);
  // Signed diagnostic renders only fictitious data, without delivery or DB writes.
  if(new URL(request.url).searchParams.get('preview_image')==='1'){
    const {renderGiftCard}=await import('../../_lib/gift-card-image');
    const png=await renderGiftCard({recipient_name:'Exemplo',initial_cents:5000,message:'Parabéns pelo seu dia!'});
    return json({ok:true,image_bytes:png.length});
  }
  await sendPendingLoyaltyNotifications(env);
  await sendPendingStoreNotifications(env);
  return json({ ok: true, ...await sendScheduledGiftCards(env) });
};
