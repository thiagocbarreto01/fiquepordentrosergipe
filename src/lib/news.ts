import { supabase } from "@/integrations/supabase/client";
import { HOME_RECENT_DAYS } from "./homeSlots";

export type Post = {
  id: string;
  title: string;
  subtitle: string | null;
  excerpt: string | null;
  source_url: string | null;
  slug: string;
  content: string;
  cover_image_url: string | null;
  manual_image_url: string | null; // Added
  image_caption?: string | null;
  image_credit?: string | null;
  category_id: string | null;
  author_id: string;
  tags: string[] | null;
  status: "captada" | "em_revisao" | "aprovada" | "rejeitada" | "publicada" | "rascunho" | "revisao" | "publicado";
  is_featured: boolean;
  is_main_featured?: boolean;
  is_urgent: boolean;
  source_id?: string | null;
  is_editorial?: boolean | null;
  is_denuncia: boolean;
  meta_title: string | null;
  meta_description: string | null;
  views: number;
  published_at: string | null;
  scheduled_at: string | null;
  created_at: string;
  updated_at: string;
  video_url_principal?: string | null;
  videos_relacionados?: string[] | null;
  home_expires_at?: string | null;
  main_featured_expires_at?: string | null;
  is_evergreen?: boolean;
  event_id?: string | null;
  ai_seo_title?: string | null;
  ai_summary?: string | null;
  ai_entities?: string[] | null;
  pinned_until?: string | null;
  pinned_slot?: string | null;
  pinned_reason?: string | null;
  categories?: { name: string; slug: string; color: string | null; default_cover_image_url?: string | null } | null;
  profiles?: { display_name: string | null } | null;
};

export type Category = {
  id: string;
  name: string;
  slug: string;
  color: string | null;
  position: number;
};

// Lista pública: usa posts_public, que expõe somente campos seguros para leitores.
const POST_SELECT = `
  id, title, subtitle, excerpt, slug, cover_image_url, manual_image_url, category_id, author_id,
  is_featured, is_main_featured, is_urgent, is_denuncia, views, published_at, created_at, tags, video_url_principal,
  home_expires_at, main_featured_expires_at, is_evergreen, is_editorial,
  event_id, ai_seo_title, ai_summary,
  pinned_until, pinned_slot, pinned_reason,
  categories ( name, slug, color, default_cover_image_url )
`;

// Apenas estes campos são expostos na página individual (sem campos internos)
const POST_DETAIL_SELECT = `
  id, title, subtitle, excerpt, slug, content, cover_image_url, manual_image_url,
  image_caption, image_credit,
  category_id, author_id, tags, is_featured, is_main_featured, is_urgent, is_denuncia,
  meta_title, meta_description, views, published_at, created_at, updated_at,
  video_url_principal, videos_relacionados, home_expires_at, main_featured_expires_at, is_evergreen, is_editorial,
  categories ( name, slug, color, default_cover_image_url )
`;

/**
 * Filtro de validade na Home:
 * - Notícias Destaque Permanente (is_evergreen) sempre passam
 * - Notícias sem data de expiração sempre passam
 * - Notícias com home_expires_at no futuro passam
 * - Demais ficam fora (mas a URL continua ativa no PostBySlug)
 */
function applyHomeValidityFilter(q: any) {
  const now = new Date().toISOString();
  return q.or(`is_evergreen.eq.true,home_expires_at.is.null,home_expires_at.gt.${now}`);
}

/**
 * Arquivamento inteligente:
 * - Notícias com mais de 90 dias saem das listagens principais
 * - Destaque Permanente (is_evergreen) é exceção e continua aparecendo
 * - A URL/categoria/busca continuam funcionando (filtros só aplicados aqui)
 */
function applyArchiveFilter(q: any) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 90);
  return q.or(`is_evergreen.eq.true,published_at.gte.${cutoff.toISOString()}`);
}

