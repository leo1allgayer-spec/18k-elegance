const {test}=require('node:test');
test('receipt separates gift-card payment from the approved Mercado Pago payment',()=>{
 const vm=require('node:vm'),context={Intl,Date};vm.createContext(context);vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'../admin-order-print.js'),'utf8').split('const printButton=')[0],context);
 const html=vm.runInContext(`printDocument({order:{order_number:'TESTE',status:'paid',total_cents:35654,gift_card_cents:5000,gift_card_status:'spent',payment_status:'approved',payment_amount_cents:30654},items:[]})`,context);
 assert.ok(html.includes('Total do pedido'));assert.ok(html.includes('Pago com cartão-presente'));assert.ok(html.includes('Pago no Mercado Pago'));for(const amount of ['356,54','306,54','50,00'])assert.ok(html.includes(amount));
 assert.equal(vm.runInContext('paymentBreakdown({total_cents:10000,gift_card_cents:0})',context),'');assert.ok(!vm.runInContext("paymentBreakdown({total_cents:10000,gift_card_cents:5000,payment_status:'pending'})",context).includes('Pago no Mercado Pago'));
});
test('configured finishes are required and persisted with the order',async()=>{
 const {db,env}=fixture(),original=global.fetch;db.prepare('UPDATE products SET available_finishes=? WHERE id=1').run(JSON.stringify(['Dourado 18K','Prata 925']));const body=await checkout().json();
 global.fetch=async()=>Response.json({id:'pref',sandbox_init_point:'https://example.test/pay'});
 try{for(const finish of ['', 'Ródio']){body.items[0].personalization={finish};assert.notEqual((await createMercadoPagoCheckout(req('/api/checkout/mercado-pago',body),env)).status,201);}body.items[0].personalization={finish:'Prata 925'};assert.equal((await createMercadoPagoCheckout(req('/api/checkout/mercado-pago',body),env)).status,201);assert.equal(JSON.parse(db.prepare('SELECT personalization_json FROM order_items').get().personalization_json).finish,'Prata 925');}finally{global.fetch=original;db.close()}
});
test('gift image contains personalized text and WhatsApp receives rendered PNG bytes',async()=>{
 require.extensions['.wasm']=(module,file)=>module.exports=new WebAssembly.Module(fs.readFileSync(file));
 require.extensions['.bin']=(module,file)=>{const b=fs.readFileSync(file);module.exports=b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)};
 const {giftCardSvg,renderGiftCard}=require('../functions/_lib/gift-card-image.ts'),{sendWhatsAppPng}=require('../functions/_lib/whatsapp.ts');
 const background=fs.readFileSync(require('node:path').join(__dirname,'../assets/gift-card-whatsapp.png')),card={recipient_name:'Brenda & Família',sender_name:'Marina',initial_cents:5000,message:'Parabéns pelo seu dia! <3'};
 const svg=giftCardSvg(card,background);assert.ok(svg.includes('Brenda &amp; Família'));assert.ok(svg.includes('De: Marina'));assert.ok(!giftCardSvg({...card,sender_name:null},background).includes('De:'));assert.ok(svg.includes('50,00'));assert.ok(svg.includes('&lt;3'));assert.ok(!svg.includes('ELG-'));
 const png=await renderGiftCard(card,background);assert.equal(Buffer.from(png).readUInt32BE(16),1200);assert.equal(Buffer.from(png).readUInt32BE(20),900);assert.notDeepEqual(Buffer.from(png),background);
 const original=global.fetch;let body;global.fetch=async(_url,options)=>{body=JSON.parse(options.body);return Response.json({ok:true})};try{await sendWhatsAppPng({EVOLUTION_API_URL:'https://example.test',EVOLUTION_API_KEY:'test',EVOLUTION_INSTANCE:'test'},'5551999990000',png,'Legenda completa');assert.deepEqual(Buffer.from(body.media,'base64'),Buffer.from(png));assert.equal(body.caption,'Legenda completa');}finally{global.fetch=original}
});
test('admin configures choices on arbitrary products and checkout enforces them after renaming',async()=>{
 const {db,env}=fixture(),original=global.fetch;db.exec("UPDATE customers SET role='admin' WHERE id=1");const session=await createSession(env,1,'admin');
 const body={name:'Modelo Novo',sku:'MODEL-NOVO',price_cents:10000,stock:1,active:true,available_colors:['Lilás','Verde'],children_models:['1 Menina','2 Meninos'],name_count_max:2};
 const save=()=>onRequest({env,request:new Request('https://elegance18k.com/api/admin/products/1',{method:'PUT',headers:{Origin:'https://elegance18k.com','Content-Type':'application/json',Cookie:'elegance_session='+session.token},body:JSON.stringify(body)})});
 try{assert.equal((await save()).status,200);body.name='Renomeado';assert.equal((await save()).status,200);const p=db.prepare('SELECT * FROM products WHERE id=1').get();assert.deepEqual(JSON.parse(p.available_colors),['Lilás','Verde']);assert.equal(p.name_count_max,2);
 const payload=await checkout().json();payload.items[0].personalization={color:'Lilás',children_model:'2 Meninos'};global.fetch=async()=>Response.json({id:'pref',sandbox_init_point:'https://example.test/pay'});assert.equal((await createMercadoPagoCheckout(req('/api/checkout/mercado-pago',payload),env)).status,201);
 body.name_count_max=7;assert.equal((await save()).status,400);
 }finally{global.fetch=original;db.close()}
});
test('Lip Lance requires one of four colors and persists the selected color',async()=>{
 const {db,env}=fixture(),original=global.fetch;db.exec(`UPDATE products SET slug='lip-lance',available_colors='["Azul Marinho","Rosa Pink","Branco","Preto"]' WHERE id=1`);const body=await checkout().json();
 global.fetch=async()=>Response.json({id:'pref-color',sandbox_init_point:'https://example.test/pay'});
 try{for(const color of ['', 'Vermelho']){body.items[0].personalization={color};assert.notEqual((await createMercadoPagoCheckout(req('/api/checkout/mercado-pago',body),env)).status,201);}assert.equal(db.prepare('SELECT COUNT(*) n FROM orders').get().n,0);body.items[0].personalization={color:'Rosa Pink'};assert.equal((await createMercadoPagoCheckout(req('/api/checkout/mercado-pago',body),env)).status,201);assert.equal(JSON.parse(db.prepare('SELECT personalization_json FROM order_items').get().personalization_json).color,'Rosa Pink');}finally{global.fetch=original;db.close()}
});
test('paid order automatically creates and links its product before exporting; unpaid order does not',async()=>{
 const {db,env}=fixture(),original=global.fetch,{stockSchema}=require('../functions/_lib/bling-stock.ts'),{exportPaidOrderToBling}=require('../functions/_lib/bling-orders.ts');
 await stockSchema(env);db.exec("CREATE TABLE bling_tokens(id INTEGER PRIMARY KEY,access_token TEXT,refresh_token TEXT,expires_at TEXT); INSERT INTO bling_tokens VALUES(1,'test','test','2099-01-01')");order(db,1);let productPosts=0,salePosts=0;
 global.fetch=async(url,opts={})=>{
  if(url.includes('/pedidos/vendas?'))return Response.json({data:[]});
  if(url.includes('/produtos?'))return Response.json({data:[]});
  if(url.includes('/depositos?'))return Response.json({data:[{id:7,situacao:1,padrao:true}]});
  if(url.endsWith('/produtos')){productPosts++;assert.equal(JSON.parse(opts.body).codigo,'piece-1');return Response.json({data:{id:777}});}
  if(url.includes('/contatos?'))return Response.json({data:[{id:88,email:'owner@example.test'}]});
  if(url.endsWith('/pedidos/vendas')){salePosts++;assert.equal(productPosts,1);assert.equal(JSON.parse(opts.body).itens[0].produto.id,777);return Response.json({data:{id:999}});}
  throw new Error('Unexpected Bling call');
 };
 try{await exportPaidOrderToBling(env,1);assert.equal(productPosts,0);assert.equal(salePosts,0);await finalizeOrder(env,1);await exportPaidOrderToBling(env,1);await exportPaidOrderToBling(env,1);assert.equal(productPosts,1);assert.equal(salePosts,1);assert.equal(db.prepare('SELECT status FROM bling_order_exports').get().status,'sent');assert.equal(db.prepare('SELECT stock FROM product_variants').get().stock,0);}finally{global.fetch=original;db.close();}
});

