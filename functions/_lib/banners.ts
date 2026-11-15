import type { Env } from './types';
export const bannerDefaults = ['/assets/hero-mobile.webp','/assets/editorial.jpeg','/assets/hero-elegance-final.jpeg'];
export async function bannerImages(env: Env) {
 const rows=await env.DB.prepare('SELECT slot,variant,filename FROM banner_images').all<{slot:number;variant:string;filename:string}>();
 return bannerDefaults.map((fallback,index)=>{
  const desktop=rows.results.find(r=>r.slot===index+1&&r.variant==='desktop');
  const mobile=rows.results.find(r=>r.slot===index+1&&r.variant==='mobile');
  const url=(filename:string)=>'/api/banner-images/'+filename;
  return {slot:index+1,desktop:desktop?url(desktop.filename):fallback,mobile:mobile?url(mobile.filename):desktop?url(desktop.filename):fallback,desktop_custom:Boolean(desktop),mobile_custom:Boolean(mobile)};
 });
}
