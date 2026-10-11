const money=cents=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format((Number(cents)||0)/100);
const esc=value=>String(value??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const statusLabel={pending_payment:'Aguardando pagamento',payment_review:'Pagamento recebido — revisar estoque',paid:'Pago',preparing:'Preparando',shipped:'Enviado',delivered:'Entregue',cancelled:'Cancelado',refunded:'Reembolsado'};
const formatDate=value=>value?new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short',timeZone:'America/Sao_Paulo'}).format(new Date(String(value).includes('T')?value:`${String(value).replace(' ','T')}Z`)):'—';
const shippingLabel=value=>({pac:'PAC',sedex:'SEDEX',pickup:'Retirada em loja',motoboy:'Entrega por motoboy'}[value]||value||'—');
function addressText(value){if(!value)return 'Retirada em loja';try{const a=typeof value==='string'?JSON.parse(value):value;return [a.street,a.number,a.complement,a.neighborhood,a.city,a.state,a.postal_code&&`CEP ${a.postal_code}`,a.preferred_delivery_date&&`Preferência de recebimento: ${a.preferred_delivery_date.split('-').reverse().join('/')}${a.preferred_delivery_time?' às '+a.preferred_delivery_time:''} (Brasília; confirmar com a loja)`].filter(Boolean).join(', ')}catch{return String(value)}}
function printDocument(details){const order=details.order,items=details.items||[];const custom=i=>{try{const p=JSON.parse(i.personalization_json||'null');return p?`${p.size?`<br><small><b>Tamanho:</b> ${esc(p.size)}</small>`:''}${p.engraving_text?`<br><small><b>Gravação:</b> ${esc(p.engraving_text)}</small>`:''}${p.image_upload_id?`<br><small><b>Foto:</b> ${esc(p.image_name||'imagem enviada')} · <a href="/api/admin/personalization/${encodeURIComponent(p.image_upload_id)}" target="_blank">abrir imagem</a></small>`:''}`:''}catch{return''}};return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Pedido ${esc(order.order_number)}</title><style>@page{size:A4;margin:14mm}*{box-sizing:border-box}body{font:13px Arial,sans-serif;color:#111;margin:0}.head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #b78b3e;padding-bottom:14px;margin-bottom:18px}.head h1{font-size:22px;margin:0 0 5px}.brand{font-size:20px;color:#8b672d;font-weight:700}.grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:18px}.box{border:1px solid #bbb;padding:12px;line-height:1.55}.box h2{font-size:11px;text-transform:uppercase;letter-spacing:.08em;margin:0 0 8px;color:#8b672d}table{width:100%;border-collapse:collapse;margin:12px 0 18px}th,td{padding:9px;border-bottom:1px solid #ccc;text-align:left}th{font-size:10px;text-transform:uppercase}.right{text-align:right}.totals{width:300px;margin-left:auto}.totals p{display:flex;justify-content:space-between;margin:7px 0}.totals .total{font-size:17px;font-weight:700;border-top:2px solid #222;padding-top:9px}.note{margin-top:30px;border-top:1px solid #bbb;padding-top:10px;color:#555;font-size:11px}@media print{button{display:none}}</style></head><body><section class="head"><div><div class="brand">ELEGANCE 18K</div><small>Separação e conferência do pedido</small></div><div><h1>Pedido ${esc(order.order_number)}</h1><div>${formatDate(order.created_at)}</div></div></section><section class="grid"><div class="box"><h2>Cliente</h2><strong>${esc(order.customer_name)}</strong><br>${esc(order.customer_email)}<br>${esc(order.customer_phone||'Telefone não informado')}</div><div class="box"><h2>Entrega</h2><strong>${esc(shippingLabel(order.shipping_method))}</strong><br>${esc(addressText(order.shipping_address_json))}${order.tracking_code?`<br>Rastreio: <strong>${esc(order.tracking_code)}</strong>`:''}</div></section><table><thead><tr><th>Produto</th><th>SKU</th><th>Qtd.</th><th class="right">Unitário</th><th class="right">Subtotal</th></tr></thead><tbody>${items.map(i=>`<tr><td>${esc(i.product_name)}${custom(i)}</td><td>${esc(i.sku||'—')}</td><td>${i.quantity}</td><td class="right">${money(i.unit_price_cents)}</td><td class="right">${money(i.unit_price_cents*i.quantity)}</td></tr>`).join('')}</tbody></table><div class="totals"><p><span>Produtos</span><span>${money(order.subtotal_cents)}</span></p><p><span>Desconto</span><span>-${money(order.discount_cents)}</span></p><p><span>Frete</span><span>${money(order.shipping_cents)}</span></p><p class="total"><span>Total</span><span>${money(order.total_cents)}</span></p></div><p class="note">Status: ${esc(statusLabel[order.status]||order.status)}. Confira produtos, quantidades e dados de entrega antes da postagem.</p><script>window.onload=()=>{window.print()}<\/script></body></html>`}

const printButton=document.querySelector('#print-orders'),status=document.querySelector('#print-status'),content=document.querySelector('#print-content');
printButton.addEventListener('click',()=>window.print());
(async()=>{
 const ids=(new URLSearchParams(location.search).get('ids')||'').split(',').map(Number);
 if(!ids.length||ids.length>200||ids.some(id=>!Number.isSafeInteger(id)||id<1)){status.textContent='Selecione um pedido no painel para imprimir.';return;}
 try{
  const records=await Promise.all(ids.map(async id=>{
   const response=await fetch('/api/admin/orders/'+id,{credentials:'same-origin',cache:'no-store'});
   const data=await response.json();
   if(!response.ok)throw new Error(response.status===401||response.status===403?'Entre no painel administrativo novamente para imprimir.':data.error?.message||'Não foi possível carregar o pedido.');
   return data;
  }));
  for(const record of records){
   const parsed=new DOMParser().parseFromString(printDocument(record),'text/html');
   parsed.querySelectorAll('script').forEach(script=>script.remove());
   const style=parsed.querySelector('style');if(style&&!document.querySelector('#order-print-style')){style.id='order-print-style';document.head.append(style);}
   const article=document.createElement('article');article.className='printed-order';article.append(...parsed.body.childNodes);content.append(article);
  }
  document.title=records.length===1?'Pedido '+records[0].order.order_number:'Pedidos Elegance 18K';
  status.hidden=true;printButton.disabled=false;
  requestAnimationFrame(()=>requestAnimationFrame(()=>window.print()));
 }catch(error){status.textContent=error.message;}
})();

