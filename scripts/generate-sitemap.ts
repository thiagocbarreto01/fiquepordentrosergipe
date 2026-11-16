// Runs before `vite dev` and `vite build` (predev/prebuild hooks); writes public/sitemap.xml.
import { writeFileSync } from "fs";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";
import { getBuildSupabaseConfig } from "./supabase-config";

const BASE_URL = "https://www.fiquepordentrosergipe.com.br";

const { url: SUPABASE_URL, key: SUPABASE_ANON_KEY } = getBuildSupabaseConfig();

interface SitemapEntry {
  path: string;
  lastmod?: string;
  changefreq?: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
  priority?: string;
}

function xmlEscape(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function toIsoDate(v: string | null | undefined) {
  if (!v) return undefined;
  const d = new Date(v);
  if (isNaN(d.getTime())) return undefined;
  return d.toISOString();
}

async function main() {
  const entries: SitemapEntry[] = [
    { path: "/", changefreq: "hourly", priority: "1.0" },
    { path: "/ultimas", changefreq: "hourly", priority: "0.9" },
    { path: "/busca", changefreq: "weekly", priority: "0.3" },
    { path: "/denuncias/enviar", changefreq: "monthly", priority: "0.5" },
  ];

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false },
    });

    const { data: cats, error: catsError } = await supabase
      .from("categories")
      .select("slug")
      .order("position", { ascending: true });
    if (catsError) throw catsError;
    for (const c of cats ?? []) {
      if (c?.slug) {
        entries.push({
          path: `/categoria/${c.slug}`,
          changefreq: "daily",
          priority: "0.7",
        });
      }
    }

    const { data: posts, error: postsError } = await supabase
      .from("posts_public" as any)
      .select("slug, published_at, updated_at, created_at")
      .order("published_at", { ascending: false })
      .limit(5000);
    if (postsError) throw postsError;
    for (const p of (posts ?? []) as any[]) {
      if (!p?.slug) continue;
      entries.push({
        path: `/noticia/${p.slug}`,
        lastmod: toIsoDate(p.updated_at || p.published_at || p.created_at),
        changefreq: "weekly",
        priority: "0.8",
      });
    }
  } catch (err) {
    console.warn("[sitemap] backend indisponível; sitemap existente preservado.");
    return;
  }

  const urls = entries.map((e) =>
    [
      `  <url>`,
      `    <loc>${xmlEscape(BASE_URL + e.path)}</loc>`,
      e.lastmod ? `    <lastmod>${e.lastmod}</lastmod>` : null,
      e.changefreq ? `    <changefreq>${e.changefreq}</changefreq>` : null,
      e.priority ? `    <priority>${e.priority}</priority>` : null,
      `  </url>`,
    ]
      .filter(Boolean)
      .join("\n"),
  );

  const xml = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
    ...urls,
    `</urlset>`,
    ``,
  ].join("\n");

  writeFileSync(resolve("public/sitemap.xml"), xml);
  console.log(`[sitemap] sitemap.xml gerado com ${entries.length} URLs`);
}

main().catch((err) => {
  console.error("[sitemap] erro fatal:", err);
  // NÃ£o quebrar o build por causa do sitemap
  process.exit(0);
});
