import type { Env } from './types';
import { blingAccessToken } from './bling';
import { stockSchema, ensureOrderProductLinks } from './bling-stock';

export async function exportPaidOrderToBling(env:Env,orderId:number):Promise<void>{
 await stockSchema(env);
 await env.DB.prepare('CREATE TABLE IF NOT EXISTS bling_order_export_locks(order_id INTEGER PRIMARY KEY)').run();
 const lock=await env.DB.prepare('INSERT OR IGNORE INTO bling_order_export_locks(order_id) VALUES(?)').bind(orderId).run();
 if(!lock.meta.changes)return;
 try{await exportLocked(env,orderId);}finally{await env.DB.prepare('DELETE FROM bling_order_export_locks WHERE order_id=?').bind(orderId).run();}
}
async function exportLocked(env:Env,orderId:number){
 await env.DB.prepare("INSERT OR IGNORE INTO bling_order_exports(order_id,status) VALUES(?,'pending')").bind(orderId).run();
 const previous=await env.DB.prepare('SELECT status,error FROM bling_order_exports WHERE order_id=?').bind(orderId).first<{status:string;error:string|null}>();
 if(previous?.status==='sent')return;
 const order=await env.DB.prepare("SELECT o.*,c.name customer_name,c.email customer_email,c.phone customer_phone FROM orders o JOIN customers c ON c.id=o.customer_id WHERE o.id=? AND o.status IN ('paid','preparing','shipped','delivered')").bind(orderId).first<any>();
 if(!order)return;
 let posting=false;
 try{
  const token=await blingAccessToken(env);
  const api=async(path:string,payload?:unknown)=>{
   const r=await fetch('https://api.bling.com.br/Api/v3'+path,{method:payload?'POST':'GET',redirect:'manual',signal:AbortSignal.timeout(15000),headers:{Authorization:`Bearer ${token}`,Accept:'application/json','Content-Type':'application/json'},body:payload?JSON.stringify(payload):undefined});
   const b:any=await r.json().catch(()=>({}));
   if(!r.ok)throw new Error(`Bling HTTP ${r.status}: ${b.error?.message||'requisição recusada'} ${(b.error?.fields||[]).map((f:any)=>f.msg).filter(Boolean).join('; ')}`.slice(0,400));
   return b.data;
  };
  const found=await api('/pedidos/vendas?'+new URLSearchParams({'numerosLojas[]':order.order_number,limite:'100'}));
  if(!Array.isArray(found))throw new Error('Consulta de pedidos inválida');
  const matches=found.filter((r:any)=>r.numeroLoja===order.order_number);
  if(matches.length>1)throw new Error('Pedidos duplicados no Bling; confira manualmente.');
  if(matches.length===1){await sent(env,orderId,matches[0].id);return;}
  if(previous?.error?.startsWith('Envio incerto'))throw new Error(previous.error);
  let items=await env.DB.prepare('SELECT i.*,l.bling_id FROM order_items i LEFT JOIN bling_stock_links l ON l.variant_id=i.variant_id WHERE i.order_id=?').bind(orderId).all<any>();
  if(items.results.some(i=>!i.bling_id)){
   await ensureOrderProductLinks(env,items.results.map(i=>i.variant_id));
   items=await env.DB.prepare('SELECT i.*,l.bling_id FROM order_items i LEFT JOIN bling_stock_links l ON l.variant_id=i.variant_id WHERE i.order_id=?').bind(orderId).all<any>();
  }
  if(!items.results.length||items.results.some(i=>!i.bling_id))throw new Error('Vincule todos os produtos do pedido ao Bling antes do envio.');
  let address:any={};try{address=JSON.parse(order.shipping_address_json||'{}')||{};}catch{}
  const endereco={endereco:address.street,numero:address.number,complemento:address.complement,bairro:address.neighborhood,cep:String(address.postal_code||'').replace(/\D/g,''),municipio:address.city,uf:address.state};
  const contacts=await api('/contatos?'+new URLSearchParams({pesquisa:order.customer_email,criterio:'1',limite:'100'}));
  if(!Array.isArray(contacts))throw new Error('Consulta de contatos inválida');
  const exact=contacts.filter((c:any)=>String(c.email||'').toLowerCase()===order.customer_email.toLowerCase());
  if(exact.length>1)throw new Error('Contatos duplicados no Bling; confira manualmente.');
  let contactId=exact[0]?.id;
  if(!contactId){const contact=await api('/contatos',{nome:order.customer_name,tipo:'F',situacao:'A',email:order.customer_email,telefone:order.customer_phone||undefined,endereco:address.street?{geral:endereco}:undefined});contactId=contact?.id;}
  if(!contactId)throw new Error('Contato não confirmado pelo Bling');
  const date=order.created_at.slice(0,10);
  const payload={numeroLoja:order.order_number,data:date,dataSaida:date,dataPrevista:date,contato:{id:contactId},desconto:{valor:order.discount_cents/100,unidade:'REAL'},transporte:{frete:order.shipping_cents/100,etiqueta:address.street?{nome:order.customer_name,...endereco}:undefined},observacoesInternas:`Pagamento aprovado no site. Entrega: ${order.shipping_method}. ${address.preferred_delivery_date||''} ${address.preferred_delivery_time||''}`.trim(),itens:items.results.map(item=>{let p:any={};try{p=JSON.parse(item.personalization_json||'{}')||{};}catch{}return {produto:{id:item.bling_id},quantidade:item.quantity,valor:item.unit_price_cents/100,descricao:[item.product_name,p.finish&&`Acabamento: ${p.finish}`,p.color&&`Cor: ${p.color}`,p.size&&`Tamanho: ${p.size}`,p.children_model&&`Modelo: ${p.children_model}`,p.engraving_text&&`Gravação: ${p.engraving_text}`].filter(Boolean).join(' — ')};}),parcelas:[]};
  posting=true;
  const created=await api('/pedidos/vendas',payload);
  if(!created?.id)throw new Error('Bling não confirmou o número do pedido');
  await sent(env,orderId,created.id);
 }catch(error){const message=error instanceof Error?error.message:'Falha no envio';await env.DB.prepare("UPDATE bling_order_exports SET status='error',error=?,updated_at=CURRENT_TIMESTAMP WHERE order_id=?").bind((posting&&!/^Bling HTTP 4/.test(message)?'Envio incerto — conferir antes de repetir. ':'')+message,orderId).run();}
}
async function sent(env:Env,id:number,remoteId:number){await env.DB.prepare("UPDATE bling_order_exports SET status='sent',bling_order_id=?,error=NULL,updated_at=CURRENT_TIMESTAMP WHERE order_id=?").bind(remoteId,id).run();}
