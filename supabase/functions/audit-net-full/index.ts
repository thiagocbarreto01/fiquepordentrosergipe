// F3D.2B — auditoria temporária de compatibilidade completa (feed/artigo/imagem).
// Autenticada por JWT staff. NÃO persiste dados. NÃO integra ao capture-sources.
// Deve ser removida ao final da F3D.2B.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import {
  safeFetch,
  SafeFetchError,
  type AllowedHost,
  type Purpose,
  type ResponseKind,
} from "../capture-sources/safe-fetch.ts";
import { authenticateRequest } from "../capture-sources/auth.ts";

const HONEST_UA =
  "FiquePorDentroSE-Aggregator/1.0 (+https://fiquepordentrosergipe.lovable.app)";

type StepResult = {
  step: string;
  ok: boolean;
  status?: number;
  mime?: string | null;
  bytes?: number;
  ms?: number;
  finalHostname?: string;
  redirects?: number;
  code?: string;
  message?: string;
  magic?: string;
  extractedUrlHost?: string;
};

async function runSafe(
  url: string,
  args: {
    sourceId: string;
    hostPurpose: Purpose;
    responseKind: ResponseKind;
    hosts: AllowedHost[];
    timeoutMs?: number;
    ua?: string;
  },
): Promise<StepResult> {
  const t0 = Date.now();
  try {
    const r = await safeFetch(url, {
      sourceId: args.sourceId,
      hostPurpose: args.hostPurpose,
      responseKind: args.responseKind,
      allowedHosts: args.hosts,
      timeoutMs: args.timeoutMs ?? 15_000,
      userAgent: args.ua ?? HONEST_UA,
    });
    const ms = Date.now() - t0;
    let magic: string | undefined;
    if (args.responseKind === "image" && r.bytes.length >= 12) {
      magic = detectImageMagic(r.bytes);
    }
    return {
      step: `${args.hostPurpose}/${args.responseKind}`,
      ok: true,
      status: r.status,
      mime: r.contentType,
      bytes: r.bytes.byteLength,
      ms,
      finalHostname: r.finalHostname,
      redirects: r.redirectCount,
      magic,
    };
  } catch (e) {
    const ms = Date.now() - t0;
    if (e instanceof SafeFetchError) {
      return { step: `${args.hostPurpose}/${args.responseKind}`, ok: false, ms, code: e.code, message: e.message };
    }
    return { step: `${args.hostPurpose}/${args.responseKind}`, ok: false, ms, code: "unknown", message: "erro desconhecido" };
  }
}

function detectImageMagic(b: Uint8Array): string {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpeg";
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "png";
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) return "gif";
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "webp";
  return "unknown";
}

function decode(b: Uint8Array): string {
  try { return new TextDecoder("utf-8", { fatal: false }).decode(b); }
  catch { return ""; }
}

function extractFirstArticleUrl(body: string, kind: ResponseKind, base: URL): string | null {
  if (kind === "feed") {
    // RSS/Atom: <link>URL</link> ou <link href="URL"/>
    const rss = body.match(/<item[^>]*>[\s\S]*?<link[^>]*>([^<]+)<\/link>/i);
    if (rss?.[1]) return rss[1].trim();
    const atom = body.match(/<entry[^>]*>[\s\S]*?<link[^>]*\shref=["']([^"']+)["']/i);
    if (atom?.[1]) return atom[1].trim();
  }
  // HTML: primeiro <a href> que aparente ser artigo (mesmo host, path com /noticia|/post|/materia ou > 20 chars)
  const anchors = [...body.matchAll(/<a[^>]+href=["']([^"'#]+)["'][^>]*>/gi)];
  for (const m of anchors) {
    try {
      const u = new URL(m[1], base);
      if (u.protocol !== "https:") continue;
      if (u.hostname === base.hostname || u.hostname === "www." + base.hostname || "www." + u.hostname === base.hostname) {
        if (u.pathname.length > 15 && !/\.(jpg|png|css|js|pdf)$/i.test(u.pathname)) return u.toString();
      }
    } catch { /* noop */ }
  }
  return null;
}

function extractFirstImageUrl(body: string, base: URL): string | null {
  // og:image primeiro
  const og = body.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
          || body.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
  if (og?.[1]) { try { return new URL(og[1], base).toString(); } catch { /* */ } }
  // enclosure em RSS
  const enc = body.match(/<enclosure[^>]+url=["']([^"']+\.(?:jpe?g|png|webp|gif))["']/i);
  if (enc?.[1]) { try { return new URL(enc[1], base).toString(); } catch { /* */ } }
  // primeiro img src que seja imagem HTTPS
  const imgs = [...body.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)];
  for (const m of imgs) {
    try {
      const u = new URL(m[1], base);
      if (u.protocol === "https:" && /\.(jpe?g|png|webp|gif)(\?|$)/i.test(u.pathname)) return u.toString();
    } catch { /* */ }
  }
  return null;
}

