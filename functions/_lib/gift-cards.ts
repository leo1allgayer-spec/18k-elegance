import type { Env } from "./types";
import { currentCustomer, sha256 } from "./auth";
import { apiError, json, readJson } from "./http";

async function provider<T>(env:Env,path:string,body?:unknown):Promise<T>{
 if(!env.MERCADO_PAGO_ACCESS_TOKEN)throw new Error("Pagamento indisponível.");
 const response=await fetch("https://api.mercadopago.com"+path,{method:body?"POST":"GET",headers:{Authorization:"Bearer "+env.MERCADO_PAGO_ACCESS_TOKEN,"Content-Type":"application/json"},...(body?{body:JSON.stringify(body)}:{})});
 if(!response.ok)throw new Error("Não foi possível consultar o Mercado Pago.");
 return response.json<T>();
}
type Sale={id:string;gift_card_id:number;customer_id:number;amount_cents:number;status:string;checkout_url:string|null};
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
 if(request.method==="GET"){
  const requested=new URL(request.url).searchParams.get("sale");
  if(requested){
   const sale=await env.DB.prepare("SELECT * FROM gift_card_sales WHERE id=? AND customer_id=?").bind(requested,customer.id).first<Sale>();
   if(sale&&sale.status==="pending"){
    const result=await provider<{results:{id:number;status:string;transaction_amount:number;external_reference:string}[]}>(env,"/v1/payments/search?external_reference="+encodeURIComponent(sale.id));
    for(const payment of result.results)await syncGiftPayment(env,payment);
   }
  }
  const rows=await env.DB.prepare("SELECT s.id,s.status,s.checkout_url,g.recipient_name,g.recipient_phone,g.message,g.initial_cents,g.balance_cents,CASE WHEN g.status='active' THEN g.code ELSE NULL END AS code FROM gift_card_sales s JOIN gift_cards g ON g.id=s.gift_card_id WHERE s.customer_id=? ORDER BY g.id DESC LIMIT 100").bind(customer.id).all();
  const reserved=await env.DB.prepare("SELECT o.order_number,o.gift_checkout_url,u.amount_cents FROM gift_card_uses u JOIN orders o ON o.id=u.order_id WHERE o.customer_id=? AND u.status='reserved' ORDER BY o.id DESC LIMIT 50").bind(customer.id).all();
  return json({cards:rows.results,reserved:reserved.results});
 }
 if(request.method!=="POST")return apiError("Método não permitido.",405);
 if(request.headers.get("origin")!==new URL(request.url).origin)return apiError("Origem inválida.",403);
 const body=await readJson<{action?:string;code?:string;amount_cents?:number;recipient_name?:string;recipient_phone?:string;message?:string;request_key?:string}>(request);
 if(body.action==="balance"){
  const card=await giftCardBalance(env,String(body.code||"").trim().toUpperCase());
  return card?json({balance_cents:card.balance_cents}):apiError("Cartão inválido ou ainda não liberado.",400);
 }
 const amount=body.amount_cents,name=String(body.recipient_name||"").trim(),phone=String(body.recipient_phone||"").replace(/\D/g,""),message=String(body.message||"").trim(),key=String(body.request_key||"");
 if(!Number.isInteger(amount)||amount!<5000||amount!>200000||name.length<2||name.length>100||phone.length<10||phone.length>13||message.length>1000||!/^[-a-zA-Z0-9]{16,80}$/.test(key))return apiError("Confira o valor (R$ 50 a R$ 2.000), nome, telefone e mensagem.");
 const existing=await env.DB.prepare("SELECT * FROM gift_card_sales WHERE customer_id=? AND request_key=?").bind(customer.id,key).first<Sale>();
 if(existing?.checkout_url)return json({checkout_url:existing.checkout_url});
 if(existing&&existing.amount_cents!==amount)return apiError("Atualize a página para iniciar uma compra com outro valor.",409);
 const id=existing?.id||"GFT-"+crypto.randomUUID(),code="ELG-"+crypto.randomUUID().replaceAll("-","").toUpperCase();
 if(!existing)await env.DB.batch([
  env.DB.prepare("INSERT INTO gift_card_sales(id,customer_id,amount_cents,request_key) VALUES(?,?,?,?)").bind(id,customer.id,amount!,key),
  env.DB.prepare("INSERT INTO gift_cards(code_hash,code,purchaser_customer_id,recipient_name,recipient_phone,message,initial_cents,balance_cents) VALUES(?,?,?,?,?,?,?,0)").bind(await sha256(code),code,customer.id,name,phone,message,amount!),
  env.DB.prepare("UPDATE gift_card_sales SET gift_card_id=(SELECT id FROM gift_cards WHERE code_hash=?) WHERE id=?").bind(await sha256(code),id)
 ]);
 const origin=new URL(request.url).origin;
 const result=await provider<{init_point:string;sandbox_init_point:string}>(env,"/checkout/preferences",{
  items:[{id,title:"Cartão-presente Elegance 18K",quantity:1,currency_id:"BRL",unit_price:amount!/100}],
  payer:{name:customer.name,email:customer.email},external_reference:id,
  back_urls:{success:origin+"/cartao-presente.html?sale="+id,pending:origin+"/cartao-presente.html?sale="+id,failure:origin+"/cartao-presente.html?sale="+id},
  auto_return:"approved",notification_url:origin+"/api/payments/mercado-pago/webhook"
 });
 const checkout=env.MERCADO_PAGO_ACCESS_TOKEN!.startsWith("TEST-")?result.sandbox_init_point:result.init_point;
 await env.DB.prepare("UPDATE gift_card_sales SET checkout_url=? WHERE id=?").bind(checkout,id).run();
 return json({checkout_url:checkout},201);
}
