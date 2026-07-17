// TEMPORÁRIA — Fase 4 da correção F3D.2D.
// Valida rede real para Metrópoles (i.metroimg.com) e TJSE (agencia.tjse.jus.br).
// Staff-only. Sem persistência. Remover após auditoria.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import {
  safeFetch,
  type AllowedHost,
  type Purpose,
} from "../capture-sources/safe-fetch.ts";

const METRO_ID = "60f21b41-7cd6-4e03-b594-b45b340cceb0";
const TJSE_ID = "867a2f71-e399-4872-9aae-fe9ed218024f";

async function loadHosts(client: ReturnType<typeof createClient>): Promise<AllowedHost[]> {
  const { data, error } = await client
    .from("news_source_allowed_hosts")
    .select("source_id, hostname, purpose, allow_subdomains")
    .in("source_id", [METRO_ID, TJSE_ID]);
  if (error) throw error;
  return (data ?? []) as AllowedHost[];
}

function magic(bytes: Uint8Array): string {
  if (bytes.length < 4) return "unknown";
  const b = Array.from(bytes.slice(0, 12));
  const hex = b.map((x) => x.toString(16).padStart(2, "0")).join("");
  if (hex.startsWith("ffd8ff")) return "jpeg";
  if (hex.startsWith("89504e47")) return "png";
  if (hex.startsWith("47494638")) return "gif";
  if (hex.startsWith("52494646") && bytes.length >= 12 &&
      String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]) === "WEBP") return "webp";
  const txt = new TextDecoder().decode(bytes.slice(0, 200)).toLowerCase();
  if (txt.includes("<?xml") || txt.includes("<rss") || txt.includes("<feed")) return "xml/feed";
  if (txt.includes("<!doctype html") || txt.includes("<html")) return "html";
  return "unknown";
}

