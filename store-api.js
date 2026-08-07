(function(){
  const money=cents=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format((Number(cents)||0)/100);
  const esc=value=>String(value??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const api=async path=>{const response=await fetch(`/api/${path}`);if(!response.ok)throw new Error('API indisponível');return response.json()};
  async function catalog(){
    const grid=document.querySelector('.catalog-grid');if(!grid)return;
    const params=new URLSearchParams(location.search),category=params.get('categoria')||'',query=params.get('q')||'';
    const search=new URLSearchParams();if(category)search.set('category',category);if(query)search.set('q',query);
    try{
      const data=await api(`products?${search}`);if(!data.products.length)return;
      grid.innerHTML=data.products.map(product=>`<article data-category="${esc(product.category_slug||'')}" data-name="${esc(product.name)}"><a href="produto.html?produto=${encodeURIComponent(product.slug)}"><div class="catalog-photo"><img src="${esc(product.image_url||'assets/logo-oficial.png')}" alt="${esc(product.name)}" loading="lazy">${product.featured?'<span>DESTAQUE</span>':''}<button class="favorite" aria-label="Favoritar">♡</button></div><h2>${esc(product.name)}</h2><p>${money(product.price_cents)}</p><small>${product.pix_price_cents?`${money(product.pix_price_cents)} no Pix`:product.stock>0?'Disponível':'Indisponível'}</small></a></article>`).join('');
      document.querySelectorAll('.category-tabs a,.store-header nav a').forEach(link=>{const linkCategory=new URL(link.href,location.href).searchParams.get('categoria');link.classList.toggle('active',linkCategory===category||(!linkCategory&&!category&&link.pathname.endsWith('catalogo.html')))});
    }catch(error){console.warn('Catálogo usando conteúdo de apresentação.',error)}
  }
  async function detail(){
    const root=document.querySelector('.product-detail');if(!root)return;
    const slug=new URLSearchParams(location.search).get('produto');if(!slug)return;
    try{
      const {product}=await api(`products/${encodeURIComponent(slug)}`),image=product.images?.[0]?.url||'assets/logo-oficial.png',variant=product.variants?.[0];
      document.title=`${product.name} | Elegance 18K`;document.querySelector('#detail-name').textContent=product.name;document.querySelector('#detail-price').textContent=money(product.price_cents);
      const main=document.querySelector('#detail-image');main.src=image;main.alt=product.name;
      document.querySelector('.thumbs').innerHTML=product.images?.length?product.images.map((item,index)=>`<button class="${index?'':'active'}"><img src="${esc(item.url)}" alt="${esc(item.alt_text||product.name)}"></button>`).join(''):`<button class="active"><img src="${esc(image)}" alt="${esc(product.name)}"></button>`;
      document.querySelector('.breadcrumb').textContent=`Início / ${product.category_name||'Joias'} / ${product.name}`;
      document.querySelector('.description').textContent=product.description||'Semijoia Elegance com acabamento premium e garantia de 1 ano.';
      const pix=document.querySelector('.pix-price');pix.textContent=product.pix_price_cents?`${money(product.pix_price_cents)} no Pix`:'Consulte as condições de pagamento no checkout.';
      const add=document.querySelector('.add-cart');add.dataset.product=product.name;add.dataset.price=(product.price_cents/100).toFixed(2);add.dataset.image=image;add.dataset.id=String(product.id);add.dataset.variant=String(variant?.id||'');add.disabled=!variant||variant.stock<1;add.querySelector('span').textContent=add.disabled?'Sem estoque':'→';
      const finish=document.querySelector('.finish-choice span');if(finish)finish.textContent=variant?.finish||'Dourado 18K';
    }catch(error){console.warn('Produto usando conteúdo de apresentação.',error)}
  }
  catalog();detail();
})();
