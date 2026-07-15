import type { Post } from "./news";
import { postHasOwnImage } from "./postImage";

/**
 * Regra simples e definitiva (estilo TV Barretão) para a Home do Fique por Dentro Sergipe.
 *
 * Prioridade da MANCHETE (em ordem):
 *   A. Plantão ativo (is_urgent + home_expires_at futuro)
 *   B. Fixação manual (pinned_slot='manchete' + pinned_until futuro, com motivo)
 *   C. Notícia publicada há menos de 2 horas
 *   D. Mais visualizada em 24h (mín. 2 views válidas) — só quando houver histórico temporal
 *   E. Mais recente
 *   F. Fallback: se nada em 24h, amplia até 48h (nunca acima de 48h como manchete automática)
 *
 * `posts.views` (contador histórico acumulado) NUNCA é usado.
 * Só `recentViews[postId]` (views das últimas 24h) influencia — quando existir.
 */

export type RecentViewsMap = Record<string, number>;

export type SelectionReason =
  | "plantao_ativo"
  | "fixada_manual"
  | "publicada_menos_2h"
  | "mais_vista_24h"
  | "mais_recente"
  | "fallback_48h"
  | "sem_candidata";

export const REASON_LABEL: Record<SelectionReason, string> = {
  plantao_ativo: "Plantão ativo",
  fixada_manual: "Fixada manualmente",
  publicada_menos_2h: "Publicada há menos de 2h",
  mais_vista_24h: "Mais visualizada em 24h",
  mais_recente: "Mais recente",
  fallback_48h: "Fallback de 48h",
  sem_candidata: "Nenhuma notícia elegível",
};

export type SimpleSlot = {
  post: Post | null;
  reason: SelectionReason;
  reasonLabel: string;
  usedFallback48h: boolean;
  recentViews: number | null;
};

export type SimpleHomeLayout = {
  manchete: SimpleSlot;
  lateral1: SimpleSlot;
  lateral2: SimpleSlot;
  lateral3: SimpleSlot;
  emDestaque: SimpleSlot;
  plantao: SimpleSlot;
  hasRecentViewsHistory: boolean;
};

const HOUR = 3_600_000;

function isPublished(p: Post): boolean {
  const s = String(p.status ?? "").toLowerCase();
  if (s === "publicada" || s === "publicado") return true;
  // posts_public só contém publicadas
  return !!p.published_at;
}

export function ageMs(p: Post, now: number): number {
  const d = p.published_at;
  if (!d) return Number.POSITIVE_INFINITY;
  return now - new Date(d).getTime();
}

export function isPlantaoActive(p: Post, now: number): boolean {
  if (!p.is_urgent) return false;
  if (!p.home_expires_at) return false;
  return new Date(p.home_expires_at).getTime() > now;
}

export function isPinnedActive(p: Post, now: number, slot = "manchete"): boolean {
  if (!p.pinned_slot || p.pinned_slot !== slot) return false;
  if (!p.pinned_until) return false;
  // Motivo (pinned_reason) é validado no servidor pela RPC pin_post_to_home
  // e não é exposto em posts_public por privacidade. Se vier definido (contexto
  // administrativo), exigimos >=3 caracteres.
  if (typeof p.pinned_reason === "string" && p.pinned_reason.trim().length < 3) return false;
  return new Date(p.pinned_until).getTime() > now;
}

/** Elegibilidade obrigatória para ocupar qualquer slot da Home. */
export function isEligible(p: Post, now: number): boolean {
  if (!isPublished(p)) return false;
  if (!p.published_at) return false;
  if (!postHasOwnImage(p)) return false;
  return true;
}

function mkSlot(
  post: Post | null,
  reason: SelectionReason,
  recentViews: RecentViewsMap,
  usedFallback48h = false,
): SimpleSlot {
  const views = post ? recentViews[post.id] ?? null : null;
  return {
    post,
    reason,
    reasonLabel: REASON_LABEL[reason],
    usedFallback48h,
    recentViews: views,
  };
}

function sortByPublishedDesc(a: Post, b: Post): number {
  const ta = new Date(a.published_at ?? 0).getTime();
  const tb = new Date(b.published_at ?? 0).getTime();
  return tb - ta;
}

/**
 * Escolhe o próximo slot lateral / "em destaque" entre candidatos ainda não usados.
 * Mistura interesse real (views 24h) e recência quando houver histórico;
 * cai em recência pura se não houver.
 */
