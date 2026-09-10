import type { Env } from "../../_lib/types";
import { currentCustomer } from "../../_lib/auth";
import { apiError, json } from "../../_lib/http";
export const onRequest: PagesFunction<Env> = async ({ request, env, params }) => {
 try {
  const id = Number(params.id);
  if (!Number.isSafeInteger(id) || id < 1) return apiError("Produto inválido.");
  if (!await env.DB.prepare("SELECT id FROM products WHERE id=? AND active=1").bind(id).first()) return apiError("Produto não encontrado.",404);
  if (request.method === "POST") {
   if (request.headers.get("origin") !== new URL(request.url).origin) return apiError("Origem inválida.",403);
   const customer = await currentCustomer(request,env);
   if (!customer) return apiError("Entre na sua conta para avaliar.",401);
   const raw = await request.text();
   if (raw.length > 12000) return apiError("Comentário muito longo.",413);
   let body: {rating?:unknown;comment?:unknown};
   try {body=JSON.parse(raw);} catch {return apiError("Dados inválidos.");}
   if (!body || typeof body !== "object") return apiError("Dados inválidos.");
   const rating=body.rating, comment=typeof body.comment==="string"?body.comment.trim():"";
   if (typeof rating!=="number" || !Number.isInteger(rating) || rating<1 || rating>5 || comment.length>2000) return apiError("Escolha uma nota de 1 a 5 e use até 2.000 caracteres.");
   await env.DB.prepare("INSERT INTO product_reviews(product_id,customer_id,rating,comment) VALUES(?,?,?,?) ON CONFLICT(product_id,customer_id) DO UPDATE SET rating=excluded.rating,comment=excluded.comment,updated_at=CURRENT_TIMESTAMP").bind(id,customer.id,rating,comment).run();
  } else if (request.method!=="GET") return apiError("Método não permitido.",405);
  const summary=await env.DB.prepare("SELECT COUNT(*) AS count,COALESCE(AVG(rating),0) AS average FROM product_reviews WHERE product_id=?").bind(id).first();
  const rows=await env.DB.prepare("SELECT r.rating,r.comment,r.updated_at,c.name FROM product_reviews r JOIN customers c ON c.id=r.customer_id WHERE r.product_id=? ORDER BY r.updated_at DESC LIMIT 50").bind(id).all<{rating:number;comment:string;updated_at:string;name:string}>();
  return json({summary,reviews:rows.results.map(row=>({...row,name:row.name.trim().split(/\s+/)[0]||"Cliente"}))});
 } catch {return apiError("Não foi possível carregar as avaliações. Tente novamente.",500);}
};
