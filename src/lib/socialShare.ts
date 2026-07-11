// URL central para compartilhamento social com prévia (Open Graph dinâmico).
//
// Aponta para a rota serverless da Vercel `/api/share-preview`, que devolve
// HTML com og:type=article, og:title, og:description e og:image. Crawlers
// (WhatsApp, Facebook, Telegram, etc.) leem as metatags; navegadores reais
// são redirecionados via JS para a matéria original.
//
// Configure VITE_SHARE_PREVIEW_BASE_URL com o domínio da Vercel (ex.:
// "https://fiquepordentrosergipe.vercel.app"). Sem essa variável, cai no
// domínio público do portal — que só funciona quando o /api estiver
// deployado no mesmo host (Vercel + domínio custom).

const SHARE_BASE = (
  (import.meta.env.VITE_SHARE_PREVIEW_BASE_URL as string | undefined) ??
  "https://fiquepordentrosergipe.vercel.app"
).replace(/\/+$/, "");

/** URL da rota serverless share-preview para o slug informado.
 *  Inclui `&v=<timestamp>` para evitar cache do WhatsApp/Facebook. */
export function getSocialShareUrl(slug: string): string {
  const safeSlug = encodeURIComponent(String(slug ?? "").trim());
  return `${SHARE_BASE}/api/share-preview?slug=${safeSlug}&v=${Date.now()}`;
}

/** URL pública canônica da matéria (link direto, sem prévia dinâmica). */
export function getArticleDirectUrl(slug: string): string {
  return `https://www.fiquepordentrosergipe.com.br/noticia/${slug}`;
}
