import type { Post } from "./news";
import { getManualHomePosts } from "./homeSlots";

/**
 * Ranking Engine v2 (G1 PRO).
 *
 *   finalScore = recency*0.35 + categoryWeight*0.25 + engagement*0.25 + entityImpact*0.15
 *
 * Cada eixo é normalizado em 0..1 antes da pesagem. Boosts editoriais
 * (urgent, main_featured) somam por cima do score base.
 */

export const WEIGHTS = {
  recency: 0.35,
  category: 0.25,
  engagement: 0.25,
  entity: 0.15,
} as const;

const CATEGORY_WEIGHT: Record<string, number> = {
  policia: 1.0,
  politica: 0.9,
  brasil: 0.75,
  sergipe: 0.7,
  aracaju: 0.7,
  mundo: 0.55,
  economia: 0.55,
  interior: 0.5,
  saude: 0.45,
  educacao: 0.45,
  esportes: 0.35,
  entretenimento: 0.25,
};

const ENTITIES = [
  "polícia", "policia", "governo", "governador", "prefeito", "ministro",
  "eleição", "eleicao", "acidente", "morte", "morreu", "morto",
  "prisão", "prisao", "preso", "presa", "operação", "operacao",
  "denúncia", "denuncia", "escândalo", "escandalo", "crime",
  "homicídio", "homicidio", "tragédia", "tragedia", "stf", "tcu",
  "feminicídio", "feminicidio", "tiroteio", "assalto",
];

function lower(...parts: (string | null | undefined)[]) {
  return parts.filter(Boolean).join(" ").toLowerCase();
}

function ageHours(post: Post): number {
  const d = post.published_at ?? post.created_at;
  if (!d) return 1e6;
  return Math.max(0, (Date.now() - new Date(d).getTime()) / 3_600_000);
}

/* ============ Axes (0..1) ============ */

function recencyScore(post: Post): number {
  if (post.is_evergreen) return 0.4;
  const h = ageHours(post);
  // exp(-h/24): 0h=1, 24h≈0.37, 48h≈0.13, 72h≈0.05
  return Math.exp(-h / 24);
}

function categoryScore(post: Post): number {
  const slug = (post.categories?.slug ?? "").toLowerCase();
  return CATEGORY_WEIGHT[slug] ?? 0.3;
}

function engagementScore(post: Post, maxViews: number): number {
  const v = Math.max(0, post.views ?? 0);
  if (maxViews <= 0) return 0;
  // log-normalizado para suavizar caudas longas
  return Math.log10(v + 1) / Math.log10(maxViews + 1);
}

function entityScore(post: Post): number {
  const text = lower(post.title, post.subtitle, post.excerpt, (post.tags ?? []).join(" "));
  let hits = 0;
  for (const e of ENTITIES) if (text.includes(e)) hits++;
  return Math.min(1, hits / 4); // 4+ hits = 1.0
}

/* ============ Score composto ============ */

export type Ranked = {
  post: Post;
  score: number;
  axes: { recency: number; category: number; engagement: number; entity: number };
  boosts: string[];
};

export function rankPosts(posts: Post[]): Ranked[] {
  const maxViews = posts.reduce((m, p) => Math.max(m, p.views ?? 0), 0);
  return posts
    .map<Ranked>((post) => {
      const axes = {
        recency: recencyScore(post),
        category: categoryScore(post),
        engagement: engagementScore(post, maxViews),
        entity: entityScore(post),
      };
      let score =
        axes.recency * WEIGHTS.recency +
        axes.category * WEIGHTS.category +
        axes.engagement * WEIGHTS.engagement +
        axes.entity * WEIGHTS.entity;
      const boosts: string[] = [];
      if (post.is_urgent) {
        score += 0.5;
        boosts.push("urgent+0.5");
      }
      if (post.is_main_featured) {
        score += 0.3;
        boosts.push("main_featured+0.3");
      }
      return { post, score, axes, boosts };
    })
    .sort((a, b) => b.score - a.score);
}

/** Mantido para compatibilidade com chamadas existentes. */
export function editorialScore(post: Post) {
  const [r] = rankPosts([post]);
  return {
    post: r.post,
    score: Math.round(r.score * 100) / 100,
    editorialWeight: Math.round((r.axes.category + r.axes.entity) * 100) / 100,
    reasons: [
      `recency=${r.axes.recency.toFixed(2)}`,
      `category=${r.axes.category.toFixed(2)}`,
      `engagement=${r.axes.engagement.toFixed(2)}`,
      `entity=${r.axes.entity.toFixed(2)}`,
      ...r.boosts,
    ],
  };
}