function recentCutoffIso(days = HOME_RECENT_DAYS) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  return cutoff.toISOString();
}

function applyRecentHomeFilter(q: any, days = HOME_RECENT_DAYS) {
  const cutoff = recentCutoffIso(days);
  const now = new Date().toISOString();
  return q.or(`and(is_evergreen.eq.false,published_at.gte.${cutoff}),is_evergreen.eq.true,and(is_urgent.eq.true,home_expires_at.gt.${now})`);
}

export async function getPublishedPosts(limit = 20) {
  const baseOrder = (q: any) => q
    .order("is_evergreen", { ascending: false })
    .order("is_main_featured", { ascending: false })
    .order("is_featured", { ascending: false })
    .order("published_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);

  const { data, error } = await baseOrder(
    applyArchiveFilter(
      applyRecentHomeFilter(
        applyHomeValidityFilter(
          supabase.from("posts_public" as any).select(POST_SELECT)
        )
      )
    )
  );
  if (error) throw error;
  if (data && data.length > 0) return data as unknown as Post[];

  // Fallback: quando não há nada nos últimos HOME_RECENT_DAYS dias,
  // devolve as mais recentes dentro da janela de arquivamento (90 dias).
  const { data: fallback, error: fbErr } = await baseOrder(
    applyArchiveFilter(
      applyHomeValidityFilter(
        supabase.from("posts_public" as any).select(POST_SELECT)
      )
    )
  );
  if (fbErr) throw fbErr;
  return (fallback ?? []) as unknown as Post[];
}

/**
 * Regra editorial da Manchete/Hero:
 * - Notícias captadas automaticamente NÃO podem ocupar a manchete principal,
 *   a menos que tenham sido marcadas como Destaque Principal (is_main_featured) ou Destaque Permanente (is_evergreen).
 */
export async function getFeaturedPost() {
  const yesterday = new Date();
  yesterday.setHours(yesterday.getHours() - 24);

  // Prioridade 1: Destaque Permanente
  const { data: evergreen } = await applyHomeValidityFilter(
    supabase
      .from("posts_public" as any)
      .select(POST_SELECT)
      .eq("is_evergreen", true)
  )
    .order("published_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (evergreen) return evergreen as unknown as Post;

  // Prioridade 2: Destaque Principal (revisado pela redação)
  const { data: main } = await applyHomeValidityFilter(
    supabase
      .from("posts_public" as any)
      .select(POST_SELECT)
      .eq("is_main_featured", true)
  )
    .order("published_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (main) return main as unknown as Post;

  // Prioridade 3: Destaque marcado (qualquer notícia com is_featured nas últimas 24h)
  const { data: featured } = await applyHomeValidityFilter(
    supabase
      .from("posts_public" as any)
      .select(POST_SELECT)
      .eq("is_featured", true)
      .gte("published_at", yesterday.toISOString())
  )
    .order("published_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (featured) return featured as unknown as Post;

  // Prioridade 4: Última notícia publicada (qualquer fonte) — garante que sempre haja manchete nova
  const { data: latest } = await applyHomeValidityFilter(
    supabase
      .from("posts_public" as any)
      .select(POST_SELECT)
  )
    .order("published_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (latest ?? null) as unknown as Post | null;
}

export async function getHighlights(excludeId?: string, limit = 3) {
  // Hero secundários: destaques marcados + as notícias mais recentes para garantir conteúdo novo sempre
  const { data } = await applyHomeValidityFilter(
    supabase
      .from("posts_public" as any)
      .select(POST_SELECT)
  )
    .order("is_evergreen", { ascending: false })
    .order("is_main_featured", { ascending: false })
    .order("is_featured", { ascending: false })
    .order("published_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit + 1);
  const list = (data ?? []) as unknown as Post[];
  return (excludeId ? list.filter((p) => p.id !== excludeId) : list).slice(0, limit);
}

export async function getUrgentPosts(limit = 6) {
  const { data: flagged } = await applyHomeValidityFilter(
    supabase
      .from("posts_public" as any)
      .select(POST_SELECT)
      .or("is_urgent.eq.true,is_featured.eq.true")
  )
    .order("is_urgent", { ascending: false })
    .order("published_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);

  const flaggedList = (flagged ?? []) as unknown as Post[];
  if (flaggedList.length > 0) {
    const seen = new Set<string>();
    return flaggedList.filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)));
  }

  return [];
}

export async function getPostsByCategory(slug: string, limit = 8) {
  const { data: cat } = await supabase
    .from("categories")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (!cat) return [];
  // Categorias também respeitam a validade na Home/listagens
  const { data } = await applyHomeValidityFilter(
    supabase
      .from("posts_public" as any)
      .select(POST_SELECT)
      .eq("category_id", cat.id)
  )
    .order("is_evergreen", { ascending: false })
    .order("published_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as unknown as Post[];
}

export async function getMostRead(limit = 5, hours = 24) {
  const since = new Date();
  since.setHours(since.getHours() - hours);

  const { data: windowed } = await applyHomeValidityFilter(
    supabase
      .from("posts_public" as any)
      .select(POST_SELECT)
      .gte("published_at", since.toISOString())
      .gt("views", 0)
  )
    .order("views", { ascending: false })
    .limit(limit);

  if (windowed && windowed.length > 0) return windowed as unknown as Post[];

  // Fallback: mais lidas dentro da janela de arquivamento (90d)
  const { data: fallback } = await applyArchiveFilter(
    applyHomeValidityFilter(
      supabase
        .from("posts_public" as any)
        .select(POST_SELECT)
        .gt("views", 0)
    )
  )
    .order("views", { ascending: false })
    .limit(limit);
  return (fallback ?? []) as unknown as Post[];
}


export async function getVideoPosts(limit = 4) {
  const { data } = await supabase
    .from("posts_public" as any)
    .select(POST_SELECT)
    .not("video_url_principal", "is", null)
    .order("published_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as unknown as Post[];
}

export async function getDenunciaPosts(limit = 4) {
  const { data } = await supabase
    .from("posts_public" as any)
    .select(POST_SELECT)
    .eq("is_denuncia", true)
    .order("published_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as unknown as Post[];
}

export async function getPostBySlug(slug: string) {
  const decodedSlug = decodeURIComponent(slug).trim();
  const { data, error } = await supabase
    .from("posts_public" as any)
    .select(POST_DETAIL_SELECT)
    .eq("slug", decodedSlug)
    .maybeSingle();
  if (error) {
    console.error("Falha ao buscar notícia por slug", { slug: decodedSlug, error });
    throw error;
  }
  if (!data) return null;
  // Busca display_name separado (view não tem o join)
  let profile: { display_name: string | null } | null = null;
  const authorId = (data as any).author_id;
  if (authorId) {
    const { data: prof } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("user_id", authorId)
      .maybeSingle();
    profile = prof ?? null;
  }
  return { ...(data as any), profiles: profile } as unknown as Post;
}

export async function getCategories() {
  const { data } = await supabase
    .from("categories")
    .select("*")
    .order("position", { ascending: true });
  return (data ?? []) as Category[];
}

export async function searchPosts(q: string, limit = 30) {
  if (!q.trim()) return [];
  const { data } = await supabase
    .from("posts_public" as any)
    .select(POST_SELECT)
    .or(`title.ilike.%${q}%,subtitle.ilike.%${q}%,content.ilike.%${q}%`)
    .order("published_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as unknown as Post[];
}

export function timeAgo(iso: string | null) {
  if (!iso) return "";
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "agora";
  if (diff < 3600) return `há ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `há ${Math.floor(diff / 3600)} h`;
  const days = Math.floor(diff / 86400);
  if (days < 7) return `há ${days} d`;
  return new Date(iso).toLocaleDateString("pt-BR");
}
