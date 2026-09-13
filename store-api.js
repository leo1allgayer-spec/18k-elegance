(function(){
  const money=cents=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format((Number(cents)||0)/100);
  const esc=value=>String(value??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const api=async path=>{const response=await fetch(`/api/${path}`);if(!response.ok)throw new Error('API indisponível');return response.json()};
  function enablePhotoPersonalization(product){
    const panel=document.querySelector('.photo-personalization'),add=document.querySelector('.add-cart'),gallery=document.querySelector('.main-product-image');
    const textEnabled=Boolean(product.engraving_text_enabled),imageEnabled=Boolean(product.engraving_image_enabled),enabled=textEnabled||imageEnabled;
    if(!panel||!add)return;
    const textField=panel.querySelector('#engraving-text')?.closest('label'),imageField=panel.querySelector('#engraving-image')?.closest('label');
    panel.hidden=!enabled;if(textField)textField.hidden=!textEnabled;if(imageField)imageField.hidden=!imageEnabled;
    const textPrice=textField?.querySelector('strong'),imagePrice=imageField?.querySelector('strong');
    if(textPrice)textPrice.textContent='+ '+money(product.engraving_text_price_cents||0);
    if(imagePrice)imagePrice.textContent='+ '+money(product.engraving_image_price_cents||0);
    add.dataset.personalizable=enabled?'true':'false';add.dataset.engravingTextEnabled=textEnabled?'true':'false';add.dataset.engravingImageEnabled=imageEnabled?'true':'false';
    add.dataset.engravingTextPrice=String(Number(product.engraving_text_price_cents)||0);add.dataset.engravingImagePrice=String(Number(product.engraving_image_price_cents)||0);
    if(gallery)gallery.dataset.previewMode=product.slug==='anel-personalizado-com-gravacao'?'ring':'standard';
  }
  function enableProductShipping(product,variant){
    const box=document.querySelector('.shipping-box'),input=box?.querySelector('.shipping-form input'),button=box?.querySelector('.shipping-form button'),options=box?.querySelector('.motoboy-option'),note=box?.querySelector('.simulation-note');
    if(!box||!input||!button||!options||!variant)return;
    button.addEventListener('click',async()=>{
      const postal=String(input.value||'').replace(/\D/g,'');
      if(postal.length!==8){note.textContent='Digite um CEP válido com 8 números.';return}
      button.disabled=true;button.textContent='Calculando...';note.textContent='Consultando PAC e SEDEX nos Correios...';
      try{
        const response=await fetch('/api/shipping/correios/quote',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({postal_code:postal,items:[{product_id:product.id,variant_id:variant.id,quantity:Number(document.querySelector('.quantity span')?.textContent||1)}]})});
        const result=await response.json();if(!response.ok)throw new Error(result.error?.message||result.message||result.error?.code||'Cotação indisponível');
        options.querySelectorAll('.correios-option').forEach(item=>item.remove());
        result.quotes.forEach(quote=>options.insertAdjacentHTML('beforeend',`<label class="correios-option"><input type="radio" name="delivery-preview"><span><b>${esc(quote.name)}</b><small>Entrega em até ${Number(quote.delivery_days)} dias úteis</small></span><strong>${money(quote.price_cents)}</strong></label>`));
        note.textContent='Valores e prazos calculados diretamente pelos Correios.';
      }catch(error){note.textContent=error.message||'Não foi possível calcular PAC e SEDEX agora.'}
      finally{button.disabled=false;button.textContent='Calcular'}
    });
  }
  function enableSizeSelection(product){
    const purchase=document.querySelector('.purchase-card'),add=document.querySelector('.add-cart');
    if(!purchase||!add||product.category_slug!=='linha-masculina')return;
    const bracelet=/pulseira/i.test(product.name),sizes=bracelet?['20 cm','21 cm','22 cm']:['60 cm','70 cm'];
    const selector=document.createElement('div');selector.className='size-selector';
    selector.innerHTML=`<b>${bracelet?'Tamanho da pulseira':'Tamanho da corrente'}</b><div class="size-options" role="group" aria-label="Escolha o tamanho">${sizes.map((size,index)=>`<button type="button" class="size-option${index?'':' active'}" data-size="${esc(size)}" aria-pressed="${index?'false':'true'}">${esc(size)}</button>`).join('')}</div>`;
    purchase.insertBefore(selector,purchase.querySelector('.options-row'));add.dataset.size=sizes[0];
    selector.addEventListener('click',event=>{const button=event.target.closest('.size-option');if(!button)return;selector.querySelectorAll('.size-option').forEach(item=>{const active=item===button;item.classList.toggle('active',active);item.setAttribute('aria-pressed',String(active))});add.dataset.size=button.dataset.size||''});
  }
  async function catalog(){
    const grid=document.querySelector('.catalog-grid');if(!grid)return;
    const params=new URLSearchParams(location.search),category=params.get('categoria')||'',query=params.get('q')||'';
    const search=new URLSearchParams();if(category)search.set('category',category);if(query)search.set('q',query);
    try{
      const data=await api(`products?${search}`),sort=document.querySelector('.catalog-toolbar select');
      const render=()=>{const products=[...data.products],mode=sort?.selectedIndex||0;if(mode===1)products.sort((a,b)=>Number(b.id)-Number(a.id));if(mode===2)products.sort((a,b)=>Number(a.price_cents)-Number(b.price_cents));if(mode===3)products.sort((a,b)=>Number(b.price_cents)-Number(a.price_cents));grid.innerHTML=products.length?products.map(product=>`<article data-category="${esc(product.category_slug||'')}" data-name="${esc(product.name)}"><a href="produto.html?produto=${encodeURIComponent(product.slug)}"><div class="catalog-photo"><img src="${esc(product.image_url||'assets/logo-oficial.png')}" alt="${esc(product.name)}" loading="lazy">${product.featured?'<span>DESTAQUE</span>':''}<button class="favorite" aria-label="Favoritar">♡</button></div><h2>${esc(product.name)}</h2><p>${money(product.price_cents)}</p><small>${product.pix_price_cents?`${money(product.pix_price_cents)} no Pix`:product.stock>0?'Disponível':'Indisponível'}</small></a></article>`).join(''):'<p class="catalog-empty">Nenhum produto cadastrado nesta categoria.</p>'};
      render();sort?.addEventListener('change',render);
      document.querySelectorAll('.category-tabs a,.store-header nav a').forEach(link=>{const linkCategory=new URL(link.href,location.href).searchParams.get('categoria');link.classList.toggle('active',linkCategory===category||(!linkCategory&&!category&&link.pathname.endsWith('catalogo.html')))});
    }catch(error){console.warn('Catálogo usando conteúdo de apresentação.',error)}
  }
  async function featured(){
    const grid=document.querySelector('.products .product-grid');if(!grid)return;
    try{const data=await api('products');grid.innerHTML=data.products.length?data.products.slice(0,4).map(product=>`<article><a href="produto.html?produto=${encodeURIComponent(product.slug)}"><div class="product-photo"><img src="${esc(product.image_url||'assets/logo-oficial.png')}" alt="${esc(product.name)}" loading="lazy">${product.featured?'<span>DESTAQUE</span>':''}<button aria-label="Favoritar">♡</button></div><h3>${esc(product.name)}</h3><p>${money(product.price_cents)}</p><small>${product.pix_price_cents?`${money(product.pix_price_cents)} no Pix`:product.stock>0?'Disponível':'Indisponível'}</small></a></article>`).join(''):'<p class="catalog-empty">Novos produtos serão adicionados em breve.</p>'}catch(error){grid.innerHTML='<p class="catalog-empty">Não foi possível carregar os produtos agora.</p>';console.warn(error)}
  }
  async function detail(){
    const root=document.querySelector('.product-detail');if(!root)return;
    const requestedSlug=new URLSearchParams(location.search).get('produto');if(!requestedSlug)return;
    const legacySlugs={'brinco-aura':'brinco-geometrico-aura','anel-lumiere':'anel-tres-aros-lumiere','colar-elise':'colar-ponto-de-luz-elise','pulseira-essencia':'pulseira-essencia'};
    try{
      let productData;
      try{productData=await api(`products/${encodeURIComponent(legacySlugs[requestedSlug]||requestedSlug)}`)}
      catch{
        const fallbackName=document.querySelector('#detail-name')?.textContent?.trim()||requestedSlug.replaceAll('-',' ');
        const listing=await api(`products?q=${encodeURIComponent(fallbackName)}`),match=listing.products?.[0];
        if(!match){
          const available=await api('products');
          const reference=available.products?.find(item=>Number(item.stock)>0)||available.products?.[0];
          if(!reference)throw new Error('Produto não encontrado no catálogo');
          const referenceData=await api(`products/${encodeURIComponent(reference.slug)}`);
          enableProductShipping(referenceData.product,referenceData.product.variants?.[0]);
          return;
        }
        productData=await api(`products/${encodeURIComponent(match.slug)}`);
      }
      const {product}=productData,image=product.images?.[0]?.url||'assets/logo-oficial.png',variant=product.variants?.[0];
      document.title=`${product.name} | Elegance 18K`;document.querySelector('#detail-name').textContent=product.name;document.querySelector('#detail-price').textContent=money(product.price_cents);
      const main=document.querySelector('#detail-image');main.src=image;main.alt=product.name;
      const thumbs=document.querySelector('.thumbs');thumbs.innerHTML=product.images?.length?product.images.map((item,index)=>`<button type="button" class="${index?'':'active'}"><img src="${esc(item.url)}" alt="${esc(item.alt_text||product.name)}"></button>`).join(''):`<button type="button" class="active"><img src="${esc(image)}" alt="${esc(product.name)}"></button>`;
      const thumbButtons=Array.from(thumbs.querySelectorAll('button'));let activeImage=0;
      const showImage=index=>{activeImage=(index+thumbButtons.length)%thumbButtons.length;const button=thumbButtons[activeImage],thumb=button?.querySelector('img');if(!thumb)return;main.src=thumb.src;main.alt=thumb.alt;thumbButtons.forEach(item=>item.classList.toggle('active',item===button));button.scrollIntoView({behavior:'smooth',block:'nearest',inline:'center'})};
      thumbs.addEventListener('click',event=>{const button=event.target.closest('button'),index=thumbButtons.indexOf(button);if(index>=0)showImage(index)});
      if(thumbButtons.length>1){const frame=document.querySelector('.main-product-image');frame.insertAdjacentHTML('beforeend','<button type="button" class="gallery-arrow gallery-prev" aria-label="Foto anterior">‹</button><button type="button" class="gallery-arrow gallery-next" aria-label="Próxima foto">›</button>');frame.querySelector('.gallery-prev').addEventListener('click',()=>showImage(activeImage-1));frame.querySelector('.gallery-next').addEventListener('click',()=>showImage(activeImage+1))}
      document.querySelector('.breadcrumb').textContent=`Início / ${product.category_name||'Joias'} / ${product.name}`;
      document.querySelector('.description').textContent=product.description||'Semijoia Elegance com acabamento premium.';
      const detailList=document.querySelector('#product-details'),details=[
        product.finish&&['Acabamento',product.finish],
        product.piece_length&&['Comprimento',product.piece_length],
        Number(product.weight_grams)>0&&['Peso',Number(product.weight_grams).toLocaleString('pt-BR')+' g'],
        product.material&&['Matéria-prima',product.material],
        product.coating&&['Proteção',product.coating],
        Number(product.warranty_months)>0&&['Garantia',product.warranty_months+' meses no banho'],
      ].filter(Boolean);
      if(detailList)detailList.innerHTML=details.length?'<dl>'+details.map(item=>'<div><dt>'+esc(item[0])+'</dt><dd>'+esc(item[1])+'</dd></div>').join('')+'</dl>':'<p>Consulte os detalhes desta peça com nossa equipe.</p>';
      const guarantee=document.querySelector('.guarantee-note');if(guarantee)guarantee.textContent=Number(product.warranty_months)>0?'◇ Garantia de '+product.warranty_months+' meses':'◇ Qualidade Elegance';
      const pix=document.querySelector('.pix-price');pix.textContent=product.pix_price_cents?`${money(product.pix_price_cents)} no Pix`:'Consulte as condições de pagamento no checkout.';
      const add=document.querySelector('.add-cart');add.dataset.product=product.name;add.dataset.price=(product.price_cents/100).toFixed(2);add.dataset.image=image;add.dataset.id=String(product.id);add.dataset.variant=String(variant?.id||'');add.disabled=!variant||variant.stock<1;add.querySelector('span').textContent=add.disabled?'Sem estoque':'→';
      window.loadProductReviews?.(product);
      enablePhotoPersonalization(product);
      const finish=document.querySelector('.finish-choice span');if(finish)finish.textContent=variant?.finish||'Dourado 18K';
      enableSizeSelection(product);
      enableProductShipping(product,variant);
    }catch(error){console.warn('Produto usando conteúdo de apresentação.',error)}
  }
  catalog();featured();detail();
})();
