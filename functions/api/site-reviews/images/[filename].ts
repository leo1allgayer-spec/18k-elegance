import type { Env } from "../../../_lib/types";
import { apiError } from "../../../_lib/http";

export const onRequest: PagesFunction<Env> = async ({ env, params }) => {
  const filename = String(params.filename || "");
  if (!env.PERSONALIZATION_BUCKET || !/^[a-f0-9-]+\.(jpg|png|webp)$/i.test(filename)) return apiError("Imagem não encontrada.", 404);
  const exists = await env.DB.prepare("SELECT id FROM site_reviews WHERE photo_filename=?").bind(filename).first();
  if (!exists) return apiError("Imagem não encontrada.", 404);
  const object = await env.PERSONALIZATION_BUCKET.get(`site-reviews/${filename}`);
  if (!object) return apiError("Imagem não encontrada.", 404);
  return new Response(object.body, { headers: { "Content-Type": object.httpMetadata?.contentType || "application/octet-stream", "Cache-Control": "public, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" } });
};
