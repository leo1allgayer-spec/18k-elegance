(function(){
  const form=document.querySelector('#checkout-form'),next=document.querySelector('.step-next'),back=document.querySelector('.text-back');
  if(!form||!next||!window.eleganceCheckout)return;
  const message=document.createElement('p');message.className='checkout-message';message.setAttribute('aria-live','polite');document.querySelector('.checkout-actions').prepend(message);
  const fields=()=>Object.fromEntries(new FormData(form));
  function validStep(step){const section=form.querySelector(`[data-step="${step}"]`);const controls=[...section.querySelectorAll('input,select')];for(const control of controls){if(!control.checkValidity()){control.reportValidity();return false}}return true}
  async function createPayment(){
    const cart=JSON.parse(localStorage.getItem('elegance-cart')||'[]');
    const items=cart.map(item=>({product_id:Number(item.product_id),variant_id:Number(item.variant_id),quantity:Number(item.qty)}));
    if(!items.length){message.textContent='Sua sacola está vazia.';return}
    if(items.some(item=>!item.product_id||!item.variant_id)){message.textContent='Atualize a sacola: remova os produtos antigos e adicione novamente pelo catálogo.';return}
    const data=fields(),cityState=String(data.city_state||'').split('-').map(value=>value.trim());
    next.disabled=true;next.textContent='Abrindo Mercado Pago…';message.textContent='Criando seu pedido com segurança…';
    try{
      const response=await fetch('/api/checkout/mercado-pago',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
        customer:{name:data.name,email:data.email,cpf:data.cpf,phone:data.phone},
        shipping:{method:data.shipping,postal_code:data.postal_code,street:data.street,number:data.number,complement:data.complement,neighborhood:data.neighborhood,city:cityState[0]||'',state:cityState[1]||''},
        items,
      })});
      const result=await response.json().catch(()=>({}));if(!response.ok)throw new Error(result.error?.message||'Não foi possível iniciar o pagamento.');
      sessionStorage.setItem('elegance-last-order',result.order_number);location.assign(result.checkout_url);
    }catch(error){message.textContent=error.message;next.disabled=false;next.textContent='Confirmar e pagar';}
  }
  next.addEventListener('click',async()=>{const step=window.eleganceCheckout.step;if(step<3){if(validStep(step))window.eleganceCheckout.next();return}if(step===3)await createPayment()});
  back.addEventListener('click',()=>window.eleganceCheckout.back());
})();
