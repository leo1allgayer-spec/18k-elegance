(function(){
 const form=document.querySelector('#gift-form'),custom=document.querySelector('#gift-custom'),preview=document.querySelector('#gift-preview-value');
 const money=c=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(c/100);
 const status=document.createElement('p');status.setAttribute('role','status');form.append(status);
 const section=document.createElement('section');section.className='gift-form';section.id='my-gifts';
 section.innerHTML='<h2>Meus cartões-presente</h2><p>Entre na sua conta para consultar os cartões comprados.</p><a href="conta.html">Entrar ou criar conta</a><button type="button" class="outline-button">Atualizar cartões</button><div class="gift-list"></div>';
 document.querySelector('.gift-shell').append(section);
 let requestKey=crypto.randomUUID();
 function amount(){const raw=form.valor.value==='Outro valor'?custom.value:form.valor.value;return Math.round(Number(raw.replace(/R\$|\s/g,'').replace(/\./g,'').replace(',','.'))*100)}
 function refresh(){custom.hidden=form.valor.value!=='Outro valor';preview.textContent=Number.isFinite(amount())?money(amount()):'Informe o valor';}
 form.addEventListener('input',()=>{requestKey=crypto.randomUUID();refresh();document.querySelector('#gift-preview-name').textContent=document.querySelector('#gift-name').value||'uma pessoa especial';});
 async function api(options,query=''){const response=await fetch('/api/gift-cards'+query,options),data=await response.json();if(!response.ok)throw new Error(data.error?.message||'Não foi possível concluir.');return data;}
 async function load(){
  const list=section.querySelector('.gift-list');list.textContent='Consultando cartões...';
  try{
   const sale=new URLSearchParams(location.search).get('sale');
   const data=await api(undefined,sale?'?sale='+encodeURIComponent(sale):'');list.replaceChildren();
   if(!data.cards.length)list.textContent='Você ainda não comprou cartões-presente.';
   (data.reserved||[]).forEach(order=>{
    const row=document.createElement('p');row.textContent='Saldo reservado no pedido '+order.order_number+': '+money(order.amount_cents)+'. ';
    const link=document.createElement('a');link.href=order.gift_checkout_url||'https://wa.me/555194927676?text='+encodeURIComponent('Preciso de ajuda com o saldo reservado no pedido '+order.order_number);
    link.textContent=order.gift_checkout_url?'Continuar pagamento':'Solicitar ajuda com pagamento';row.append(link);list.append(row);
   });
   data.cards.forEach(card=>{
    const article=document.createElement('article'),title=document.createElement('h3'),info=document.createElement('p');
    title.textContent='Para '+card.recipient_name+' · '+money(card.initial_cents);
    info.textContent=card.code?'Saldo disponível: '+money(card.balance_cents):card.status==='refunded'?'Pagamento estornado':'Aguardando pagamento / confirmação';
    article.append(title,info);
    if(card.code){
     const code=document.createElement('p'),share=document.createElement('a');code.textContent='Código: '+card.code;
     share.className='outline-button';share.textContent='Enviar pelo WhatsApp';share.target='_blank';share.rel='noopener';
     const text=['Você recebeu um Cartão Presente Elegance 18K!','Para: '+card.recipient_name,'Valor: '+money(card.initial_cents),card.message||'','Código: '+card.code,'Use no pagamento da sua compra: https://elegance18k.com/'].join('\n');
     const phone=card.recipient_phone.replace(/\D/g,'');share.href='https://wa.me/'+(phone.length<=11?'55':'')+phone+'?text='+encodeURIComponent(text);
     article.append(code,share);
    }else if(card.checkout_url&&card.status!=='refunded'){
     const pay=document.createElement('a');pay.href=card.checkout_url;pay.className='outline-button';pay.textContent='Continuar pagamento';article.append(pay);
    }
    list.append(article);
   });
  }catch(error){list.textContent=error.message;}
 }
 section.querySelector('button').onclick=load;
 form.onsubmit=async event=>{
  event.preventDefault();const button=form.querySelector('[type=submit]');
  if(!Number.isInteger(amount())||amount()<5000||amount()>200000){status.textContent='Escolha um valor de R$ 50 a R$ 2.000.';return;}
  button.disabled=true;status.textContent='Preparando pagamento seguro...';
  try{
   const data=await api({method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({amount_cents:amount(),recipient_name:document.querySelector('#gift-name').value,recipient_phone:document.querySelector('#gift-phone').value,message:document.querySelector('#gift-message').value,request_key:requestKey})});
   location.assign(data.checkout_url);
  }catch(error){status.textContent=error.message;button.disabled=false;}
 };
 refresh();load();
})();
