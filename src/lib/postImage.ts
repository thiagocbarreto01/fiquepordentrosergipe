import type { SyntheticEvent } from "react";
import type { Post } from "./news";

// Placeholder neutro oficial do Fique Por Dentro Sergipe (último recurso, quando não há imagem real nem default de categoria)
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
  "ic_whatsapp",
  "/imgs/ic_",
  "favicon",
  "/logo",
];

function isGeneric(url: string | null | undefined): boolean {
  if (!url || !url.trim()) return true;
  return GENERIC_PATTERNS.some((p) => url.includes(p));
}

export type ImageValidationResult = {
  valid: boolean;
  url: string;
  reason: string;
};

declare global {
  interface Window {
    __fpdImageFailures?: Array<{ url: string; reason: string; context?: string; at: string }>;
  }
}

export function validateImageUrl(src: string | null | undefined): ImageValidationResult {
  const url = (src ?? "").trim();
  if (!url) return { valid: false, url: "", reason: "URL ausente" };
  if (isGeneric(url)) return { valid: false, url, reason: "Imagem genérica ou placeholder" };

  try {
    const base = typeof window !== "undefined" ? window.location.origin : "https://fiquepordentro.local";
    const parsed = new URL(url, base);
    if (!/^https?:$/.test(parsed.protocol)) {
      return { valid: false, url, reason: "Protocolo de imagem não permitido" };
    }
    return { valid: true, url, reason: "Imagem válida" };
  } catch {
    return { valid: false, url, reason: "URL inválida" };
  }
}

export function registerImageFailure(url: string | null | undefined, reason: string, context?: string) {
  if (typeof window === "undefined") return;
  const normalized = (url ?? "").trim() || "sem URL";
  const failures = window.__fpdImageFailures ?? [];
  if (!failures.some((item) => item.url === normalized && item.context === context)) {
    failures.push({ url: normalized, reason, context, at: new Date().toISOString() });
    window.__fpdImageFailures = failures;
  }
  console.warn("[Imagem indisponível]", { url: normalized, motivo: reason, contexto: context });
}

export type PostImageInput = Pick<Post, "cover_image_url" | "manual_image_url"> & {
  categories?: { default_cover_image_url?: string | null } | null;
};

/**
 * Escolhe a imagem do post com prioridade:
 *   manual_image_url (override editorial) > cover_image_url (própria notícia) > default da categoria > placeholder Fique Por Dentro Sergipe
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

  // Último recurso: placeholder neutro do Fique Por Dentro Sergipe
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

export function getPostImageIssue(post: (PostImageInput & { title?: string | null }) | null | undefined) {
  if (!post) return { url: "", reason: "Post ausente", title: "" };
  const candidates = [post.manual_image_url, post.cover_image_url, post.categories?.default_cover_image_url]
    .map((url) => (url ?? "").trim())
    .filter(Boolean);
  if (postHasOwnImage(post)) return null;
  const validation = validateImageUrl(candidates[0] ?? "");
  return {
    url: validation.url || "sem URL cadastrada",
    reason: validation.reason,
    title: post.title ?? "sem título",
  };
}

/**
 * Substitui automaticamente a imagem se ela falhar ao carregar (404, broken).
 * Cai para categoria → placeholder, evitando loops e jamais usando imagem de outra notícia.
 */
export function handleImgError(
  e: SyntheticEvent<HTMLImageElement, Event>,
  post: PostImageInput | null | undefined,
) {
  const img = e.currentTarget;
  const current = img.src;

  registerImageFailure(current, "Erro ao carregar imagem no navegador", "post");

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
