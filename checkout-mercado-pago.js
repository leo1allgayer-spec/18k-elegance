(function(){
  const form=document.querySelector('#checkout-form'),next=document.querySelector('.step-next'),back=document.querySelector('.text-back');
  if(!form||!next||!window.eleganceCheckout)return;
  const message=document.createElement('p');message.className='checkout-message';message.setAttribute('aria-live','polite');document.querySelector('.checkout-actions').prepend(message);
  const fields=()=>Object.fromEntries(new FormData(form));
  const cartItems=()=>JSON.parse(localStorage.getItem('elegance-cart')||'[]').map(item=>({product_id:Number(item.product_id),variant_id:Number(item.variant_id),quantity:Number(item.qty)}));
  async function setupCorreios(){
    const old=form.querySelector('.shipping-coming-soon');if(!old)return;
    try{const health=await fetch('/api/health').then(response=>response.json());if(!health.integrations?.correios)return}catch{return}
    const box=document.createElement('div');box.className='correios-quotes';box.innerHTML='<button type="button" class="correios-calculate">Calcular PAC e SEDEX</button><p class="shipping-help">Digite o CEP para consultar prazo e valor.</p>';
    old.replaceWith(box);const button=box.querySelector('button'),help=box.querySelector('p');
    button.addEventListener('click',async()=>{
      const postal=String(form.elements.postal_code.value||'').replace(/\D/g,'');
      if(postal.length!==8){help.textContent='Digite um CEP válido com 8 números.';form.elements.postal_code.focus();return}
      button.disabled=true;button.textContent='Consultando Correios…';help.textContent='Calculando PAC e SEDEX com segurança…';
      try{
        const response=await fetch('/api/shipping/correios/quote',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({postal_code:postal,items:cartItems()})});
        const result=await response.json().catch(()=>({}));if(!response.ok)throw new Error(result.error?.message||'Não foi possível calcular o frete.');
        box.innerHTML=result.quotes.map(quote=>`<label><input type="radio" name="shipping" value="correios" data-service="${quote.code}"> <span><b>${quote.name}</b><small>Entrega em até ${quote.delivery_days} dias úteis</small></span><strong>${(quote.price_cents/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</strong></label>`).join('')+'<input type="hidden" name="shipping_service_code">';
        box.querySelectorAll('input[type="radio"]').forEach(radio=>radio.addEventListener('change',()=>{box.querySelector('[name="shipping_service_code"]').value=radio.dataset.service||''}));
      }catch(error){help.textContent=error.message;button.disabled=false;button.textContent='Tentar calcular novamente';}
    });
  }
  function validStep(step){const section=form.querySelector(`[data-step="${step}"]`);const controls=[...section.querySelectorAll('input,select')];for(const control of controls){if(!control.checkValidity()){control.reportValidity();return false}}return true}
  async function createPayment(){
    const items=cartItems();
    if(!items.length){message.textContent='Sua sacola está vazia.';return}
    if(items.some(item=>!item.product_id||!item.variant_id)){message.textContent='Atualize a sacola: remova os produtos antigos e adicione novamente pelo catálogo.';return}
    const data=fields(),cityState=String(data.city_state||'').split('-').map(value=>value.trim());
    next.disabled=true;next.textContent='Abrindo Mercado Pago…';message.textContent='Criando seu pedido com segurança…';
    try{
      const response=await fetch('/api/checkout/mercado-pago',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
        customer:{name:data.name,email:data.email,cpf:data.cpf,phone:data.phone},
        shipping:{method:data.shipping,service_code:data.shipping_service_code,postal_code:data.postal_code,street:data.street,number:data.number,complement:data.complement,neighborhood:data.neighborhood,city:cityState[0]||'',state:cityState[1]||''},
        items,
      })});
      const result=await response.json().catch(()=>({}));if(!response.ok)throw new Error(result.error?.message||'Não foi possível iniciar o pagamento.');
      sessionStorage.setItem('elegance-last-order',result.order_number);location.assign(result.checkout_url);
    }catch(error){message.textContent=error.message;next.disabled=false;next.textContent='Confirmar e pagar';}
  }
  next.addEventListener('click',async()=>{const step=window.eleganceCheckout.step;if(step<3){if(validStep(step))window.eleganceCheckout.next();return}if(step===3)await createPayment()});
  back.addEventListener('click',()=>window.eleganceCheckout.back());
  setupCorreios();
})();
