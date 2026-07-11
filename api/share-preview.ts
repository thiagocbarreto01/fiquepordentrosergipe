// Vercel Serverless Function: /api/share-preview?slug=<slug>
//
// Retorna HTML com Open Graph dinâmico para crawlers de redes sociais
// (WhatsApp, Facebook, Telegram, X, etc.) ao compartilhar links de matérias.
// Navegadores humanos são redirecionados via JS para a página real da notícia.

import { createClient } from "@supabase/supabase-js";

const SITE_URL = "https://www.fiquepordentrosergipe.com.br";
const DEFAULT_OG_IMAGE = `${SITE_URL}/og-default.jpg`;

function escapeHtml(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function toAbsoluteHttpsImage(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = String(raw).trim().replace(/&amp;/gi, "&");
  if (!s) return null;
  if (/^https:\/\//i.test(s)) return s;
  if (/^http:\/\//i.test(s)) return s.replace(/^http:\/\//i, "https://");
  if (s.startsWith("//")) return `https:${s}`;
  if (s.startsWith("/")) return `${SITE_URL}${s}`;
  return null;
}

function htmlError(res: any, status: number, message: string) {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("x-content-type-options", "nosniff");
  res.status(status).send(
    `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${escapeHtml(message)}</title></head><body><p>${escapeHtml(message)}</p></body></html>`,
  );
}

export default async function handler(req: any, res: any) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return htmlError(res, 405, "Método não permitido.");
  }

  const rawSlug = (req.query?.slug ?? "") as string | string[];
  const slugParam = Array.isArray(rawSlug) ? rawSlug[0] : rawSlug;
  let slug = "";
  try {
    slug = decodeURIComponent(String(slugParam ?? "").trim());
  } catch {
    slug = String(slugParam ?? "").trim();
  }
  slug = slug.split("?")[0].split("#")[0].trim();

  if (!slug) return htmlError(res, 404, "Notícia não encontrada.");

  const SUPABASE_URL =
    process.env.VITE_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    "";
  const SUPABASE_KEY =
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    "";

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return htmlError(res, 500, "Configuração ausente.");
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const SELECT_COLS =
      "id, slug, title, subtitle, excerpt, cover_image_url, manual_image_url, meta_title, meta_description, ai_seo_title, ai_summary, published_at, tags, category_id";

    // 1) posts_public (view canônica de publicadas)
    let { data: post, error } = await supabase
      .from("posts_public")
      .select(SELECT_COLS)
      .eq("slug", slug)
      .maybeSingle();

    // 2) fallback: tabela posts (apenas publicadas)
    if (!post && !error) {
      const r = await supabase
        .from("posts")
        .select(SELECT_COLS + ", status")
        .eq("slug", slug)
        .eq("status", "publicada")
        .maybeSingle();
      if (r.data) post = r.data as any;
    }

    // 3) fallback: aliases de slug (se a tabela existir)
    if (!post) {
      try {
        const alias = await supabase
          .from("post_slug_aliases")
          .select("post_id")
          .eq("alias", slug)
          .maybeSingle();
        if (alias.data?.post_id) {
          const r = await supabase
            .from("posts_public")
            .select(SELECT_COLS)
            .eq("id", alias.data.post_id)
            .maybeSingle();
          if (r.data) post = r.data as any;
        }
      } catch { /* tabela pode não existir — ignora */ }
    }

    if (error && !post) {
      console.error("[share-preview] erro:", error.message);
      return htmlError(res, 500, "Erro ao carregar notícia.");
    }
    if (!post) {
      return htmlError(res, 404, "Notícia não encontrada.");
    }

    const articleUrl = `${SITE_URL}/noticia/${post.slug}`;
    const proto = (req.headers["x-forwarded-proto"] as string) || "https";
    const host = (req.headers["x-forwarded-host"] as string) || (req.headers.host as string) || "";
    const selfUrl = `${proto}://${host}/api/share-preview?slug=${encodeURIComponent(post.slug)}`;

    const title = (post as any).ai_seo_title || post.meta_title || post.title;
    const description =
      (post as any).ai_summary ||
      post.meta_description ||
      post.subtitle ||
      post.excerpt ||
      post.title;

    const image =
      toAbsoluteHttpsImage((post as any).manual_image_url) ||
      toAbsoluteHttpsImage((post as any).cover_image_url) ||
      DEFAULT_OG_IMAGE;

    const t = escapeHtml(title);
    const d = escapeHtml(description);
    const img = escapeHtml(image);
    const article = escapeHtml(articleUrl);
    const self = escapeHtml(selfUrl);

    const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${t} — Fique Por Dentro Sergipe</title>
<meta name="description" content="${d}" />
<link rel="canonical" href="${self}" />
<meta property="og:type" content="article" />
<meta property="og:site_name" content="Fique Por Dentro Sergipe" />
<meta property="og:locale" content="pt_BR" />
<meta property="og:title" content="${t}" />
<meta property="og:description" content="${d}" />
<meta property="og:url" content="${self}" />
<meta property="og:image" content="${img}" />
<meta property="og:image:secure_url" content="${img}" />
<meta property="og:image:type" content="image/jpeg" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${t}" />
<meta name="twitter:description" content="${d}" />
<meta name="twitter:image" content="${img}" />
</head>
<body>
<p>Redirecionando para <a href="${article}">${t}</a>…</p>
<script>window.location.replace(${JSON.stringify(articleUrl)});</script>
</body>
</html>`;

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("x-content-type-options", "nosniff");
    res.setHeader("Cache-Control", "public, max-age=0, must-revalidate");
    res.status(200).send(html);
  } catch (e) {
    console.error("[share-preview] exceção:", (e as Error).message);
    return htmlError(res, 500, "Erro ao carregar notícia.");
  }
}
