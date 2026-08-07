// URL central para compartilhamento social com prévia (Open Graph dinâmico).
// A API de prévia está na Vercel, então a base precisa ser fixa e nunca deve
// usar window.location.origin nem o domínio público do site.
const SHARE_PREVIEW_BASE_URL = "https://www.fiquepordentrosergipe.com.br";

/** URL da rota serverless share-preview para o slug informado.
 *  Inclui `&v=<timestamp>` para evitar cache do WhatsApp/Facebook. */
export function getSocialShareUrl(slug: string): string {
  const safeSlug = encodeURIComponent(String(slug ?? "").trim());
  return `${SHARE_PREVIEW_BASE_URL}/api/share-preview?slug=${safeSlug}&v=${Date.now()}`;
}

/** URL pública canônica da matéria (link direto, sem prévia dinâmica). */
export function getArticleDirectUrl(slug: string): string {
  return `https://www.fiquepordentrosergipe.com.br/noticia/${slug}`;
}
