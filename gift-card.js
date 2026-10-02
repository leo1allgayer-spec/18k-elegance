(function(){
 const form=document.querySelector('#gift-form'),custom=document.querySelector('#gift-custom'),preview=document.querySelector('#gift-preview-value'),deliveryDate=document.querySelector('#gift-delivery-date'),deliveryTime=document.querySelector('#gift-delivery-time');
 const money=c=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(c/100);
 const status=document.createElement('p');status.setAttribute('role','status');form.append(status);
 let requestKey=crypto.randomUUID();
 const localDate=()=>{const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts();const value=type=>parts.find(part=>part.type===type)?.value||'';return `${value('year')}-${value('month')}-${value('day')}`};
 deliveryDate.min=localDate();deliveryDate.value=localDate();
 function amount(){const raw=form.valor.value==='Outro valor'?custom.value:form.valor.value;return Math.round(Number(raw.replace(/R\$|\s/g,'').replace(/\./g,'').replace(',','.'))*100)}
 function refresh(){custom.hidden=form.valor.value!=='Outro valor';preview.textContent=Number.isFinite(amount())?money(amount()):'Informe o valor';}
 form.addEventListener('input',()=>{requestKey=crypto.randomUUID();refresh();document.querySelector('#gift-preview-name').textContent=document.querySelector('#gift-name').value||'uma pessoa especial';});
 async function api(options,query=''){const response=await fetch('/api/gift-cards'+query,options),text=await response.text();let data={};try{data=text?JSON.parse(text):{};}catch{}if(!response.ok){const error=new Error(data.error?.message||'O servidor não conseguiu processar o cartão-presente. Tente novamente em instantes.');error.status=response.status;throw error;}return data;}
 function openPayment(value){let url;try{url=new URL(value);if(url.protocol!=='https:')throw new Error();}catch{throw new Error('O Mercado Pago não retornou um link de pagamento válido. Tente novamente.');}const link=document.createElement('a');link.href=url.href;link.target='_self';link.rel='noopener';link.hidden=true;document.body.append(link);link.click();link.remove();}
 async function showPaymentReturn(){const sale=new URLSearchParams(location.search).get('sale');if(!sale)return;const notice=document.createElement('p');notice.className='gift-payment-return';notice.textContent='Confirmando o pagamento do cartão-presente...';form.prepend(notice);try{const data=await api(undefined,'?sale='+encodeURIComponent(sale));const card=(data.cards||[]).find(item=>item.id===sale);if(card?.status==='approved'||card?.code){notice.replaceChildren('Pagamento aprovado! O cartão está ativo e o envio foi programado. ',Object.assign(document.createElement('a'),{href:'conta.html',textContent:'Ver meus cartões-presente'}));}else notice.textContent='O pagamento está em análise. Assim que for aprovado, o cartão ficará disponível em Sua conta.';}catch{notice.textContent='Não foi possível confirmar o pagamento nesta tela. Consulte o cartão em Sua conta.';}}
 form.onsubmit=async event=>{
  event.preventDefault();const button=form.querySelector('[type=submit]');
  if(!Number.isInteger(amount())||amount()<100||amount()>200000){status.textContent='Escolha um valor de R$ 1 a R$ 2.000.';return;}
  button.disabled=true;status.textContent='Preparando pagamento seguro...';
  try{
   const data=await api({method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({amount_cents:amount(),recipient_name:document.querySelector('#gift-name').value,recipient_phone:document.querySelector('#gift-phone').value,message:document.querySelector('#gift-message').value,delivery_date:deliveryDate.value,delivery_time:deliveryTime.value,request_key:requestKey})});
   openPayment(data.checkout_url);
  }catch(error){
   status.replaceChildren();
   if(error.status===401){
    const message=document.createElement('span'),link=document.createElement('a');
    message.textContent='Entre ou crie sua conta para comprar ou usar um cartão-presente.';
    link.href='conta.html';link.className='gift-login-link';link.textContent='Criar conta ou entrar';
    status.append(message,link);
   }else status.textContent=error.message;
   button.disabled=false;
  }
 };
 refresh();showPaymentReturn();
})();