async function auditSource(
  src: { id: string; name: string; source_type: string; url: string },
  hosts: AllowedHost[],
): Promise<Record<string, unknown>> {
  const listingKind: ResponseKind = src.source_type === "site" ? "html" : "feed";
  const feed = await runSafe(src.url, { sourceId: src.id, hostPurpose: "feed", responseKind: listingKind, hosts });
  const out: Record<string, unknown> = { source: src.name, id: src.id, type: src.source_type, url: src.url, feed };

  if (!feed.ok) return out;

  // Refetch to parse (we already have bytes but not returned — refetch small)
  // Optimization: refetch since safeFetch didn't return bytes in StepResult.
  let bodyText = "";
  try {
    const r = await safeFetch(src.url, { sourceId: src.id, hostPurpose: "feed", responseKind: listingKind, allowedHosts: hosts, userAgent: HONEST_UA });
    bodyText = decode(r.bytes);
  } catch { /* noop */ }

  const baseUrl = new URL(src.url);
  const articleUrl = extractFirstArticleUrl(bodyText, listingKind, baseUrl);
  out.articleUrl = articleUrl ? new URL(articleUrl).hostname : null;

  if (!articleUrl) {
    out.article = { step: "article/html", ok: false, code: "no_link_found", message: "Nenhum link de artigo extraído." };
    return out;
  }

  const article = await runSafe(articleUrl, { sourceId: src.id, hostPurpose: "article", responseKind: "html", hosts });
  out.article = article;

  if (!article.ok) return out;

  // Refetch article to extract image
  let articleBody = "";
  try {
    const r = await safeFetch(articleUrl, { sourceId: src.id, hostPurpose: "article", responseKind: "html", allowedHosts: hosts, userAgent: HONEST_UA });
    articleBody = decode(r.bytes);
  } catch { /* noop */ }

  // Try image from article; fallback to feed
  const imgUrl = extractFirstImageUrl(articleBody, new URL(articleUrl)) || extractFirstImageUrl(bodyText, baseUrl);
  out.imageUrl = imgUrl ? new URL(imgUrl).hostname : null;

  if (!imgUrl) {
    out.image = { step: "media/image", ok: false, code: "no_image_found", message: "Nenhuma URL de imagem extraída." };
    return out;
  }

  const image = await runSafe(imgUrl, { sourceId: src.id, hostPurpose: "media", responseKind: "image", hosts });
  out.image = image;

  return out;
}

