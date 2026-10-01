import type { Env } from "../../_lib/types";
import { currentCustomer } from "../../_lib/auth";
import { apiError, json } from "../../_lib/http";
import { imageForm, validImage } from "../../_lib/image-validation";

const MAX_PRODUCT_REVIEW_PHOTO_BYTES = 10 * 1024 * 1024;

function imageExtension(file: File): string | null {
  return ({ "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" } as Record<string, string | undefined>)[file.type] || null;
}

export const onRequest: PagesFunction<Env> = async ({ request, env, params }) => {
  try {
    const id = Number(params.id);
    if (!Number.isSafeInteger(id) || id < 1) return apiError("Produto inválido.");
    if (!await env.DB.prepare("SELECT id FROM products WHERE id=? AND active=1").bind(id).first()) return apiError("Produto não encontrado.", 404);
    if (request.method === "POST") {
      if (request.headers.get("origin") !== new URL(request.url).origin) return apiError("Origem inválida.", 403);
      const customer = await currentCustomer(request, env);
      if (!customer) return apiError("Entre na sua conta para avaliar.", 401);
      let rating: unknown, comment = "", photo: File | null = null;
      if (request.headers.get("content-type")?.startsWith("multipart/form-data;")) {
        const form = await imageForm(request, MAX_PRODUCT_REVIEW_PHOTO_BYTES);
        rating = Number(form.get("rating"));
        comment = String(form.get("comment") || "").trim();
        const candidate = form.get("photo");
        photo = candidate instanceof File && candidate.size ? candidate : null;
      } else {
        const raw = await request.text();
        if (raw.length > 12000) return apiError("Comentário muito longo.", 413);
        let body: { rating?: unknown; comment?: unknown };
        try { body = JSON.parse(raw); } catch { return apiError("Dados inválidos."); }
        if (!body || typeof body !== "object") return apiError("Dados inválidos.");
        rating = body.rating;
        comment = typeof body.comment === "string" ? body.comment.trim() : "";
      }
      if (typeof rating !== "number" || !Number.isInteger(rating) || rating < 1 || rating > 5 || comment.length > 2000) return apiError("Escolha uma nota de 1 a 5 e use até 2.000 caracteres.");
      if (photo && (!env.PERSONALIZATION_BUCKET || !await validImage(photo, MAX_PRODUCT_REVIEW_PHOTO_BYTES))) return apiError("Use uma foto JPG, PNG ou WebP válida, de até 10 MB.");
      const previous = await env.DB.prepare("SELECT photo_filename FROM product_reviews WHERE product_id=? AND customer_id=?").bind(id, customer.id).first<{ photo_filename: string | null }>();
      let filename: string | null = null;
      if (photo) {
        const extension = imageExtension(photo);
        if (!extension) return apiError("Use uma foto JPG, PNG ou WebP válida, de até 10 MB.");
        filename = `${crypto.randomUUID()}.${extension}`;
        await env.PERSONALIZATION_BUCKET!.put(`reviews/${id}/${customer.id}/${filename}`, photo.stream(), { httpMetadata: { contentType: photo.type, cacheControl: "public, max-age=31536000, immutable" } });
      }
      await env.DB.prepare("INSERT INTO product_reviews(product_id,customer_id,rating,comment,photo_filename) VALUES(?,?,?,?,?) ON CONFLICT(product_id,customer_id) DO UPDATE SET rating=excluded.rating,comment=excluded.comment,photo_filename=COALESCE(excluded.photo_filename,product_reviews.photo_filename),updated_at=CURRENT_TIMESTAMP")
        .bind(id, customer.id, rating, comment, filename).run();
      if (filename && previous?.photo_filename) await env.PERSONALIZATION_BUCKET!.delete(`reviews/${id}/${customer.id}/${previous.photo_filename}`);
    } else if (request.method !== "GET") return apiError("Método não permitido.", 405);
    const summary = await env.DB.prepare("SELECT COUNT(*) AS count,COALESCE(AVG(rating),0) AS average FROM product_reviews WHERE product_id=?").bind(id).first();
    const rows = await env.DB.prepare("SELECT r.rating,r.comment,r.updated_at,r.photo_filename,c.name FROM product_reviews r JOIN customers c ON c.id=r.customer_id WHERE r.product_id=? ORDER BY r.updated_at DESC LIMIT 50")
      .bind(id).all<{ rating: number; comment: string; updated_at: string; photo_filename: string | null; name: string }>();
    return json({ summary, reviews: rows.results.map(row => ({ ...row, name: row.name.trim().split(/\s+/)[0] || "Cliente", photo_url: row.photo_filename ? `/api/reviews/${id}/images/${row.photo_filename}` : null })) });
  } catch { return apiError("Não foi possível carregar as avaliações. Tente novamente.", 500); }
};
