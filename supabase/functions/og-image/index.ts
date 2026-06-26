// Renderiza um card editorial 1200x630 (Open Graph 1.91:1) com a capa da
// matéria, gradiente escuro inferior e título sobreposto. Salva o PNG em
// storage (bucket `media`) e grava em posts.share_image_url para reuso.
//
// Uso: GET /og-image?slug=<slug>[&force=1]
// Redireciona 302 para o PNG final em storage.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { Resvg, initWasm } from "https://esm.sh/@resvg/resvg-wasm@2.6.2";

const SITE_URL = "https://fiquepordentrosergipe.lovable.app";
const BRAND = "FIQUE POR DENTRO SERGIPE";
const BRAND_ACCENT = "#c8102e";

let wasmReady: Promise<void> | null = null;
async function ensureWasm() {
  if (!wasmReady) {
    wasmReady = (async () => {
      const res = await fetch("https://esm.sh/@resvg/resvg-wasm@2.6.2/index_bg.wasm");
      const buf = await res.arrayBuffer();
      await initWasm(buf);
    })();
  }
  return wasmReady;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

function escapeXml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function clip(s: string, max = 70) {
  const t = (s ?? "").trim().replace(/\s+/g, " ");
  if (t.length <= max) return t;
  return t.slice(0, max - 1).replace(/\s+\S*$/, "") + "…";
}

// Quebra simples por largura aproximada (px) — fonte ~52px, ~28 chars/linha.
function wrapTitle(title: string, perLine = 28, maxLines = 3): string[] {
  const words = clip(title, 70).split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (next.length > perLine && cur) {
      lines.push(cur);
      cur = w;
      if (lines.length === maxLines - 1) break;
    } else {
      cur = next;
    }
  }
  if (cur && lines.length < maxLines) lines.push(cur);
  return lines.slice(0, maxLines);
}

async function fetchImageAsDataUrl(url: string): Promise<string | null> {
  try {
    const r = await fetch(url, { redirect: "follow" });
    if (!r.ok) return null;
    const ct = r.headers.get("content-type") || "image/jpeg";
    const buf = new Uint8Array(await r.arrayBuffer());
    let bin = "";
    for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
    return `data:${ct};base64,${btoa(bin)}`;
  } catch {
    return null;
  }
}

function buildSvg(opts: { title: string; category?: string | null; imageDataUrl: string | null }) {
  const { title, category, imageDataUrl } = opts;
  const W = 1200, H = 630;
  const lines = wrapTitle(title, 28, 3);
  const lineH = 64;
  const totalH = lines.length * lineH;
  const baseY = H - 80 - totalH + lineH * 0.8;

  const bg = imageDataUrl
    ? `<image href="${imageDataUrl}" x="0" y="0" width="${W}" height="${H}" preserveAspectRatio="xMidYMid slice"/>`
    : `<rect width="${W}" height="${H}" fill="#0a1f44"/>`;

  const cat = category ? escapeXml(category.toUpperCase()) : "NOTÍCIA";

  const titleSvg = lines
    .map((ln, i) => `<text x="60" y="${baseY + i * lineH}" font-family="Georgia, 'Times New Roman', serif" font-weight="700" font-size="56" fill="#ffffff">${escapeXml(ln)}</text>`)
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#000" stop-opacity="0"/>
      <stop offset="45%" stop-color="#000" stop-opacity="0.15"/>
      <stop offset="100%" stop-color="#000" stop-opacity="0.92"/>
    </linearGradient>
  </defs>
  ${bg}
  <rect width="${W}" height="${H}" fill="url(#g)"/>
  <rect x="0" y="0" width="8" height="${H}" fill="${BRAND_ACCENT}"/>
  <g>
    <rect x="60" y="${baseY - totalH - 50}" width="${cat.length * 13 + 36}" height="34" rx="4" fill="${BRAND_ACCENT}"/>
    <text x="${60 + 18}" y="${baseY - totalH - 26}" font-family="Inter, Arial, sans-serif" font-weight="700" font-size="18" fill="#ffffff" letter-spacing="1.5">${cat}</text>
  </g>
  ${titleSvg}
  <text x="60" y="${H - 32}" font-family="Inter, Arial, sans-serif" font-weight="600" font-size="20" fill="#ffffff" opacity="0.92" letter-spacing="2">${BRAND}</text>
</svg>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const reqId = crypto.randomUUID();
  const url = new URL(req.url);
  let slug = (url.searchParams.get("slug") ?? "").trim();
  try { slug = decodeURIComponent(slug); } catch { /* keep */ }
  slug = slug.split("?")[0].split("#")[0].trim();
  const force = url.searchParams.get("force") === "1";

  if (!slug) {
    return new Response("missing slug", { status: 400, headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const { data: post, error } = await supabase
    .from("posts")
    .select("id, slug, title, cover_image_url, share_image_url, share_image_generated_at, updated_at, category_id, categories:category_id(name)")
    .eq("slug", slug)
    .maybeSingle();

  if (error || !post || post.slug !== slug) {
    console.error(`[og-image ${reqId}] post não encontrado slug=${slug}`, error?.message);
    return new Response("not found", { status: 404, headers: corsHeaders });
  }

  // Cache hit: já temos imagem otimizada e o post não foi alterado depois.
  if (!force && post.share_image_url && post.share_image_generated_at
      && new Date(post.share_image_generated_at) >= new Date(post.updated_at ?? 0)) {
    return Response.redirect(post.share_image_url, 302);
  }

  try {
    await ensureWasm();
    const imageDataUrl = post.cover_image_url ? await fetchImageAsDataUrl(post.cover_image_url) : null;
    const svg = buildSvg({
      title: post.title ?? "",
      category: (post as any).categories?.name ?? null,
      imageDataUrl,
    });

    const resvg = new Resvg(svg, {
      fitTo: { mode: "width", value: 1200 },
      background: "#0a1f44",
    });
    const png = resvg.render().asPng();

    const ts = Date.now();
    const path = `og/${post.id}-${ts}.png`;
    const { error: upErr } = await supabase.storage
      .from("media")
      .upload(path, png, { contentType: "image/png", cacheControl: "31536000", upsert: true });
    if (upErr) throw upErr;

    const { data: pub } = supabase.storage.from("media").getPublicUrl(path);
    const publicUrl = pub.publicUrl;

    await supabase
      .from("posts")
      .update({ share_image_url: publicUrl, share_image_generated_at: new Date().toISOString() })
      .eq("id", post.id);

    console.log(`[og-image ${reqId}] gerado slug=${slug} -> ${publicUrl}`);
    return Response.redirect(publicUrl, 302);
  } catch (e) {
    console.error(`[og-image ${reqId}] falha:`, (e as Error).message);
    // Fallback: redireciona para a capa original
    if (post.cover_image_url) return Response.redirect(post.cover_image_url, 302);
    return new Response("render failed", { status: 500, headers: corsHeaders });
  }
});
