import { supabase } from "@/integrations/supabase/client";
import {
  type Category,
  type Post,
  getCategories as getSharedCategories,
  getFeaturedPost,
  getHighlights,
  getMostRead,
  getPostBySlug,
  getPostsByCategory,
  getPublishedPosts,
  getUrgentPosts,
  getVideoPosts,
  getDenunciaPosts,
  searchPosts,
  timeAgo,
} from "./news";

const AUTO_REFRESH_MS = 5000;

function sortNoticias(posts: Post[]) {
  return [...posts].sort((a, b) => {
    const pubA = a.published_at ? new Date(a.published_at).getTime() : 0;
    const pubB = b.published_at ? new Date(b.published_at).getTime() : 0;
    if (pubA !== pubB) return pubB - pubA;
    const creA = new Date(a.created_at).getTime();
    const creB = new Date(b.created_at).getTime();
    return creB - creA;
  });
}

export function subscribeToNoticiasFeed(onChange: () => void) {
  const channel = supabase
    .channel(`noticias-feed-${crypto.randomUUID()}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "posts" }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "categories" }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "home_audit" }, onChange)
    .subscribe();

  const intervalId = window.setInterval(onChange, AUTO_REFRESH_MS);
  const onFocus = () => onChange();
  const onVisible = () => {
    if (document.visibilityState === "visible") onChange();
  };

  window.addEventListener("focus", onFocus);
  document.addEventListener("visibilitychange", onVisible);

  return () => {
    window.clearInterval(intervalId);
    window.removeEventListener("focus", onFocus);
    document.removeEventListener("visibilitychange", onVisible);
    supabase.removeChannel(channel);
  };
}

export async function getPublishedNoticias(limit = 20) {
  return sortNoticias(await getPublishedPosts(limit));
}

export async function getFeaturedNoticia() {
  return getFeaturedPost();
}

export async function getHighlightsNoticias(excludeId?: string, limit = 3) {
  return sortNoticias(await getHighlights(excludeId, limit));
}

export async function getUrgentNoticias(limit = 6) {
  return sortNoticias(await getUrgentPosts(limit));
}

export async function getNoticiasByCategory(slug: string, limit = 8) {
  return sortNoticias(await getPostsByCategory(slug, limit));
}

export async function getMostReadNoticias(limit = 5, hours = 24) {
  return getMostRead(limit, hours);
}

export async function getNoticiaBySlug(slug: string) {
  return getPostBySlug(slug);
}

export async function searchNoticias(q: string, limit = 30) {
  return sortNoticias(await searchPosts(q, limit));
}

export async function getCategoriasNoticias() {
  return getSharedCategories();
}

export type { Post, Category };
export { timeAgo };
export async function getVideoNoticias(limit = 4) {
  return getVideoPosts(limit);
}
export async function getDenunciasDestaqueNoticias(limit = 4) {
  return getDenunciaPosts(limit);
}
