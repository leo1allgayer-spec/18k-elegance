import type { Env } from './types';
import { sha256 } from './auth';
import { apiError, json } from './http';

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
  if (['GET','HEAD','OPTIONS'].includes(request.method)) return null;
  const serverCallback = ['/api/payments/mercado-pago/webhook','/api/integrations/bling-stock-tick'].includes(path);
  if (serverCallback) return null;
  const origin = request.headers.get('Origin');
  if ((origin && origin !== url.origin) || request.headers.get('Sec-Fetch-Site') === 'cross-site') return apiError('Origem inválida.',403);
  const auth = path === '/admin-login' || path.startsWith('/api/auth/');
  const checkout = path === '/api/checkout/mercado-pago';
  if (!auth && !checkout) return null;
  if (path === '/api/auth/logout') return null;
  const ip = request.headers.get('CF-Connecting-IP') || 'local';
  const group = checkout ? 'checkout' : 'auth';
  if (!await consumeLimit(env, `${group}:ip:${ip}`, checkout ? 15 : 40)) return limited();
  // Bound the cloned body before parsing; Content-Length alone is not trustworthy.
  const reader = request.clone().body?.getReader();
  let size = 0;
  const chunks: Uint8Array[] = [];
  if (reader) {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      size += result.value.byteLength;
      if (size > (checkout ? 65536 : 16384)) { void reader.cancel(); return apiError('Dados muito grandes.',413); }
      chunks.push(result.value);
    }
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk,offset); offset += chunk.length; }
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
