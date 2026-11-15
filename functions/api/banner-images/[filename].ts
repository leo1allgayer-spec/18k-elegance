import type { Env } from '../../_lib/types';
export const onRequest: PagesFunction<Env> = async ({request,params,env}) => {
 const filename=String(params.filename||'');
 if(!['GET','HEAD'].includes(request.method)||!env.PERSONALIZATION_BUCKET||!/^[a-f0-9-]{36}\.(jpg|png|webp)$/.test(filename))return new Response('Not found',{status:404});
 const object=await env.PERSONALIZATION_BUCKET.get('banners/'+filename);
 if(!object)return new Response('Not found',{status:404});
 const headers=new Headers();object.writeHttpMetadata(headers);headers.set('Cache-Control','public, max-age=31536000, immutable');headers.set('ETag',object.httpEtag);
 return new Response(request.method==='HEAD'?null:object.body,{headers});
};
