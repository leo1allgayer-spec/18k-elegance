(() => {
  const checkout = document.querySelector('.checkout-button');
  if (!checkout) return;
  const slugs = ['limpa-ouro', 'limpa-prata', 'sacola-personalizada'];
  const dialog = document.createElement('dialog');
  dialog.className = 'cart-extras';
  dialog.setAttribute('aria-labelledby', 'extras-title');
  dialog.innerHTML = '<h2 id="extras-title">Complete seu pedido</h2><p>Escolha seus cuidados e uma embalagem especial. Os extras são opcionais.</p><div class="cart-extras-list"></div><p class="extras-message" role="status"></p><div class="cart-extras-actions"><button type="button" class="button" data-confirm>Adicionar e continuar</button><a class="button" href="checkout.html">Continuar sem adicionar</a><button type="button" class="button" data-close>Voltar à sacola</button></div>';
  document.body.append(dialog);
  const list = dialog.querySelector('.cart-extras-list');
  const message = dialog.querySelector('.extras-message');
  const confirm = dialog.querySelector('[data-confirm]');
  let available = [];
  let loading = false;
  dialog.querySelector('[data-close]').onclick = () => dialog.close();
  checkout.addEventListener('click', async event => {
    event.preventDefault();
    if (!getCart().length || loading) return;
    dialog.showModal();
    loading = true;
    confirm.disabled = true;
    list.replaceChildren();
    message.textContent = 'Carregando opções…';
    try {
      const results = await Promise.all(slugs.map(async slug => {
        const response = await fetch('/api/products/' + slug, {signal:AbortSignal.timeout(10000)});
        if (!response.ok) return null;
        return (await response.json()).product;
      }));
      const cart = getCart();
      available = results.filter(Boolean).map(product => ({ product, variant:product.variants.find(v => v.stock > cart.filter(i => Number(i.variant_id) === v.id).reduce((sum,i) => sum + Number(i.qty),0)) })).filter(item => item.variant);
      available.forEach(({ product, variant }, index) => {
        const label = document.createElement('label');
        label.className = 'cart-extra';
        const img = document.createElement('img');
        img.src = product.images[0]?.url || '';
        img.alt = product.name;
        const text = document.createElement('div');
        const title = document.createElement('strong');
        title.textContent = product.name;
        const description = document.createElement('p');
        description.textContent = product.description;
        const price = document.createElement('p');
        price.textContent = money((variant.price_cents ?? product.price_cents)/100);
        text.append(title,description,price);
        const input = document.createElement('input');
        input.type = 'checkbox'; input.value = String(index);
        input.setAttribute('aria-label','Adicionar ' + product.name);
        label.append(img,text,input); list.append(label);
      });
      message.textContent = available.length ? 'Cada opção selecionada adiciona uma unidade.' : 'Não há extras disponíveis no momento. Você pode continuar para a entrega.';
      confirm.disabled = !available.length;
    } catch {
      message.textContent = 'Não foi possível carregar os extras. Você pode continuar para a entrega ou tentar novamente.';
    } finally { loading = false; }
  });
  confirm.onclick = () => {
    const selected = [...list.querySelectorAll('input:checked')];
    const cart = getCart();
    if (!cart.length) { dialog.close(); return; }
    selected.forEach(input => {
      const {product,variant} = available[Number(input.value)];
      const existing = cart.find(item => Number(item.variant_id) === variant.id);
      if (existing) existing.qty = Number(existing.qty) + 1;
      else cart.push({product_id:product.id,variant_id:variant.id,name:product.name,price:(variant.price_cents ?? product.price_cents)/100,image:product.images[0]?.url || '',qty:1,personalization:null});
    });
    if (selected.length) { localStorage.removeItem('elegance-coupon'); saveCart(cart); }
    location.assign('checkout.html');
  };
})();
