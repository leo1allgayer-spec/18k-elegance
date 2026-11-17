import type { Env } from '../_lib/types';
import { json,apiError } from '../_lib/http';
import { storefrontControls } from '../_lib/storefront-controls';
export const onRequest:PagesFunction<Env>=async({request,env})=>request.method==='GET'?json({settings:await storefrontControls(env)}):apiError('Método não permitido.',405);
