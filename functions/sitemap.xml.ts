import type { Env } from "./_lib/types";

const ORIGIN = "https://elegance18k.com";
const xml = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  const [products, categories] = await Promise.all([
    env.DB.prepare("SELECT slug,updated_at FROM products WHERE active=1 ORDER BY updated_at DESC").all<{ slug: string; updated_at: string }>(),
    env.DB.prepare("SELECT slug FROM categories WHERE active=1 ORDER BY sort_order,name").all<{ slug: string }>(),
  ]);
  const staticUrls = [
    ["/", "1.0", "weekly"],
    ["/catalogo", "0.9", "daily"],
    ["/cartao-presente", "0.7", "monthly"],
    ["/conservacao", "0.6", "monthly"],
    ["/medidas", "0.6", "monthly"],
    ["/fidelidade", "0.5", "monthly"],
  ];
  const entries = [
    ...staticUrls.map(([path, priority, frequency]) => `<url><loc>${ORIGIN}${path}</loc><changefreq>${frequency}</changefreq><priority>${priority}</priority></url>`),
    ...categories.results.map(category => `<url><loc>${xml(`${ORIGIN}/catalogo?categoria=${encodeURIComponent(category.slug)}`)}</loc><changefreq>weekly</changefreq><priority>0.8</priority></url>`),
    ...products.results.map(product => `<url><loc>${xml(`${ORIGIN}/produto?produto=${encodeURIComponent(product.slug)}`)}</loc><lastmod>${xml(new Date(product.updated_at + "Z").toISOString())}</lastmod><changefreq>weekly</changefreq><priority>0.8</priority></url>`),
  ];
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${entries.join("")}</urlset>`, {
    headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600" },
  });
};
