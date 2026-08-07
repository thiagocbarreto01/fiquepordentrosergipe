// Runs after `vite build`. Reads dist/index.html and generates per-route static
// HTML with real SEO tags (title, description, canonical, og:*, twitter:*, JSON-LD).
// Output layout (served by Vercel as directory index for the route):
//   dist/noticia/<slug>/index.html
//   dist/categoria/<slug>/index.html
//   dist/ultimas/index.html
import { writeFileSync, mkdirSync, readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { createClient } from "@supabase/supabase-js";

const SITE_ORIGIN = "https://www.fiquepordentrosergipe.com.br";
const SITE_NAME = "Fique Por Dentro Sergipe";
const DEFAULT_OG_IMAGE = `${SITE_ORIGIN}/og-default.jpg`;
const LOGO_URL = `${SITE_ORIGIN}/favicon.png`;

const SUPABASE_URL =
  process.env.VITE_SUPABASE_URL || "https://faubrqvkzgyfryfjylnb.supabase.co";
const SUPABASE_ANON_KEY =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZhdWJycXZremd5ZnJ5Zmp5bG5iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA2MDA2MTgsImV4cCI6MjA5NjE3NjYxOH0.bY4KIW1Hh2O1s6zxTHXkrhKDNGqHKyGyMIN74SKC1uI";

const DIST_INDEX = resolve("dist/index.html");

function esc(s: string) {
  return (s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function absoluteImage(url: string | null | undefined): string | null {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url.replace(/^http:\/\//i, "https://");
  if (url.startsWith("/")) return `${SITE_ORIGIN}${url}`;
  return null;
}

type Meta = {
  title: string;
  description: string;
  canonical: string;
  ogType?: "website" | "article";
  ogImage?: string | null;
  /** og:url/twitter:url quando diferente do canonical (ex.: páginas /s/<slug>). */
  ogUrl?: string;
  /** URL para redirecionar humanos (meta refresh + JS). Crawlers só leem as tags. */
  redirectUrl?: string;
  jsonLd?: object[];
};

function renderHtml(template: string, meta: Meta): string {
  let html = template;

  // Remove existing tags we control (from index.html defaults) to avoid duplicates.
  const remove = [
    /<title>[\s\S]*?<\/title>/i,
    /<meta\s+name=["']description["'][^>]*>\s*/gi,
    /<link\s+rel=["']canonical["'][^>]*>\s*/gi,
    /<meta\s+property=["']og:(?:type|url|title|description|image|image:secure_url|site_name|locale)["'][^>]*>\s*/gi,
    /<meta\s+name=["']twitter:(?:card|title|description|image|url)["'][^>]*>\s*/gi,
    /<script\s+type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>\s*/gi,
  ];
  for (const re of remove) html = html.replace(re, "");

  const ogType = meta.ogType || "website";
  const img = meta.ogImage || DEFAULT_OG_IMAGE;
  const ogUrl = meta.ogUrl || meta.canonical;

  const tags: string[] = [
    `<title>${esc(meta.title)}</title>`,
    `<meta name="description" content="${esc(meta.description)}">`,
    `<link rel="canonical" href="${esc(meta.canonical)}">`,
    `<meta property="og:type" content="${ogType}">`,
    `<meta property="og:site_name" content="${esc(SITE_NAME)}">`,
    `<meta property="og:locale" content="pt_BR">`,
    `<meta property="og:url" content="${esc(ogUrl)}">`,
    `<meta property="og:title" content="${esc(meta.title)}">`,
    `<meta property="og:description" content="${esc(meta.description)}">`,
    `<meta property="og:image" content="${esc(img)}">`,
    `<meta property="og:image:secure_url" content="${esc(img)}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:url" content="${esc(ogUrl)}">`,
    `<meta name="twitter:title" content="${esc(meta.title)}">`,
    `<meta name="twitter:description" content="${esc(meta.description)}">`,
    `<meta name="twitter:image" content="${esc(img)}">`,
  ];

  // Redireciona humanos para a matéria oficial. Meta refresh no <head> +
  // fallback JS no fim do <body>. Crawlers sociais ignoram e só leem as tags OG.
  if (meta.redirectUrl) {
    const target = esc(meta.redirectUrl);
    tags.push(`<meta http-equiv="refresh" content="0;url=${target}">`);
  }

  // Base JSON-LD: WebSite + NewsMediaOrganization (always) + page-specific.
  const baseLd = [
    {
      "@context": "https://schema.org",
      "@type": "NewsMediaOrganization",
      name: SITE_NAME,
      url: SITE_ORIGIN,
      logo: { "@type": "ImageObject", url: LOGO_URL },
    },
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: SITE_NAME,
      url: SITE_ORIGIN,
      potentialAction: {
        "@type": "SearchAction",
        target: `${SITE_ORIGIN}/busca?q={search_term_string}`,
        "query-input": "required name=search_term_string",
      },
    },
  ];
  const allLd = [...baseLd, ...(meta.jsonLd || [])];
  for (const obj of allLd) {
    tags.push(
      `<script type="application/ld+json">${JSON.stringify(obj).replace(/</g, "\\u003c")}</script>`,
    );
  }

  const injection = tags.join("\n    ") + "\n  ";
  html = html.replace(/<\/head>/i, `    ${injection}</head>`);

  if (meta.redirectUrl) {
    const redirectScript =
      `<p>Redirecionando para <a href="${esc(meta.redirectUrl)}">${esc(meta.title)}</a>…</p>\n` +
      `<script>window.location.replace(${JSON.stringify(meta.redirectUrl)});</script>\n`;
    html = html.replace(/<\/body>/i, `${redirectScript}</body>`);
  }
  return html;
}

function writeRoute(routePath: string, html: string) {
  // routePath like "/noticia/foo" or "/" -> write dist/<path>/index.html
  const clean = routePath === "/" ? "/" : routePath.replace(/\/+$/, "");
  const relative = clean === "/" ? "index.html" : `${clean.replace(/^\//, "")}/index.html`;
  const outPath = resolve("dist", relative);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, html);
}

async function main() {
  if (!existsSync(DIST_INDEX)) {
    console.warn("[prerender] dist/index.html não encontrado, pulando");
    return;
  }
  const template = readFileSync(DIST_INDEX, "utf8");

  // Home
  const homeMeta: Meta = {
    title: "Fique Por Dentro Sergipe — Notícias de Sergipe, Aracaju, Brasil e Mundo",
    description:
      "Portal Fique Por Dentro Sergipe: cobertura em tempo real de Sergipe, Aracaju, política, polícia, denúncias, esportes, Brasil e mundo.",
    canonical: `${SITE_ORIGIN}/`,
    ogType: "website",
    ogImage: DEFAULT_OG_IMAGE,
  };
  const homeHtml = renderHtml(template, homeMeta);
  writeRoute("/", homeHtml);

  // /ultimas
  writeRoute(
    "/ultimas",
    renderHtml(template, {
      title: "Últimas notícias — Fique Por Dentro Sergipe",
      description:
        "Todas as últimas notícias de Sergipe, Aracaju, Brasil e mundo, atualizadas em tempo real.",
      canonical: `${SITE_ORIGIN}/ultimas`,
      ogType: "website",
    }),
  );

  let categoryCount = 0;
  let newsCount = 0;
  let shareCount = 0;

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false },
    });

    // Categorias
    const { data: cats } = await supabase
      .from("categories")
      .select("slug,name,description")
      .order("position", { ascending: true });
    const catBySlug = new Map<string, { name: string; description: string | null }>();
    for (const c of cats ?? []) {
      if (!c?.slug) continue;
      catBySlug.set(c.slug, { name: c.name, description: (c as any).description ?? null });
      const canonical = `${SITE_ORIGIN}/categoria/${c.slug}`;
      const title = `${c.name} — Notícias — Fique Por Dentro Sergipe`;
      const description =
        (c as any).description?.trim() ||
        `Últimas notícias de ${c.name} no portal Fique Por Dentro Sergipe.`;
      writeRoute(
        `/categoria/${c.slug}`,
        renderHtml(template, {
          title,
          description,
          canonical,
          ogType: "website",
        }),
      );
      categoryCount++;
    }

    // Notícias publicadas
    const { data: posts, error } = await supabase
      .from("posts_public" as any)
      .select(
        "slug,title,subtitle,excerpt,meta_title,meta_description,ai_seo_title,ai_summary,cover_image_url,manual_image_url,image_credit,image_caption,published_at,updated_at,created_at,category_id,tags",
      )
      .order("published_at", { ascending: false })
      .limit(5000);
    if (error) throw error;

    for (const p of (posts ?? []) as any[]) {
      if (!p?.slug) continue;
      const canonical = `${SITE_ORIGIN}/noticia/${p.slug}`;
      const seoTitle = p.ai_seo_title || p.meta_title || p.title;
      const seoDesc =
        p.ai_summary ||
        p.meta_description ||
        p.subtitle ||
        (p.excerpt ? String(p.excerpt).slice(0, 200) : "") ||
        p.title;
      const title = `${seoTitle} — Fique Por Dentro Sergipe`;
      const img = absoluteImage(p.manual_image_url || p.cover_image_url);
      const category = catBySlug.get(
        [...catBySlug.entries()].find(() => false)?.[0] || "",
      );
      const cat = p.category_id
        ? [...catBySlug.values()].find(
            (_v, i) => [...catBySlug.keys()][i] === undefined,
          ) || null
        : null;
      void category; void cat;

      const newsArticle: Record<string, unknown> = {
        "@context": "https://schema.org",
        "@type": "NewsArticle",
        headline: p.title,
        description: seoDesc,
        datePublished: p.published_at ?? p.created_at,
        dateModified: p.updated_at ?? p.published_at ?? p.created_at,
        mainEntityOfPage: { "@type": "WebPage", "@id": canonical },
        author: { "@type": "Organization", name: `Redação ${SITE_NAME}` },
        publisher: {
          "@type": "NewsMediaOrganization",
          name: SITE_NAME,
          url: SITE_ORIGIN,
          logo: { "@type": "ImageObject", url: LOGO_URL },
        },
        keywords: Array.isArray(p.tags) ? p.tags.join(", ") : undefined,
      };
      if (img) newsArticle.image = [img];

      writeRoute(
        `/noticia/${p.slug}`,
        renderHtml(template, {
          title,
          description: seoDesc,
          canonical,
          ogType: "article",
          ogImage: img,
          jsonLd: [newsArticle],
        }),
      );
      newsCount++;
    }
  } catch (err) {
    console.warn("[prerender] falha ao consultar Supabase; rotas dinâmicas não pré-renderizadas:", err);
  }

  console.log(
    `[prerender] concluído: 1 home + 1 /ultimas + ${categoryCount} categorias + ${newsCount} notícias`,
  );
}

main().catch((err) => {
  console.error("[prerender] erro fatal:", err);
  // Nunca quebrar o build por causa do prerender
  process.exit(0);
});
