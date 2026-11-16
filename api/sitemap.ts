// Vercel Serverless Function: /sitemap.xml (via rewrite em vercel.json → /api/sitemap)
//
// Gera o sitemap em tempo de requisição, para que notícias recém-publicadas apareçam
// sem precisar de novo deploy. Usa apenas a chave pública (publishable/anon) e as
// leituras públicas (categories, posts_public). Cache de borda curto.

import { createClient } from "@supabase/supabase-js";

const SITE_URL = "https://www.fiquepordentrosergipe.com.br";

interface Entry {
  path: string;
  lastmod?: string;
  changefreq: string;
  priority: string;
}

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function iso(v: string | null | undefined): string | undefined {
  if (!v) return undefined;
  const d = new Date(v);
  return isNaN(d.getTime()) ? undefined : d.toISOString();
}

export default async function handler(req: any, res: any) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD");
    return res.status(405).end();
  }

  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
  const key =
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    "";

  const entries: Entry[] = [
    { path: "/", changefreq: "hourly", priority: "1.0" },
    { path: "/ultimas", changefreq: "hourly", priority: "0.9" },
    { path: "/busca", changefreq: "weekly", priority: "0.3" },
    { path: "/denuncias/enviar", changefreq: "monthly", priority: "0.5" },
  ];

  if (url && key) {
    try {
      const supabase = createClient(url, key, { auth: { persistSession: false } });

      const { data: cats } = await supabase
        .from("categories")
        .select("slug")
        .order("position", { ascending: true });
      for (const c of cats ?? []) {
        if (c?.slug) entries.push({ path: `/categoria/${c.slug}`, changefreq: "daily", priority: "0.7" });
      }

      const { data: posts } = await supabase
        .from("posts_public" as any)
        .select("slug, published_at, updated_at, created_at")
        .order("published_at", { ascending: false })
        .limit(5000);
      for (const p of (posts ?? []) as any[]) {
        if (!p?.slug) continue;
        entries.push({
          path: `/noticia/${p.slug}`,
          lastmod: iso(p.updated_at || p.published_at || p.created_at),
          changefreq: "weekly",
          priority: "0.8",
        });
      }
    } catch {
      // Falha do backend: devolve ao menos as páginas fixas.
    }
  }

  const body =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    entries
      .map((e) =>
        [
          "  <url>",
          `    <loc>${xmlEscape(SITE_URL + e.path)}</loc>`,
          e.lastmod ? `    <lastmod>${e.lastmod}</lastmod>` : null,
          `    <changefreq>${e.changefreq}</changefreq>`,
          `    <priority>${e.priority}</priority>`,
          "  </url>",
        ]
          .filter(Boolean)
          .join("\n"),
      )
      .join("\n") +
    `\n</urlset>\n`;

  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.setHeader("Cache-Control", "public, s-maxage=600, stale-while-revalidate=3600");
  res.setHeader("x-content-type-options", "nosniff");
  return res.status(200).send(body);
}
