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
const {hashPassword,verifyPassword,upgradePassword}=require('../functions/_lib/auth.ts');
const {publicPaymentStatus}=require('../functions/_lib/mercado-pago.ts');
const {validImage,imageForm}=require('../functions/_lib/image-validation.ts');
const {securityHeaders,privatePath}=require('../functions/_lib/security-headers.ts');
const {readBoundedBody}=require('../functions/_lib/http.ts');
function fixture(){
 const db=new DatabaseSync(':memory:');
 for(const file of ['0001_initial','0003_product_personalization','0004_product_personalizable','0008_customer_accounts_first_purchase','0009_product_details_and_personalization','0011_gift_card_checkout','0012_whatsapp_recovery','0018_checkout_security','0019_security_hardening','0020_category_images','0021_admin_mfa']){
  db.exec(fs.readFileSync(require('node:path').join(__dirname,'../migrations',file+'.sql'),'utf8'));
 }
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
test('admin form login works in browsers without Origin headers, while supplied foreign origins are denied',async()=>{
 const {db,env}=fixture();
 const body=new URLSearchParams({email:'owner@example.test',password:'test'});
 const allowed=new Request('https://elegance18k.com/admin-login',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body});
 assert.equal(await protectRequest(allowed,env),null);
 const forged=new Request('https://elegance18k.com/admin-login',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded','Sec-Fetch-Site':'cross-site','Sec-Fetch-Mode':'navigate','Sec-Fetch-Dest':'document'},body:new URLSearchParams({email:'owner@example.test'})});
 assert.equal((await protectRequest(forged,env)).status,403);
 db.close();
});


