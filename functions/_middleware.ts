import type { Env } from "./_lib/types";
import { protectRequest } from "./_lib/request-security";

const LEGACY_HOST = "site-18-kelegance.pages.dev";
const PRIMARY_ORIGIN = "https://elegance18k.com";
const DEFAULT_IMAGE = `${PRIMARY_ORIGIN}/assets/hero-mobile.webp`;

type SeoData = {
  title: string;
  description: string;
  canonical: string;
  image?: string;
  robots?: string;
  type?: "website" | "product";
  jsonLd?: Record<string, unknown>[];
};

const PUBLIC_PAGES: Record<string, { title: string; description: string; image?: string }> = {
  "/": {
    title: "Elegance 18K | Semijoias, presentes e joias personalizadas",
    description: "Semijoias Elegance 18K com banho premium, garantia e envio para todo o Brasil. Encontre brincos, anéis, pulseiras, colares e joias personalizadas.",
  },
  "/index": {
    title: "Elegance 18K | Semijoias, presentes e joias personalizadas",
    description: "Semijoias Elegance 18K com banho premium, garantia e envio para todo o Brasil. Encontre brincos, anéis, pulseiras, colares e joias personalizadas.",
  },
  "/catalogo": {
    title: "Semijoias e joias personalizadas | Elegance 18K",
    description: "Explore semijoias com banho premium: brincos, anéis, pulseiras, pingentes, gargantilhas, tornozeleiras e peças personalizadas Elegance 18K.",
  },
  "/cartao-presente": {
    title: "Cartão-presente digital para joias | Elegance 18K",
    description: "Presenteie alguém especial com um cartão-presente digital Elegance 18K para escolher semijoias e joias personalizadas.",
  },
  "/conservacao": {
    title: "Como cuidar de semijoias | Guia Elegance 18K",
    description: "Aprenda a limpar, guardar e conservar suas semijoias para preservar o brilho, o banho e o acabamento por muito mais tempo.",
  },
  "/medidas": {
    title: "Guia de medidas para pulseiras | Elegance 18K",
    description: "Descubra como medir o pulso corretamente e escolher o tamanho ideal da sua pulseira Elegance 18K.",
  },
  "/fidelidade": {
    title: "Clube fidelidade Elegance 18K | Benefícios em semijoias",
    description: "Conheça o Clube Elegance: acumule compras e receba benefícios exclusivos em sua próxima semijoia.",
  },
};

const NOINDEX_PATHS = new Set([
  "/admin", "/admin-demo", "/conta", "/carrinho", "/checkout",
  "/pagamento-retorno", "/rastreamento",
]);

const cleanPath = (path: string) => {
  const cleaned = path.replace(/\.html$/i, "").replace(/\/+$/, "");
  return cleaned || "/";
};

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, char => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[char] || char));

const absoluteUrl = (value: string | null | undefined) => {
  if (!value) return DEFAULT_IMAGE;
  try { return new URL(value, PRIMARY_ORIGIN).toString(); }
  catch { return DEFAULT_IMAGE; }
};