test('Bling recovery preserves discount, freight and size and does not duplicate an existing sale',async()=>{
 const {db,env}=fixture(),original=global.fetch,{stockSchema}=require('../functions/_lib/bling-stock.ts'),{exportPaidOrderToBling}=require('../functions/_lib/bling-orders.ts');
 await stockSchema(env);db.exec("CREATE TABLE bling_tokens(id INTEGER PRIMARY KEY,access_token TEXT,refresh_token TEXT,expires_at TEXT); INSERT INTO bling_tokens VALUES(1,'test','test','2099-01-01'); INSERT INTO bling_stock_links(variant_id,bling_id,deposit_id) VALUES(1,777,1)");order(db,1);await finalizeOrder(env,1);db.exec("UPDATE orders SET shipping_cents=3000,discount_cents=3683 WHERE id=1; UPDATE order_items SET personalization_json='{\"size\":\"60 cm\"}' WHERE order_id=1");let payload,posts=0;
 global.fetch=async(url,opts)=>{if(url.includes('/pedidos/vendas?')){assert.ok(url.includes('numerosLojas%5B%5D=ELG-1'));return Response.json({data:[]});}if(url.includes('/contatos?'))return Response.json({data:[{id:88,email:'owner@example.test'}]});posts++;payload=JSON.parse(opts.body);return Response.json({data:{id:999}})};
 try{await exportPaidOrderToBling(env,1);assert.equal(payload.contato.id,88);assert.equal(payload.desconto.valor,36.83);assert.equal(payload.transporte.frete,30);assert.ok(payload.itens[0].descricao.includes('60 cm'));assert.equal(db.prepare('SELECT status FROM bling_order_exports').get().status,'sent');await exportPaidOrderToBling(env,1);assert.equal(posts,1);db.exec("UPDATE bling_order_exports SET status='error',bling_order_id=NULL");global.fetch=async()=>Response.json({data:[{id:999,numeroLoja:'ELG-1'}]});await exportPaidOrderToBling(env,1);assert.equal(db.prepare('SELECT bling_order_id FROM bling_order_exports').get().bling_order_id,999);}finally{global.fetch=original;db.close()}
});
test('heart necklace requires a valid children model and preserves it in the order',async()=>{
 const {db,env}=fixture(),original=global.fetch;db.exec(`UPDATE products SET slug='gargantilha-coracao-vazado-veneziana',children_models='["3 Meninos e 1 Menina"]' WHERE id=1`);
 const body=await checkout().json();global.fetch=async()=>Response.json({id:'pref1',sandbox_init_point:'https://example.test/pay'});
 try{for(const model of ['', '5 Meninas']){body.items[0].personalization={children_model:model};assert.notEqual((await createMercadoPagoCheckout(req('/api/checkout/mercado-pago',body),env)).status,201);}body.items[0].personalization={children_model:'3 Meninos e 1 Menina'};assert.equal((await createMercadoPagoCheckout(req('/api/checkout/mercado-pago',body),env)).status,201);assert.equal(JSON.parse(db.prepare('SELECT personalization_json FROM order_items').get().personalization_json).children_model,'3 Meninos e 1 Menina');}finally{global.fetch=original;db.close()}
});
test('nuvem necklace rejects four children and accepts three matching names',async()=>{
 const {db,env}=fixture(),original=global.fetch;
 db.exec("UPDATE products SET slug='gargantilha-nuvem-filhos-veneziana',name_count_max=3,engraving_name_count_enabled=1,engraving_text_enabled=1,engraving_text_required=1 WHERE id=1");
 const request=checkout();const body=await request.json();body.items[0].personalization={name_count:4,engraving_text:'Ana, Bia, Caio, Davi'};
 global.fetch=async()=>Response.json({id:'pref1',sandbox_init_point:'https://example.test/pay'});
 try{assert.notEqual((await createMercadoPagoCheckout(req('/api/checkout/mercado-pago',body),env)).status,201);assert.equal(db.prepare('SELECT COUNT(*) n FROM orders').get().n,0);body.items[0].personalization={name_count:3,engraving_text:'Ana, Bia, Caio'};assert.equal((await createMercadoPagoCheckout(req('/api/checkout/mercado-pago',body),env)).status,201);}finally{global.fetch=original;db.close()}
});
test('store alert is queued only after payment and delivered once to the authorized shop number',async()=>{
 const {db,env}=fixture(),original=global.fetch,{sendStoreNotification}=require('../functions/_lib/store-notifications.ts');
 Object.assign(env,{EVOLUTION_API_URL:'https://evolution.example.test',EVOLUTION_API_KEY:'test-only',EVOLUTION_INSTANCE:'test'});
 order(db,1);assert.equal(db.prepare('SELECT COUNT(*) n FROM store_notifications').get().n,0);
 await finalizeOrder(env,1);await finalizeOrder(env,1);let calls=0,body;
 global.fetch=async(_url,options)=>{calls++;body=JSON.parse(options.body);return new Response('{}',{status:200})};
 try{await Promise.all([sendStoreNotification(env,1),sendStoreNotification(env,1)]);await sendStoreNotification(env,1);assert.equal(calls,1);assert.equal(body.number,'5551994927676');assert.ok(body.text.includes('ELG-1'));assert.ok(body.text.includes('Retirada em loja'));assert.equal(db.prepare('SELECT status FROM store_notifications').get().status,'sent');}finally{global.fetch=original;db.close()}
});
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {DatabaseSync}=require('node:sqlite');
const {transformSync}=require('esbuild');
require.extensions['.ts']=(module,filename)=>module._compile(transformSync(fs.readFileSync(filename,'utf8'),{loader:'ts',format:'cjs',target:'es2022'}).code,filename);
const {createMercadoPagoCheckout,applyMercadoPagoPayment,reconcileExpiredCheckout,mercadoPagoWebhook}=require('../functions/_lib/mercado-pago.ts');
const {reservationStatements,releaseCheckout,finalizeOrder}=require('../functions/_lib/checkout-stock.ts');
const {protectRequest}=require('../functions/_lib/request-security.ts');
const {onRequest}=require('../functions/api/[[path]].ts');
const {createSession,sha256,currentCustomer}=require('../functions/_lib/auth.ts');
const {hashPassword,verifyPassword,upgradePassword}=require('../functions/_lib/auth.ts');
const {publicPaymentStatus}=require('../functions/_lib/mercado-pago.ts');
const {validImage,imageForm}=require('../functions/_lib/image-validation.ts');
const {securityHeaders,privatePath}=require('../functions/_lib/security-headers.ts');
const {readBoundedBody}=require('../functions/_lib/http.ts');
function fixture(){
 const db=new DatabaseSync(':memory:');
 for(const file of ['0001_initial','0003_product_personalization','0004_product_personalizable','0008_customer_accounts_first_purchase','0009_product_details_and_personalization','0010_product_reviews','0011_gift_card_checkout','0012_whatsapp_recovery','0018_checkout_security','0019_security_hardening','0020_category_images','0021_admin_mfa','0022_required_personalization_text','0023_name_count_personalization','0024_gift_card_scheduled_delivery','0025_product_review_photos','0026_site_review_submissions','0028_bling_order_exports']){
  db.exec(fs.readFileSync(require('node:path').join(__dirname,'../migrations',file+'.sql'),'utf8'));
 }
 db.exec(fs.readFileSync(require('node:path').join(__dirname,'../migrations/0030_product_available_sizes.sql'),'utf8'));
 db.exec(fs.readFileSync(require('node:path').join(__dirname,'../migrations/0031_loyalty_rewards.sql'),'utf8'));
 db.exec(fs.readFileSync(require('node:path').join(__dirname,'../migrations/0032_loyalty_whatsapp_notifications.sql'),'utf8'));
 db.exec(fs.readFileSync(require('node:path').join(__dirname,'../migrations/0033_motoboy_rates.sql'),'utf8'));
 db.exec(fs.readFileSync(require('node:path').join(__dirname,'../migrations/0034_store_notifications.sql'),'utf8'));
 db.exec(fs.readFileSync(require('node:path').join(__dirname,'../migrations/0036_product_choice_options.sql'),'utf8'));
 db.exec(fs.readFileSync(require('node:path').join(__dirname,'../migrations/0037_gift_card_sender.sql'),'utf8'));
 db.exec(fs.readFileSync(require('node:path').join(__dirname,'../migrations/0038_product_finishes.sql'),'utf8'));
 db.exec(`INSERT INTO customers(id,name,email,phone,password_hash,password_salt,account_claimed) VALUES(1,'Original','owner@example.test','51999990000','unchanged','unchanged',0);
 INSERT INTO loyalty_accounts(customer_id) VALUES(1);
 INSERT INTO products(id,name,slug,sku,price_cents) VALUES(1,'Piece','piece','piece',10000);
 INSERT INTO product_variants(id,product_id,name,sku,stock) VALUES(1,1,'Standard','piece-1',1);`);
 const adapter={prepare(sql){let values=[];return {bind(...args){values=args;return this},async first(){return db.prepare(sql).get(...values)||null},async all(){return {results:db.prepare(sql).all(...values)}},run(){const r=db.prepare(sql).run(...values);return {success:true,meta:{changes:Number(r.changes),last_row_id:Number(r.lastInsertRowid)}}}}},async batch(stmts){db.exec('BEGIN');try{const rows=stmts.map(stmt=>stmt.run());db.exec('COMMIT');return rows}catch(e){db.exec('ROLLBACK');throw e}}};
 return {db,env:{DB:adapter,MERCADO_PAGO_ACCESS_TOKEN:'TEST-local-only'}};
}
const req=(path,body,headers={})=>new Request('https://elegance18k.com'+path,{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://elegance18k.com',...headers},body:JSON.stringify(body)});
const checkout=()=>req('/api/checkout/mercado-pago',{customer:{name:'Changed',email:'owner@example.test',phone:'51888880000',cpf:'12345678901'},shipping:{method:'pickup'},items:[{product_id:1,variant_id:1,quantity:1}]});
function order(db,id){db.prepare(`INSERT INTO orders(id,order_number,customer_id,subtotal_cents,total_cents,shipping_method) VALUES(?,?,1,10000,10000,'pickup')`).run(id,'ELG-'+id);db.prepare(`INSERT INTO order_items(order_id,product_id,variant_id,product_name,unit_price_cents,quantity) VALUES(?,1,1,'Piece',10000,1)`).run(id)}

test('registration cannot claim an existing guest or admin account',async()=>{
 const {db,env}=fixture();
 for(const role of ['customer','admin']){
  db.prepare('UPDATE customers SET role=? WHERE id=1').run(role);
  const response=await onRequest({env,request:req('/api/auth/register',{name:'Intruder',email:'owner@example.test',password:'new-password'})});
  assert.equal(response.status,409);assert.equal(db.prepare('SELECT password_hash FROM customers').get().password_hash,'unchanged');assert.equal(db.prepare('SELECT COUNT(*) n FROM sessions').get().n,0);
 } db.close();
});
test('checkout preserves existing identity, reserves last unit, and rejects competing checkout',async()=>{
 const {db,env}=fixture();const original=global.fetch;let calls=0;
 global.fetch=async()=>{calls++;return Response.json({id:'pref1',sandbox_init_point:'https://example.test/pay'})};
 try{
  const results=await Promise.all([createMercadoPagoCheckout(checkout(),env),createMercadoPagoCheckout(checkout(),env)]);
  assert.deepEqual(results.map(r=>r.status).sort(),[201,409]);assert.equal(calls,1);
  const c=db.prepare('SELECT name,phone FROM customers').get();assert.equal(c.name,'Original');assert.equal(c.phone,'51999990000');assert.equal(db.prepare('SELECT stock FROM product_variants').get().stock,0);
 }finally{global.fetch=original;db.close()}
});
test('imported masculine chain requires a valid length and reaches payment with 70 cm',async()=>{
 const {db,env}=fixture(),original=global.fetch;
 db.exec("UPDATE products SET category_id=(SELECT id FROM categories WHERE slug='linha-masculina'),sku='E18-20260923-1',name='Corrente Cadeado 2mm' WHERE id=1; UPDATE product_variants SET sku='E18-20260923-1-PADRAO' WHERE id=1;");
 global.fetch=async(_url,options)=>{assert.equal(options.redirect,'manual');return Response.json({id:'single-size',sandbox_init_point:'https://example.test/pay'})};
 try{const missing=await createMercadoPagoCheckout(checkout(),env);assert.equal(missing.status,400);assert.equal((await missing.json()).error.code,'INVALID_SIZE');const body=await checkout().json();body.items[0].personalization={size:'70 cm'};assert.equal((await createMercadoPagoCheckout(req('/api/checkout/mercado-pago',body),env)).status,201)}finally{global.fetch=original;db.close()}
});
test('checkout uses only the sizes configured on the product',async()=>{
 const {db,env}=fixture(),original=global.fetch;db.exec(`UPDATE products SET available_sizes='["45 cm","55 cm"]' WHERE id=1`);
 const body=await checkout().json();body.items[0].personalization={size:'60 cm'};
 assert.equal((await createMercadoPagoCheckout(req('/api/checkout/mercado-pago',body),env)).status,400);
 global.fetch=async()=>Response.json({id:'custom-size',sandbox_init_point:'https://example.test/pay'});
 try{body.items[0].personalization.size='55 cm';assert.equal((await createMercadoPagoCheckout(req('/api/checkout/mercado-pago',body),env)).status,201)}finally{global.fetch=original;db.close()}
});
test('refused photo checkout releases its image for a secure retry',async()=>{
 const {db,env}=fixture(),token='b'.repeat(64),original=global.fetch;
 db.exec("UPDATE products SET engraving_image_enabled=1 WHERE id=1");
 db.prepare("INSERT INTO personalization_uploads(id,object_key,product_id,original_name,content_type,size_bytes,owner_hash) VALUES('retry-photo','key',1,'image.png','image/png',100,?)").run(await sha256(token));
 const body=await checkout().json();body.items[0].personalization={image_upload_id:'retry-photo'};
 const request=()=>req('/api/checkout/mercado-pago',body,{Cookie:'__Host-elegance-upload='+token});
 try{global.fetch=async()=>Response.json({}, {status:400});assert.equal((await createMercadoPagoCheckout(request(),env)).status,502);assert.equal(db.prepare("SELECT order_id FROM personalization_uploads WHERE id='retry-photo'").get().order_id,null);global.fetch=async()=>Response.json({id:'retry',sandbox_init_point:'https://example.test/pay'});assert.equal((await createMercadoPagoCheckout(request(),env)).status,201)}finally{global.fetch=original;db.close()}
});
test('Pix preference never attempts to exclude Mercado Pago account balance',async()=>{
 const {db,env}=fixture(),original=global.fetch;let preference;
 global.fetch=async(url,options)=>{if(url.endsWith('/v1/payment_methods'))return Response.json([{id:'pix',status:'active',payment_type_id:'bank_transfer'},{id:'visa',status:'active',payment_type_id:'credit_card'},{id:'account_money',status:'active',payment_type_id:'account_money'}]);preference=JSON.parse(options.body);return Response.json({id:'pix',sandbox_init_point:'https://example.test/pay'})};
 try{const body=await checkout().json();body.payment_method='pix';assert.equal((await createMercadoPagoCheckout(req('/api/checkout/mercado-pago',body),env)).status,201);assert.equal(preference.payment_methods.default_payment_method_id,'pix');assert.equal(preference.payment_methods.excluded_payment_types.some(x=>x.id==='account_money'),false);assert.equal(preference.payment_methods.excluded_payment_methods.some(x=>x.id==='account_money'),false);assert.equal(preference.items[0].unit_price,85.5);}finally{global.fetch=original;db.close()}
});
test('motoboy delivery preference is validated and stored with the order',async()=>{
 const {db,env}=fixture(),original=global.fetch;const body=await checkout().json();
 body.shipping={method:'motoboy',postal_code:'93230250',street:'Rua Teste',number:'10',neighborhood:'Centro',city:'Sapucaia do Sul',state:'RS',preferred_delivery_date:'2099-02-30',preferred_delivery_time:'14:30'};
 assert.equal((await createMercadoPagoCheckout(req('/api/checkout/mercado-pago',body),env)).status,400);
 body.shipping.preferred_delivery_date='2099-12-10';body.shipping.preferred_delivery_time='25:00';
 assert.equal((await createMercadoPagoCheckout(req('/api/checkout/mercado-pago',body),env)).status,400);
 assert.equal(db.prepare('SELECT COUNT(*) n FROM orders').get().n,0);
 global.fetch=async()=>Response.json({id:'motoboy',sandbox_init_point:'https://example.test/pay'});
 try{body.shipping.preferred_delivery_time='14:30';assert.equal((await createMercadoPagoCheckout(req('/api/checkout/mercado-pago',body),env)).status,201);const address=JSON.parse(db.prepare('SELECT shipping_address_json FROM orders').get().shipping_address_json);assert.equal(address.preferred_delivery_date,'2099-12-10');assert.equal(address.preferred_delivery_time,'14:30');}finally{global.fetch=original;db.close()}
});
test('printed order displays stored size and motoboy preference',()=>{
 const vm=require('node:vm'),context={Intl,Date};vm.createContext(context);
 vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'../admin-order-print.js'),'utf8').split('const printButton=')[0],context);
 const html=vm.runInContext(`printDocument({order:{order_number:'TESTE',created_at:'2026-10-11 23:00:00',status:'paid',shipping_method:'motoboy',shipping_address_json:JSON.stringify({street:'Rua Teste',preferred_delivery_date:'2099-12-10',preferred_delivery_time:'14:30'}),customer_name:'Cliente',total_cents:21900},items:[{product_name:'Corrente',quantity:1,unit_price_cents:21900,personalization_json:JSON.stringify({size:'60 cm'})}]})`,context);
 assert.ok(html.includes('<b>Tamanho:</b> 60 cm'));assert.ok(html.includes('10/12/2099 às 14:30'));assert.ok(html.includes('confirmar com a loja'));
});
test('tenth paid order issues one loyalty reward even with repeated finalization',async()=>{
 const {db,env}=fixture();db.exec('UPDATE loyalty_accounts SET purchase_count=9 WHERE customer_id=1');order(db,1);await finalizeOrder(env,1);await finalizeOrder(env,1);
 assert.equal(db.prepare('SELECT purchase_count FROM loyalty_accounts').get().purchase_count,10);assert.equal(db.prepare("SELECT COUNT(*) n FROM loyalty_rewards WHERE kind='loyalty'").get().n,1);assert.equal(db.prepare('SELECT rewards_issued FROM loyalty_accounts').get().rewards_issued,1);db.close();
});
test('birthday reward is issued once in the Brazil calendar year and only on the day',async()=>{
 const {db,env}=fixture(),{loyaltyOverview,brazilDate}=require('../functions/_lib/loyalty.ts');const today=brazilDate();db.prepare('UPDATE customers SET birth_date=? WHERE id=1').run('1990-'+today.slice(5));
 const first=await loyaltyOverview(env,1);await loyaltyOverview(env,1);assert.equal(first.rewards[0].percent,10);assert.equal(first.rewards[0].expires_on,today);assert.equal(db.prepare("SELECT COUNT(*) n FROM loyalty_rewards WHERE kind='birthday'").get().n,1);
 db.exec("UPDATE customers SET birth_date='1990-01-01' WHERE id=1");await loyaltyOverview(env,1);assert.equal(db.prepare("SELECT COUNT(*) n FROM loyalty_rewards WHERE kind='birthday'").get().n,1);db.close();
});
test('loyalty reward requires the matching account, releases on refusal and is consumed once',async()=>{
 const {db,env}=fixture(),original=global.fetch;db.exec("UPDATE customers SET account_claimed=1 WHERE id=1;UPDATE loyalty_accounts SET purchase_count=10 WHERE customer_id=1;UPDATE product_variants SET stock=3");
 const session=await createSession(env,1,'customer'),body=await checkout().json();const signed=()=>req('/api/checkout/mercado-pago',body,{Cookie:'elegance_session='+session.token});let amount;
 global.fetch=async(_url,options)=>{amount=JSON.parse(options.body).items[0].unit_price;return Response.json({}, {status:400})};
 try{assert.equal((await createMercadoPagoCheckout(signed(),env)).status,502);assert.equal(amount,85);assert.equal(db.prepare('SELECT status FROM loyalty_reward_uses').get().status,'released');
 global.fetch=async(_url,options)=>{amount=JSON.parse(options.body).items[0].unit_price;return Response.json({id:crypto.randomUUID(),sandbox_init_point:'https://example.test/pay'})};
 const response=await createMercadoPagoCheckout(signed(),env);assert.equal(response.status,201);assert.equal(amount,85);const held=db.prepare("SELECT order_id FROM loyalty_reward_uses WHERE status='held'").get().order_id;await finalizeOrder(env,held);await finalizeOrder(env,held);assert.equal(db.prepare("SELECT COUNT(*) n FROM loyalty_reward_uses WHERE status='spent'").get().n,1);
 assert.equal((await createMercadoPagoCheckout(signed(),env)).status,201);assert.equal(amount,100);
 }finally{global.fetch=original;db.close()}
});
test('guest cannot claim a loyalty reward by entering its owner email',async()=>{
 const {db,env}=fixture(),original=global.fetch;db.exec('UPDATE loyalty_accounts SET purchase_count=10 WHERE customer_id=1');let amount;global.fetch=async(_url,options)=>{amount=JSON.parse(options.body).items[0].unit_price;return Response.json({id:'guest',sandbox_init_point:'https://example.test/pay'})};
 try{assert.equal((await createMercadoPagoCheckout(checkout(),env)).status,201);assert.equal(amount,90);assert.equal(db.prepare('SELECT COUNT(*) n FROM loyalty_reward_uses').get().n,0)}finally{global.fetch=original;db.close()}
});
test('approved order sends the loyalty image once despite concurrent duplicate notifications',async()=>{
 const {db,env}=fixture(),original=global.fetch,{sendLoyaltyNotification}=require('../functions/_lib/loyalty-notifications.ts');
 Object.assign(env,{EVOLUTION_API_URL:'https://evolution.example.test',EVOLUTION_API_KEY:'test-only',EVOLUTION_INSTANCE:'test'});order(db,1);await finalizeOrder(env,1);await finalizeOrder(env,1);let calls=0,body;
 global.fetch=async(url,options)=>{calls++;assert.ok(url.includes('/message/sendMedia/'));body=JSON.parse(options.body);return Response.json({key:{id:'test-delivered'}})};
 try{await Promise.all([sendLoyaltyNotification(env,1),sendLoyaltyNotification(env,1)]);await sendLoyaltyNotification(env,1);assert.equal(calls,1);assert.equal(body.number,'5551999990000');assert.ok(body.media.endsWith('loyalty-card-1.png'));assert.ok(body.caption.includes('1 de 10'));assert.equal(db.prepare('SELECT status FROM loyalty_notifications').get().status,'sent');}finally{global.fetch=original;db.close()}
});
test('uncertain WhatsApp result is not sent a second time and does not undo payment',async()=>{
 const {db,env}=fixture(),original=global.fetch,{sendLoyaltyNotification}=require('../functions/_lib/loyalty-notifications.ts');Object.assign(env,{EVOLUTION_API_URL:'https://evolution.example.test',EVOLUTION_API_KEY:'test-only',EVOLUTION_INSTANCE:'test'});order(db,1);await finalizeOrder(env,1);let calls=0;global.fetch=async()=>{calls++;throw new Error('timeout')};
 try{await sendLoyaltyNotification(env,1);await sendLoyaltyNotification(env,1);assert.equal(calls,1);assert.equal(db.prepare('SELECT status FROM loyalty_notifications').get().status,'uncertain');assert.equal(db.prepare('SELECT status FROM orders').get().status,'paid');}finally{global.fetch=original;db.close()}
});
test('unpaid orders never enqueue a loyalty message',async()=>{
 const {db,env}=fixture(),{sendPendingLoyaltyNotifications}=require('../functions/_lib/loyalty-notifications.ts');order(db,1);await sendPendingLoyaltyNotifications(env);assert.equal(db.prepare('SELECT COUNT(*) n FROM loyalty_notifications').get().n,0);db.close();
});
test('motoboy tariffs can be changed only by an admin and affect server quotes',async()=>{
 const {db,env}=fixture(),{motoboyPrice}=require('../functions/_lib/motoboy.ts');const rates={canoas:2700,esteio:2500,'sapucaia do sul':3000};
 assert.equal((await onRequest({env,request:new Request('https://elegance18k.com/api/admin/shipping/motoboy',{method:'PUT',headers:{Origin:'https://elegance18k.com','Content-Type':'application/json'},body:JSON.stringify({rates})})})).status,403);
 db.exec("UPDATE customers SET role='admin' WHERE id=1");const session=await createSession(env,1,'admin');const put=value=>new Request('https://elegance18k.com/api/admin/shipping/motoboy',{method:'PUT',headers:{Origin:'https://elegance18k.com','Content-Type':'application/json',Cookie:'elegance_session='+session.token},body:JSON.stringify({rates:value})});
 assert.equal((await onRequest({env,request:put({...rates,canoas:-100})})).status,400);assert.equal((await onRequest({env,request:put(rates)})).status,200);assert.equal(await motoboyPrice(env,'Canoas'),2700);assert.equal(await motoboyPrice(env,'Sapucaia'),3000);assert.equal(await motoboyPrice(env,'Garopaba'),undefined);db.close();
});
test('motoboy calendar skips Sundays and Sapucaia holidays and enforces business hours',()=>{
 const calendar=require('../motoboy-calendar.js');const now=new Date('2026-10-11T18:00:00Z');assert.equal(calendar.availableDays(now)[0],'2026-10-13');assert.equal(calendar.validDay('2026-10-17'),true);assert.equal(calendar.validDay('2026-10-18'),false);assert.equal(calendar.validDay('2026-12-08'),false);assert.equal(calendar.validDay('2026-06-04'),false);assert.equal(calendar.validDay('2026-04-03'),false);assert.equal(calendar.validDay('2026-08-20'),true);assert.equal(calendar.validate('2026-10-13','09:00',now),'');assert.equal(calendar.validate('2026-10-13','18:00',now),'');assert.ok(calendar.validate('2026-10-13','18:01',now));assert.ok(calendar.validate('2026-10-13','08:59',now));assert.equal(calendar.availableDays(new Date('2026-10-17T21:00:00Z'))[0],'2026-10-19');
});
test('cart reservations roll back all lines and aggregate repeated variants',async()=>{
 const {db,env}=fixture();order(db,1);
 await assert.rejects(()=>env.DB.batch(reservationStatements(env,1,[{variant_id:1,stock:1},{variant_id:1,stock:1}])),/OUT_OF_STOCK/);
 assert.equal(db.prepare('SELECT stock FROM product_variants').get().stock,1);
 db.exec("INSERT INTO products(id,name,slug,price_cents) VALUES(2,'Other','other',100); INSERT INTO product_variants(id,product_id,name,sku,stock) VALUES(2,2,'Other','other',0)");
 await assert.rejects(()=>env.DB.batch(reservationStatements(env,1,[{variant_id:1,stock:1},{variant_id:2,stock:1}])),/OUT_OF_STOCK/);
 assert.equal(db.prepare('SELECT stock FROM product_variants WHERE id=1').get().stock,1);assert.equal(db.prepare('SELECT COUNT(*) n FROM stock_reservations').get().n,0);db.close();
});
test('payment finalization is atomic and idempotent; release cannot restore spent stock',async()=>{
 const {db,env}=fixture();order(db,1);await env.DB.batch(reservationStatements(env,1,[{variant_id:1,stock:1}]));
 await Promise.all([finalizeOrder(env,1),finalizeOrder(env,1)]);await releaseCheckout(env,1);
 assert.equal(db.prepare('SELECT stock FROM product_variants').get().stock,0);assert.equal(db.prepare('SELECT purchase_count FROM loyalty_accounts').get().purchase_count,1);assert.equal(db.prepare('SELECT status FROM orders').get().status,'paid');db.close();
});
test('legacy paid notification cannot oversell and late released reservation requires review',async()=>{
 const {db,env}=fixture();order(db,1);order(db,2);
 for(const id of [1,2])db.prepare("INSERT INTO payments(order_id,status,amount_cents) VALUES(?,'pending',10000)").run(id);
 await applyMercadoPagoPayment(env,{id:11,status:'approved',transaction_amount:100,external_reference:'ELG-1'});
 await applyMercadoPagoPayment(env,{id:12,status:'approved',transaction_amount:100,external_reference:'ELG-2'});
 assert.equal(db.prepare('SELECT status FROM orders WHERE id=2').get().status,'payment_review');assert.equal(db.prepare('SELECT stock FROM product_variants').get().stock,0);db.close();
});
test('definitive preference rejection releases stock; network uncertainty retains it',async()=>{
 for(const rejected of [true,false]){
  const {db,env}=fixture();const original=global.fetch;
  global.fetch=async()=>{if(rejected)return Response.json({}, {status:400});throw new Error('timeout')};
  try{assert.equal((await createMercadoPagoCheckout(checkout(),env)).status,502);assert.equal(db.prepare('SELECT stock FROM product_variants').get().stock,rejected?1:0)}finally{global.fetch=original;db.close()}
 }
});
test('expiration requires expired provider preference and no pending payments; release is idempotent',async()=>{
 const {db,env}=fixture();order(db,1);await env.DB.batch(reservationStatements(env,1,[{variant_id:1,stock:1}]));
 db.exec("INSERT INTO checkout_security(order_id,expires_at) VALUES(1,'2020-01-01');INSERT INTO payments(order_id,provider_order_id,amount_cents) VALUES(1,'pref1',10000)");
 const original=global.fetch;let pending=true;
 global.fetch=async url=>String(url).includes('/checkout/preferences/')?Response.json({expires:true,expiration_date_to:'2020-01-01'}):Response.json({results:pending?[{status:'pending'}]:[],paging:{total:pending?1:0}});
 try{await reconcileExpiredCheckout(env);assert.equal(db.prepare('SELECT stock FROM product_variants').get().stock,0);pending=false;db.exec('UPDATE checkout_security SET checked_at=NULL');await reconcileExpiredCheckout(env);await releaseCheckout(env,1);assert.equal(db.prepare('SELECT stock FROM product_variants').get().stock,1);await assert.rejects(()=>finalizeOrder(env,1),/RESERVATION_RELEASED/)}finally{global.fetch=original;db.close()}
});
test('rate limits cover API and form logins, shared identities across IPs, and reject cross-origin',async()=>{
 const {db,env}=fixture();
 for(let i=0;i<12;i++)assert.equal(await protectRequest(req('/api/auth/login',{email:'same@example.test'},{'CF-Connecting-IP':String(i)}),env),null);
 const form=new Request('https://elegance18k.com/admin-login',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded','CF-Connecting-IP':'new',Origin:'https://elegance18k.com'},body:'email=same%40example.test&password=x'});
 assert.equal((await protectRequest(form,env)).status,429);
 assert.equal((await protectRequest(req('/api/auth/login',{}, {Origin:'https://evil.test'}),env)).status,403);
 assert.equal((await protectRequest(req('/api/auth/login',{password:'x'.repeat(17000)}),env)).status,413);db.close();
});
test('unsigned payment notification is rejected even if webhook secret is absent',async()=>{
 const {env,db}=fixture();const response=await mercadoPagoWebhook(req('/api/payments/mercado-pago/webhook',{type:'payment',data:{id:123}}),env);assert.equal(response.status,401);db.close();
});
test('gift-card-only checkout consumes stock and balance exactly once',async()=>{
 const {env,db}=fixture();const code='ELG-'+'A'.repeat(32);
 const session=await createSession(env,1);
 db.prepare("INSERT INTO gift_cards(code_hash,recipient_name,initial_cents,balance_cents,status) VALUES(?,'Test',10000,10000,'active')").run(await sha256(code));
 const original=global.fetch;global.fetch=async()=>{throw new Error('No provider call for fully covered checkout')};
 try{
  const body=await checkout().json();body.gift_card_code=code;
  const response=await createMercadoPagoCheckout(req('/api/checkout/mercado-pago',body,{Cookie:'elegance_session='+session.token}),env);
  assert.equal(response.status,201);assert.equal(db.prepare('SELECT stock FROM product_variants').get().stock,0);
  assert.equal(db.prepare('SELECT balance_cents FROM gift_cards').get().balance_cents,1000);
  assert.equal(db.prepare('SELECT purchase_count FROM loyalty_accounts').get().purchase_count,1);
 }finally{global.fetch=original;db.close()}
});
test('sessions that expired earlier today cannot authenticate',async()=>{
 const {env,db}=fixture();const token='expired-test';
 db.prepare("INSERT INTO sessions(customer_id,token_hash,expires_at) VALUES(1,?,?)").run(await sha256(token),new Date(Date.now()-1000).toISOString());
 assert.equal(await currentCustomer(new Request('https://elegance18k.com/api/auth/me',{headers:{Cookie:'elegance_session='+token}}),env),null);db.close();
});

test('strong password hashes retain legacy login and upgrade without changing password',async()=>{
 const {db,env}=fixture();
 const legacy=await hashPassword('test-long-password',undefined,10000);
 const old=legacy.hash.split('$')[2];
 assert.equal(await verifyPassword('test-long-password',legacy.salt,old),true);
 assert.equal(await verifyPassword('wrong',legacy.salt,old),false);
 db.prepare('UPDATE customers SET password_hash=?,password_salt=? WHERE id=1').run(old,legacy.salt);
 await upgradePassword(env,1,'test-long-password',old);
 const updated=db.prepare('SELECT password_hash,password_salt FROM customers').get();
 assert.match(updated.password_hash,/^pbkdf2-sha256\$100000\$/);
 assert.equal(await verifyPassword('test-long-password',updated.password_salt,updated.password_hash),true);
 assert.equal(await verifyPassword('x','bad!','bad!'),false);db.close();
});

test('administrator sessions last eight hours, including existing long-lived sessions',async()=>{
 const {db,env}=fixture();db.exec("UPDATE customers SET role='admin' WHERE id=1");
 const session=await createSession(env,1);
 assert.ok(Date.parse(session.expiresAt)-Date.now()<=8*3600000);
 const request=new Request('https://elegance18k.com/api/auth/me',{headers:{Cookie:'elegance_session='+session.token}});
 assert.equal((await currentCustomer(request,env)).role,'admin');
 db.exec("UPDATE sessions SET created_at=datetime('now','-9 hours')");
 assert.equal(await currentCustomer(request,env),null);db.close();
});

test('order number alone or another account cannot read order details; guest cookie can',async()=>{
 const {db,env}=fixture(),original=global.fetch;
 global.fetch=async()=>Response.json({id:'pref',sandbox_init_point:'https://example.test/pay'});
 try {
  const created=await createMercadoPagoCheckout(checkout(),env),body=await created.json();
  const url='https://elegance18k.com/api/payments/status?pedido='+body.order_number;
  assert.equal((await publicPaymentStatus(new Request(url),env)).status,404);
  assert.equal((await publicPaymentStatus(new Request(url,{headers:{Cookie:created.headers.get('set-cookie').split(';')[0]}}),env)).status,200);
  const owner=await createSession(env,1);
  assert.equal((await publicPaymentStatus(new Request(url,{headers:{Cookie:'elegance_session='+owner.token}}),env)).status,200);
  db.exec("INSERT INTO customers(id,name,email,password_hash,password_salt) VALUES(2,'Other','other@example.test','x','x')");
  const other=await createSession(env,2);
  assert.equal((await publicPaymentStatus(new Request(url,{headers:{Cookie:'elegance_session='+other.token}}),env)).status,404);
 }finally{global.fetch=original;db.close()}
});

test('fake images, MIME mismatch, oversized and appended payloads are rejected',async()=>{
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aP9sAAAAASUVORK5CYII=','base64');
 assert.equal(await validImage(new File([png],'pixel.png',{type:'image/png'})),true);
 assert.equal(await validImage(new File([png],'wrong.jpg',{type:'image/jpeg'})),false);
 assert.equal(await validImage(new File(['<script>alert(1)</script>'],'fake.png',{type:'image/png'})),false);
 assert.equal(await validImage(new File([png,'<script>evil</script>'],'polyglot.png',{type:'image/png'})),false);
 assert.equal(await validImage(new File([new Uint8Array(5*1024*1024+1)],'big.png',{type:'image/png'})),false);
 const form=new FormData();form.set('image',new File([png],'pixel.png',{type:'image/png'}));
 assert.ok((await imageForm(new Request('https://elegance18k.com/upload',{method:'POST',body:form}))).get('image'));
 await assert.rejects(()=>readBoundedBody(new Request('https://example.test',{method:'POST',body:'x'.repeat(20)}),10));
});

test('upload ownership is enforced and concurrent reuse rolls back atomically',async()=>{
 const {db,env}=fixture(),token='a'.repeat(64),original=global.fetch;
 db.exec("UPDATE products SET engraving_image_enabled=1 WHERE id=1; UPDATE product_variants SET stock=2");
 db.prepare("INSERT INTO personalization_uploads(id,object_key,product_id,original_name,content_type,size_bytes,owner_hash) VALUES('upload','key',1,'image.png','image/png',100,?)").run(await sha256(token));
 const body=await checkout().json();body.items[0].personalization={image_upload_id:'upload'};
 assert.equal((await createMercadoPagoCheckout(req('/api/checkout/mercado-pago',body),env)).status,400);
 global.fetch=async()=>Response.json({id:'pref',sandbox_init_point:'https://example.test/pay'});
 try {
  const request=()=>req('/api/checkout/mercado-pago',body,{Cookie:'__Host-elegance-upload='+token});
  const results=await Promise.all([createMercadoPagoCheckout(request(),env),createMercadoPagoCheckout(request(),env)]);
  assert.equal(results.filter(r=>r.status===201).length,1);
  assert.equal(db.prepare('SELECT stock FROM product_variants').get().stock,1);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM order_items').get().n,1);
 }finally{global.fetch=original;db.close()}
});

test('mutations without origin are denied and public upload/recovery endpoints are rate limited',async()=>{
 const {db,env}=fixture();
 const missing=new Request('https://elegance18k.com/api/account',{method:'PUT',body:'{}'});
 assert.equal((await protectRequest(missing,env)).status,403);
 for(let i=0;i<5;i++)assert.equal(await protectRequest(req('/api/cart-recovery',{}),env),null);
 assert.equal((await protectRequest(req('/api/cart-recovery',{}),env)).status,429);
 for(let i=0;i<20;i++)assert.equal(await protectRequest(req('/api/personalization/upload',{}),env),null);
 assert.equal((await protectRequest(req('/api/personalization/upload',{}),env)).status,429);db.close();
});

test('security headers block framing and executable inline attributes; private files denied',()=>{
 const response=securityHeaders(new Response('ok',{headers:{'Access-Control-Allow-Origin':'*'}}),'testnonce');
 assert.equal(response.headers.get('x-frame-options'),'DENY');
 assert.equal(response.headers.get('access-control-allow-origin'),null);
 assert.match(response.headers.get('content-security-policy'),/script-src-attr 'none'/);
 assert.match(response.headers.get('content-security-policy'),/'nonce-testnonce'/);
 for(const path of ['/.env','/%2eenv','/.git/config','/wrangler.toml','/package-lock.json','/docs/file.md','/functions/api/test.ts'])assert.equal(privatePath(path),true,path);
 assert.equal(privatePath('/assets/image.jpg'),false);
 assert.equal(privatePath('/api/products/item'),false);
});

test('checkout rejects fractional quantities and unknown shipping methods',async()=>{
 const {db,env}=fixture();let body=await checkout().json();body.items[0].quantity=1.5;
 assert.equal((await createMercadoPagoCheckout(req('/api/checkout/mercado-pago',body),env)).status,400);
 body=await checkout().json();body.shipping.method='free-anywhere';
 assert.equal((await createMercadoPagoCheckout(req('/api/checkout/mercado-pago',body),env)).status,400);
 assert.equal(db.prepare('SELECT COUNT(*) n FROM orders').get().n,0);db.close();
});
test('category images require admin, validate files, persist and can be removed',async()=>{
 const {db,env}=fixture();
 db.exec("INSERT INTO categories(id,name,slug) VALUES(90,'Test category','test-category')");
 const objects=new Map();
 env.PERSONALIZATION_BUCKET={
  async put(key,stream,options){objects.set(key,{body:await new Response(stream).arrayBuffer(),httpEtag:'test',writeHttpMetadata(headers){headers.set('Content-Type',options.httpMetadata.contentType)}})},
  async get(key){return objects.get(key)||null},
  async delete(key){objects.delete(key)}
 };
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64');
 const upload=(cookie='',bytes=png)=>{const form=new FormData();form.set('image',new File([bytes],'photo.png',{type:'image/png'}));return new Request('https://elegance18k.com/api/admin/categories/90/image',{method:'POST',headers:{Origin:'https://elegance18k.com',Cookie:cookie},body:form})};
 assert.equal((await onRequest({env,request:upload()})).status,403);
 db.exec("UPDATE customers SET role='admin' WHERE id=1");
 const token=await createSession(env,1);
 const cookie='elegance_session='+token.token;
 const bad=await onRequest({env,request:upload(cookie,Buffer.from('not an image'))});
 assert.equal(bad.status,400);
 const good=await onRequest({env,request:upload(cookie)});
 assert.equal(good.status,201);
 const url=(await good.json()).image.url;
 assert.match(url,/^\/api\/category-images\/90\//);
 assert.equal(db.prepare('SELECT image_url FROM categories WHERE id=90').get().image_url,url);
 const publicImage=await onRequest({env,request:new Request('https://elegance18k.com'+url)});
 assert.equal(publicImage.status,200);assert.equal(publicImage.headers.get('content-type'),'image/png');
 const update=(remove)=>new Request('https://elegance18k.com/api/admin/categories/90',{method:'PUT',headers:{Origin:'https://elegance18k.com',Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify({name:'Test category',remove_image:remove})});
 assert.equal((await onRequest({env,request:update(false)})).status,200);
 assert.equal(db.prepare('SELECT image_url FROM categories WHERE id=90').get().image_url,url);
 assert.equal((await onRequest({env,request:update(true)})).status,200);
 assert.equal(db.prepare('SELECT image_url FROM categories WHERE id=90').get().image_url,null);
 const listing=await onRequest({env,request:new Request('https://elegance18k.com/api/categories')});
 assert.equal((await listing.json()).categories.find(c=>c.id===90).image_url,null);
 assert.equal(objects.size,1);
 db.close();
});
test('TOTP follows RFC 6238 SHA-1 vectors',async()=>{
 const {totp,base32,matchStep}=require('../functions/_lib/totp.ts');
 const secret=base32(new TextEncoder().encode('12345678901234567890'));
 for(const [time,expected] of [[59,'94287082'],[1111111109,'07081804'],[1111111111,'14050471'],[1234567890,'89005924'],[2000000000,'69279037'],[20000000000,'65353130']])assert.equal(await totp(secret,Math.floor(time/30),8),expected);
 assert.equal(await matchStep(secret,'287082',59000),1);
 assert.equal(await matchStep(secret,'nototp',59000),null);
});
test('MFA enrollment, both login routes, replay, recovery and session revocation',async()=>{
 const {db,env}=fixture();env.MFA_ENCRYPTION_KEY='ab'.repeat(32);
 const {totp}=require('../functions/_lib/totp.ts');
 const {onRequestPost:formLogin}=require('../functions/admin-login.ts');
 const password='Test-only-password-2026!';
 const hashed=await hashPassword(password);
 db.prepare("UPDATE customers SET role='admin',password_hash=?,password_salt=? WHERE id=1").run(hashed.hash,hashed.salt);
 const session=await createSession(env,1),cookie='elegance_session='+session.token;
 const call=(action,body)=>onRequest({env,request:req('/api/admin/mfa/'+action,body,{Cookie:cookie})});
 const setup=await call('setup',{password});assert.equal(setup.status,200);
 const data=await setup.json();assert.equal(data.recovery_codes.length,10);
 assert.ok(!db.prepare('SELECT secret FROM admin_mfa').get().secret.includes(data.secret));
 assert.equal(db.prepare('SELECT code_hash FROM admin_recovery_codes').get().code_hash.length,44);
 const bad=await call('confirm',{code:'invalid'});assert.equal(bad.status,400);
 assert.equal(db.prepare('SELECT enabled FROM admin_mfa').get().enabled,0);
 const step=Math.floor(Date.now()/30000),otp=await totp(data.secret,step);
 assert.equal((await call('confirm',{code:otp})).status,200);
 assert.equal(await currentCustomer(new Request('https://elegance18k.com/api/auth/me',{headers:{Cookie:cookie}}),env),null);
 assert.equal(db.prepare('SELECT COUNT(*) n FROM sessions').get().n,0);
 await assert.rejects(()=>createSession(env,1),/MFA_REQUIRED/);
 const loginBody={email:'owner@example.test',password};
 assert.equal((await onRequest({env,request:req('/api/auth/login',loginBody)})).status,401);
 const form=(code='')=>formLogin({env,request:new Request('https://elegance18k.com/admin-login',{method:'POST',body:new URLSearchParams({...loginBody,otp:code})})});
 assert.match((await form()).headers.get('location'),/erro=mfa/);
 assert.equal((await onRequest({env,request:req('/api/auth/login',{...loginBody,otp})})).status,401);
 // Next time window is accepted once; the same factor cannot create two sessions.
 const next=await totp(data.secret,step+1);
 const ok=await onRequest({env,request:req('/api/auth/login',{...loginBody,otp:next})});
 assert.equal(ok.status,200);assert.ok(ok.headers.get('set-cookie'));
 assert.equal((await onRequest({env,request:req('/api/auth/login',{...loginBody,otp:next})})).status,401);
 assert.equal((await form(data.recovery_codes[0])).status,200);
 assert.match((await form(data.recovery_codes[0])).headers.get('location'),/erro=mfa/);
 assert.equal(db.prepare('SELECT COUNT(*) n FROM admin_recovery_codes').get().n,9);
 assert.equal(db.prepare('SELECT MIN(mfa_verified) n FROM sessions').get().n,1);
 const admin={id:1,email:'owner@example.test',role:'admin'};
 const addDevice=await require('../functions/_lib/admin-mfa.ts').adminMfa(req('/api/admin/mfa/add-device',{password,code:data.recovery_codes[1]}),env,admin,'add-device');
 assert.equal(addDevice.status,200);const device=await addDevice.json();assert.equal(device.secret,data.secret);assert.match(device.uri,/otpauth:\/\/totp\//);
 assert.equal(db.prepare('SELECT COUNT(*) n FROM admin_recovery_codes').get().n,8);
 assert.equal((await call('setup',{password})).status,403);
 db.close();
});
test('MFA pending enrollments expire and remain optional until confirmed',async()=>{
 const {db,env}=fixture();env.MFA_ENCRYPTION_KEY='cd'.repeat(32);
 const {adminMfa}=require('../functions/_lib/admin-mfa.ts'),{totp}=require('../functions/_lib/totp.ts');
 const password='Test-only-password-2026!',hashed=await hashPassword(password);
 db.prepare("UPDATE customers SET role='admin',password_hash=?,password_salt=? WHERE id=1").run(hashed.hash,hashed.salt);
 const customer={id:1,email:'owner@example.test',role:'admin'};
 const response=await adminMfa(req('/api/admin/mfa/setup',{password}),env,customer,'setup');
 const data=await response.json();
 db.exec("UPDATE admin_mfa SET expires_at='2000-01-01'");
 const otp=await totp(data.secret,Math.floor(Date.now()/30000));
 assert.equal((await adminMfa(req('/api/admin/mfa/confirm',{code:otp}),env,customer,'confirm')).status,400);
 assert.ok((await createSession(env,1)).token);
 db.close();
});
test('admin form login supports embedded-browser origin variants without weakening other mutations',async()=>{
 const {db,env}=fixture();
 const body=new URLSearchParams({email:'owner@example.test',password:'test'});
 const allowed=new Request('https://elegance18k.com/admin-login',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body});
 assert.equal(await protectRequest(allowed,env),null);
 const embedded=new Request('https://elegance18k.com/admin-login',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded',Origin:'null','Sec-Fetch-Site':'cross-site'},body:new URLSearchParams({email:'owner@example.test'})});
 assert.equal(await protectRequest(embedded,env),null);
 const forged=new Request('https://elegance18k.com/api/admin/categories',{method:'POST',headers:{'Content-Type':'application/json',Origin:'null','Sec-Fetch-Site':'cross-site'},body:'{}'});
 assert.equal((await protectRequest(forged,env)).status,403);
 db.close();
});


