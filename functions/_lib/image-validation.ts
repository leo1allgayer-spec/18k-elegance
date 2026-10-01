import { readBoundedBody } from './http';

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export async function imageForm(request: Request, maxBytes = MAX_IMAGE_BYTES): Promise<FormData> {
  if (!request.headers.get('content-type')?.startsWith('multipart/form-data;')) throw new Error('INVALID_IMAGE_FORM');
  const bytes = await readBoundedBody(request, maxBytes + 16384);
  return new Response(bytes, {headers:{'Content-Type':request.headers.get('content-type')!}}).formData();
}

// Check the actual signature and container structure, never only the supplied MIME.
// This is not an antivirus or a complete image decoder.
export async function validImage(file: File, maxBytes = MAX_IMAGE_BYTES): Promise<boolean> {
  if (file.size < 12 || file.size > maxBytes) return false;
  const b = new Uint8Array(await file.arrayBuffer());
  const view = new DataView(b.buffer);
  const ascii = (start:number,length:number) => String.fromCharCode(...b.subarray(start,start+length));
  const dimensions = (w:number,h:number) => w>0 && h>0 && w<=12000 && h<=12000 && w*h<=40000000;
  if (file.type === 'image/png') {
    if (!b.subarray(0,8).every((n,i)=>n===[137,80,78,71,13,10,26,10][i])) return false;
    let offset=8, data=false, header=false;
    while(offset+12<=b.length) {
      const length=view.getUint32(offset),kind=ascii(offset+4,4);
      if(offset+12+length>b.length) return false;
      if(!header) {
        if(kind!=='IHDR'||length!==13||!dimensions(view.getUint32(offset+8),view.getUint32(offset+12))) return false;
        header=true;
      }
      if(kind==='IDAT'&&length>0) data=true;
      if(kind==='IEND') return data&&length===0&&offset+12===b.length;
      offset+=12+length;
    }
    return false;
  }
  if(file.type==='image/jpeg') {
    if(b[0]!==255||b[1]!==216||b[b.length-2]!==255||b[b.length-1]!==217) return false;
    let offset=2, sized=false;
    while(offset+4<b.length) {
      if(b[offset++]!==255) return false;
      while(b[offset]===255) offset++;
      const marker=b[offset++];
      if(marker===0xda) return sized; // compressed scan; terminal EOI was checked above
      if(marker===0xd9||marker===0) return false;
      const length=view.getUint16(offset);
      if(length<2||offset+length>b.length) return false;
      if([0xc0,0xc1,0xc2].includes(marker)) {
        if(length<8||!dimensions(view.getUint16(offset+5),view.getUint16(offset+3))) return false;
        sized=true;
      }
      offset+=length;
    }
    return false;
  }
  if(file.type==='image/webp') {
    if(ascii(0,4)!=='RIFF'||ascii(8,4)!=='WEBP'||view.getUint32(4,true)+8!==b.length) return false;
    let offset=12, found=false;
    while(offset+8<=b.length) {
      const kind=ascii(offset,4),length=view.getUint32(offset+4,true),start=offset+8;
      if(start+length>b.length) return false;
      if(kind==='VP8 '&&length>=10&&b[start+3]===157&&b[start+4]===1&&b[start+5]===42)
        found=dimensions(view.getUint16(start+6,true)&16383,view.getUint16(start+8,true)&16383);
      if(kind==='VP8L'&&length>=5&&b[start]===47) {
        const bits=view.getUint32(start+1,true);
        found=dimensions((bits&16383)+1,((bits>>>14)&16383)+1);
      }
      if(kind==='ANIM'||kind==='ANMF') return false;
      offset=start+length+(length%2);
    }
    return found&&offset===b.length;
  }
  return false;
}
