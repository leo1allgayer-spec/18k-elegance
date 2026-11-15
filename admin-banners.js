(function(){
 'use strict';
 const page=document.querySelector('#page-content');if(!page)return;
 let loading=false;
 const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function message(text,error=false){const toast=document.querySelector('#toast');toast.textContent=text;toast.classList.toggle('error',error);toast.classList.add('show');setTimeout(()=>toast.classList.remove('show'),4000);}
 async function render(target){
  if(!target)return;
  loading=true;
  try{const r=await fetch('/api/admin/banners',{credentials:'same-origin',cache:'no-store'});const data=await r.json();if(!r.ok)throw Error(data.error?.message||'Não foi possível carregar os banners.');
   if(!target.isConnected)return;
   target.innerHTML='<article class="setting-card"><p class="eyebrow">CAMPANHAS DA LOJA</p><h3>Fotos dos banners</h3><p>Troque as três fotos do carrossel da página inicial. Envie JPG, PNG ou WebP de até 5 MB. Sugestões: computador 1920 × 900 px; celular 853 × 1280 px. Se não houver foto de celular, será usada a de computador. Os textos e botões atuais da loja são mantidos sobre as fotos.</p></article>'+data.banners.map(b=>`<article class="setting-card" style="margin-top:16px"><h3>Banner ${b.slot}</h3><div class="form-grid">${['desktop','mobile'].map(v=>`<form class="field banner-upload" data-slot="${b.slot}" data-variant="${v}"><label>${v==='desktop'?'Computador':'Celular'}</label><img src="${esc(b[v])}" alt="Prévia do banner ${b.slot}" style="max-width:100%;height:150px;object-fit:contain"><input name="image" type="file" accept="image/jpeg,image/png,image/webp" required><button class="btn primary" type="submit">Enviar e publicar foto</button>${b[v+'_custom']?'<button class="btn secondary" type="button" data-banner-reset>Restaurar padrão</button>':''}</form>`).join('')}</div></article>`).join('');
  }catch(e){target.textContent=e.message;}finally{loading=false;queueMicrotask(mount);}
 }
 function mount(){if(loading||document.querySelector('#admin-banners-panel'))return;if(!page.querySelector('.marketing-form'))return;const panel=document.createElement('section');panel.id='admin-banners-panel';panel.style.marginBottom='20px';panel.textContent='Carregando banners…';page.prepend(panel);void render(panel);}
 new MutationObserver(mount).observe(page,{childList:true});mount();
 document.addEventListener('submit',async e=>{const form=e.target;if(!form.matches?.('.banner-upload'))return;e.preventDefault();const button=form.querySelector('[type="submit"]');button.disabled=true;
  try{const image=form.elements.image.files[0];if(!image||image.size>5*1024*1024||!['image/jpeg','image/png','image/webp'].includes(image.type))throw Error('Use JPG, PNG ou WebP de até 5 MB.');const body=new FormData();body.append('image',image);const r=await fetch(`/api/admin/banners?slot=${form.dataset.slot}&variant=${form.dataset.variant}`,{method:'POST',credentials:'same-origin',body});const data=await r.json();if(!r.ok)throw Error(data.error?.message||'Falha no envio.');message('Banner publicado na loja.');await render(document.querySelector('#admin-banners-panel'));}catch(error){message(error.message,true);}finally{button.disabled=false;}
 });
 document.addEventListener('click',async e=>{const button=e.target.closest('[data-banner-reset]');if(!button)return;if(!confirm('Restaurar a imagem padrão desta versão do banner?'))return;const form=button.closest('form');button.disabled=true;try{const r=await fetch(`/api/admin/banners?slot=${form.dataset.slot}&variant=${form.dataset.variant}`,{method:'DELETE',credentials:'same-origin'});if(!r.ok)throw Error('Não foi possível restaurar.');message('Imagem padrão restaurada.');await render(document.querySelector('#admin-banners-panel'));}catch(error){message(error.message,true);}finally{button.disabled=false;}});
})();
