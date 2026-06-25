import type { Post } from "./news";
import { scorePost, type ScoredPost } from "./homeSlots";

/**
 * Motor editorial: classificação e normalização de notícias para a Home.
 * Construído em cima de `scorePost` para reaproveitar a lógica já validada,
 * adicionando uma camada explícita de prioridade por editoria, palavras de
 * impacto e helpers de seleção (manchete, secundárias, trending).
 */

const CATEGORY_WEIGHT: Record<string, number> = {
  policia: 50,
  política: 0,
  politica: 40,
  brasil: 32,
  sergipe: 30,
  aracaju: 28,
  mundo: 22,
  economia: 22,
  saude: 18,
  educacao: 16,
  esportes: 12,
  entretenimento: 8,
  interior: 18,
};

const IMPACT_KEYWORDS = [
  "morte", "morreu", "morto", "acidente", "tragédia", "tragedia",
  "crime", "homicídio", "homicidio", "feminicídio", "feminicidio",
  "prisão", "prisao", "preso", "presa", "operação", "operacao",
  "governo", "governador", "prefeito", "ministro", "eleição", "eleicao",
  "denúncia", "denuncia", "escândalo", "escandalo", "tiroteio", "assalto",
];

function lowerJoin(...parts: (string | null | undefined)[]) {
  return parts.filter(Boolean).join(" ").toLowerCase();
}

function categoryWeight(post: Post): number {
  const slug = (post.categories?.slug ?? "").toLowerCase();
  return CATEGORY_WEIGHT[slug] ?? 5;
}

function impactBoost(post: Post): number {
  const text = lowerJoin(post.title, post.subtitle, post.excerpt);
  const hits = IMPACT_KEYWORDS.reduce((n, w) => (text.includes(w) ? n + 1 : n), 0);
  return Math.min(hits, 4) * 8;
}

export type EditorialScore = ScoredPost & { editorialWeight: number };

export function editorialScore(post: Post): EditorialScore {
  const base = scorePost(post);
  const weight = categoryWeight(post) + impactBoost(post);
  return { ...base, editorialWeight: weight, score: base.score + weight };
}

/** Escolhe a melhor manchete. Retorna `null` se não houver candidatos. */
export function pickManchete(posts: Post[]): Post | null {
  if (!posts.length) return null;
  const scored = posts.map(editorialScore).sort((a, b) => b.score - a.score);
  return scored[0]?.post ?? null;
}

/** Notícias secundárias (mesma editoria da manchete OU últimas 24h), dedup. */
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
  const sorted = pool
    .map(editorialScore)
    .sort((a, b) => b.score - a.score)
    .map((s) => s.post);
  // se faltar, completa com os demais por recência
  if (sorted.length >= n) return sorted.slice(0, n);
  const fillers = posts
    .filter((p) => p.id !== manchete.id && !sorted.some((x) => x.id === p.id))
    .sort(
      (a, b) =>
        new Date(b.published_at ?? b.created_at).getTime() -
        new Date(a.published_at ?? a.created_at).getTime(),
    );
  return [...sorted, ...fillers].slice(0, n);
}

export function pickTrending(posts: Post[], n = 5): Post[] {
  return [...posts]
    .sort((a, b) => {
      const va = a.views ?? 0;
      const vb = b.views ?? 0;
      if (vb !== va) return vb - va;
      return (
        new Date(b.published_at ?? b.created_at).getTime() -
        new Date(a.published_at ?? a.created_at).getTime()
      );
    })
    .slice(0, n);
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