function pickNext(
  candidates24h: Post[],
  candidates48h: Post[],
  used: Set<string>,
  recentViews: RecentViewsMap,
  hasHistory: boolean,
  now: number,
): { post: Post | null; reason: SelectionReason; usedFallback48h: boolean } {
  const pool24 = candidates24h.filter((p) => !used.has(p.id));
  const pool48 = candidates48h.filter((p) => !used.has(p.id));

  const chooseFrom = (pool: Post[]): { post: Post; reason: SelectionReason } | null => {
    if (!pool.length) return null;
    if (hasHistory) {
      // maior views 24h; empate → mais recente
      const withViews = pool
        .map((p) => ({ p, v: recentViews[p.id] ?? 0 }))
        .filter((x) => x.v >= 2)
        .sort((a, b) => (b.v - a.v) || sortByPublishedDesc(a.p, b.p));
      if (withViews.length) return { post: withViews[0].p, reason: "mais_vista_24h" };
    }
    const byRecency = [...pool].sort(sortByPublishedDesc);
    return { post: byRecency[0], reason: "mais_recente" };
  };

  const first = chooseFrom(pool24);
  if (first) return { post: first.post, reason: first.reason, usedFallback48h: false };
  const fb = chooseFrom(pool48);
  if (fb) return { post: fb.post, reason: "fallback_48h", usedFallback48h: true };
  return { post: null, reason: "sem_candidata", usedFallback48h: false };
}

export function buildSimpleHomeLayout(
  posts: Post[],
  recentViews: RecentViewsMap,
  now: number = Date.now(),
): SimpleHomeLayout {
  const hasRecentViewsHistory = Object.keys(recentViews).length > 0;
  const eligibles = posts.filter((p) => isEligible(p, now));

  const cut24 = now - 24 * HOUR;
  const cut48 = now - 48 * HOUR;
  const pubTs = (p: Post) => new Date(p.published_at!).getTime();
  const in24h = eligibles.filter((p) => pubTs(p) >= cut24);
  const in48h = eligibles.filter((p) => pubTs(p) >= cut48);

  const used = new Set<string>();

  /* ============ MANCHETE ============ */
  let manchete: SimpleSlot;

  // A. Plantão ativo — a mais recente entre plantões ativos
  const plantoes = eligibles
    .filter((p) => isPlantaoActive(p, now))
    .sort(sortByPublishedDesc);
  const plantao1 = plantoes[0] ?? null;

  // B. Fixação manual
  const pinned = eligibles
    .filter((p) => isPinnedActive(p, now, "manchete"))
    .sort((a, b) => new Date(b.pinned_until!).getTime() - new Date(a.pinned_until!).getTime())[0] ?? null;

  if (plantao1) {
    manchete = mkSlot(plantao1, "plantao_ativo", recentViews);
  } else if (pinned) {
    manchete = mkSlot(pinned, "fixada_manual", recentViews);
  } else {
    // C. Publicada há menos de 2h → mais recente
    const fresh = eligibles
      .filter((p) => ageMs(p, now) < 2 * HOUR)
      .sort(sortByPublishedDesc)[0];
    if (fresh) {
      manchete = mkSlot(fresh, "publicada_menos_2h", recentViews);
    } else {
      // D. Mais vista em 24h (mín 2 views) — só se houver histórico
      let chosen: { post: Post; reason: SelectionReason } | null = null;
      if (hasRecentViewsHistory) {
        const ranked = in24h
          .map((p) => ({ p, v: recentViews[p.id] ?? 0 }))
          .filter((x) => x.v >= 2)
          .sort((a, b) => (b.v - a.v) || sortByPublishedDesc(a.p, b.p));
        if (ranked.length) chosen = { post: ranked[0].p, reason: "mais_vista_24h" };
      }
      // E. Mais recente (dentro de 24h)
      if (!chosen && in24h.length) {
        chosen = { post: [...in24h].sort(sortByPublishedDesc)[0], reason: "mais_recente" };
      }
      // F. Fallback 48h
      if (!chosen && in48h.length) {
        chosen = { post: [...in48h].sort(sortByPublishedDesc)[0], reason: "fallback_48h" };
      }
      if (chosen) {
        manchete = mkSlot(
          chosen.post,
          chosen.reason,
          recentViews,
          chosen.reason === "fallback_48h",
        );
      } else {
        manchete = mkSlot(null, "sem_candidata", recentViews);
      }
    }
  }
  if (manchete.post) used.add(manchete.post.id);

  /* ============ LATERAIS ============ */
  const nextLateral = () => {
    const r = pickNext(in24h, in48h, used, recentViews, hasRecentViewsHistory, now);
    if (r.post) used.add(r.post.id);
    return {
      post: r.post,
      reason: r.reason,
      reasonLabel: REASON_LABEL[r.reason],
      usedFallback48h: r.usedFallback48h,
      recentViews: r.post ? recentViews[r.post.id] ?? null : null,
    } as SimpleSlot;
  };

  const lateral1 = nextLateral();
  const lateral2 = nextLateral();
  const lateral3 = nextLateral();

  /* ============ EM DESTAQUE AGORA ============ */
  const emDestaque = nextLateral();

  /* ============ PLANTÃO (faixa) ============ */
  // Apenas plantões válidos; nunca vencidos.
  const plantaoSlot: SimpleSlot = plantao1
    ? mkSlot(plantao1, "plantao_ativo", recentViews)
    : mkSlot(null, "sem_candidata", recentViews);

  return {
    manchete,
    lateral1,
    lateral2,
    lateral3,
    emDestaque,
    plantao: plantaoSlot,
    hasRecentViewsHistory,
  };
}
