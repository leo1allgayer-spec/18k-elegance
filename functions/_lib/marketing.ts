import type { Env } from './types';
export type MarketingSettings = { meta_pixel_id: string; google_tag_id: string; google_ads_id: string; google_ads_label: string };
export function validMarketing(value: unknown): value is MarketingSettings {
 if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
 const v = value as Record<string, unknown>;
 return Object.keys(v).every(k => ['meta_pixel_id','google_tag_id','google_ads_id','google_ads_label'].includes(k)) &&
  [['meta_pixel_id',/^\d{5,25}$/],['google_tag_id',/^G-[A-Z0-9]{4,20}$/],['google_ads_id',/^AW-\d{5,20}$/],['google_ads_label',/^[A-Za-z0-9_-]{3,100}$/]].every(([k,re]) =>
   typeof v[String(k)] === 'string' && (v[String(k)] === '' || (re as RegExp).test(v[String(k)] as string))) &&
  (!v.google_ads_label || Boolean(v.google_ads_id));
}
export async function marketingSettings(env: Env): Promise<MarketingSettings> {
 return await env.DB.prepare('SELECT meta_pixel_id,google_tag_id,google_ads_id,google_ads_label FROM marketing_settings WHERE id=1').first<MarketingSettings>() || {meta_pixel_id:'',google_tag_id:'',google_ads_id:'',google_ads_label:''};
}
