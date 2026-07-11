// URL central para compartilhamento social com prévia (Open Graph dinâmico).
//
// Aponta para a Edge Function `share-preview`, que devolve HTML com og:type=article,
// og:title, og:description, og:image e canonical apontando para /noticia/<slug>.
// Crawlers (WhatsApp, Facebook, Telegram, etc.) leem as metatags; navegadores
// reais são redirecionados imediatamente para a matéria original.

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/+$/, "") ?? "";

/** URL da função share-preview para o slug informado. */
export function getSocialShareUrl(slug: string): string {
  const safeSlug = encodeURIComponent(String(slug ?? "").trim());
  return `${SUPABASE_URL}/functions/v1/share-preview?slug=${safeSlug}`;
}

/** URL pública canônica da matéria (link direto, sem prévia dinâmica). */
export function getArticleDirectUrl(slug: string): string {
  return `https://www.fiquepordentrosergipe.com.br/noticia/${slug}`;
}
