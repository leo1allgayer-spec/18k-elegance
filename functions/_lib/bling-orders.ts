import type { Env } from './types';
import { blingAccessToken } from './bling';
import { stockSchema } from './bling-stock';

type OrderRow = { id:number; order_number:string; shipping_cents:number; shipping_method:string; shipping_address_json:string|null; customer_name:string; customer_email:string; customer_phone:string|null };
type ItemRow = { product_name:string; quantity:number; unit_price_cents:number; bling_id:number|null };

export async function exportPaidOrderToBling(env: Env, orderId: number): Promise<void> {
  // The stock links are created lazily by the Bling settings screen. Ensure the
  // table exists even when the first paid order arrives before that screen was opened.
  await stockSchema(env);
  await env.DB.prepare(`INSERT OR IGNORE INTO bling_order_exports(order_id,status) VALUES(?,'pending')`).bind(orderId).run();
  const exported = await env.DB.prepare("SELECT status FROM bling_order_exports WHERE order_id=?").bind(orderId).first<{status:string}>();
  if (exported?.status === 'sent') return;
  const order = await env.DB.prepare(`SELECT o.id,o.order_number,o.shipping_cents,o.shipping_method,o.shipping_address_json,c.name customer_name,c.email customer_email,c.phone customer_phone FROM orders o JOIN customers c ON c.id=o.customer_id WHERE o.id=? AND o.status IN ('paid','preparing','shipped','delivered')`).bind(orderId).first<OrderRow>();
  if (!order) return;
  const items = await env.DB.prepare(`SELECT i.product_name,i.quantity,i.unit_price_cents,l.bling_id FROM order_items i LEFT JOIN bling_stock_links l ON l.variant_id=i.variant_id WHERE i.order_id=?`).bind(orderId).all<ItemRow>();
  if (!items.results.length || items.results.some(item => !item.bling_id)) return mark(env, orderId, 'error', 'Vincule todos os produtos do pedido ao Bling antes da emissão.');
  let address: Record<string,string> = {};
  try { address = JSON.parse(order.shipping_address_json || '{}'); } catch { /* pickup has no address */ }
  const payload = { numeroLoja: order.order_number, data: new Date().toISOString().slice(0,10), valorFrete: order.shipping_cents / 100,
    contato: { nome: order.customer_name, email: order.customer_email, telefone: order.customer_phone || undefined,
      endereco: Object.keys(address).length ? { geral: { endereco: address.street, numero: address.number, complemento: address.complement || undefined, bairro: address.neighborhood, cep: String(address.postal_code || '').replace(/\D/g,''), municipio: address.city, uf: address.state } } : undefined },
    itens: items.results.map(item => ({ produto: { id: item.bling_id }, quantidade: item.quantity, valor: item.unit_price_cents / 100, descricao: item.product_name })),
  };
  try {
    const token = await blingAccessToken(env);
    const response = await fetch('https://api.bling.com.br/Api/v3/pedidos/vendas', { method:'POST', redirect:'error', signal:AbortSignal.timeout(15000), headers:{Authorization:`Bearer ${token}`,Accept:'application/json','Content-Type':'application/json'}, body:JSON.stringify(payload) });
    const body: { data?: { id?: number }; error?: unknown } = await response.json<{data?:{id?:number};error?:unknown}>().catch(()=>({}));
    if (!response.ok || !body.data?.id) return mark(env, orderId, 'error', `Bling recusou o pedido (HTTP ${response.status}).`);
    await env.DB.prepare("UPDATE bling_order_exports SET status='sent',bling_order_id=?,error=NULL,updated_at=CURRENT_TIMESTAMP WHERE order_id=?").bind(body.data.id,orderId).run();
  } catch { await mark(env,orderId,'error','Não foi possível enviar o pedido ao Bling agora.'); }
}

async function mark(env: Env, orderId: number, status:'error', error:string) { await env.DB.prepare("UPDATE bling_order_exports SET status=?,error=?,updated_at=CURRENT_TIMESTAMP WHERE order_id=?").bind(status,error,orderId).run(); }
