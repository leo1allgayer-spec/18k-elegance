import type { Env } from '../../_lib/types';
import { currentCustomer } from '../../_lib/auth';
import { apiError,json } from '../../_lib/http';
import { imageForm,validImage } from '../../_lib/image-validation';
import { bannerImages } from '../../_lib/banners';
export const onRequest: PagesFunction<Env> = async ({request,env}) => {
 if((await currentCustomer(request,env))?.role!=='admin')return apiError('Acesso restrito.',403);
 if(request.method==='GET')return json({banners:await bannerImages(env)});
 if(request.headers.get('Origin')!==new URL(request.url).origin)return apiError('Origem inválida.',403);
 if(!['POST','DELETE'].includes(request.method))return apiError('Método não permitido.',405);
 const url=new URL(request.url);
 const slot=Number(url.searchParams.get('slot')),variant=url.searchParams.get('variant');
 if(!Number.isInteger(slot)||slot<1||slot>4||!['desktop','mobile'].includes(variant||''))return apiError('Banner inválido.');
 if(request.method==='DELETE'){
  // Keep previous objects recoverable; only reset the current selection.
  if(slot===4)await env.DB.prepare('DELETE FROM catalog_banner_images WHERE variant=?').bind(variant).run();
  else await env.DB.prepare('DELETE FROM banner_images WHERE slot=? AND variant=?').bind(slot,variant).run();
  return json({ok:true,banners:await bannerImages(env)});
 }
 if(!env.PERSONALIZATION_BUCKET)return apiError('Armazenamento de imagens indisponível.',503);
 let form:FormData;try{form=await imageForm(request);}catch{return apiError('Envie uma imagem de até 5 MB.',400);}
 const image=form.get('image');
 if(!(image instanceof File)||!['image/jpeg','image/png','image/webp'].includes(image.type)||!await validImage(image))return apiError('Use uma imagem JPG, PNG ou WebP válida, de até 5 MB.');
 const extension=image.type==='image/png'?'png':image.type==='image/webp'?'webp':'jpg';
 const filename=crypto.randomUUID()+'.'+extension;
 await env.PERSONALIZATION_BUCKET.put('banners/'+filename,image.stream(),{httpMetadata:{contentType:image.type,cacheControl:'public, max-age=31536000, immutable'}});
 if(slot===4)await env.DB.prepare(`INSERT INTO catalog_banner_images(variant,filename) VALUES(?,?) ON CONFLICT(variant) DO UPDATE SET filename=excluded.filename,updated_at=CURRENT_TIMESTAMP`).bind(variant,filename).run();
 else await env.DB.prepare(`INSERT INTO banner_images(slot,variant,filename) VALUES(?,?,?) ON CONFLICT(slot,variant) DO UPDATE SET filename=excluded.filename,updated_at=CURRENT_TIMESTAMP`).bind(slot,variant,filename).run();
 return json({ok:true,banners:await bannerImages(env)},201);
};
