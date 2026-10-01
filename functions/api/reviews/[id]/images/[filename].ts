import type { Env } from "../../../../_lib/types";
import { apiError } from "../../../../_lib/http";

export const onRequest: PagesFunction<Env> = async ({ env, params }) => {
  const id = Number(params.id), filename = String(params.filename || "");
  if (!env.PERSONALIZATION_BUCKET || !Number.isSafeInteger(id) || id < 1 || !/^[a-f0-9-]+\.(jpg|png|webp)$/i.test(filename)) return apiError("Imagem não encontrada.", 404);
  const review = await env.DB.prepare("SELECT customer_id FROM product_reviews WHERE product_id=? AND photo_filename=?").bind(id, filename).first<{ customer_id: number }>();
  if (!review) return apiError("Imagem não encontrada.", 404);
  const object = await env.PERSONALIZATION_BUCKET.get(`reviews/${id}/${review.customer_id}/${filename}`);
  if (!object) return apiError("Imagem não encontrada.", 404);
  return new Response(object.body, { headers: { "Content-Type": object.httpMetadata?.contentType || "application/octet-stream", "Cache-Control": "public, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" } });
};
