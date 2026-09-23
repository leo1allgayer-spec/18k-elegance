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
        const label = document.createElement('article');
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
        const remaining = Math.max(0, variant.stock - cart.filter(i => Number(i.variant_id) === variant.id).reduce((sum,i) => sum + Number(i.qty),0));
        input.type = 'number'; input.min = '0'; input.max = String(remaining); input.step = '1'; input.value = '0'; input.dataset.index = String(index);
        input.setAttribute('aria-label','Quantidade de ' + product.name);
        const controls = document.createElement('div'); controls.className = 'extra-quantity';
        const minus = document.createElement('button'), plus = document.createElement('button');
        minus.type = plus.type = 'button'; minus.textContent = '−'; plus.textContent = '+';
        minus.setAttribute('aria-label','Diminuir quantidade de ' + product.name);
        plus.setAttribute('aria-label','Aumentar quantidade de ' + product.name);
        const update = value => { input.value = String(Math.max(0,Math.min(remaining,Math.floor(Number(value)||0)))); minus.disabled = Number(input.value)===0; plus.disabled = Number(input.value)>=remaining; };
        minus.onclick = () => update(Number(input.value)-1); plus.onclick = () => update(Number(input.value)+1);
        input.onchange = () => update(input.value); update(0);
        controls.append(minus,input,plus);
        const stock = document.createElement('small'); stock.textContent = `${remaining} disponível(is)`; text.append(stock);
        label.append(img,text,controls); list.append(label);
      });
      message.textContent = available.length ? 'Escolha a quantidade de cada extra. Deixe zero para não adicionar.' : 'Não há extras disponíveis no momento. Você pode continuar para a entrega.';
      confirm.disabled = !available.length;
    } catch {
      message.textContent = 'Não foi possível carregar os extras. Você pode continuar para a entrega ou tentar novamente.';
    } finally { loading = false; }
  });
  confirm.onclick = () => {
    const selected = [...list.querySelectorAll('input[type="number"]')].filter(input => Number(input.value)>0);
    const cart = getCart();
    if (!cart.length) { dialog.close(); return; }
    selected.forEach(input => {
      const {product,variant} = available[Number(input.dataset.index)];
      const already = cart.filter(item => Number(item.variant_id) === variant.id).reduce((sum,item) => sum+Number(item.qty),0);
      const quantity = Math.max(0,Math.min(variant.stock-already,Math.floor(Number(input.value)||0)));
      if (!quantity) return;
      const existing = cart.find(item => Number(item.variant_id) === variant.id);
      if (existing) existing.qty = Number(existing.qty) + quantity;
      else cart.push({product_id:product.id,variant_id:variant.id,name:product.name,price:(variant.price_cents ?? product.price_cents)/100,image:product.images[0]?.url || '',qty:quantity,personalization:null});
    });
    if (selected.length) { localStorage.removeItem('elegance-coupon'); saveCart(cart); }
    location.assign('checkout.html');
  };
})();