async function investigateFailing(
  src: { id: string; name: string; source_type: string; url: string },
  hosts: AllowedHost[],
): Promise<Record<string, unknown>> {
  const name = src.name;
  const listingKind: ResponseKind = src.source_type === "site" ? "html" : "feed";

  if (name === "A8SE" || name === "Faxaju") {
    // A: comparar UA default (raw fetch) vs safeFetch com UA honesto
    const rawT0 = Date.now();
    let rawStatus: number | string = "n/a";
    try {
      const r = await fetch(src.url, { redirect: "manual" });
      rawStatus = r.status;
      try { await r.body?.cancel(); } catch { /* */ }
    } catch { rawStatus = "error"; }
    const rawMs = Date.now() - rawT0;
    const safe = await runSafe(src.url, { sourceId: src.id, hostPurpose: "feed", responseKind: listingKind, hosts });
    return { source: name, category: "WAF/403", rawFetch: { status: rawStatus, ms: rawMs }, safeFetch: safe };
  }
  if (name === "F5 News") {
    const attempts: StepResult[] = [];
    for (let i = 0; i < 3; i++) attempts.push(await runSafe(src.url, { sourceId: src.id, hostPurpose: "feed", responseKind: listingKind, hosts, timeoutMs: 15_000 }));
    const extended = await runSafe(src.url, { sourceId: src.id, hostPurpose: "feed", responseKind: listingKind, hosts, timeoutMs: 30_000 });
    return { source: name, category: "timeout", attempts_15s: attempts, attempt_30s_audit_only: extended };
  }
  if (name === "Polícia Civil Sergipe") {
    const resolved: { family: string; count: number; error?: string }[] = [];
    for (let i = 0; i < 3; i++) {
      try {
        const a = await Deno.resolveDns("pc.se.gov.br", "A");
        resolved.push({ family: "A", count: a.length });
      } catch (e) { resolved.push({ family: "A", count: 0, error: (e as Error).message }); }
      try {
        const aaaa = await Deno.resolveDns("pc.se.gov.br", "AAAA");
        resolved.push({ family: "AAAA", count: aaaa.length });
      } catch (e) { resolved.push({ family: "AAAA", count: 0, error: (e as Error).message }); }
    }
    return { source: name, category: "DNS", attempts: resolved, note: "IPs omitidos por privacidade." };
  }
  if (name === "Prefeitura de Aracaju" || name === "SSP Sergipe") {
    // Tratar como site listagem HTML
    const audit = await auditSource(src, hosts);
    // Detectar se listagem tem links reais
    let hasArticles = false;
    if ((audit.feed as StepResult)?.ok) {
      try {
        const r = await safeFetch(src.url, { sourceId: src.id, hostPurpose: "feed", responseKind: "html", allowedHosts: hosts, userAgent: HONEST_UA });
        const body = decode(r.bytes);
        hasArticles = /<a[^>]+href=["'][^"']*\/(noticia|materia|post|not[iú]cias?\/)/i.test(body);
      } catch { /* */ }
    }
    return { source: name, category: name === "SSP Sergipe" ? "site oficial" : "site municipal", audit, hasArticleLinks: hasArticles };
  }
  if (name === "TJSE") {
    const current = await runSafe(src.url, { sourceId: src.id, hostPurpose: "feed", responseKind: "html", hosts });
    // Candidata: agencia.tjse.jus.br — NÃO está na allowlist. Fazer raw fetch controlado
    // apenas para relatar disponibilidade estrutural (leitura, sem persistência).
    const candidate = "https://agencia.tjse.jus.br/";
    let candStatus: number | string = "n/a";
    let candMime = "";
    let candMs = 0;
    const cT0 = Date.now();
    try {
      const r = await fetch(candidate, { redirect: "follow", headers: { "User-Agent": HONEST_UA } });
      candStatus = r.status;
      candMime = r.headers.get("content-type") ?? "";
      const body = await r.text();
      candMs = Date.now() - cT0;
      const hasHtmlListing = /<a[^>]+href=["'][^"']*(?:noticia|materia)/i.test(body);
      const hasRssLink = /<link[^>]+type=["']application\/(?:rss|atom)/i.test(body);
      return {
        source: name,
        category: "URL cadastrada 404",
        current,
        candidate: {
          hostname: "agencia.tjse.jus.br",
          status: candStatus,
          mime: candMime,
          ms: candMs,
          hasHtmlListing,
          hasRssLink,
        },
        proposal: {
          new_url: candidate,
          new_hosts_needed: [
            { hostname: "agencia.tjse.jus.br", purpose: "feed" },
            { hostname: "agencia.tjse.jus.br", purpose: "article" },
            { hostname: "agencia.tjse.jus.br", purpose: "media" },
          ],
        },
      };
    } catch (e) {
      return { source: name, category: "URL cadastrada 404", current, candidate: { hostname: "agencia.tjse.jus.br", error: (e as Error).message } };
    }
  }
  return { source: name, category: "unhandled" };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(url, service, { auth: { persistSession: false } });

  const auth = await authenticateRequest(req, createClient(url, anon, { auth: { persistSession: false } }));
  if (!auth.ok) {
    return new Response(JSON.stringify({ error: auth.code, message: auth.message }), {
      status: auth.status, headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }

  const { data: sources, error: sErr } = await admin
    .from("news_sources").select("id,name,source_type,url").order("name");
  if (sErr) return new Response(JSON.stringify({ error: sErr.message }), { status: 500, headers: { ...corsHeaders, "content-type": "application/json" } });

  const { data: hostRows, error: hErr } = await admin
    .from("news_source_allowed_hosts").select("source_id,hostname,purpose,allow_subdomains");
  if (hErr) return new Response(JSON.stringify({ error: hErr.message }), { status: 500, headers: { ...corsHeaders, "content-type": "application/json" } });
  const hosts = (hostRows ?? []) as AllowedHost[];

  const WORKING = new Set(["Danuzio News","G1 Sergipe","Infonet","Metrópoles","NEnotícias","Revista Oeste"]);
  const FAILING = new Set(["A8SE","Faxaju","F5 News","Polícia Civil Sergipe","Prefeitura de Aracaju","SSP Sergipe","TJSE"]);

  const results: { phase1: unknown[]; phase2: unknown[] } = { phase1: [], phase2: [] };
  for (const src of sources ?? []) {
    if (WORKING.has(src.name)) results.phase1.push(await auditSource(src, hosts));
    else if (FAILING.has(src.name)) results.phase2.push(await investigateFailing(src, hosts));
  }

  return new Response(JSON.stringify({ ok: true, generated_at: new Date().toISOString(), ...results }, null, 2), {
    status: 200, headers: { ...corsHeaders, "content-type": "application/json" },
  });
});
