/**
 * News Events — clusters editoriais.
 * Lê tabela public.news_events e expõe utilitários para Home/Breaking.
 */
import { supabase } from "@/integrations/supabase/client";
import { withCache, TTL } from "./cache";

export type NewsEvent = {
  id: string;
  slug: string | null;
  title: string;
  summary: string | null;
  category_id: string | null;
  entities: string[];
  keywords: string[];
  impact_score: number;
  is_breaking: boolean;
  breaking_until: string | null;
  first_seen_at: string;
  last_updated_at: string;
  post_count: number;
};

const EVENT_SELECT =
  "id,slug,title,summary,category_id,entities,keywords,impact_score,is_breaking,breaking_until,first_seen_at,last_updated_at,post_count";

/** Evento de breaking news ativo (mais relevante). */
export async function getActiveBreakingEvent(): Promise<NewsEvent | null> {
  return withCache("evt:breaking", TTL.breaking, async () => {
    // Limpa flags expiradas de forma idempotente.
    try { await supabase.rpc("expire_breaking_events" as any); } catch { /* noop */ }
    const { data, error } = await supabase
      .from("news_events" as any)
      .select(EVENT_SELECT)
      .eq("is_breaking", true)
      .order("impact_score", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      console.warn("[events] breaking error:", error.message);
      return null;
    }
    return (data as unknown as NewsEvent) ?? null;
  });
}

/** Top eventos por impact_score (últimas 24h). */
export async function getTopEvents(limit = 5): Promise<NewsEvent[]> {
  return withCache(`evt:top:${limit}`, TTL.trending, async () => {
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const { data, error } = await supabase
      .from("news_events" as any)
      .select(EVENT_SELECT)
      .gte("last_updated_at", since)
      .order("impact_score", { ascending: false })
      .limit(limit);
    if (error) {
      console.warn("[events] top error:", error.message);
      return [];
    }
    return (data as unknown as NewsEvent[]) ?? [];
  });
}

/** Mapeia post → impact_score do seu evento (0..100). */
export async function getEventScoresByPostIds(
  postIds: string[],
): Promise<Record<string, { event_id: string; impact_score: number; is_breaking: boolean }>> {
  if (!postIds.length) return {};
  try {
    const { data: posts } = await supabase
      .from("posts_public" as any)
      .select("id,event_id")
      .in("id", postIds);
    const eventIds = Array.from(
      new Set(((posts as any[]) ?? []).map((p) => p.event_id).filter(Boolean)),
    ) as string[];
    if (!eventIds.length) return {};
    const { data: events } = await supabase
      .from("news_events" as any)
      .select("id,impact_score,is_breaking")
      .in("id", eventIds);
    const evMap = new Map(
      ((events as any[]) ?? []).map((e) => [e.id, e]),
    );
    const out: Record<string, { event_id: string; impact_score: number; is_breaking: boolean }> = {};
    for (const p of (posts as any[]) ?? []) {
      if (!p.event_id) continue;
      const e = evMap.get(p.event_id);
      if (!e) continue;
      out[p.id] = {
        event_id: p.event_id,
        impact_score: Number(e.impact_score) || 0,
        is_breaking: !!e.is_breaking,
      };
    }
    return out;
  } catch (err) {
    console.warn("[events] scoring error:", err);
    return {};
  }
}

/** Posts relacionados do mesmo evento. */
export async function getRelatedPostsByEvent(postId: string, limit = 5) {
  try {
    const { data, error } = await supabase.rpc("get_event_related_posts" as any, {
      _post_id: postId,
      _limit: limit,
    });
    if (error) {
      console.warn("[events] related error:", error.message);
      return [];
    }
    return (data as Array<{ id: string; title: string; slug: string; cover_image_url: string | null; published_at: string }>) ?? [];
  } catch {
    return [];
  }
}
