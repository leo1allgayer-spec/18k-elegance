/* IDs only; no arbitrary scripts from the administration panel. */
(async function(){
 'use strict';
 const path=location.pathname.replace(/\.html$/,'');
 if (/^\/(admin|conta|api|rastreamento)(?:[-/]|$)/.test(path)) return;
 const consentKey='elegance-marketing-consent-v1';
 const read=(key)=>{try{return localStorage.getItem(key)}catch{return null}};
 const write=(key,value)=>{try{localStorage.setItem(key,value)}catch{}};
 let config,started=false,allowed=read(consentKey)==='accepted',banner;
 try{const r=await fetch('/api/marketing',{credentials:'omit',cache:'no-store'});if(!r.ok)return;config=(await r.json()).settings;}catch{return}
 if(!config || ![config.meta_pixel_id,config.google_tag_id,config.google_ads_id].some(Boolean))return;
 function load(src){const s=document.createElement('script');s.async=true;s.src=src;document.head.append(s)}
 function event(meta,google,params={},id){
  if(!allowed||!started)return;
  if(config.meta_pixel_id)window.fbq('track',meta,params,id?{eventID:id}:undefined);
  if(config.google_tag_id)window.gtag('event',google,{...params,send_to:config.google_tag_id});
 }
 function start(){
  if(started||!allowed)return;started=true;
  if(/^\d{5,25}$/.test(config.meta_pixel_id)){
   const n=window.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};
   if(!window._fbq)window._fbq=n;n.push=n;n.loaded=true;n.version='2.0';n.queue=[];
   n('set','autoConfig',false,config.meta_pixel_id);n('consent','grant');n('init',config.meta_pixel_id);
   load('https://connect.facebook.net/en_US/fbevents.js');
  }
  const ids=[config.google_tag_id,config.google_ads_id].filter(x=>/^(G-[A-Z0-9]{4,20}|AW-\d{5,20})$/.test(x));
  if(ids.length){
   window.dataLayer=window.dataLayer||[];window.gtag=function(){window.dataLayer.push(arguments)};
   window.gtag('consent','default',{analytics_storage:'granted',ad_storage:'granted',ad_user_data:'denied',ad_personalization:'granted'});
   window.gtag('js',new Date());
   ids.forEach(id=>window.gtag('config',id,{send_page_view:false,page_location:location.origin+path,page_referrer:'',allow_enhanced_conversions:false}));
   load('https://www.googletagmanager.com/gtag/js?id='+encodeURIComponent(ids[0]));
  }
  event('PageView','page_view',{page_location:location.origin+path,page_referrer:''});
  if(path==='/produto')event('ViewContent','view_item');
  if(path==='/checkout')event('InitiateCheckout','begin_checkout');
  if(path==='/pagamento-retorno')purchase();
 }
 async function purchase(attempt=0){
  if(!allowed)return;
  const order=new URLSearchParams(location.search).get('pedido')||sessionStorage.getItem('elegance-last-order')||'';
  if(!/^ELG-[A-Z0-9-]+$/.test(order))return;
  const key='elegance-pixel-purchase:'+config.meta_pixel_id+':'+config.google_tag_id+':'+config.google_ads_id+':'+order;
  if(read(key))return;
  try{
   const r=await fetch('/api/payments/status?pedido='+encodeURIComponent(order),{cache:'no-store'});if(!r.ok)return;
   const o=(await r.json()).order;
   if(!allowed)return;
   if(['paid','preparing','shipped','delivered'].includes(o?.status)&&Number.isSafeInteger(o.total_cents)&&o.total_cents>=0){
    event('Purchase','purchase',{currency:'BRL',value:o.total_cents/100,transaction_id:order},order);
    if(config.google_ads_id&&config.google_ads_label)window.gtag('event','conversion',{send_to:config.google_ads_id+'/'+config.google_ads_label,currency:'BRL',value:o.total_cents/100,transaction_id:order});
    write(key,'1');
   }else if(o?.status==='pending_payment'&&attempt<10)setTimeout(()=>purchase(attempt+1),4000);
  }catch{}
 }
 function show(){
  if(banner)return;
  banner=document.createElement('section');banner.className='marketing-consent';banner.setAttribute('aria-label','Preferências de cookies');
  banner.innerHTML='<p>Podemos usar cookies da Meta e do Google para medir visitas, compras e melhorar anúncios? Você pode recusar e continuar comprando normalmente. <a href="/politicas#privacidade">Privacidade</a></p><div><button type="button" data-choice="accepted">Aceitar opcionais</button><button type="button" data-choice="rejected">Recusar opcionais</button></div>';
  banner.addEventListener('click',e=>{const choice=e.target.closest('[data-choice]')?.dataset.choice;if(!choice)return;write(consentKey,choice);allowed=choice==='accepted';banner.remove();banner=null;if(allowed)start();else if(started){window.fbq?.('consent','revoke');window.gtag?.('consent','update',{analytics_storage:'denied',ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied'});location.reload();}});
  document.body.append(banner);
 }
 const prefs=document.createElement('button');prefs.type='button';prefs.className='marketing-preferences';prefs.textContent='Cookies';prefs.addEventListener('click',show);document.body.append(prefs);
 document.addEventListener('elegance:cart-added',()=>event('AddToCart','add_to_cart'));
 if(allowed)start();else if(read(consentKey)!=='rejected')show();
})();
