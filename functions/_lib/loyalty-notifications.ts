import type { Env } from './types';
import { normalizeBrazilPhone,sendWhatsAppImage,whatsappConfigured } from './whatsapp';

export async function sendLoyaltyNotification(env:Env,orderId:number){
 if(!whatsappConfigured(env))return;
 const notice=await env.DB.prepare(`SELECT n.order_id,n.purchase_count,c.name,c.phone FROM loyalty_notifications n
 JOIN customers c ON c.id=n.customer_id JOIN orders o ON o.id=n.order_id
 WHERE n.order_id=? AND n.status='pending' AND o.status IN ('paid','preparing','shipped','delivered')`).bind(orderId).first<{order_id:number;purchase_count:number;name:string;phone:string|null}>();
 if(!notice)return;
 const claim=await env.DB.prepare("UPDATE loyalty_notifications SET status='sending' WHERE order_id=? AND status='pending'").bind(orderId).run();
 if(!claim.meta.changes)return;
 const phone=normalizeBrazilPhone(notice.phone||'');
 if(!phone){await env.DB.prepare("UPDATE loyalty_notifications SET status='skipped',last_error='Telefone não informado ou inválido' WHERE order_id=?").bind(orderId).run();return;}
 const progress=notice.purchase_count%10||10;
 const caption=[`Olá, ${notice.name.split(/\s+/)[0]}! Seu pagamento foi aprovado. ✨`,
 'Você está participando do Clube Elegance 18K!',
 `Esta compra foi adicionada à sua fidelidade: ${progress} de 10 marcas neste cartão.`,
 progress===10?'Você completou o cartão e ganhou 15% OFF nos produtos para uma próxima compra!':`Faltam ${10-progress} compras confirmadas para ganhar 15% OFF nos produtos.`,
 `Total acumulado: ${notice.purchase_count} ${notice.purchase_count===1?'compra paga':'compras pagas'}.`,
 'Confira seu progresso e benefícios na sua conta: https://elegance18k.com/conta',
 'O benefício exige acesso à sua conta e não acumula com cupons. Regras: https://elegance18k.com/fidelidade'].join('\n\n');
 try{
  await sendWhatsAppImage(env,phone,`https://elegance18k.com/assets/loyalty-card-${progress}.png`,caption,'cartao-fidelidade-elegance-18k.png');
  await env.DB.prepare("UPDATE loyalty_notifications SET status='sent',sent_at=CURRENT_TIMESTAMP,last_error=NULL WHERE order_id=? AND status='sending'").bind(orderId).run();
 }catch(error){
  // A timeout can mean that Evolution delivered the message. Never repeat an
  // uncertain attempt or send a text fallback, which could duplicate it.
  const detail=error instanceof Error?error.message:'Falha no envio';
  await env.DB.prepare("UPDATE loyalty_notifications SET status=?,last_error=? WHERE order_id=? AND status='sending'").bind(/^EVOLUTION_MEDIA_FAILED_4\d\d$/.test(detail)?'failed':'uncertain',detail.slice(0,200),orderId).run();
  console.error(JSON.stringify({event:'loyalty_whatsapp_failed',order_id:orderId,error:detail}));
 }
}
export async function sendPendingLoyaltyNotifications(env:Env){
 if(!whatsappConfigured(env))return;
 const pending=await env.DB.prepare("SELECT n.order_id FROM loyalty_notifications n JOIN orders o ON o.id=n.order_id WHERE n.status='pending' AND o.status IN ('paid','preparing','shipped','delivered') ORDER BY n.created_at LIMIT 3").all<{order_id:number}>();
 for(const row of pending.results)await sendLoyaltyNotification(env,row.order_id);
}
