import type { Env } from "./types";
import { currentCustomer, sha256 } from "./auth";
import { apiError, json, readJson } from "./http";
import { normalizeBrazilPhone, sendWhatsAppMessage, whatsappConfigured } from "./whatsapp";

async function provider<T>(env:Env,path:string,body?:unknown):Promise<T>{
 const token=env.MERCADO_PAGO_ACCESS_TOKEN?.trim();
 if(!token)throw new Error("Pagamento indisponível.");
 const response=await fetch("https://api.mercadopago.com"+path,{signal:AbortSignal.timeout(15000),method:body?"POST":"GET",headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"},...(body?{body:JSON.stringify(body)}:{})});
 if(!response.ok)throw new Error("Não foi possível consultar o Mercado Pago.");
 return response.json<T>();
}
type Sale={id:string;gift_card_id:number;customer_id:number;amount_cents:number;status:string;checkout_url:string|null};
type ScheduledCard={id:number;code:string;recipient_name:string;recipient_phone:string;message:string|null;initial_cents:number};

function brazilToday(): string {
 const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts();
 const read = (type: string) => parts.find(part => part.type === type)?.value || "";
 return `${read("year")}-${read("month")}-${read("day")}`;
}

function scheduledAt(date: string, time: string): string | null {
 if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time) || date < brazilToday()) return null;
 const parsed = Date.parse(`${date}T${time}:00.000-03:00`);
 return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function deliveryMessage(card: ScheduledCard): string {
 const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(card.initial_cents / 100);
 return ["Você recebeu um Cartão Presente Elegance 18K!", `Para: ${card.recipient_name}`, `Valor: ${money}`, card.message || "", `Código: ${card.code}`, "Use no pagamento da sua compra: https://elegance18k.com/"].filter(Boolean).join("\n");
}

export async function sendScheduledGiftCards(env: Env): Promise<{ sent: number; failed: number }> {
 if (!whatsappConfigured(env)) return { sent: 0, failed: 0 };
 const due = await env.DB.prepare(`SELECT id,code,recipient_name,recipient_phone,message,initial_cents FROM gift_cards
   WHERE status='active' AND delivery_status='scheduled' AND datetime(delivery_scheduled_for)<=CURRENT_TIMESTAMP
   ORDER BY delivery_scheduled_for ASC LIMIT 25`).all<ScheduledCard>();
 let sent = 0, failed = 0;
 for (const card of due.results) {
  const claim = await env.DB.prepare("UPDATE gift_cards SET delivery_status='sending',delivery_attempts=delivery_attempts+1,delivery_last_error=NULL WHERE id=? AND delivery_status='scheduled'").bind(card.id).run();
  if (!claim.meta.changes) continue;
  const phone = normalizeBrazilPhone(card.recipient_phone || "");
  if (!phone) {
   await env.DB.prepare("UPDATE gift_cards SET delivery_status='failed',delivery_last_error='Telefone inválido' WHERE id=?").bind(card.id).run();
   failed++; continue;
  }
  try {
   await sendWhatsAppMessage(env, phone, deliveryMessage(card));
   await env.DB.prepare("UPDATE gift_cards SET delivery_status='sent',delivery_sent_at=CURRENT_TIMESTAMP,delivery_last_error=NULL WHERE id=? AND delivery_status='sending'").bind(card.id).run();
   sent++;
  } catch (error) {
   const detail = error instanceof Error && /^EVOLUTION_SEND_FAILED_\d{3}$/.test(error.message) ? error.message : 'Falha temporária no envio';
   await env.DB.prepare("UPDATE gift_cards SET delivery_status='scheduled',delivery_last_error=? WHERE id=? AND delivery_status='sending'").bind(detail, card.id).run();
   failed++;
  }
 }
 return { sent, failed };
}
export async function syncGiftPayment(env:Env,payment:{id:number;status:string;transaction_amount:number;external_reference?:string}){
 if(!payment.external_reference?.startsWith("GFT-"))return false;
 const sale=await env.DB.prepare("SELECT * FROM gift_card_sales WHERE id=?").bind(payment.external_reference).first<Sale>();
 if(!sale||Math.round(payment.transaction_amount*100)!==sale.amount_cents)throw new Error("Pagamento do cartão não corresponde à compra.");
 if(payment.status==="approved"){
  await env.DB.batch([
   env.DB.prepare("UPDATE gift_cards SET status='active',balance_cents=initial_cents WHERE id=? AND status='pending_payment'").bind(sale.gift_card_id),
   env.DB.prepare("UPDATE gift_card_sales SET status='approved',payment_id=? WHERE id=? AND status!='refunded'").bind(String(payment.id),sale.id)
  ]);
 }else if(["refunded","charged_back"].includes(payment.status)){
  await env.DB.batch([
   env.DB.prepare("UPDATE gift_cards SET status='refunded' WHERE id=?").bind(sale.gift_card_id),
   env.DB.prepare("UPDATE gift_card_sales SET status='refunded',payment_id=? WHERE id=?").bind(String(payment.id),sale.id)
  ]);
 }
 return true;
}
export async function giftCardBalance(env:Env,code:string){
 if(!/^ELG-[A-F0-9]{32}$/.test(code))return null;
 return env.DB.prepare("SELECT id,balance_cents FROM gift_cards WHERE code_hash=? AND status='active' AND (expires_at IS NULL OR expires_at>CURRENT_TIMESTAMP)").bind(await sha256(code)).first<{id:number;balance_cents:number}>();
}
export async function giftCardsRequest(request:Request,env:Env):Promise<Response>{
 const customer=await currentCustomer(request,env);
 if(!customer)return apiError("Entre ou crie sua conta para comprar ou usar um cartão-presente.",401);
 const path=new URL(request.url).pathname.split('/').filter(Boolean);
 const saleId=path.length===3?path[2]:'';
 if(request.method==='DELETE'){
  if(!/^GFT-[a-f0-9-]{36}$/i.test(saleId))return apiError('Cartão-presente inválido.',404);
  const sale=await env.DB.prepare(`SELECT s.id,s.gift_card_id FROM gift_card_sales s JOIN gift_cards g ON g.id=s.gift_card_id
    WHERE s.id=? AND s.customer_id=? AND s.status='pending' AND g.status='pending_payment'
    AND datetime(g.created_at)<=datetime('now','-48 hours')`).bind(saleId,customer.id).first<{id:string;gift_card_id:number}>();
  if(!sale)return apiError('Somente cartões não pagos há pelo menos 48 horas podem ser excluídos.',409);
  await env.DB.prepare('DELETE FROM gift_card_sales WHERE id=? AND customer_id=?').bind(sale.id,customer.id).run();
  await env.DB.prepare("DELETE FROM gift_cards WHERE id=? AND status='pending_payment'").bind(sale.gift_card_id).run();
  return json({ok:true});
 }
 if(request.method==="GET"){
  const requested=new URL(request.url).searchParams.get("sale");
  if(requested){
   const sale=await env.DB.prepare("SELECT * FROM gift_card_sales WHERE id=? AND customer_id=?").bind(requested,customer.id).first<Sale>();
   if(sale&&sale.status==="pending"){
    const result=await provider<{results:{id:number;status:string;transaction_amount:number;external_reference:string}[]}>(env,"/v1/payments/search?external_reference="+encodeURIComponent(sale.id));
    for(const payment of result.results)await syncGiftPayment(env,payment);
   }
  }
  const rows=await env.DB.prepare("SELECT s.id,s.status,s.checkout_url,g.recipient_name,g.recipient_phone,g.message,g.initial_cents,g.balance_cents,g.delivery_scheduled_for,g.delivery_sent_at,g.delivery_status,g.created_at,CASE WHEN g.status='active' AND g.delivery_status='not_scheduled' THEN g.code ELSE NULL END AS code FROM gift_card_sales s JOIN gift_cards g ON g.id=s.gift_card_id WHERE s.customer_id=? ORDER BY g.id DESC LIMIT 100").bind(customer.id).all();
  const reserved=await env.DB.prepare("SELECT o.order_number,o.gift_checkout_url,u.amount_cents FROM gift_card_uses u JOIN orders o ON o.id=u.order_id WHERE o.customer_id=? AND u.status='reserved' ORDER BY o.id DESC LIMIT 50").bind(customer.id).all();
  return json({cards:rows.results,reserved:reserved.results});
 }
 if(request.method!=="POST")return apiError("Método não permitido.",405);
 if(request.headers.get("origin")!==new URL(request.url).origin)return apiError("Origem inválida.",403);
 const body=await readJson<{action?:string;code?:string;amount_cents?:number;recipient_name?:string;recipient_phone?:string;message?:string;delivery_date?:string;delivery_time?:string;request_key?:string}>(request);
 if(body.action==="balance"){
  const card=await giftCardBalance(env,String(body.code||"").trim().toUpperCase());
  return card?json({balance_cents:card.balance_cents}):apiError("Cartão inválido ou ainda não liberado.",400);
 }
 const amount=body.amount_cents,name=String(body.recipient_name||"").trim(),phone=String(body.recipient_phone||"").replace(/\D/g,""),message=String(body.message||"").trim(),key=String(body.request_key||""),delivery=scheduledAt(String(body.delivery_date||""),String(body.delivery_time||""));
 if(!Number.isInteger(amount)||amount!<100||amount!>200000||name.length<2||name.length>100||phone.length<10||phone.length>13||message.length>1000||!delivery||!/^[-a-zA-Z0-9]{16,80}$/.test(key))return apiError("Confira o valor, nome, WhatsApp, mensagem e data de envio.");
 const existing=await env.DB.prepare("SELECT * FROM gift_card_sales WHERE customer_id=? AND request_key=?").bind(customer.id,key).first<Sale>();
 if(existing?.checkout_url)return json({checkout_url:existing.checkout_url});
 if(existing&&existing.amount_cents!==amount)return apiError("Atualize a página para iniciar uma compra com outro valor.",409);
 const id=existing?.id||"GFT-"+crypto.randomUUID(),code="ELG-"+crypto.randomUUID().replaceAll("-","").toUpperCase();
 if(!existing){
  const codeHash=await sha256(code);
  await env.DB.prepare("INSERT INTO gift_card_sales(id,customer_id,amount_cents,request_key) VALUES(?,?,?,?)").bind(id,customer.id,amount!,key).run();
  await env.DB.prepare("INSERT INTO gift_cards(code_hash,code,purchaser_customer_id,recipient_name,recipient_phone,message,initial_cents,balance_cents,delivery_scheduled_for,delivery_status) VALUES(?,?,?,?,?,?,?,?,?, 'scheduled')").bind(codeHash,code,customer.id,name,phone,message,amount!,amount!,delivery).run();
  await env.DB.prepare("UPDATE gift_card_sales SET gift_card_id=(SELECT id FROM gift_cards WHERE code_hash=?) WHERE id=?").bind(codeHash,id).run();
 }
 const origin=new URL(request.url).origin;
 const result=await provider<{init_point:string;sandbox_init_point:string}>(env,"/checkout/preferences",{
  items:[{id,title:"Cartão-presente Elegance 18K",quantity:1,currency_id:"BRL",unit_price:amount!/100}],
  payer:{name:customer.name,email:customer.email},external_reference:id,
  back_urls:{success:origin+"/cartao-presente.html?sale="+id,pending:origin+"/cartao-presente.html?sale="+id,failure:origin+"/cartao-presente.html?sale="+id},
  auto_return:"approved",notification_url:origin+"/api/payments/mercado-pago/webhook"
 });
 // Mercado Pago may omit the sandbox link for a production preference (and vice
 // versa). Always use the valid link it returned instead of sending an empty URL
 // to the customer's browser.
 const preferred=env.MERCADO_PAGO_ACCESS_TOKEN!.trim().startsWith("TEST-")?result.sandbox_init_point:result.init_point;
 const checkout=preferred||result.init_point||result.sandbox_init_point;
 let paymentUrl: URL;
 try { paymentUrl = new URL(checkout); }
 catch { throw new Error("O Mercado Pago não retornou um link de pagamento válido. Tente novamente em instantes."); }
 if(paymentUrl.protocol!=="https:")throw new Error("O Mercado Pago não retornou um link de pagamento seguro. Tente novamente em instantes.");
 await env.DB.prepare("UPDATE gift_card_sales SET checkout_url=? WHERE id=?").bind(paymentUrl.toString(),id).run();
 return json({checkout_url:paymentUrl.toString()},201);
}
