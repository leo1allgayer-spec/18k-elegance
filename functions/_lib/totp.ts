const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function base32(bytes: Uint8Array): string {
  let bits=0,value=0,result='';
  for(const byte of bytes){value=(value<<8)|byte;bits+=8;while(bits>=5){result+=alphabet[(value>>>(bits-5))&31];bits-=5;}}
  if(bits)result+=alphabet[(value<<(5-bits))&31];
  return result;
}
function decode(value:string):Uint8Array<ArrayBuffer>{
  let bits=0,buffer=0;const bytes:number[]=[];
  for(const char of value){const n=alphabet.indexOf(char);if(n<0)throw new Error('INVALID_SECRET');buffer=(buffer<<5)|n;bits+=5;if(bits>=8){bytes.push((buffer>>>(bits-8))&255);bits-=8;}}
  return new Uint8Array(bytes);
}
export async function totp(secret:string,step:number,digits=6):Promise<string>{
  const key=await crypto.subtle.importKey('raw',decode(secret),{name:'HMAC',hash:'SHA-1'},false,['sign']);
  const counter=new ArrayBuffer(8);new DataView(counter).setBigUint64(0,BigInt(step));
  const signature=new Uint8Array(await crypto.subtle.sign('HMAC',key,counter));
  const offset=signature[19]&15;
  const number=((signature[offset]&127)<<24)|(signature[offset+1]<<16)|(signature[offset+2]<<8)|signature[offset+3];
  return String(number%10**digits).padStart(digits,'0');
}
export async function matchStep(secret:string,code:string,now=Date.now()):Promise<number|null>{
  if(!/^\d{6}$/.test(code))return null;
  const current=Math.floor(now/30000);let matched:number|null=null;
  for(const step of [current-1,current,current+1]){
    const expected=await totp(secret,step);let difference=0;
    for(let i=0;i<6;i++)difference|=expected.charCodeAt(i)^code.charCodeAt(i);
    if(difference===0)matched=step;
  }
  return matched;
}
