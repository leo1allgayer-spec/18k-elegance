// Local-only, in-memory fixtures for exercising the real administration UI.
// Does not connect to D1, R2, Bling or the production site.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const product={id:1,name:'Produto de teste',sku:'TEST-1',price_cents:10000,stock:5,active:1,description:'Descrição de teste'};
const coupon={id:1,code:'TESTE',type:'percent',value:10,minimum_cents:0,uses:0,active:1};
const banners=[1,2,3,4].map(slot=>({slot,desktop:'/assets/hero-mobile.webp',mobile:'/assets/hero-mobile.webp',desktop_custom:false,mobile_custom:false}));
http.createServer(async(req,res)=>{
 const url=new URL(req.url,'http://127.0.0.1:4191');
 if(url.pathname.startsWith('/api/')){
  let body='';for await(const chunk of req){body+=chunk;if(body.length>6*1024*1024){res.writeHead(413).end();return;}}
  const routes={
   '/api/auth/me':{customer:{id:1,role:'admin',name:'Teste local'}},
   '/api/admin/dashboard':{stats:{products:1,orders:0,customers:0,revenue_cents:0},recent_orders:[]},
   '/api/admin/products':{products:[product]},'/api/admin/categories':{categories:[]},
   '/api/admin/orders':{orders:[]},'/api/admin/customers':{customers:[]},
   '/api/admin/coupons':{coupons:[coupon]},'/api/admin/integrations/bling/status':{},
   '/api/admin/shipping/origin':{origin:{}},'/api/admin/loyalty':{participants:[]},
   '/api/shipping/motoboy':{rates:[]},'/api/admin/marketing':{settings:{}},'/api/admin/banners':{banners}
   ,'/api/admin/storefront-controls':{settings:{instagram_handle:'elegance___18k',labels:{add_cart:'Adicionar à sacola',category_all:'Todos'}}}
  };
  if(req.method==='PUT'&&url.pathname==='/api/admin/coupons/1')Object.assign(coupon,JSON.parse(body));
  if(req.method==='PUT'&&url.pathname==='/api/admin/products/1')Object.assign(product,JSON.parse(body));
  res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'}).end(JSON.stringify(routes[url.pathname]||{ok:true,id:1}));return;
 }
 const name=url.pathname==='/admin-demo'?'admin-demo.html':decodeURIComponent(url.pathname).replace(/^\//,'');
 if(!/^(?:[\w.-]+\.(?:html|js|css)|assets\/[\w.-]+)$/.test(name)){res.writeHead(404).end();return;}
 const file=path.join(root,name);if(!fs.existsSync(file)){res.writeHead(404).end();return;}
 res.writeHead(200,{'Content-Type':({'.html':'text/html','.js':'text/javascript','.css':'text/css','.webp':'image/webp','.png':'image/png'})[path.extname(name)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);
}).listen(4191,'127.0.0.1',()=>console.log('Local fixtures: http://127.0.0.1:4191/admin-demo'));
