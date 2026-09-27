import { parseCookies } from './http';
import { sha256 } from './auth';

export function randomToken(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)),n=>n.toString(16).padStart(2,'0')).join('');
}
export function guestToken(request: Request): string | null {
  const value=parseCookies(request)['__Host-elegance-upload'];
  return /^[a-f0-9]{64}$/.test(value||'') ? value : null;
}
export async function uploadOwner(request: Request): Promise<string> {
  const token=guestToken(request);
  return token ? sha256(token) : '';
}
export function guestCookie(token:string): string {
  return `__Host-elegance-upload=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000`;
}
export function orderCookie(order:string,token:string): string {
  return `elegance_order_${order}=${token}; Path=/api/payments/status; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000`;
}
