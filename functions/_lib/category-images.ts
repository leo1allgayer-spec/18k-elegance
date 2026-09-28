import type { Env } from './types';
import { apiError, json } from './http';
import { imageForm, validImage } from './image-validation';

export async function uploadCategoryImage(request: Request, env: Env, id: number): Promise<Response> {
  if (!Number.isSafeInteger(id) || id < 1) return apiError('Categoria inválida.');
  if (!env.PERSONALIZATION_BUCKET) return apiError('Armazenamento indisponível.', 503);
  if (!await env.DB.prepare('SELECT id FROM categories WHERE id=?').bind(id).first()) return apiError('Categoria não encontrada.', 404);
  const form = await imageForm(request);
  const file = form.get('image');
  if (!(file instanceof File) || !await validImage(file)) return apiError('Use uma imagem JPG, PNG ou WebP válida, com até 5 MB.');
  const extension = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
  const filename = crypto.randomUUID() + '.' + extension;
  const key = `categories/${id}/${filename}`;
  const url = `/api/category-images/${id}/${filename}`;
  await env.PERSONALIZATION_BUCKET.put(key, file.stream(), { httpMetadata: { contentType: file.type, cacheControl: 'public, max-age=31536000, immutable' } });
  try {
    await env.DB.prepare('UPDATE categories SET image_url=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(url, id).run();
  } catch (error) {
    await env.PERSONALIZATION_BUCKET.delete(key);
    throw error;
  }
  // Keep previous objects recoverable; never delete shared product photographs.
  return json({ ok: true, image: { url } }, 201);
}

export async function publicCategoryImage(env: Env, id: number, filename: string): Promise<Response> {
  if (!env.PERSONALIZATION_BUCKET || !Number.isSafeInteger(id) || id < 1 || !/^[a-f0-9-]+\.(jpg|png|webp)$/i.test(filename)) return apiError('Imagem não encontrada.', 404);
  const object = await env.PERSONALIZATION_BUCKET.get(`categories/${id}/${filename}`);
  if (!object) return apiError('Imagem não encontrada.', 404);
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  headers.set('ETag', object.httpEtag);
  headers.set('X-Content-Type-Options', 'nosniff');
  return new Response(object.body, { headers });
}
