(async function(){
 if(/^\/(admin|api)(?:[-/.]|$)/.test(location.pathname))return;
 let settings;try{const r=await fetch('/api/storefront-controls',{credentials:'omit',cache:'no-store'});if(!r.ok)return;settings=(await r.json()).settings;}catch{return;}
 const labels=settings.labels||{};
 window.eleganceUi={label:(key,fallback)=>labels[key]||fallback};
 const put=(el,value)=>{if(el&&el.textContent!==value)el.textContent=value;};
 const controls={'.catalog-back-home':'category_back','.category-tabs>a:not([href*="categoria="])':'category_all','.search-panel>button':'search','.shipping-form button':'shipping_calculate','.checkout-button':'checkout','.checkout-header>a:first-child':'continue_shopping','.empty-cart>a':'explore','#clear-cart':'clear_cart','.hero-ctas .button':'home_collection','.hero-ctas .text-link':'home_new','.cart-extras-actions [data-confirm]':'extra_add','.cart-extras-actions>a':'extra_skip','.cart-extras-actions [data-close]':'extra_back'};
 function apply(){
  for(const [selector,key]of Object.entries(controls))document.querySelectorAll(selector).forEach(el=>{if(!el.disabled)put(el,labels[key]);});
  document.querySelectorAll('.add-cart').forEach(el=>{
   if(el.disabled)return;const value=labels[el.dataset.uiState==='added'?'added_cart':'add_cart'];
   const text=[...el.childNodes].find(n=>n.nodeType===3);if(text){if(text.textContent.trim()!==value)text.textContent=value+' ';}else if(el.children.length===0)put(el,value);
  });
  document.querySelectorAll('[data-favorite]').forEach(el=>{const active=el.getAttribute('aria-pressed')==='true';const label=labels[active?'favorite_remove':'favorite_add'];if(el.getAttribute('aria-label')!==label)el.setAttribute('aria-label',label);if(el.classList.contains('wish-button'))put(el,(active?'♥︎ ':'♡ ')+label);});
  document.querySelectorAll('a[href*="instagram.com/"]').forEach(el=>{
   const target='https://www.instagram.com/'+settings.instagram_handle+'/';if(el.href!==target)el.href=target;
   if(el.classList.contains('instagram-link')){const text=el.querySelector('span:last-child');if(text)put(text,labels.instagram_follow);else put(el,labels.instagram_follow);}
  });
  const heading=document.querySelector('.instagram>h2');if(heading)put(heading,'@'+settings.instagram_handle);
 }
 let pending=false;const observer=new MutationObserver(()=>{if(pending)return;pending=true;queueMicrotask(()=>{pending=false;apply();});});observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['aria-pressed','disabled']});apply();
})();
