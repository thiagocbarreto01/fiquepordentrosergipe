import type { Post } from "./news";

// Placeholder neutro oficial do TV Barretão (último recurso, quando não há imagem real nem default de categoria)
export const FALLBACK_IMAGE = "/news-placeholder.svg";

// Padrões considerados "genéricos / seed / demo" — NUNCA usar como imagem real de notícia.
// Imagens reais de notícia devem vir do CDN da fonte original ou do nosso storage (Supabase).
// Qualquer URL do images.unsplash.com é tratada como placeholder de seed e ignorada.
const GENERIC_PATTERNS = [
  "images.unsplash.com",
  "placeholder.svg",
  "news-placeholder.svg",
  "via.placeholder.com",
  "placehold.co",
];

function isGeneric(url: string | null | undefined): boolean {
  if (!url || !url.trim()) return true;
  return GENERIC_PATTERNS.some((p) => url.includes(p));
}

export type PostImageInput = Pick<Post, "cover_image_url" | "manual_image_url"> & {
  categories?: { default_cover_image_url?: string | null } | null;
};

/**
 * Escolhe a imagem do post com prioridade:
 *   manual_image_url (override editorial) > cover_image_url (própria notícia) > default da categoria > placeholder TV Barretão
 *
 * IMPORTANTE: nunca devolve imagem de outra notícia. Se a própria notícia não tiver
 * imagem válida, cai direto para o default da categoria ou para o placeholder neutro.
 */
export function getPostImage(post: PostImageInput | null | undefined): string {
  if (!post) return FALLBACK_IMAGE;

  // Prioridade 1: Imagem definida manualmente pelo editor para ESTA notícia
  if (post.manual_image_url && !isGeneric(post.manual_image_url)) {
    return post.manual_image_url;
  }

  // Prioridade 2: Imagem de capa da PRÓPRIA notícia (RSS / extraída / upload)
  if (post.cover_image_url && !isGeneric(post.cover_image_url)) {
    return post.cover_image_url;
  }

  // Prioridade 3: Imagem padrão da categoria (se cadastrada)
  const catDefault = post.categories?.default_cover_image_url;
  if (catDefault && catDefault.trim() && !isGeneric(catDefault)) {
    return catDefault;
  }

  // Último recurso: placeholder neutro do TV Barretão
  return FALLBACK_IMAGE;
}

/**
 * Retorna true se a notícia possui imagem própria utilizável (manual, capa ou default da categoria).
 * Usado para impedir que notícias sem imagem ocupem manchete / destaques laterais da Home.
 */
export function postHasOwnImage(post: PostImageInput | null | undefined): boolean {
  if (!post) return false;
  if (post.manual_image_url && !isGeneric(post.manual_image_url)) return true;
  if (post.cover_image_url && !isGeneric(post.cover_image_url)) return true;
  const catDefault = post.categories?.default_cover_image_url;
  if (catDefault && catDefault.trim() && !isGeneric(catDefault)) return true;
  return false;
}

/**
 * Substitui automaticamente a imagem se ela falhar ao carregar (404, broken).
 * Cai para categoria → placeholder, evitando loops e jamais usando imagem de outra notícia.
 */
export function handleImgError(
  e: React.SyntheticEvent<HTMLImageElement, Event>,
  post: PostImageInput | null | undefined,
) {
  const img = e.currentTarget;
  const current = img.src;

  if (post?.manual_image_url && current.endsWith(post.manual_image_url)) {
    if (post.cover_image_url && !isGeneric(post.cover_image_url)) {
      img.src = post.cover_image_url;
      return;
    }
  }

  const catDefault = post?.categories?.default_cover_image_url ?? "";
  if (catDefault && !isGeneric(catDefault) && !current.endsWith(catDefault)) {
    img.src = catDefault;
    return;
  }
  if (!current.endsWith(FALLBACK_IMAGE)) {
    img.src = FALLBACK_IMAGE;
  }
}
