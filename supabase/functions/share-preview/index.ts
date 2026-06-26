// Edge function que entrega HTML com Open Graph dinâmico para crawlers
// de redes sociais (WhatsApp, Telegram, Facebook, X) ao compartilhar
// links de matérias. Usuários reais são redirecionados imediatamente
// para a página da matéria no portal.
//
// Uso: https://<projeto>.functions.supabase.co/share-preview?slug=<slug>
//      ou /share-preview/<slug>
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const SITE_URL = "https://fiquepordentrosergipe.lovable.app";

function toAbsoluteImage(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s) return null;
  if (/^https:\/\//i.test(s)) return s;
  if (/^http:\/\//i.test(s)) return s.replace(/^http:\/\//i, "https://");
  if (s.startsWith("//")) return `https:${s}`;
  if (s.startsWith("/")) return `${SITE_URL}${s}`;
  return null;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildHtml(opts: {
  title: string;
  description: string;
  image: string | null;
  url: string;
  publishedAt?: string | null;
  category?: string | null;
  tags?: string[] | null;
}) {
  const { title, description, image, url, publishedAt, category, tags } = opts;
  const t = escapeHtml(title);
  const d = escapeHtml(description);
  const u = escapeHtml(url);
  const img = image ? escapeHtml(image) : null;
  const ld: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    headline: title,
    description,
    datePublished: publishedAt ?? undefined,
    articleSection: category ?? "Geral",
    keywords: (tags ?? []).join(", "),
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    publisher: {
      "@type": "NewsMediaOrganization",
      name: "Fique Por Dentro Sergipe",
    },
  };
  if (image) ld.image = [image];

  const ogImageTags = img
    ? `<meta property="og:image" content="${img}" />
<meta property="og:image:secure_url" content="${img}" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta property="og:image:alt" content="${t}" />
<meta name="twitter:image" content="${img}" />`
    : "";

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${t} — Fique Por Dentro Sergipe</title>
<meta name="description" content="${d}" />
<link rel="canonical" href="${u}" />
<meta property="og:type" content="article" />
<meta property="og:site_name" content="Fique Por Dentro Sergipe" />
<meta property="og:locale" content="pt_BR" />
<meta property="og:title" content="${t}" />
<meta property="og:description" content="${d}" />
<meta property="og:url" content="${u}" />
${ogImageTags}
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${t}" />
<meta name="twitter:description" content="${d}" />
<meta http-equiv="refresh" content="0; url=${u}" />
<script type="application/ld+json">${JSON.stringify(ld)}</script>
</head>
<body>
<p>Redirecionando para <a href="${u}">${t}</a>…</p>
<script>window.location.replace(${JSON.stringify(url)});</script>
</body>
</html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

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

  const html5xx = (msg: string) =>
    new Response(
      buildHtml({
        title: "Fique Por Dentro Sergipe",
        description: msg,
        image: null,
        url: SITE_URL,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } },
    );

  if (!slug) {
    console.log(`[share-preview ${reqId}] sem slug — retornando fallback institucional`);
    return html5xx("Portal de notícias de Sergipe, Aracaju, Brasil e mundo.");
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
      .select("id, slug, title, subtitle, excerpt, cover_image_url, meta_title, meta_description, ai_seo_title, ai_summary, published_at, tags, category_id, categories:category_id(name)")
      .eq("slug", slug)
      .maybeSingle();

    if (error) {
      console.error(`[share-preview ${reqId}] erro consultando slug=${slug}:`, error.message);
      return html5xx("Erro ao carregar notícia.");
    }

    if (!post) {
      console.log(`[share-preview ${reqId}] nenhuma matéria para slug=${slug}`);
      return html5xx("Notícia não encontrada.");
    }

    // Garantia extra: o slug retornado pelo banco deve bater com o solicitado.
    if (post.slug !== slug) {
      console.error(`[share-preview ${reqId}] slug divergente: pedido=${slug} retornado=${post.slug} — abortando para evitar vazamento`);
      return html5xx("Notícia não encontrada.");
    }

    const articleUrl = `${SITE_URL}/noticia/${post.slug}`;
    const title = (post as any).ai_seo_title || post.meta_title || post.title;
    const description =
      (post as any).ai_summary ||
      post.meta_description ||
      post.subtitle ||
      post.excerpt ||
      post.title;
    // Imagem EXCLUSIVAMENTE da própria matéria. Sem fallback genérico/Lovable.
    const image = toAbsoluteImage(post.cover_image_url);

    console.log(`[share-preview ${reqId}] match post.id=${post.id} slug=${post.slug} og:image=${image ?? "(omitida)"}`);

    return new Response(
      buildHtml({
        title,
        description,
        image,
        url: articleUrl,
        publishedAt: post.published_at,
        category: (post as any).categories?.name,
        tags: post.tags,
      }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "text/html; charset=utf-8",
          // Cache por slug — chaves diferentes não compartilham resposta.
          "Cache-Control": "public, max-age=120, s-maxage=300",
          "Vary": "Accept, Accept-Encoding",
          "X-Share-Preview-Slug": post.slug,
        },
      },
    );
  } catch (e) {
    console.error(`[share-preview ${reqId}] exceção:`, (e as Error).message);
    return html5xx("Erro ao carregar notícia.");
  }
});
