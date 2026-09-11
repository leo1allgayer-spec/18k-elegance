(function(){
 const section=document.querySelector('[data-step="3"]');if(!section)return;
 const box=document.createElement('div');box.className='shipping-box';
 box.innerHTML='<label for="gift-card-code">Tem um cartão-presente?</label><input id="gift-card-code" name="gift_card_code" placeholder="ELG-..." autocomplete="off"><button type="button">Consultar saldo</button><p role="status"></p><small>O saldo será aplicado ao confirmar. Se cobrir tudo, seu pedido será confirmado aqui; se faltar, pague o restante no Mercado Pago. Entre na sua conta para usar.</small>';
 section.append(box);
 box.querySelector('button').onclick=async()=>{
  const message=box.querySelector('p');message.textContent='Consultando...';
  try{
   const response=await fetch('/api/gift-cards',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'balance',code:box.querySelector('input').value.trim()})}),data=await response.json();
   if(!response.ok)throw new Error(data.error?.message||'Não foi possível consultar.');
   message.textContent='Saldo disponível: '+new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(data.balance_cents/100);
  }catch(error){message.textContent=error.message;}
 };
})();
