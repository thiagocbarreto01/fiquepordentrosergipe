const CRAWLER_USER_AGENT =
  /(facebookexternalhit|facebot|whatsapp|twitterbot|telegrambot|linkedinbot|pinterest|discordbot|slackbot|vkshare|skypeuripreview|embedly|quora link preview|outbrain|ia_archiver|googlebot|bingbot)/i;

const ARTICLE_PATH = /^\/noticia\/([^/?#]+)\/?$/i;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const userAgent = request.headers.get("user-agent") || "";
    const articleMatch = url.pathname.match(ARTICLE_PATH);

    if (request.method === "GET" && articleMatch && CRAWLER_USER_AGENT.test(userAgent)) {
      if (!env.SHARE_PREVIEW_FUNCTION_URL) {
        return new Response("Missing SHARE_PREVIEW_FUNCTION_URL", { status: 500 });
      }

      const slug = decodeURIComponent(articleMatch[1]).split("?")[0].split("#")[0].trim();
      const previewUrl = new URL(env.SHARE_PREVIEW_FUNCTION_URL);
      previewUrl.searchParams.set("slug", slug);

      const previewResponse = await fetch(previewUrl.toString(), {
        headers: {
          "accept": "text/html",
          "user-agent": userAgent,
        },
        cf: { cacheTtl: 0, cacheEverything: false },
      });

      const headers = new Headers(previewResponse.headers);
      headers.set("content-type", "text/html; charset=utf-8");
      headers.set("cache-control", "public, max-age=60, s-maxage=60");
      headers.set("x-og-source", "share-preview");

      return new Response(previewResponse.body, {
        status: previewResponse.status,
        headers,
      });
    }

    return fetch(request);
  },
};