async function probe(
  label: string,
  url: string,
  sourceId: string,
  hostPurpose: Purpose,
  responseKind: "feed" | "html" | "image",
  allowedHosts: AllowedHost[],
) {
  const started = Date.now();
  try {
    const res = await safeFetch(url, {
      sourceId,
      hostPurpose,
      responseKind,
      allowedHosts,
      timeoutMs: 15000,
      userAgent: "FiquePorDentroSergipe/audit-f3d2d",
    });
    const first = res.bytes.slice(0, 400);
    return {
      label,
      url,
      ok: true,
      status: res.status,
      finalHostname: res.finalHostname,
      contentType: res.contentType,
      redirectCount: res.redirectCount,
      bytesLen: res.bytes.length,
      magic: magic(res.bytes),
      preview: responseKind === "image" ? null : new TextDecoder().decode(first).slice(0, 200),
      ms: Date.now() - started,
    };
  } catch (err) {
    return {
      label,
      url,
      ok: false,
      error: err instanceof Error ? err.name + ":" + err.message : String(err),
      code: (err as { code?: string } | undefined)?.code ?? null,
      ms: Date.now() - started,
    };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Staff-only via JWT
  const authHeader = req.headers.get("Authorization") ?? "";
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const authed = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData } = await authed.auth.getUser();
  if (!userData?.user) {
    return new Response(JSON.stringify({ error: "unauthenticated" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const admin = createClient(supabaseUrl, serviceKey);
  const { data: roles } = await admin
    .from("user_roles").select("role").eq("user_id", userData.user.id);
  const isAdmin = (roles ?? []).some((r) => r.role === "admin");
  if (!isAdmin) {
    return new Response(JSON.stringify({ error: "forbidden" }), {
      status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const allowedHosts = await loadHosts(admin);

  // Metrópoles: feed → primeiro item → primeira imagem em i.metroimg.com
  const metroFeed = await probe(
    "metropoles.feed", "https://www.metropoles.com/feed",
    METRO_ID, "feed", "feed", allowedHosts,
  );

  let metroArticleUrl: string | null = null;
  if (metroFeed.ok && metroFeed.preview) {
    // pega primeiro <link> do feed inteiro
    const full = await probe(
      "metropoles.feed.full", "https://www.metropoles.com/feed",
      METRO_ID, "feed", "feed", allowedHosts,
    );
    const decoded = full.ok
      ? new TextDecoder().decode(new Uint8Array(0))
      : "";
    // recarrega bytes completos
  }
  // parse simplificado: refazer fetch e ler bytes completos
  const feedFetch = await safeFetch("https://www.metropoles.com/feed", {
    sourceId: METRO_ID, hostPurpose: "feed", responseKind: "feed",
    allowedHosts, timeoutMs: 15000, userAgent: "audit-f3d2d",
  }).catch(() => null);
  if (feedFetch) {
    const xml = new TextDecoder().decode(feedFetch.bytes);
    const m = xml.match(/<link>([^<]+metropoles\.com[^<]+)<\/link>/);
    if (m) metroArticleUrl = m[1];
  }
  const metroArticle = metroArticleUrl
    ? await probe("metropoles.article", metroArticleUrl, METRO_ID, "article", "html", allowedHosts)
    : { label: "metropoles.article", ok: false, error: "no_article_url_from_feed" };

  let metroImageUrl: string | null = null;
  if ((metroArticle as { ok: boolean; preview?: string }).ok) {
    const html = (metroArticle as { preview?: string }).preview ?? "";
    // caça a primeira imagem hospedada em i.metroimg.com ou images.metroimg.com
    const im = html.match(/https?:\/\/(i|images)\.metroimg\.com\/[^"'\s<>]+/);
    if (im) metroImageUrl = im[0];
  }
  // se não achamos no preview curto, refazer artigo completo
  if (!metroImageUrl && metroArticleUrl) {
    const artFull = await safeFetch(metroArticleUrl, {
      sourceId: METRO_ID, hostPurpose: "article", responseKind: "html",
      allowedHosts, timeoutMs: 15000, userAgent: "audit-f3d2d",
    }).catch(() => null);
    if (artFull) {
      const txt = new TextDecoder().decode(artFull.bytes);
      const im = txt.match(/https?:\/\/i\.metroimg\.com\/[^"'\s<>]+\.(jpg|jpeg|png|webp)/i);
      if (im) metroImageUrl = im[0];
    }
  }
  const metroImage = metroImageUrl
    ? await probe("metropoles.image.imetro", metroImageUrl, METRO_ID, "media", "image", allowedHosts)
    : { label: "metropoles.image.imetro", ok: false, error: "no_image_url_on_imetro" };

  // TJSE: listagem em agencia.tjse.jus.br → artigo → imagem
  const tjseFeed = await probe(
    "tjse.feed", "https://agencia.tjse.jus.br/",
    TJSE_ID, "feed", "html", allowedHosts, // portal HTML; validar cobertura de purpose=feed
  );
  let tjseArticleUrl: string | null = null;
  if (tjseFeed.ok && (tjseFeed as { preview?: string }).preview) {
    const listFull = await safeFetch("https://agencia.tjse.jus.br/", {
      sourceId: TJSE_ID, hostPurpose: "feed", responseKind: "html",
      allowedHosts, timeoutMs: 15000, userAgent: "audit-f3d2d",
    }).catch(() => null);
    if (listFull) {
      const html = new TextDecoder().decode(listFull.bytes);
      const m = html.match(/https?:\/\/agencia\.tjse\.jus\.br\/noticias\/[^"'\s<>]+/);
      if (m) tjseArticleUrl = m[0];
    }
  }
  const tjseArticle = tjseArticleUrl
    ? await probe("tjse.article", tjseArticleUrl, TJSE_ID, "article", "html", allowedHosts)
    : { label: "tjse.article", ok: false, error: "no_article_url_on_agencia" };

  let tjseImageUrl: string | null = null;
  if (tjseArticleUrl) {
    const artFull = await safeFetch(tjseArticleUrl, {
      sourceId: TJSE_ID, hostPurpose: "article", responseKind: "html",
      allowedHosts, timeoutMs: 15000, userAgent: "audit-f3d2d",
    }).catch(() => null);
    if (artFull) {
      const txt = new TextDecoder().decode(artFull.bytes);
      const im = txt.match(/https?:\/\/agencia\.tjse\.jus\.br\/[^"'\s<>]+\.(jpg|jpeg|png|webp)/i);
      if (im) tjseImageUrl = im[0];
    }
  }
  const tjseImage = tjseImageUrl
    ? await probe("tjse.image", tjseImageUrl, TJSE_ID, "media", "image", allowedHosts)
    : { label: "tjse.image", ok: false, error: "no_image_url_on_agencia" };

  return new Response(JSON.stringify({
    allowlist_hosts_loaded: allowedHosts.length,
    metropoles: { feed: metroFeed, article: metroArticle, image: metroImage,
                  discovered: { articleUrl: metroArticleUrl, imageUrl: metroImageUrl } },
    tjse: { feed: tjseFeed, article: tjseArticle, image: tjseImage,
            discovered: { articleUrl: tjseArticleUrl, imageUrl: tjseImageUrl } },
  }, null, 2), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
