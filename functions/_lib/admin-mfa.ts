import type {Env,SessionCustomer} from './types';
import {apiError,json,readJson} from './http';
import {verifyPassword,sha256,clearSessionCookie} from './auth';
import {consumeLimit} from './request-security';
import {base32,matchStep} from './totp';

type Mfa={secret:string;enabled:number;expires_at:string;last_step:number};
const encoder=new TextEncoder();
function hex(bytes:Uint8Array){return Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');}
async function key(env:Env){
  if(!env.MFA_ENCRYPTION_KEY || !/^[a-f0-9]{64}$/i.test(env.MFA_ENCRYPTION_KEY))throw new Error('MFA_NOT_CONFIGURED');
  return crypto.subtle.importKey('raw',Uint8Array.from(env.MFA_ENCRYPTION_KEY.match(/../g)!,v=>parseInt(v,16)),{name:'AES-GCM'},false,['encrypt','decrypt']);
}
async function encrypt(env:Env,id:number,secret:string){
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const data=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:encoder.encode(String(id))},await key(env),encoder.encode(secret));
  return hex(iv)+':'+hex(new Uint8Array(data));
}
async function decrypt(env:Env,id:number,value:string){
  const [iv,data]=value.split(':').map(s=>Uint8Array.from(s.match(/../g)!,v=>parseInt(v,16)));
  return new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv,additionalData:encoder.encode(String(id))},await key(env),data));
}
export async function mfaEnabled(env:Env,id:number):Promise<boolean>{
  return !!await env.DB.prepare('SELECT customer_id FROM admin_mfa WHERE customer_id=? AND enabled=1').bind(id).first();
}
export async function verifyAdminFactor(env:Env,id:number,input:unknown):Promise<boolean>{
  const row=await env.DB.prepare('SELECT * FROM admin_mfa WHERE customer_id=? AND enabled=1').bind(id).first<Mfa>();
  if(!row)return true;
  if(typeof input!=='string'||!input.trim())return false;
  if(!await consumeLimit(env,`mfa-login:${id}`,8))return false;
  const code=input.replace(/[\s-]/g,'').toLowerCase();
  if(/^[a-f0-9]{32}$/.test(code)){
    const used=await env.DB.prepare('DELETE FROM admin_recovery_codes WHERE customer_id=? AND code_hash=? RETURNING customer_id').bind(id,await sha256(code)).first();
    return !!used;
  }
  const step=await matchStep(await decrypt(env,id,row.secret),code);
  if(step===null)return false;
  const result=await env.DB.prepare('UPDATE admin_mfa SET last_step=? WHERE customer_id=? AND enabled=1 AND last_step<?').bind(step,id,step).run();
  return result.meta.changes===1;
}
export async function adminMfa(request:Request,env:Env,customer:SessionCustomer,action:string):Promise<Response>{
  const id=customer.id;
  if(request.method==='GET'&&action==='status')return json({ok:true,enabled:await mfaEnabled(env,id),configured:!!env.MFA_ENCRYPTION_KEY});
  if(request.method!=='POST'||!['setup','confirm','add-device'].includes(action))return apiError('Não encontrado.',404);
  if(!await consumeLimit(env,`mfa-setup:${id}`,8))return apiError('Muitas tentativas. Aguarde 15 minutos.',429);
  const body=await readJson<{password?:string;code?:string}>(request);
  if(action==='add-device'){
    const row=await env.DB.prepare('SELECT * FROM admin_mfa WHERE customer_id=? AND enabled=1').bind(id).first<Mfa>();
    if(!row)return apiError('Ative a autenticação em duas etapas antes de vincular outro aparelho.',400);
    const record=await env.DB.prepare('SELECT password_hash,password_salt FROM customers WHERE id=?').bind(id).first<{password_hash:string;password_salt:string}>();
    if(!record||typeof body.password!=='string'||!await verifyPassword(body.password,record.password_salt,record.password_hash))return apiError('Senha incorreta.',401);
    if(!await verifyAdminFactor(env,id,body.code))return apiError('Código do autenticador ou de recuperação inválido.',400);
    const secret=await decrypt(env,id,row.secret),issuer='Elegance 18K';
    return json({ok:true,secret,uri:`otpauth://totp/${encodeURIComponent(issuer+':'+customer.email)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`});
  }
  if(await mfaEnabled(env,id))return apiError('A autenticação em duas etapas já está ativa.',409);
  if(action==='setup'){
    const record=await env.DB.prepare('SELECT password_hash,password_salt FROM customers WHERE id=?').bind(id).first<{password_hash:string;password_salt:string}>();
    if(!record||typeof body.password!=='string'||!await verifyPassword(body.password,record.password_salt,record.password_hash))return apiError('Senha incorreta.',401);
    const secret=base32(crypto.getRandomValues(new Uint8Array(20)));
    const encrypted=await encrypt(env,id,secret);
    const codes=Array.from({length:10},()=>hex(crypto.getRandomValues(new Uint8Array(16))));
    const hashes=await Promise.all(codes.map(code=>sha256(code)));
    // Single transaction: replacing an unconfirmed enrollment replaces its recovery codes.
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO admin_mfa(customer_id,secret,expires_at) VALUES(?,?,?) ON CONFLICT(customer_id) DO UPDATE SET secret=excluded.secret,expires_at=excluded.expires_at WHERE enabled=0`).bind(id,encrypted,new Date(Date.now()+600000).toISOString()),
      env.DB.prepare('DELETE FROM admin_recovery_codes WHERE customer_id=? AND EXISTS(SELECT 1 FROM admin_mfa WHERE customer_id=? AND enabled=0 AND secret=?)').bind(id,id,encrypted),
      ...hashes.map(hash=>env.DB.prepare('INSERT INTO admin_recovery_codes(customer_id,code_hash) SELECT ?,? WHERE EXISTS(SELECT 1 FROM admin_mfa WHERE customer_id=? AND enabled=0 AND secret=?)').bind(id,hash,id,encrypted))
    ]);
    const saved=await env.DB.prepare('SELECT secret,enabled FROM admin_mfa WHERE customer_id=?').bind(id).first<Mfa>();
    if(saved?.enabled||saved?.secret!==encrypted)return apiError('Configuração alterada em outra janela. Recomece.',409);
    const issuer='Elegance 18K';
    return json({ok:true,secret,uri:`otpauth://totp/${encodeURIComponent(issuer+':'+customer.email)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`,recovery_codes:codes});
  }
  const row=await env.DB.prepare('SELECT * FROM admin_mfa WHERE customer_id=? AND enabled=0 AND datetime(expires_at)>CURRENT_TIMESTAMP').bind(id).first<Mfa>();
  if(!row)return apiError('Configuração expirada. Gere um novo QR Code.',400);
  const step=await matchStep(await decrypt(env,id,row.secret),typeof body.code==='string'?body.code.trim():'');
  if(step===null)return apiError('Código inválido. Confira o horário automático do celular.',400);
  const activated=await env.DB.prepare('UPDATE admin_mfa SET enabled=1,last_step=? WHERE customer_id=? AND enabled=0 AND secret=? AND datetime(expires_at)>CURRENT_TIMESTAMP').bind(step,id,row.secret).run();
  if(activated.meta.changes!==1)return apiError('Configuração alterada. Recomece.',409);
  return json({ok:true,enabled:true},200,{'Set-Cookie':clearSessionCookie()});
}
