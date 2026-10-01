import type { Env } from "../_lib/types";
import { apiError, json } from "../_lib/http";
import { imageForm, validImage } from "../_lib/image-validation";

const extensionFor = (file: File) => ({ "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" } as Record<string, string | undefined>)[file.type] || null;
const MAX_REVIEW_PHOTO_BYTES = 10 * 1024 * 1024;

export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  try {
    if (request.method === "GET") {
      const rows = await env.DB.prepare("SELECT id,name,rating,comment,photo_filename,created_at FROM site_reviews ORDER BY id DESC LIMIT 50").all<{id:number;name:string;rating:number;comment:string;photo_filename:string|null;created_at:string}>();
      return json({ reviews: rows.results.map(row => ({ ...row, photo_url: row.photo_filename ? `/api/site-reviews/images/${row.photo_filename}` : null })) });
    }
    if (request.method !== "POST") return apiError("Método não permitido.", 405);
    if (request.headers.get("origin") !== new URL(request.url).origin) return apiError("Origem inválida.", 403);
    const form = await imageForm(request, MAX_REVIEW_PHOTO_BYTES);
    const name = String(form.get("name") || "").trim();
    const comment = String(form.get("comment") || "").trim();
    const rating = Number(form.get("rating"));
    const candidate = form.get("photo");
    const photo = candidate instanceof File && candidate.size ? candidate : null;
    if (name.length < 2 || name.length > 100 || !Number.isInteger(rating) || rating < 1 || rating > 5 || comment.length < 2 || comment.length > 2000) return apiError("Preencha nome, nota e comentário corretamente.");
    if (photo && (!env.PERSONALIZATION_BUCKET || !await validImage(photo, MAX_REVIEW_PHOTO_BYTES))) return apiError("Use uma foto JPG, PNG ou WebP válida, de até 10 MB.");
    let filename: string | null = null;
    if (photo) {
      const extension = extensionFor(photo);
      if (!extension) return apiError("Use uma foto JPG, PNG ou WebP válida, de até 10 MB.");
      filename = `${crypto.randomUUID()}.${extension}`;
      await env.PERSONALIZATION_BUCKET!.put(`site-reviews/${filename}`, photo.stream(), { httpMetadata: { contentType: photo.type, cacheControl: "public, max-age=31536000, immutable" } });
    }
    const created = await env.DB.prepare("INSERT INTO site_reviews(name,rating,comment,photo_filename) VALUES(?,?,?,?) RETURNING id,name,rating,comment,photo_filename,created_at").bind(name, rating, comment, filename).first<{id:number;name:string;rating:number;comment:string;photo_filename:string|null;created_at:string}>();
    if (!created) return apiError("Não foi possível salvar sua avaliação.", 500);
    return json({ review: { ...created, photo_url: created.photo_filename ? `/api/site-reviews/images/${created.photo_filename}` : null } }, 201);
  } catch { return apiError("Não foi possível salvar sua avaliação. Tente novamente.", 500); }
};
