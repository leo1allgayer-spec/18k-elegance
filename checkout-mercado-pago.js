(function(){
  const form=document.querySelector('#checkout-form'),next=document.querySelector('.step-next'),back=document.querySelector('.text-back');
  if(!form||!next||!window.eleganceCheckout)return;
  const message=document.createElement('p');message.className='checkout-message';message.setAttribute('aria-live','polite');document.querySelector('.checkout-actions').prepend(message);
  const fields=()=>Object.fromEntries(new FormData(form));
  const cartItems=()=>JSON.parse(localStorage.getItem('elegance-cart')||'[]').map(item=>({product_id:Number(item.product_id),variant_id:Number(item.variant_id),quantity:Number(item.qty),personalization:item.personalization||undefined}));
  function setupPostalAutofill(){
    const postal=form.elements.postal_code,street=form.elements.street,neighborhood=form.elements.neighborhood,cityState=form.elements.city_state,number=form.elements.number;
    if(!postal||!street||!neighborhood||!cityState)return;
    const status=document.createElement('small');status.className='postal-lookup-status';status.setAttribute('aria-live','polite');postal.closest('label')?.append(status);
    let timer=null,controller=null,lastPostal='';
    const lookup=async()=>{
      const digits=String(postal.value||'').replace(/\D/g,'').slice(0,8);
      postal.value=digits.length>5?`${digits.slice(0,5)}-${digits.slice(5)}`:digits;
      if(digits.length!==8){status.textContent=digits?'Digite os 8 números do CEP.':'';return}
      if(digits===lastPostal)return;
      controller?.abort();controller=new AbortController();status.textContent='Buscando endereço…';
      try{
        const response=await fetch(`https://viacep.com.br/ws/${digits}/json/`,{signal:controller.signal});
        if(!response.ok)throw new Error('CEP_LOOKUP_FAILED');
        const address=await response.json();
        if(address.erro)throw new Error('CEP_NOT_FOUND');
        street.value=address.logradouro||street.value;
        neighborhood.value=address.bairro||neighborhood.value;
        cityState.value=[address.localidade,address.uf].filter(Boolean).join(' - ')||cityState.value;
        [street,neighborhood,cityState].forEach(input=>input.dispatchEvent(new Event('input',{bubbles:true})));
        lastPostal=digits;status.textContent='Endereço preenchido automaticamente. Confira e informe o número.';number?.focus();
      }catch(error){
        if(error.name==='AbortError')return;
        status.textContent=error.message==='CEP_NOT_FOUND'?'CEP não encontrado. Confira os números.':'Não foi possível consultar agora. Preencha o endereço manualmente.';
      }
    };
    postal.addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(lookup,350)});
    postal.addEventListener('blur',lookup);
    if(String(postal.value||'').replace(/\D/g,'').length===8)lookup();
  }
  function setupMotoboy(){
    const cityInput=form.elements.city_state,option=form.querySelector('.motoboy-checkout-option'),radio=option?.querySelector('input'),price=option?.querySelector('strong'),help=option?.querySelector('small'),link=form.querySelector('.motoboy-whatsapp');
    if(!cityInput||!option||!radio||!price||!link)return;
    const normalize=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
    const update=()=>{const city=normalize(cityInput.value.split('-')[0]),rates={canoas:2000,esteio:2500,sapucaia:3000},cents=rates[city];
      if(cents){radio.disabled=false;price.textContent=(cents/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});help.textContent=`Valor fixo para ${cityInput.value.split('-')[0].trim()}`;link.hidden=true}
      else{radio.disabled=true;price.textContent=city?'Sob consulta':'Informe a cidade';help.textContent='Canoas R$ 20 · Esteio R$ 25 · Sapucaia R$ 30';if(radio.checked)form.querySelector('input[name="shipping"][value="pickup"]')?.click();link.hidden=!city;link.href=`https://wa.me/555194927676?text=${encodeURIComponent(`Olá! Gostaria de cotar a entrega por motoboy para ${cityInput.value.trim()}.`)}`}
    };cityInput.addEventListener('input',update);cityInput.addEventListener('change',update);update();
  }
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
        coupon:JSON.parse(localStorage.getItem('elegance-coupon')||'null')?.code||undefined,
      })});
      const result=await response.json().catch(()=>({}));if(!response.ok)throw new Error(result.error?.message||'Não foi possível iniciar o pagamento.');
      sessionStorage.setItem('elegance-last-order',result.order_number);location.assign(result.checkout_url);
    }catch(error){message.textContent=error.message;next.disabled=false;next.textContent='Confirmar e pagar';}
  }
  next.addEventListener('click',async()=>{const step=window.eleganceCheckout.step;if(step<3){if(validStep(step))window.eleganceCheckout.next();return}if(step===3)await createPayment()});
  back.addEventListener('click',()=>window.eleganceCheckout.back());
  setupPostalAutofill();setupMotoboy();setupCorreios();
})();