async function productSeo(url: URL, env: Env): Promise<SeoData> {
  const slug = (url.searchParams.get("produto") || "").trim();
  if (!slug) return {
    title: "Produto | Elegance 18K",
    description: "Conheça as semijoias Elegance 18K.",
    canonical: `${PRIMARY_ORIGIN}/catalogo`,
    robots: "noindex,follow",
  };
  const product = await env.DB.prepare(`SELECT p.name,p.slug,p.sku,p.description,p.price_cents,p.updated_at,
    c.name AS category_name,c.slug AS category_slug,
    (SELECT url FROM product_images WHERE product_id=p.id ORDER BY sort_order,id LIMIT 1) AS image_url,
    COALESCE((SELECT SUM(stock) FROM product_variants WHERE product_id=p.id AND active=1),0) AS stock
    FROM products p LEFT JOIN categories c ON c.id=p.category_id
    WHERE p.slug=? AND p.active=1 LIMIT 1`).bind(slug).first<Record<string, string | number | null>>();
  if (!product) return {
    title: "Produto não encontrado | Elegance 18K",
    description: "Este produto não está disponível. Explore outras semijoias Elegance 18K.",
    canonical: `${PRIMARY_ORIGIN}/catalogo`,
    robots: "noindex,follow",
  };
  const canonical = `${PRIMARY_ORIGIN}/produto?produto=${encodeURIComponent(String(product.slug))}`;
  const image = absoluteUrl(String(product.image_url || ""));
  const description = String(product.description || `${product.name}: semijoia Elegance 18K com acabamento premium e garantia.`).slice(0, 300);
  const productSchema = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description,
    image: [image],
    sku: product.sku,
    url: canonical,
    brand: { "@type": "Brand", name: "Elegance 18K" },
    category: product.category_name || "Semijoias",
    offers: {
      "@type": "Offer",
      url: canonical,
      priceCurrency: "BRL",
      price: (Number(product.price_cents) / 100).toFixed(2),
      availability: Number(product.stock) > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      itemCondition: "https://schema.org/NewCondition",
      seller: { "@type": "Organization", name: "Elegance 18K" },
    },
  };
  const breadcrumbs = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Início", item: PRIMARY_ORIGIN },
      { "@type": "ListItem", position: 2, name: product.category_name || "Semijoias", item: `${PRIMARY_ORIGIN}/catalogo${product.category_slug ? `?categoria=${encodeURIComponent(String(product.category_slug))}` : ""}` },
      { "@type": "ListItem", position: 3, name: product.name, item: canonical },
    ],
  };
  return {
    title: `${product.name} | Elegance 18K`,
    description,
    canonical,
    image,
    type: "product",
    jsonLd: [productSchema, breadcrumbs],
  };
}

async function resolveSeo(url: URL, env: Env): Promise<SeoData> {
  const path = cleanPath(url.pathname);
  if (path === "/produto") return productSeo(url, env);
  if (NOINDEX_PATHS.has(path) || path.startsWith("/admin")) return {
    title: "Elegance 18K",
    description: "Área de serviço da Elegance 18K.",
    canonical: `${PRIMARY_ORIGIN}${path}`,
    robots: "noindex,follow",
  };
  const page = PUBLIC_PAGES[path];
  if (!page) return {
    title: "Elegance 18K",
    description: "Semijoias que revelam a sua essência.",
    canonical: `${PRIMARY_ORIGIN}${path}`,
    robots: "noindex,follow",
  };
  let title = page.title;
  let description = page.description;
  let canonical = `${PRIMARY_ORIGIN}${path === "/index" ? "/" : path}`;
  let robots = "index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1";
  if (path === "/catalogo") {
    const category = url.searchParams.get("categoria");
    const search = url.searchParams.get("q");
    const favorites = url.searchParams.get("favoritos");
    if (category && /^[a-z0-9-]+$/.test(category)) {
      const record = await env.DB.prepare("SELECT name,description FROM categories WHERE slug=? AND active=1").bind(category).first<{ name: string; description: string | null }>();
      if (record) {
        title = `${record.name} | Semijoias Elegance 18K`;
        description = record.description || `Conheça a coleção ${record.name} da Elegance 18K: semijoias com acabamento premium, garantia e envio para todo o Brasil.`;
        canonical += `?categoria=${encodeURIComponent(category)}`;
      } else robots = "noindex,follow";
    }
    if (search || favorites) robots = "noindex,follow";
  }
  const schemas: Record<string, unknown>[] = [];
  if (path === "/" || path === "/index") {
    schemas.push({
      "@context": "https://schema.org",
      "@type": "OnlineStore",
      "@id": `${PRIMARY_ORIGIN}/#organization`,
      name: "Elegance 18K",
      url: PRIMARY_ORIGIN,
      logo: `${PRIMARY_ORIGIN}/assets/logo-oficial.png`,
      image: DEFAULT_IMAGE,
      telephone: "+55 51 9492-7676",
      sameAs: ["https://www.instagram.com/elegance__18k/"],
      currenciesAccepted: "BRL",
      paymentAccepted: "Pix, Cartão de crédito",
    });
    schemas.push({
      "@context": "https://schema.org",
      "@type": "WebSite",
      "@id": `${PRIMARY_ORIGIN}/#website`,
      url: PRIMARY_ORIGIN,
      name: "Elegance 18K",
      inLanguage: "pt-BR",
      publisher: { "@id": `${PRIMARY_ORIGIN}/#organization` },
    });
  }
  return { title, description, canonical, image: page.image || DEFAULT_IMAGE, robots, jsonLd: schemas };
}

