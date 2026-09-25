const {test}=require('node:test');
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
function fixture(){
 const db=new DatabaseSync(':memory:');
 for(const file of ['0001_initial','0003_product_personalization','0004_product_personalizable','0008_customer_accounts_first_purchase','0009_product_details_and_personalization','0011_gift_card_checkout','0012_whatsapp_recovery','0018_checkout_security']){
  db.exec(fs.readFileSync(require('node:path').join(__dirname,'../migrations',file+'.sql'),'utf8'));
 }
 db.exec(`INSERT INTO customers(id,name,email,phone,password_hash,password_salt,account_claimed) VALUES(1,'Original','owner@example.test','51999990000','unchanged','unchanged',0);
 INSERT INTO loyalty_accounts(customer_id) VALUES(1);
 INSERT INTO products(id,name,slug,sku,price_cents) VALUES(1,'Piece','piece','piece',10000);
 INSERT INTO product_variants(id,product_id,name,sku,stock) VALUES(1,1,'Standard','piece-1',1);`);
 const adapter={prepare(sql){let values=[];return {bind(...args){values=args;return this},async first(){return db.prepare(sql).get(...values)||null},async all(){return {results:db.prepare(sql).all(...values)}},run(){const r=db.prepare(sql).run(...values);return {success:true,meta:{changes:Number(r.changes),last_row_id:Number(r.lastInsertRowid)}}}}},async batch(stmts){db.exec('BEGIN');try{const rows=stmts.map(stmt=>stmt.run());db.exec('COMMIT');return rows}catch(e){db.exec('ROLLBACK');throw e}}};
 return {db,env:{DB:adapter,MERCADO_PAGO_ACCESS_TOKEN:'TEST-local-only'}};
}
const req=(path,body,headers={})=>new Request('https://elegance18k.com'+path,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
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
 const form=new Request('https://elegance18k.com/admin-login',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded','CF-Connecting-IP':'new'},body:'email=same%40example.test&password=x'});
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
