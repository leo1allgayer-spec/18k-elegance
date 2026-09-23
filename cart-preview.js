(() => {
  const dialog = document.createElement('dialog');
  dialog.className = 'cart-preview';
  dialog.setAttribute('aria-labelledby','cart-preview-title');
  dialog.innerHTML = '<header><h2 id="cart-preview-title">Sua sacola</h2><button type="button" data-close aria-label="Fechar sacola">×</button></header><p class="cart-preview-notice" role="status">Produto adicionado à sacola.</p><section class="cart-preview-items"></section><footer><p><span>Subtotal</span><strong class="cart-preview-total"></strong></p><small>Frete e descontos calculados nas próximas etapas.</small><a class="button" href="carrinho.html">Ver sacola e continuar</a><button type="button" class="button" data-close>Continuar comprando</button></footer>';
  document.body.append(dialog);
  const list = dialog.querySelector('.cart-preview-items');
  const safe = value => String(value || '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function render() {
    const cart = getCart();
    list.innerHTML = cart.length ? cart.map((item,index)=>`<article><img src="${safe(item.image)}" alt="${safe(item.name)}"><div><h3>${safe(item.name)}</h3>${item.personalization?.size?`<p>Tamanho: ${safe(item.personalization.size)}</p>`:''}${item.personalization?.engraving_text?`<p>Gravação: ${safe(item.personalization.engraving_text)}</p>`:''}<p>Quantidade: ${Number(item.qty)}</p><strong>${money(Number(item.price)*Number(item.qty))}</strong><button type="button" data-remove-preview="${index}" aria-label="Remover ${safe(item.name)}">Remover</button></div></article>`).join('') : '<p>Sua sacola está vazia.</p>';
    dialog.querySelector('.cart-preview-total').textContent = money(cart.reduce((sum,item)=>sum+Number(item.price)*Number(item.qty),0));
    dialog.querySelector('a.button').hidden = !cart.length;
  }
  dialog.querySelectorAll('[data-close]').forEach(button=>button.onclick=()=>dialog.close());
  dialog.addEventListener('click',event=>{if(event.target===dialog){const box=dialog.getBoundingClientRect();if(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom)dialog.close();}});
  list.addEventListener('click',event=>{
    const button=event.target.closest('[data-remove-preview]'); if(!button)return;
    const cart=getCart();cart.splice(Number(button.dataset.removePreview),1);
    localStorage.removeItem('elegance-coupon');saveCart(cart);render();
    dialog.querySelector('.cart-preview-notice').textContent='Produto removido da sacola.';
  });
  let previousOverflow='';
  dialog.addEventListener('close',()=>{document.body.style.overflow=previousOverflow;});
  document.addEventListener('elegance:cart-added',()=>{
    render();dialog.querySelector('.cart-preview-notice').textContent='Produto adicionado à sacola.';
    if(!dialog.open){previousOverflow=document.body.style.overflow;document.body.style.overflow='hidden';dialog.showModal();}
  });
})();
