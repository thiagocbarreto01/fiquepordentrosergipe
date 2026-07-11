// Edge function que entrega HTML com Open Graph dinâmico para crawlers
// de redes sociais (WhatsApp, Telegram, Facebook, X) ao compartilhar
// links de matérias. Usuários reais são redirecionados imediatamente
// para a página da matéria no portal.
//
// Uso: https://<projeto>.functions.supabase.co/share-preview?slug=<slug>
//      ou /share-preview/<slug>
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SITE_URL = "https://www.fiquepordentrosergipe.com.br";
const DEFAULT_OG_IMAGE = `${SITE_URL}/og-default.jpg`;

function toAbsoluteImage(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = String(raw)
    .trim()
    .replace(/&amp;/gi, "&")
    .replace(/&#0*38;/gi, "&");
  if (!s) return null;
  if (/^https:\/\//i.test(s)) return s;
  if (/^http:\/\//i.test(s)) return s.replace(/^http:\/\//i, "https://");
  if (s.startsWith("//")) return `https:${s}`;
  if (s.startsWith("/")) return `${SITE_URL}${s}`;
  return null;
}

const htmlHeaders = {
  ...corsHeaders,
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "content-type": "text/html; charset=utf-8",
};

function htmlResponse(body: string, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  // Remove qualquer variação de content-type já setada para evitar duplicatas
  headers.delete("content-type");
  headers.delete("Content-Type");
  headers.set("content-type", "text/html; charset=utf-8");
  headers.set("x-content-type-options", "nosniff");
  return new Response(body, { ...init, headers });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function guessImageType(image: string | null): string | null {
  if (!image) return null;
  const path = image.split("?")[0].toLowerCase();
  if (path.endsWith(".png")) return "image/png";
  if (path.endsWith(".jpg") || path.endsWith(".jpeg")) return "image/jpeg";
  if (path.endsWith(".webp")) return "image/webp";
  if (path.endsWith(".gif")) return "image/gif";
  return null;
}

function buildHtml(opts: {
  title: string;
  description: string;
  image: string | null;
  articleUrl: string;
  publishedAt?: string | null;
  category?: string | null;
  tags?: string[] | null;
}) {
  const { title, description, image, articleUrl, publishedAt, category, tags } = opts;
  const t = escapeHtml(title);
  const d = escapeHtml(description);
  const article = escapeHtml(articleUrl);
  const img = escapeHtml(image || DEFAULT_OG_IMAGE);
  const imageType = guessImageType(image);
  const ld: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    headline: title,
    description,
    datePublished: publishedAt ?? undefined,
    articleSection: category ?? "Geral",
    keywords: (tags ?? []).join(", "),
    mainEntityOfPage: { "@type": "WebPage", "@id": articleUrl },
    author: { "@type": "Organization", name: "Redação Fique Por Dentro Sergipe" },
    publisher: {
      "@type": "NewsMediaOrganization",
      name: "Fique Por Dentro Sergipe",
      logo: { "@type": "ImageObject", url: `${SITE_URL}/favicon.png` },
    },
  };
  if (image) ld.image = [image];

  // Apenas UMA og:image e UMA twitter:image. Sem og:image:secure_url,
  // og:image:type, width/height/alt — evita qualquer chance de o Facebook
  // interpretar múltiplas imagens candidatas.
  void imageType;
  const ogImageTags = `<meta property="og:image" content="${img}" />
<meta name="twitter:image" content="${img}" />`;

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${t} — Fique Por Dentro Sergipe</title>
<meta name="description" content="${d}" />
<link rel="canonical" href="${article}" />
<meta property="og:type" content="article" />
<meta property="og:site_name" content="Fique Por Dentro Sergipe" />
<meta property="og:locale" content="pt_BR" />
<meta property="og:title" content="${t}" />
<meta property="og:description" content="${d}" />
<meta property="og:url" content="${article}" />
${ogImageTags}
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${t}" />
<meta name="twitter:description" content="${d}" />
<script type="application/ld+json">${JSON.stringify(ld)}</script>
</head>
<body>
<p>Redirecionando para <a href="${article}">${t}</a>…</p>
<script>window.location.replace(${JSON.stringify(articleUrl)});</script>
</body>
</html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: htmlHeaders });

  const reqId = crypto.randomUUID();
  const url = new URL(req.url);

  // Slug vem SOMENTE de ?slug=... ou /share-preview/<slug>. Stateless: nada
  // é mantido entre requests — toda variável vive dentro deste handler.
  const rawSlugParam = url.searchParams.get("slug");
  let slug = (rawSlugParam ?? "").trim();
  if (!slug) {
    const parts = url.pathname.split("/").filter(Boolean);
    const last = (parts[parts.length - 1] ?? "").trim();
    if (last && last !== "share-preview") slug = last;
  }
  // Normaliza: remove qualquer query/hash residual e decoda %xx
  try { slug = decodeURIComponent(slug); } catch { /* mantém como veio */ }
  slug = slug.split("?")[0].split("#")[0].trim();

  console.log(`[share-preview ${reqId}] slug recebido: ${JSON.stringify(slug)}`);

  const noCacheHeaders = {
    ...htmlHeaders,
    "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
    "Pragma": "no-cache",
    "Expires": "0",
    "Surrogate-Control": "no-store",
    "CDN-Cache-Control": "no-store",
  };

  const htmlError = (status: number, msg: string) =>
    new Response(
      buildHtml({
        title: "Fique Por Dentro Sergipe",
        description: msg,
        image: DEFAULT_OG_IMAGE,
        articleUrl: SITE_URL,
      }),
      { status, headers: noCacheHeaders },
    );

  if (!slug) {
    console.log(`[share-preview ${reqId}] sem slug — 404`);
    return htmlError(404, "Notícia não encontrada.");
  }

  try {
    // Cliente Supabase recriado por request — sem reuso entre invocações.
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );

    // Filtro ESTRITO por slug exato. Sem order/limit/first. maybeSingle()
    // retorna erro se houver mais de um match, evitando colisão silenciosa.
    const { data: post, error } = await supabase
      .from("posts_public")
      .select("id, slug, title, subtitle, excerpt, cover_image_url, manual_image_url, meta_title, meta_description, ai_seo_title, ai_summary, published_at, tags, category_id, categories:category_id(name)")
      .eq("slug", slug)
      .maybeSingle();

    if (error) {
      console.error(`[share-preview ${reqId}] erro consultando slug=${slug}:`, error.message);
      return htmlError(500, "Erro ao carregar notícia.");
    }

    if (!post) {
      console.log(`[share-preview ${reqId}] nenhuma matéria para slug=${slug} — 404`);
      return htmlError(404, "Notícia não encontrada.");
    }

    // Garantia extra: o slug retornado pelo banco deve bater com o solicitado.
    if (post.slug !== slug) {
      console.error(`[share-preview ${reqId}] slug divergente: pedido=${slug} retornado=${post.slug} — abortando`);
      return htmlError(404, "Notícia não encontrada.");
    }

    const articleUrl = `${SITE_URL}/noticia/${post.slug}`;
    const title = (post as any).ai_seo_title || post.meta_title || post.title;
    const description =
      (post as any).ai_summary ||
      post.meta_description ||
      post.subtitle ||
      post.excerpt ||
      post.title;
    const manualImg = toAbsoluteImage((post as any).manual_image_url);
    const coverImg = toAbsoluteImage((post as any).cover_image_url);
    const ogImageUrl = manualImg
      ?? coverImg
      ?? DEFAULT_OG_IMAGE;
    const image = ogImageUrl;

    console.log(`[share-preview ${reqId}] match post.id=${post.id} slug=${post.slug} og:image=${image}`);

    return new Response(
      buildHtml({
        title,
        description,
        image,
        articleUrl,
        publishedAt: post.published_at,
        category: (post as any).categories?.name,
        tags: post.tags,
      }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "public, max-age=0, must-revalidate",
          "CDN-Cache-Control": "no-store",
          "Vary": "*",
          "X-Share-Preview-Slug": post.slug,
        },
      },
    );
  } catch (e) {
    console.error(`[share-preview ${reqId}] exceção:`, (e as Error).message);
    return htmlError(500, "Erro ao carregar notícia.");
  }
});
