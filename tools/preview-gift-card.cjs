// Local QA only: no database access, real gift code, or WhatsApp delivery.
const fs=require('node:fs'),path=require('node:path'),{transformSync}=require('esbuild');
require.extensions['.ts']=(module,file)=>module._compile(transformSync(fs.readFileSync(file,'utf8'),{loader:'ts',format:'cjs',target:'es2022'}).code,file);
require.extensions['.wasm']=(module,file)=>module.exports=new WebAssembly.Module(fs.readFileSync(file));
require.extensions['.bin']=(module,file)=>{const bytes=fs.readFileSync(file);module.exports=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);};
(async()=>{const {renderGiftCard}=require('../functions/_lib/gift-card-image.ts');const image=await renderGiftCard({recipient_name:'Brenda',initial_cents:5000,message:'Parabéns pelo seu dia!'},fs.readFileSync(path.join(__dirname,'../assets/gift-card-whatsapp.png')));const target=process.argv[2];if(!target)throw new Error('Informe o arquivo de prévia PNG');fs.writeFileSync(target,image);console.log('Prévia sem código real gerada:',target);})().catch(error=>{console.error(error);process.exitCode=1;});
