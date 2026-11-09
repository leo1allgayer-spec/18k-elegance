import type { Env } from '../_lib/types';
import { json, apiError } from '../_lib/http';
import { marketingSettings } from '../_lib/marketing';
export const onRequest: PagesFunction<Env> = async ({request,env}) => {
 if (request.method !== 'GET') return apiError('Método não permitido.',405);
 return json({settings:await marketingSettings(env)});
};
