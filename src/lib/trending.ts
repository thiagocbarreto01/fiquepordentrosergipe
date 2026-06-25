import { supabase } from "@/integrations/supabase/client";
import type { Post } from "./news";
import { pickTrending } from "./editorialEngine";
import { withCache, TTL } from "./cache";

const POST_SELECT = `
  id, title, subtitle, excerpt, slug, cover_image_url, manual_image_url, category_id, author_id,
  is_featured, is_main_featured, is_urgent, is_denuncia, views, published_at, created_at, tags, video_url_principal,
  home_expires_at, main_featured_expires_at, is_evergreen, is_editorial,
  categories ( name, slug, color, default_cover_image_url )
`;

/**
 * Trending Engine — engajamento real (views já incrementado por
 * `increment_post_views` em cada visita à matéria). Janela 24h, fallback 7d.
 * Combina engagement + recência via `pickTrending`.
 *
 * Limitação: sem tracking granular de cliques, usamos views como proxy.
 */
export async function getTrending(limit = 5): Promise<Post[]> {
  return withCache(`trending:${limit}`, TTL.trending, async () => {
    const since24 = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const { data: d24 } = await supabase
      .from("posts_public" as any)
      .select(POST_SELECT)
      .gte("published_at", since24)
      .gt("views", 0)
      .order("views", { ascending: false })
      .limit(limit * 4);

    let pool = ((d24 ?? []) as unknown as Post[]);
    if (pool.length < limit) {
      const since7 = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
      const { data: d7 } = await supabase
        .from("posts_public" as any)
        .select(POST_SELECT)
        .gte("published_at", since7)
        .gt("views", 0)
        .order("views", { ascending: false })
        .limit(limit * 4);
      pool = ((d7 ?? []) as unknown as Post[]);
    }
    return pickTrending(pool, limit);
  });
}
