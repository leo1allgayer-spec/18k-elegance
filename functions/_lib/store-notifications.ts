import type { Env } from './types';
import { sendWhatsAppMessage, whatsappConfigured } from './whatsapp';

export async function sendStoreNotification(env:Env,orderId:number){
 if(!whatsappConfigured(env))return;
 const order=await env.DB.prepare(`SELECT o.order_number,o.total_cents,o.shipping_method,o.shipping_address_json,c.name,c.phone
 FROM store_notifications n JOIN orders o ON o.id=n.order_id JOIN customers c ON c.id=o.customer_id
 WHERE n.order_id=? AND n.status='pending' AND o.status IN ('paid','preparing','shipped','delivered')`).bind(orderId).first<{order_number:string;total_cents:number;shipping_method:string;shipping_address_json:string|null;name:string;phone:string|null}>();
 if(!order)return;
 const claim=await env.DB.prepare("UPDATE store_notifications SET status='sending' WHERE order_id=? AND status='pending'").bind(orderId).run();
 if(!claim.meta.changes)return;
 let address:Record<string,string>={};
 try{address=JSON.parse(order.shipping_address_json||'{}')||{};}catch{}
 const methods:Record<string,string>={pickup:'Retirada em loja',motoboy:'Motoboy',correios:'Correios'};
 const message=['🛍️ Nova compra aprovada — Elegance 18K',`Pedido: ${order.order_number}`,`Cliente: ${order.name}`,order.phone?`WhatsApp do cliente: ${order.phone}`:'',`Total: ${(order.total_cents/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}`,`Entrega: ${methods[order.shipping_method]||order.shipping_method}`,
 order.shipping_method!=='pickup'?[address.street,address.number,address.complement,address.neighborhood,address.city,address.state,address.postal_code].filter(Boolean).join(', '):'',
 address.preferred_delivery_date?`Data solicitada: ${address.preferred_delivery_date.split('-').reverse().join('/')}`:'',address.preferred_delivery_time?`Horário solicitado: ${address.preferred_delivery_time}`:'','Confira os itens e prepare o pedido no painel: https://elegance18k.com/admin-demo'].filter(Boolean).join('\n');
 try{
  await sendWhatsAppMessage(env,'5551994927676',message);
  await env.DB.prepare("UPDATE store_notifications SET status='sent',sent_at=CURRENT_TIMESTAMP,last_error=NULL WHERE order_id=?").bind(orderId).run();
 }catch(error){
  const detail=error instanceof Error?error.message:'Falha no envio';
  // Do not repeat an ambiguous timeout: the provider may have delivered it.
  await env.DB.prepare("UPDATE store_notifications SET status=?,last_error=? WHERE order_id=?").bind(/^EVOLUTION_SEND_FAILED_4\d\d$/.test(detail)?'failed':'uncertain',detail.slice(0,200),orderId).run();
 }
}
export async function sendPendingStoreNotifications(env:Env){
 if(!whatsappConfigured(env))return;
 const pending=await env.DB.prepare("SELECT order_id FROM store_notifications WHERE status='pending' ORDER BY created_at LIMIT 3").all<{order_id:number}>();
 for(const row of pending.results)await sendStoreNotification(env,row.order_id);
}
