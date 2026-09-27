import type { Env } from './types';
import { sha256 } from './auth';
import { apiError, json, readBoundedBody, BodyTooLarge } from './http';

export async function consumeLimit(env: Env, key: string, limit: number, seconds = 900): Promise<boolean> {
  const now = Math.floor(Date.now() / 1000);
  const bucket = Math.floor(now / seconds);
  const row = await env.DB.prepare(`INSERT INTO request_limits(key,bucket,hits,expires_at) VALUES(?,?,1,?)
    ON CONFLICT(key) DO UPDATE SET bucket=excluded.bucket,
      hits=CASE WHEN request_limits.bucket=excluded.bucket THEN request_limits.hits+1 ELSE 1 END,
      expires_at=excluded.expires_at RETURNING hits`).bind(await sha256(key), bucket, now + seconds * 2).first<{hits:number}>();
  return Boolean(row && row.hits <= limit);
}

export async function protectRequest(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  const path = '/' + url.pathname.split('/').filter(Boolean).join('/');
  const ip = request.headers.get('CF-Connecting-IP') || 'local';
  if (['GET','HEAD','OPTIONS'].includes(request.method)) {
    if (['/api/payments/status','/api/gift-cards','/api/cart-recovery','/api/payments/mercado-pago/diagnostic'].includes(path)
      && !await consumeLimit(env, `public-read:ip:${ip}`, 120)) return limited();
    return null;
  }
  const serverCallback = ['/api/payments/mercado-pago/webhook','/api/integrations/bling-stock-tick'].includes(path);
  if (serverCallback) {
    try { await readBoundedBody(request.clone(),65536); } catch { return apiError('Dados muito grandes.',413); }
    return null;
  }
  const origin = request.headers.get('Origin');
  // Fail closed: all browser mutations must present an exact same-origin Origin.
  // Only independently signed server callbacks above are exempt.
  if (origin !== url.origin || request.headers.get('Sec-Fetch-Site') === 'cross-site') return apiError('Origem inválida.',403);
  const auth = path === '/admin-login' || path.startsWith('/api/auth/');
  const checkout = path === '/api/checkout/mercado-pago';
  const upload = path === '/api/personalization/upload' || /^\/api\/admin\/products\/\d+\/image$/.test(path);
  if (!auth && !checkout) {
    const group = upload ? 'upload' : path.startsWith('/api/admin/') ? 'admin-write' : path;
    const limit = upload ? 20 : path === '/api/cart-recovery' ? 5 : path.startsWith('/api/reviews/') ? 15 : 90;
    if (!await consumeLimit(env, `${group}:ip:${ip}`,limit)) return limited();
    try { await readBoundedBody(request.clone(), upload ? 5*1024*1024+16384 : 65536); }
    catch (error) { if (error instanceof BodyTooLarge) return apiError('Dados muito grandes.',413); throw error; }
    return null;
  }
  if (path === '/api/auth/logout') return null;
  const group = checkout ? 'checkout' : 'auth';
  if (!await consumeLimit(env, `${group}:ip:${ip}`, checkout ? 15 : 40)) return limited();
  let bytes;
  try { bytes = await readBoundedBody(request.clone(),checkout ? 65536 : 16384); }
  catch (error) { if (error instanceof BodyTooLarge) return apiError('Dados muito grandes.',413); throw error; }
  const text = new TextDecoder().decode(bytes);
  let identity = '';
  try {
    const body = path === '/admin-login' ? Object.fromEntries(new URLSearchParams(text)) : JSON.parse(text);
    identity = String(body.email || body.phone || body.customer?.email || '').trim().toLowerCase();
  } catch { return apiError('Dados inválidos.',400); }
  if (identity && !await consumeLimit(env, `${group}:identity:${identity}`, checkout ? 6 : 12)) return limited();
  return null;
}

function limited() {
  return json({ok:false,error:{code:'RATE_LIMITED',message:'Muitas tentativas. Aguarde 15 minutos e tente novamente.'}},429,{'Retry-After':'900'});
}
