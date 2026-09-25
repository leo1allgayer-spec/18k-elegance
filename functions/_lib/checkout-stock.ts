import type { Env } from './types';

export function reservationStatements(env: Env, orderId: number, items: {variant_id:number;stock:number}[]) {
  const quantities = new Map<number,number>();
  for (const item of items) quantities.set(item.variant_id,(quantities.get(item.variant_id)||0)+item.stock);
  return [...quantities].map(([variant,quantity]) => env.DB.prepare(
    'INSERT INTO stock_reservations(order_id,variant_id,quantity) VALUES(?,?,?)').bind(orderId,variant,quantity));
}

export async function releaseCheckout(env: Env, orderId: number) {
  // Release only after a definitive refusal or confirmation of an expired checkout.
  await env.DB.batch([
    env.DB.prepare(`UPDATE stock_reservations SET status='released' WHERE order_id=? AND status='held'
      AND NOT EXISTS(SELECT 1 FROM finalized_orders WHERE order_id=?)`).bind(orderId,orderId),
    env.DB.prepare(`UPDATE gift_card_uses SET status='released' WHERE order_id=? AND status='reserved'
      AND NOT EXISTS(SELECT 1 FROM finalized_orders WHERE order_id=?)`).bind(orderId,orderId),
    env.DB.prepare(`UPDATE orders SET status='cancelled',updated_at=CURRENT_TIMESTAMP WHERE id=?
      AND NOT EXISTS(SELECT 1 FROM finalized_orders WHERE order_id=?)`).bind(orderId,orderId),
  ]);
}

export async function finalizeOrder(env: Env, orderId: number) {
  await env.DB.prepare('INSERT OR IGNORE INTO finalized_orders(order_id) VALUES(?)').bind(orderId).run();
}
