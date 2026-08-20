import type { Env } from "./types";
import { apiError, json } from "./http";

const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_BYTES = 5 * 1024 * 1024;

export async function uploadPersonalization(request: Request, env: Env): Promise<Response> {
  if (!env.PERSONALIZATION_BUCKET) return apiError("O envio de imagens ainda não foi ativado.", 503, "UPLOAD_NOT_CONFIGURED");
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.includes("multipart/form-data")) return apiError("Envie a imagem como formulário.");
  const form = await request.formData();
  const productId = Number(form.get("product_id"));
  const file = form.get("image");
  if (!Number.isInteger(productId) || !(file instanceof File)) return apiError("Produto ou imagem inválidos.");
  if (!ALLOWED_TYPES.has(file.type) || file.size < 1 || file.size > MAX_BYTES) return apiError("Use uma imagem JPG, PNG ou WebP com até 5 MB.");
  const product = await env.DB.prepare(`SELECT p.id FROM products p JOIN categories c ON c.id=p.category_id
    WHERE p.id=? AND p.active=1 AND c.slug='fotogravacao'`).bind(productId).first();
  if (!product) return apiError("Este produto não aceita fotogravação.", 400, "NOT_PERSONALIZABLE");
  const id = crypto.randomUUID();
  const extension = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const key = `pending/${new Date().toISOString().slice(0, 10)}/${id}.${extension}`;
  await env.PERSONALIZATION_BUCKET.put(key, file.stream(), { httpMetadata: { contentType: file.type }, customMetadata: { uploadId: id } });
  await env.DB.prepare(`INSERT INTO personalization_uploads(id,object_key,product_id,original_name,content_type,size_bytes)
    VALUES(?,?,?,?,?,?)`).bind(id, key, productId, file.name.slice(0, 160), file.type, file.size).run();
  return json({ ok: true, upload: { id, name: file.name, size: file.size } }, 201);
}

export async function adminPersonalizationImage(env: Env, id: string): Promise<Response> {
  if (!env.PERSONALIZATION_BUCKET) return apiError("Armazenamento não configurado.", 503);
  const upload = await env.DB.prepare("SELECT object_key,content_type,original_name FROM personalization_uploads WHERE id=?")
    .bind(id).first<{ object_key: string; content_type: string; original_name: string }>();
  if (!upload) return apiError("Imagem não encontrada.", 404, "NOT_FOUND");
  const object = await env.PERSONALIZATION_BUCKET.get(upload.object_key);
  if (!object) return apiError("Arquivo não encontrado.", 404, "NOT_FOUND");
  return new Response(object.body, { headers: { "Content-Type": upload.content_type, "Content-Disposition": `inline; filename="${upload.original_name.replace(/[\"\\]/g, "")}"`, "Cache-Control": "private, no-store" } });
}
