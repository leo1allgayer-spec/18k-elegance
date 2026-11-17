import type { Env } from './types';
export const controlLabels:Record<string,string>={add_cart:'Adicionar à sacola',added_cart:'Adicionado à sacola ✓',favorite_add:'Adicionar aos favoritos',favorite_remove:'Remover dos favoritos',shipping_calculate:'Calcular',category_all:'Todos',category_back:'← Voltar para a página inicial',search:'Buscar',checkout:'Continuar para entrega',continue_shopping:'← Continuar comprando',explore:'Explorar joias',clear_cart:'Esvaziar sacola',home_collection:'Conhecer a coleção',home_new:'Ver novidades',instagram_follow:'Seguir no Instagram',extra_add:'Adicionar e continuar',extra_skip:'Continuar sem adicionar',extra_back:'Voltar à sacola'};
export function validControls(body:unknown):body is {instagram_handle:string;labels:Record<string,string>}{
 if(!body||typeof body!=='object'||Array.isArray(body))return false;
 const b=body as Record<string,unknown>;
 if(Object.keys(b).some(k=>!['instagram_handle','labels'].includes(k))||typeof b.instagram_handle!=='string'||!/^[a-zA-Z0-9._]{1,30}$/.test(b.instagram_handle))return false;
 if(!b.labels||typeof b.labels!=='object'||Array.isArray(b.labels))return false;
 return Object.entries(b.labels).every(([key,value])=>Object.hasOwn(controlLabels,key)&&typeof value==='string'&&value.length<=60&&!/[<>\x00-\x1f]/.test(value));
}
export async function storefrontControls(env:Env){
 const row=await env.DB.prepare('SELECT instagram_handle,labels_json FROM storefront_controls WHERE id=1').first<{instagram_handle:string;labels_json:string}>();
 const saved:Record<string,string>=row?JSON.parse(row.labels_json):{};
 const labels={...controlLabels};for(const key of Object.keys(labels))if(typeof saved[key]==='string'&&saved[key].trim())labels[key]=saved[key].trim();
 return {instagram_handle:row?.instagram_handle||'elegance___18k',labels};
}
