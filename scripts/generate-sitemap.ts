// Runs before `vite dev` and `vite build` (predev/prebuild hooks); writes public/sitemap.xml.
import { writeFileSync } from "fs";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";

const BASE_URL = "https://www.fiquepordentrosergipe.com.br";

const SUPABASE_URL =
  process.env.VITE_SUPABASE_URL || "https://faubrqvkzgyfryfjylnb.supabase.co";
const SUPABASE_ANON_KEY =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZhdWJycXZremd5ZnJ5Zmp5bG5iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA2MDA2MTgsImV4cCI6MjA5NjE3NjYxOH0.bY4KIW1Hh2O1s6zxTHXkrhKDNGqHKyGyMIN74SKC1uI";

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

    const { data: cats } = await supabase
      .from("categories")
      .select("slug")
      .order("position", { ascending: true });
    for (const c of cats ?? []) {
      if (c?.slug) {
        entries.push({
          path: `/categoria/${c.slug}`,
          changefreq: "daily",
          priority: "0.7",
        });
      }
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
        lastmod: toIsoDate(p.updated_at || p.published_at || p.created_at),
        changefreq: "weekly",
        priority: "0.8",
      });
    }
  } catch (err) {
    console.warn("[sitemap] falha ao buscar dados do Supabase, gerando somente rotas fixas:", err);
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
  // Não quebrar o build por causa do sitemap
  process.exit(0);
});
