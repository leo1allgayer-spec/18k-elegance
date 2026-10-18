import { Resvg, initWasm } from '@resvg/resvg-wasm';
import wasm from '@resvg/resvg-wasm/index_bg.wasm';
import font from '../_assets/NotoSans-Regular.bin';

let ready:Promise<void>|undefined;
const esc=(value:string)=>value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]!));
export function base64(bytes:Uint8Array):string{let text='';for(let i=0;i<bytes.length;i+=8192)text+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(text);}
function lines(value:string,width:number,max:number){
 const words=value.trim().split(/\s+/),rows:string[]=[];let row='';
 for(const word of words){for(let i=0;i<word.length;i+=width){const part=word.slice(i,i+width);if(row.length+part.length+1>width){rows.push(row);row='';}row+=(row?' ':'')+part;}}
 if(row)rows.push(row);
 if(rows.length>max){rows.length=max;rows[max-1]=rows[max-1].slice(0,width-3)+'...';}
 return rows;
}
export function giftCardSvg(card:{recipient_name:string;initial_cents:number;message:string|null},background:Uint8Array){
 const money=new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(card.initial_cents/100);
 const names=lines(card.recipient_name,32,3),message=lines(card.message||'Um presente especial para você.',58,5);
 const text=(rows:string[],y:number,size:number,step:number,color:string)=>rows.map((line,i)=>`<text x="90" y="${y+i*step}" font-size="${size}" fill="${color}">${esc(line)}</text>`).join('');
 return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1200" height="900" viewBox="0 0 1200 900"><image width="1200" height="900" preserveAspectRatio="none" xlink:href="data:image/png;base64,${base64(background)}"/><rect x="55" y="55" width="1050" height="790" rx="15" fill="#030d20" opacity="0.5"/><g font-family="Noto Sans"><text x="90" y="125" font-size="42" letter-spacing="5" fill="#e7c983">ELEGANCE 18K</text><text x="90" y="180" font-size="22" letter-spacing="4" fill="#f9f1dd">CARTÃO-PRESENTE</text><text x="90" y="310" font-size="96" fill="#e7c983">${esc(money)}</text><text x="90" y="380" font-size="24" fill="#e7c983">PARA</text>${text(names,435,42,52,'#ffffff')}${text(message,620,28,39,'#f9f1dd')}<text x="90" y="850" font-size="20" fill="#e7c983">elegance18k.com · Seu código está na mensagem abaixo.</text></g></svg>`;
}
export async function renderGiftCard(card:{recipient_name:string;initial_cents:number;message:string|null},background?:Uint8Array):Promise<Uint8Array>{
 await (ready??=initWasm(wasm));
 if(!background){const r=await fetch('https://elegance18k.com/assets/gift-card-whatsapp.png');if(!r.ok)throw new Error('GIFT_BACKGROUND_UNAVAILABLE');background=new Uint8Array(await r.arrayBuffer());}
 const image=new Resvg(giftCardSvg(card,background),{font:{fontBuffers:[new Uint8Array(font)],defaultFontFamily:'Noto Sans',loadSystemFonts:false}});
 try{const rendered=image.render();try{return rendered.asPng();}finally{rendered.free();}}finally{image.free();}
}
