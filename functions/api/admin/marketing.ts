import { currentCustomer } from '../../_lib/auth';
import { apiError, json, readJson } from '../../_lib/http';
import { marketingSettings, validMarketing } from '../../_lib/marketing';
import type { Env } from '../../_lib/types';
export const onRequest: PagesFunction<Env> = async ({request,env}) => {
 if ((await currentCustomer(request,env))?.role !== 'admin') return apiError('Acesso restrito.',403);
 if (request.method === 'GET') return json({settings:await marketingSettings(env)});
 if (request.method !== 'PUT') return apiError('Método não permitido.',405);
 if (request.headers.get('Origin') !== new URL(request.url).origin) return apiError('Origem inválida.',403);
 let body: unknown;
 try { body = await readJson(request); } catch { return apiError('Dados inválidos.'); }
 if (!validMarketing(body)) return apiError('Informe apenas os IDs válidos, sem código HTML. O rótulo de conversão exige um ID Google Ads.');
 await env.DB.prepare(`INSERT INTO marketing_settings(id,meta_pixel_id,google_tag_id,google_ads_id,google_ads_label) VALUES(1,?,?,?,?)
  ON CONFLICT(id) DO UPDATE SET meta_pixel_id=excluded.meta_pixel_id,google_tag_id=excluded.google_tag_id,google_ads_id=excluded.google_ads_id,google_ads_label=excluded.google_ads_label,updated_at=CURRENT_TIMESTAMP`)
  .bind(body.meta_pixel_id,body.google_tag_id,body.google_ads_id,body.google_ads_label).run();
 return json({ok:true,settings:await marketingSettings(env)});
};
