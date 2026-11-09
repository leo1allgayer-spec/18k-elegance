export function privatePath(pathname: string): boolean {
  let path: string;
  try { path = decodeURIComponent(pathname).toLowerCase(); } catch { return true; }
  return /(?:^|\/)\.(?!well-known(?:\/|$))/.test(path)
    || /^\/(?:functions|migrations|tests|docs|tools|workers|work|catalog-drafts|node_modules)(?:\/|$)/.test(path)
    || /\.(?:sql|toml|map|log|md|lock|ps1|cjs|ts|bak|pem|key)$/.test(path)
    || /^\/(?:package(?:-lock)?|tsconfig|wrangler)\.jsonc?$/.test(path);
}

export function securityHeaders(response: Response, nonce?: string, marketing = false): Response {
  const headers = new Headers(response.headers);
  headers.set('X-Content-Type-Options','nosniff');
  headers.set('X-Frame-Options','DENY');
  headers.set('Referrer-Policy','no-referrer');
  headers.set('Strict-Transport-Security','max-age=31536000');
  headers.set('Permissions-Policy','camera=(), microphone=(), geolocation=()');
  headers.set('Cross-Origin-Resource-Policy','same-origin');
  headers.delete('Access-Control-Allow-Origin');
  headers.delete('Access-Control-Allow-Credentials');
  headers.set('Content-Security-Policy',[
    "default-src 'self'",
    `script-src 'self'${marketing ? ' https://connect.facebook.net https://www.googletagmanager.com https://www.googleadservices.com https://www.google.com' : ''}${nonce ? ` 'nonce-${nonce}'` : ''}`,
    "script-src-attr 'none'", "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com", "img-src 'self' https: data: blob:",
    "connect-src 'self' https://viacep.com.br" + (marketing ? " https://www.facebook.com https://connect.facebook.net https://*.google-analytics.com https://*.analytics.google.com https://www.googletagmanager.com https://www.googleadservices.com https://www.google.com https://googleads.g.doubleclick.net" : ''), "media-src 'self' blob:",
    marketing ? 'frame-src https://www.googletagmanager.com https://td.doubleclick.net' : "frame-src 'none'",
    "object-src 'none'", "base-uri 'none'", "frame-ancestors 'none'", "form-action 'self'",
    'upgrade-insecure-requests',
  ].join('; '));
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}