/* ============ Pickers ============ */

export function pickManchete(posts: Post[]): Post | null {
  if (!posts.length) return null;
  return rankPosts(posts)[0]?.post ?? null;
}

export function pickSecundarias(posts: Post[], manchete: Post | null, n = 3): Post[] {
  if (!manchete) return posts.slice(0, n);
  const cat = manchete.categories?.slug ?? null;
  const cutoff = Date.now() - 24 * 3600 * 1000;
  const pool = posts.filter((p) => {
    if (p.id === manchete.id) return false;
    if (cat && p.categories?.slug === cat) return true;
    const t = new Date(p.published_at ?? p.created_at).getTime();
    return t >= cutoff;
  });
  const ranked = rankPosts(pool).map((r) => r.post);
  if (ranked.length >= n) return ranked.slice(0, n);
  const fillers = rankPosts(
    posts.filter((p) => p.id !== manchete.id && !ranked.some((x) => x.id === p.id)),
  ).map((r) => r.post);
  return [...ranked, ...fillers].slice(0, n);
}

export function pickTrending(posts: Post[], n = 5): Post[] {
  const maxViews = posts.reduce((m, p) => Math.max(m, p.views ?? 0), 0);
  return [...posts]
    .map((p) => {
      const eng = engagementScore(p, maxViews);
      const rec = recencyScore(p);
      // engajamento pesa mais que recência para trending
      const score = eng * 0.7 + rec * 0.3 + (p.is_urgent ? 0.15 : 0);
      return { p, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, n)
    .map((x) => x.p);
}

export function pickLatest(posts: Post[], n = 10): Post[] {
  return [...posts]
    .sort(
      (a, b) =>
        new Date(b.published_at ?? b.created_at).getTime() -
        new Date(a.published_at ?? a.created_at).getTime(),
    )
    .slice(0, n);
}

/** Breaking news: urgentes da última hora (ou marcadas urgent) por recência. */
export function pickBreaking(posts: Post[], n = 10): Post[] {
  const cutoff = Date.now() - 60 * 60 * 1000;
  const urgent = posts.filter(
    (p) =>
      p.is_urgent ||
      new Date(p.published_at ?? p.created_at).getTime() >= cutoff,
  );
  return urgent
    .sort(
      (a, b) =>
        new Date(b.published_at ?? b.created_at).getTime() -
        new Date(a.published_at ?? a.created_at).getTime(),
    )
    .slice(0, n);
}

/* ============ Override editorial ============ */

export type ManualOverride = {
  manchete?: Post;
  secundarias: Post[];
};

/**
 * Lê os slots manuais do `home_audit` e aplica sobre o ranking automático.
 * Manchete manual sempre vence; laterais manuais preenchem slots 1..3.
 */
export async function applyManualOverride(
  auto: { manchete: Post | null; secundarias: Post[] },
): Promise<{ manchete: Post | null; secundarias: Post[] }> {
  let manual: Awaited<ReturnType<typeof getManualHomePosts>> = {};
  try {
    manual = await getManualHomePosts();
  } catch (err) {
    console.warn("[editorial] override indisponível", err);
    return auto;
  }
  const manchete = manual.manchete ?? auto.manchete;
  const slots = [
    manual.destaque_lateral_1,
    manual.destaque_lateral_2,
    manual.destaque_lateral_3,
  ];
  const used = new Set<string>();
  if (manchete) used.add(manchete.id);
  const secundarias: Post[] = [];
  for (const slot of slots) {
    if (slot && !used.has(slot.id)) {
      secundarias.push(slot);
      used.add(slot.id);
    }
  }
  for (const p of auto.secundarias) {
    if (secundarias.length >= 3) break;
    if (!used.has(p.id)) {
      secundarias.push(p);
      used.add(p.id);
    }
  }
  return { manchete, secundarias };
}

/* ============ Normalização ============ */

export type NormalizedPost = {
  id: string;
  title: string;
  summary: string;
  image: string | null;
  category: string;
  categorySlug: string;
  date: string;
  source: string;
  raw: Post;
};

export function normalizePost(post: Post): NormalizedPost {
  return {
    id: post.id,
    title: post.title ?? "Sem título",
    summary: post.subtitle ?? post.excerpt ?? "",
    image: post.cover_image_url ?? post.manual_image_url ?? null,
    category: post.categories?.name ?? "Geral",
    categorySlug: post.categories?.slug ?? "geral",
    date: post.published_at ?? post.created_at,
    source: post.is_editorial ? "Redação" : "Fonte externa",
    raw: post,
  };
}
