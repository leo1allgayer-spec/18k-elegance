const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {transformSync} = require('esbuild');
const {DatabaseSync} = require('node:sqlite');
require.extensions['.ts'] = (module, filename) => module._compile(transformSync(fs.readFileSync(filename,'utf8'), {
  loader:'ts',format:'cjs',target:'es2022'
}).code,filename);
const {stockDecision,inventoryNumber} = require('../functions/_lib/stock-decision.ts');
const {signStockTick,verifyStockTick} = require('../functions/_lib/stock-signature.ts');
const {stockSchema,runStockSync} = require('../functions/_lib/bling-stock.ts');
const scheduler = require('../workers/stock-scheduler/index.ts').default;

function fixture() {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE customers(id INTEGER PRIMARY KEY);
    CREATE TABLE products(id INTEGER PRIMARY KEY,name TEXT);
    CREATE TABLE product_variants(id INTEGER PRIMARY KEY,product_id INTEGER,stock INTEGER,updated_at TEXT);
    CREATE TABLE bling_tokens(id INTEGER PRIMARY KEY,access_token TEXT,refresh_token TEXT,token_type TEXT,expires_at TEXT,scope TEXT,connected_at TEXT,updated_at TEXT);
    INSERT INTO products VALUES(1,'Test'); INSERT INTO product_variants VALUES(1,1,5,CURRENT_TIMESTAMP);
    INSERT INTO bling_tokens(id,access_token,refresh_token,expires_at) VALUES(1,'test-only','test-only','2099-01-01');`);
  const adapter = {
    prepare(sql) {
      const stmt = db.prepare(sql); let values=[];
      return {bind(...args){values=args;return this;},async first(){return stmt.get(...values)??null;},async all(){return {results:stmt.all(...values)};},
        async run(){const r=stmt.run(...values);return {success:true,meta:{changes:Number(r.changes),last_row_id:Number(r.lastInsertRowid)}};}};
    },
    async batch(stmts) { db.exec('BEGIN'); try {const results=[];for(const stmt of stmts)results.push(await stmt.run());db.exec('COMMIT');return results;} catch(e){db.exec('ROLLBACK');throw e;} }
  };
  return {db,env:{DB:adapter}};
}

test('decisions never silently accept concurrent changes, including equal decrements',()=>{
  assert.equal(stockDecision(1,10,null),'initialize');
  assert.equal(stockDecision(10,10,10),'equal');
  assert.equal(stockDecision(9,10,10),'push');
  assert.equal(stockDecision(10,9,10),'pull');
  assert.equal(stockDecision(9,8,10),'conflict');
  assert.equal(stockDecision(9,9,10),'conflict');
  for(const value of [-1,0.5,NaN,Infinity,'1',null]) assert.throws(()=>inventoryNumber(value));
  assert.equal(inventoryNumber(0),0);
});
test('scheduler accepts only valid recent signatures',async()=>{
  const timestamp=String(Date.now()), sig=await signStockTick('test-key',timestamp);
  assert.equal(await verifyStockTick('test-key',timestamp,sig),true);
  assert.equal(await verifyStockTick('other-key',timestamp,sig),false);
  assert.equal(await verifyStockTick('test-key',String(Date.now()-120000),sig),false);
  assert.equal(await verifyStockTick('test-key',timestamp,'bad'),false);
});
test('scheduler signs the fixed endpoint and never follows redirects',async()=>{
  const original=global.fetch;const env={DB:{prepare:()=>({first:async()=>({secret:'test-key'})})}};
  global.fetch=async(url,options)=>{
    assert.equal(url,'https://elegance18k.com/api/integrations/bling-stock-tick');
    assert.equal(options.redirect,'manual');assert.equal(options.method,'POST');
    assert.equal(await verifyStockTick('test-key',options.headers['X-Stock-Time'],options.headers['X-Stock-Signature']),true);
    return Response.redirect('https://example.invalid/',302);
  };
  try{await assert.rejects(()=>scheduler.scheduled({},env),/HTTP 302/);}finally{global.fetch=original;}
});
test('initial site balance, reservation preservation, echo dedupe, inbound change and sale',async()=>{
  const {db,env}=fixture(); await stockSchema(env);
  db.exec(`INSERT INTO bling_stock_links(variant_id,bling_id,deposit_id) VALUES(1,99,7); UPDATE bling_stock_control SET enabled=1;`);
  let physical=12,reserved=2;const writes=[];const original=global.fetch;
  global.fetch=async(url,options)=>{
    if(options.method==='POST'){const body=JSON.parse(options.body);writes.push(body);physical=body.operacao==='B'?body.quantidade:physical+(body.operacao==='E'?1:-1)*body.quantidade;return Response.json({data:{id:100}});}
    return Response.json({data:[{produto:{id:99},saldoFisicoTotal:physical,saldoVirtualTotal:physical-reserved}]});
  };
  try {
    await runStockSync(env); assert.equal(writes.length,1);assert.equal(writes[0].operacao,'B');assert.equal(physical,7);
    await runStockSync(env);await runStockSync(env);assert.equal(writes.length,1);assert.equal(db.prepare('SELECT baseline FROM bling_stock_links').get().baseline,5);
    physical=9;await runStockSync(env);assert.equal(db.prepare('SELECT stock FROM product_variants').get().stock,7);
    db.exec('UPDATE product_variants SET stock=6');await runStockSync(env);assert.equal(writes[1].operacao,'S');assert.equal(writes[1].quantidade,1);
    await runStockSync(env);await runStockSync(env);assert.equal(writes.length,2);assert.equal(physical-reserved,6);
  } finally {global.fetch=original;db.close();}
});
test('uncertain outgoing result is not sent twice',async()=>{
  const {db,env}=fixture();await stockSchema(env);
  db.exec(`INSERT INTO bling_stock_links(variant_id,bling_id,deposit_id,baseline,status) VALUES(1,99,7,6,'synced');UPDATE bling_stock_control SET enabled=1;`);
  let writes=0;const original=global.fetch;
  global.fetch=async(_url,options)=>{if(options.method==='POST'){writes++;throw new Error('network timeout');}return Response.json({data:[{produto:{id:99},saldoFisicoTotal:6,saldoVirtualTotal:6}]});};
  try {await runStockSync(env);await runStockSync(env);assert.equal(writes,1);const row=db.prepare('SELECT pending_target,status FROM bling_stock_links').get();assert.equal(row.pending_target,5);assert.equal(row.status,'error');}
  finally{global.fetch=original;db.close();}
});
test('inbound stock does not overwrite a concurrent site payment',async()=>{
  const {db,env}=fixture();await stockSchema(env);
  db.exec(`INSERT INTO bling_stock_links(variant_id,bling_id,deposit_id,baseline,status) VALUES(1,99,7,5,'synced');UPDATE bling_stock_control SET enabled=1;`);
  const original=global.fetch;global.fetch=async()=>{db.exec('UPDATE product_variants SET stock=4');return Response.json({data:[{produto:{id:99},saldoFisicoTotal:3,saldoVirtualTotal:3}]});};
  try{await runStockSync(env);assert.equal(db.prepare('SELECT stock FROM product_variants').get().stock,4);assert.equal(db.prepare('SELECT baseline FROM bling_stock_links').get().baseline,5);await runStockSync(env);assert.equal(db.prepare('SELECT status FROM bling_stock_links').get().status,'conflict');}
  finally{global.fetch=original;db.close();}
});
test('paused integration does not call Bling',async()=>{
  const {db,env}=fixture();await stockSchema(env);const original=global.fetch;global.fetch=()=>{throw new Error('must not fetch');};
  try{assert.deepEqual(await runStockSync(env),{skipped:true});}finally{global.fetch=original;db.close();}
});
test('explicit forbidden response is not confused with an uncertain write',async()=>{
  const {db,env}=fixture();await stockSchema(env);
  db.exec(`INSERT INTO bling_stock_links(variant_id,bling_id,deposit_id,baseline,status) VALUES(1,99,7,6,'synced');UPDATE bling_stock_control SET enabled=1;`);
  const original=global.fetch;
  global.fetch=async(_url,options)=>options.method==='POST'?Response.json({error:{}},{status:403}):Response.json({data:[{produto:{id:99},saldoFisicoTotal:6,saldoVirtualTotal:6}]});
  try{await runStockSync(env);const row=db.prepare('SELECT pending_target,status,error FROM bling_stock_links').get();assert.equal(row.pending_target,null);assert.equal(row.status,'error');assert.match(row.error,/movimentar estoque/);}
  finally{global.fetch=original;db.close();}
});
test('conflict remains blocked without consulting or changing remote stock',async()=>{
  const {db,env}=fixture();await stockSchema(env);
  db.exec(`INSERT INTO bling_stock_links(variant_id,bling_id,deposit_id,baseline,status) VALUES(1,99,7,6,'conflict');UPDATE bling_stock_control SET enabled=1;`);
  const original=global.fetch;let calls=0;global.fetch=async()=>{calls++;throw new Error('should not fetch');};
  try{await runStockSync(env);assert.equal(calls,0);assert.equal(db.prepare('SELECT status FROM bling_stock_links').get().status,'conflict');}
  finally{global.fetch=original;db.close();}
});
