(function(){
 const checkout=document.querySelector('[data-step="3"]'),coupon=document.querySelector('#cart-coupon');
 if(!checkout&&!coupon)return;
 const key='elegance-gift-card-code',box=document.createElement('div');box.className='shipping-box gift-card-entry';
 box.style.cssText='display:block;margin:16px 0;padding:16px;border:1px solid #b9985066';
 box.innerHTML='<label for="gift-card-code">Cartão-presente (não é cupom de desconto)</label><div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px"><input id="gift-card-code" name="gift_card_code" placeholder="Código ELG-..." autocomplete="off" maxlength="36" style="min-width:0;flex:1;width:100%;padding:12px;background:#080c14;color:#fff;border:1px solid #b9985066"><button type="button" data-consult-gift>Consultar saldo</button><button type="button" data-remove-gift hidden>Remover</button></div><p role="status" style="display:block;line-height:1.5"></p><small style="display:block;line-height:1.5">O cartão-presente é uma forma de pagamento e pode ser usado junto do cupom de desconto. O saldo será aplicado ao confirmar o pedido. Entre na sua conta para usar.</small>';
 if(coupon)coupon.closest('label').after(box);else checkout.append(box);
 const input=box.querySelector('input'),message=box.querySelector('p'),button=box.querySelector('[data-consult-gift]'),remove=box.querySelector('[data-remove-gift]');
 input.value=sessionStorage.getItem(key)||'';
 function remember(){const code=input.value.trim().toUpperCase();if(code)sessionStorage.setItem(key,code);else sessionStorage.removeItem(key);remove.hidden=!code;return code;}
 if(input.value)message.textContent='Código mantido para o pagamento. Você pode consultar o saldo ou removê-lo.';
 remove.hidden=!input.value;
 input.addEventListener('input',()=>{remember();message.textContent='';});
 remove.onclick=()=>{input.value='';remember();message.textContent='Cartão-presente removido desta compra.';};
 let checking=false;
 async function consult(){
  if(checking)return;
  const code=remember();input.value=code;
  if(!/^ELG-[A-F0-9]{32}$/.test(code)){message.textContent='Confira o código do cartão-presente, que começa com ELG-.';return;}
  checking=true;button.disabled=true;message.textContent='Consultando saldo…';
  try{
   const response=await fetch('/api/gift-cards',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify({action:'balance',code})}),data=await response.json();
   if(input.value.trim().toUpperCase()!==code)return;
   if(!response.ok)throw new Error(data.error?.message||'Não foi possível consultar.');
   message.textContent='Saldo disponível: '+new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(data.balance_cents/100)+'. O código será levado ao pagamento e o saldo será aplicado ao confirmar.';
  }catch(error){if(input.value.trim().toUpperCase()===code)message.textContent=error.message;}finally{checking=false;button.disabled=false;}
 }
 button.onclick=consult;
 input.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();consult();}});
 window.eleganceGiftCard={setCode(code){input.value=String(code||'').trim().toUpperCase();remember();input.focus();consult();}};
 document.querySelector('.checkout-button')?.addEventListener('click',remember);
})();