class RemoveElement {
  element(element: Element) { element.remove(); }
}

class SetTitle {
  constructor(private readonly title: string) {}
  element(element: Element) { element.setInnerContent(this.title); }
}

class AppendSeo {
  constructor(private readonly seo: SeoData) {}
  element(element: Element) {
    const seo = this.seo;
    const tags = [
      `<meta name="description" content="${escapeHtml(seo.description)}">`,
      `<meta name="robots" content="${escapeHtml(seo.robots || "index,follow,max-image-preview:large") }">`,
      `<link rel="canonical" href="${escapeHtml(seo.canonical)}">`,
      `<meta property="og:locale" content="pt_BR">`,
      `<meta property="og:site_name" content="Elegance 18K">`,
      `<meta property="og:type" content="${seo.type === "product" ? "product" : "website"}">`,
      `<meta property="og:title" content="${escapeHtml(seo.title)}">`,
      `<meta property="og:description" content="${escapeHtml(seo.description)}">`,
      `<meta property="og:url" content="${escapeHtml(seo.canonical)}">`,
      `<meta property="og:image" content="${escapeHtml(seo.image || DEFAULT_IMAGE)}">`,
      `<meta property="og:image:alt" content="${escapeHtml(seo.title)}">`,
      `<meta name="twitter:card" content="summary_large_image">`,
      `<meta name="twitter:title" content="${escapeHtml(seo.title)}">`,
      `<meta name="twitter:description" content="${escapeHtml(seo.description)}">`,
      `<meta name="twitter:image" content="${escapeHtml(seo.image || DEFAULT_IMAGE)}">`,
      ...(seo.jsonLd || []).map(data => `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, "\\u003c")}</script>`),
    ].join("");
    element.append(tags, { html: true });
  }
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url);
  try {
    const blocked = await protectRequest(context.request, context.env);
    if (blocked) return blocked;
  } catch {
    return Response.json({ok:false,error:{message:'Não foi possível validar a solicitação. Tente novamente.'}},{status:503,headers:{'Cache-Control':'no-store'}});
  }
  if (url.hostname === LEGACY_HOST && !url.pathname.startsWith("/api/")) {
    const destination = new URL(url.pathname + url.search, PRIMARY_ORIGIN);
    return Response.redirect(destination.toString(), 308);
  }
  const response = await context.next();
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("text/html") || response.status >= 400) return response;
  const seo = await resolveSeo(url, context.env);
  const headers = new Headers(response.headers);
  headers.set("Link", `<${seo.canonical}>; rel="canonical"`);
  if (seo.robots?.startsWith("noindex")) headers.set("X-Robots-Tag", seo.robots);
  const transformed = new HTMLRewriter()
    .on("title", new SetTitle(seo.title))
    .on('meta[name="description"],meta[name="robots"],link[rel="canonical"],meta[property^="og:"],meta[name^="twitter:"]', new RemoveElement())
    .on("head", new AppendSeo(seo))
    .transform(new Response(response.body, { status: response.status, statusText: response.statusText, headers }));
  return transformed;
};
