import type { Env } from '../../_lib/types';
import { currentCustomer } from '../../_lib/auth';
import { apiError,json,readJson } from '../../_lib/http';
import { storefrontControls,validControls } from '../../_lib/storefront-controls';
export const onRequest:PagesFunction<Env>=async({request,env})=>{
 if((await currentCustomer(request,env))?.role!=='admin')return apiError('Acesso restrito.',403);
 if(request.method==='GET')return json({settings:await storefrontControls(env)});
 if(request.method!=='PUT')return apiError('Método não permitido.',405);
 if(request.headers.get('Origin')!==new URL(request.url).origin)return apiError('Origem inválida.',403);
 let body:unknown;try{body=await readJson(request);}catch{return apiError('Dados inválidos.');}
 if(!validControls(body))return apiError('Informe um perfil do Instagram válido e textos de até 60 caracteres, sem HTML.');
 await env.DB.prepare(`INSERT INTO storefront_controls(id,instagram_handle,labels_json) VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET instagram_handle=excluded.instagram_handle,labels_json=excluded.labels_json,updated_at=CURRENT_TIMESTAMP`).bind(body.instagram_handle,JSON.stringify(body.labels)).run();
 return json({ok:true,settings:await storefrontControls(env)});
};
