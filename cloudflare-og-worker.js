// ============================================================================
// Cloudflare Worker — SSR de Open Graph para crawlers
// Rota: www.fiquepordentrosergipe.com.br/noticia/*
// ============================================================================
// O que faz:
//   1. Intercepta GET/HEAD em /noticia/<slug>
//   2. Se o User-Agent é de crawler (Facebook, WhatsApp, Twitter, etc.),
//      busca o HTML pronto da Edge Function `share-preview` no Supabase
//      e devolve com as metatags da notícia.
//   3. Usuários reais (browsers) passam direto para a origem (SPA React).
//
// Cole este arquivo inteiro no editor de Workers do Cloudflare.
// NÃO precisa wrangler.toml. NÃO precisa configurar variáveis de ambiente.
//
// IMPORTANTE — desative no painel do Cloudflare (Security → Bots):
//   • Bot Fight Mode: OFF
//   • Super Bot Fight Mode → "Definitely automated": Allow
//   • Super Bot Fight Mode → "Verified bots": Allow
// Caso contrário o Cloudflare responde HTTP 418 para o facebookexternalhit
// ANTES deste Worker rodar e o crawler nunca vê as metatags corretas.
// ============================================================================

const SHARE_PREVIEW_URL =
  "https://faubrqvkzgyfryfjylnb.supabase.co/functions/v1/share-preview";

const CRAWLER_UA = /(facebookexternalhit|facebot|meta-externalagent|whatsapp|twitterbot|telegrambot|linkedinbot|pinterest|discordbot|slackbot|slack-imgproxy|vkshare|skypeuripreview|embedly|redditbot|applebot|quora link preview|outbrain|ia_archiver|googlebot|bingbot|yandex|duckduckbot|baiduspider|petalbot)/i;

const ARTICLE_PATH = /^\/noticia\/([^/?#]+)\/?$/i;

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const ua = request.headers.get("user-agent") || "";
    const method = request.method.toUpperCase();
    const match = url.pathname.match(ARTICLE_PATH);
    const isCrawler = CRAWLER_UA.test(ua);
    const debug = url.searchParams.has("__ogdebug");

    // Debug: força o comportamento de crawler para inspecionar no browser.
    // Ex.: https://www.fiquepordentrosergipe.com.br/noticia/<slug>?__ogdebug=1
    const treatAsCrawler = isCrawler || debug;

    // Só interceptamos GET/HEAD em /noticia/<slug> vindos de crawlers.
    if ((method !== "GET" && method !== "HEAD") || !match || !treatAsCrawler) {
      return fetch(request);
    }

    const slug = decodeURIComponent(match[1]).split("?")[0].split("#")[0].trim();
    if (!slug) return fetch(request);

    const target = new URL(SHARE_PREVIEW_URL);
    target.searchParams.set("slug", slug);

    try {
      const upstream = await fetch(target.toString(), {
        method: "GET",
        headers: {
          accept: "text/html,application/xhtml+xml",
          "user-agent": ua || "cloudflare-worker-og-proxy",
          "x-forwarded-for": request.headers.get("cf-connecting-ip") || "",
          "x-forwarded-host": url.host,
          "x-forwarded-proto": "https",
          "x-original-url": request.url,
        },
        // Não usar cache do CF entre invocações: metatags devem refletir o post agora.
        cf: { cacheTtl: 0, cacheEverything: false },
        redirect: "follow",
      });

      // Se a Edge Function falhou, cai para a origem em vez de quebrar o share.
      if (!upstream.ok) {
        const fallback = await fetch(request);
        const h = new Headers(fallback.headers);
        h.set("x-og-source", `share-preview-failed-${upstream.status}`);
        return new Response(fallback.body, { status: fallback.status, headers: h });
      }

      const body = await upstream.text();
      const headers = new Headers();
      headers.set("content-type", "text/html; charset=utf-8");
      headers.set("cache-control", "public, max-age=60, s-maxage=60");
      headers.set("x-og-source", "share-preview");
      headers.set("x-og-slug", slug);
      // Para HEAD devolvemos só os headers.
      return new Response(method === "HEAD" ? null : body, { status: 200, headers });
    } catch (err) {
      // Nunca devolva 5xx/418 para crawler — degrade graciosamente.
      const fallback = await fetch(request);
      const h = new Headers(fallback.headers);
      h.set("x-og-source", "share-preview-exception");
      h.set("x-og-error", String(err && err.message ? err.message : err).slice(0, 200));
      return new Response(fallback.body, { status: fallback.status, headers: h });
    }
  },
};
