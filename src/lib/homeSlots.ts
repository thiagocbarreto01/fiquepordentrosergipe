import { supabase } from "@/integrations/supabase/client";
import type { Post } from "./news";
import { postHasOwnImage } from "./postImage";

export const HOME_RECENT_DAYS = 7;

/* ============================================================
   PONTUAÇÃO EDITORIAL — escolhe a manchete mais forte
   ============================================================ */

const POLICE_KEYWORDS = [
  "acidente", "morte", "morreu", "morto", "prisão", "preso", "presa", "presos",
  "perseguição", "operação", "denúncia", "tiroteio", "assalto", "homicídio",
  "tráfico", "apreensão", "quadrilha", "facção", "violência", "feminicídio",
];
const POLITICS_KEYWORDS = [
  "governador", "prefeito", "câmara", "assembleia", "ministro", "presidente",
  "eleição", "votação", "lei", "projeto de lei", "stf", "tcu", "tce",
];
const REGION_KEYWORDS = ["aracaju", "sergipe", "municípios", "municipios"];
const SOFT_KEYWORDS = [
  "esporte", "futebol", "entretenimento", "show", "festival", "celebridade",
  "energisa", "comunicado", "institucional", "informa",
];

function lower(...parts: (string | null | undefined)[]) {
  return parts.filter(Boolean).join(" ").toLowerCase();
}
function hasAny(text: string, words: string[]) {
  return words.some((w) => text.includes(w));
}

export type ScoredPost = { post: Post; score: number; reasons: string[] };

export function scorePost(post: Post): ScoredPost {
  const reasons: string[] = [];
  let score = 0;
  const cat = (post.categories?.slug ?? "").toLowerCase();
  const text = lower(post.title, post.subtitle, post.excerpt, (post.tags ?? []).join(" "));

  if (post.is_urgent) { score += 100; reasons.push("Plantão / Urgente (+100)"); }
  if (post.is_evergreen) { score += 90; reasons.push("P1 Destaque Permanente (+90)"); }
  if (post.is_main_featured && isMainFeaturedActive(post)) { score += 80; reasons.push("P2 Destaque Principal (+80)"); }
  else if (post.is_main_featured) { reasons.push("P2 expirou — peso removido"); }
  if (post.is_featured) { score += 30; reasons.push("P3 Destaque (+30)"); }

  if (cat === "policia" || cat === "polícia") { score += 40; reasons.push("Editoria Polícia (+40)"); }
  if (hasAny(text, POLICE_KEYWORDS)) { score += 35; reasons.push("Palavra-chave policial (+35)"); }
  if (cat === "politica" || cat === "política" || hasAny(text, POLITICS_KEYWORDS)) {
    score += 25; reasons.push("Política relevante (+25)");
  }
  if (["aracaju", "sergipe", "municipios", "municípios"].includes(cat) || hasAny(text, REGION_KEYWORDS)) {
    score += 15; reasons.push("Interesse local SE (+15)");
  }
  if (["esporte", "entretenimento", "servicos", "serviços"].includes(cat) || hasAny(text, SOFT_KEYWORDS)) {
    score += 5; reasons.push("Editoria leve/serviço (+5)");
  }

  const refDate = post.published_at ?? post.created_at;
  if (refDate) {
    const hours = (Date.now() - new Date(refDate).getTime()) / 3_600_000;
    const ageLabel =
      hours < 1 ? `${Math.max(1, Math.round(hours * 60))} min`
      : hours < 24 ? `${Math.round(hours)}h`
      : `${Math.round(hours / 24)}d`;
    let bonus = 0;
    if (hours < 1) bonus = 50;
    else if (hours < 3) bonus = 40;
    else if (hours < 6) bonus = 30;
    else if (hours < 12) bonus = 20;
    else if (hours < 24) bonus = 10;
    else if (hours < 48) bonus = 5;
    else bonus = 0;
    if (bonus > 0) {
      score += bonus;
      reasons.push(`Recência ${ageLabel} (+${bonus})`);
    } else {
      reasons.push(`Recência ${ageLabel} (+0)`);
    }
  }

  return { post, score, reasons };
}

export function isRecent(post: Post, days = 7) {
  const d = post.published_at ?? post.created_at;
  if (!d) return false;
  return Date.now() - new Date(d).getTime() <= days * 24 * 60 * 60 * 1000;
}

export function isActiveHomePlantao(post: Post): boolean {
  if (!post.is_urgent || !post.home_expires_at) return false;
  return new Date(post.home_expires_at).getTime() > Date.now();
}

export function isMainFeaturedActive(post: Post): boolean {
  if (!post.is_main_featured) return false;
  // Regra: P2 SEM data de validade não recebe o bônus (evita travar a manchete eternamente).
  if (!post.main_featured_expires_at) return false;
  return new Date(post.main_featured_expires_at).getTime() > Date.now();
}

export function isEligibleForHome(post: Post): boolean {
  return isRecent(post, HOME_RECENT_DAYS) || Boolean(post.is_evergreen) || isActiveHomePlantao(post);
}

export function filterEligibleHomePosts(posts: Post[]): Post[] {
  return posts.filter(isEligibleForHome);
}

/** Pode ocupar vitrine (manchete/laterais/em destaque)? Precisa imagem + recência (ou P1/Plantão). */
export function canOccupyShowcase(post: Post): boolean {
  return postHasOwnImage(post) && isEligibleForHome(post);
}

export type HomeLayoutSlot = {
  post: Post | null;
  score: number;
  reasons: string[];
  reasonLabel: string;
};

export type HomeLayout = {
  manchetePrincipal: HomeLayoutSlot;
  destaqueLateral1: HomeLayoutSlot;
  destaqueLateral2: HomeLayoutSlot;
  destaqueLateral3: HomeLayoutSlot;
  destaqueAgora: HomeLayoutSlot;
  plantaoAtivo: HomeLayoutSlot;
  maisRecentes: Post[];
  ignoradasPorImagem: Post[];
};

function emptySlot(label = "Nenhuma notícia elegível"): HomeLayoutSlot {
  return { post: null, score: 0, reasons: [], reasonLabel: label };
}
function toSlot(s: ScoredPost | undefined, fallback = "Selecionada por relevância"): HomeLayoutSlot {
  if (!s) return emptySlot();
  return { post: s.post, score: s.score, reasons: s.reasons, reasonLabel: s.reasons[0] ?? fallback };
}

export function buildHomeLayout({ published }: { published: Post[] }): HomeLayout {
  const all = published.filter((p) => {
    const s = String(p.status ?? "").toLowerCase();
    if (s === "publicada" || s === "publicado") return true;
    if (p.published_at) return true;
    return false;
  });

  const dedupe = (list: Post[]) => {
    const seen = new Set<string>();
    return list.filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)));
  };

  const eligible = dedupe(all.filter(isEligibleForHome));
  // FALLBACK: a Home NUNCA pode ficar vazia. Se a recência/plantão/evergreen
  // não retornar nada, usamos todas as publicadas mais recentes.
  const baseForShowcase = eligible.length > 0 ? eligible : dedupe(all);
  // Preferimos com imagem própria; se nenhuma tiver, ainda exibimos as mais
  // recentes (placeholder/categoria) em vez de deixar a vitrine em branco.
  const withImage = baseForShowcase.filter(canOccupyShowcase);
  const showcaseEligible = withImage.length > 0 ? withImage : baseForShowcase;

  const scoredLayered = showcaseEligible.map(scorePost).sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const ta = new Date(a.post.published_at ?? a.post.created_at).getTime();
    const tb = new Date(b.post.published_at ?? b.post.created_at).getTime();
    return tb - ta;
  });

  const used = new Set<string>();



  const ageHours = (p: Post) => {
    const d = p.published_at ?? p.created_at;
    return d ? (Date.now() - new Date(d).getTime()) / 3_600_000 : Infinity;
  };

  // Manchete: usa pontuação editorial, mas garante que notícias da última hora
  // têm prioridade sobre matérias com mais de 48h.
  const mancheteSorted = [...scoredLayered].sort((a, b) => {
    const ha = ageHours(a.post);
    const hb = ageHours(b.post);
    const aFresh = ha < 1;
    const bFresh = hb < 1;
    const aOld = ha > 48;
    const bOld = hb > 48;
    if (aFresh && bOld) return -1;
    if (bFresh && aOld) return 1;
    if (b.score !== a.score) return b.score - a.score;
    return ha - hb;
  });
  const manchete = mancheteSorted.find((s) => !used.has(s.post.id));
  if (manchete) used.add(manchete.post.id);

  // Laterais / Em Destaque: priorizam recência pura entre as elegíveis restantes.
  const byRecency = [...scoredLayered].sort((a, b) => ageHours(a.post) - ageHours(b.post));
  const takeRecent = (): ScoredPost | undefined => {
    const f = byRecency.find((s) => !used.has(s.post.id));
    if (f) used.add(f.post.id);
    return f;
  };
  const lateral1 = takeRecent();
  const lateral2 = takeRecent();
  const lateral3 = takeRecent();
  const emDestaque = takeRecent();

  const plantaoScored = showcaseEligible
    .filter((p) => p.is_urgent && (isRecent(p, HOME_RECENT_DAYS) || isActiveHomePlantao(p)))
    .map(scorePost)
    .sort((a, b) => ageHours(a.post) - ageHours(b.post));
  const plantao = plantaoScored.find((s) => !used.has(s.post.id));
  if (plantao) used.add(plantao.post.id);

  const maisRecentesBase = eligible.length > 0 ? eligible : baseForShowcase;
  const maisRecentes = maisRecentesBase
    .filter((p) => !used.has(p.id))
    .sort((a, b) => ageHours(a) - ageHours(b));

  const ignoradasPorImagem = baseForShowcase.filter((p) => !postHasOwnImage(p)).slice(0, 10);

  if (typeof window !== "undefined") {
    try {
      console.info("[Home][diag]", {
        total_publicadas: all.length,
        total_ultimos_7_dias: all.filter((p) => isRecent(p, HOME_RECENT_DAYS)).length,
        total_com_imagem: all.filter(postHasOwnImage).length,
        total_home_candidates: showcaseEligible.length,
        manchete_escolhida: manchete?.post?.title ?? null,
        laterais_escolhidas: [lateral1, lateral2, lateral3].map((s) => s?.post?.title ?? null),
      });
    } catch {}
  }

  return {
    manchetePrincipal: manchete ? toSlot(manchete, "Maior pontuação editorial") : emptySlot("Sem notícias recentes suficientes"),
    destaqueLateral1: lateral1 ? toSlot(lateral1) : emptySlot("Sem notícias recentes suficientes"),
    destaqueLateral2: lateral2 ? toSlot(lateral2) : emptySlot("Sem notícias recentes suficientes"),
    destaqueLateral3: lateral3 ? toSlot(lateral3) : emptySlot("Sem notícias recentes suficientes"),
    destaqueAgora: emDestaque ? toSlot(emDestaque) : emptySlot("Sem notícias recentes suficientes"),
    plantaoAtivo: plantao ? toSlot(plantao, "Plantão / Urgente") : emptySlot("Nenhum plantão recente ativo"),
    maisRecentes,
    ignoradasPorImagem,
  };
}



export const HOME_SLOT_KEYS = [
  "manchete",
  "destaque_lateral_1",
  "destaque_lateral_2",
  "destaque_lateral_3",
  "em_destaque_agora",
  "plantao_ativo",
] as const;

export type HomeSlotKey = (typeof HOME_SLOT_KEYS)[number];

export const HOME_SLOT_LABELS: Record<HomeSlotKey, string> = {
  manchete: "Manchete Principal",
  destaque_lateral_1: "Destaque Lateral 1",
  destaque_lateral_2: "Destaque Lateral 2",
  destaque_lateral_3: "Destaque Lateral 3",
  em_destaque_agora: "Em Destaque Agora",
  plantao_ativo: "Plantão Ativo",
};

const LEGACY_KEY_MAP: Record<string, HomeSlotKey> = {
  manchete: "manchete",
  lateral_1: "destaque_lateral_1",
  lateral_2: "destaque_lateral_2",
  lateral_3: "destaque_lateral_3",
  destaque_lateral_1: "destaque_lateral_1",
  destaque_lateral_2: "destaque_lateral_2",
  destaque_lateral_3: "destaque_lateral_3",
  em_destaque: "em_destaque_agora",
  em_destaque_agora: "em_destaque_agora",
  plantao: "plantao_ativo",
  plantao_ativo: "plantao_ativo",
};

export function normalizeHomeSlotKey(key?: string | null): HomeSlotKey | null {
  if (!key) return null;
  const normalized = key
    .toString()
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_");

  return LEGACY_KEY_MAP[normalized] ?? null;
}

export type HomeSlotSelection = {
  slotKey: HomeSlotKey;
  label: string;
  postId: string;
  selectedAt: string;
  selectedBy: string | null;
  reason: string | null;
};

type HomeAuditRow = {
  position: string | null;
  post_id: string | null;
  created_at: string;
  changed_by?: string | null;
  reason?: string | null;
};

export type ResolvedHomeSlots = Record<HomeSlotKey, Post | null>;

type ResolveHomeSlotsArgs = {
  featured: Post | null;
  highlights: Post[];
  latest: Post[];
  urgent: Post[];
  manualPosts?: Partial<Record<HomeSlotKey, Post>>;
};

function nextUnused(posts: Post[], usedIds: Set<string>) {
  return posts.find((post) => !usedIds.has(post.id)) ?? null;
}

export function resolveHomeSlots({ featured, highlights, latest, urgent, manualPosts = {} }: ResolveHomeSlotsArgs): ResolvedHomeSlots {
  const usedIds = new Set<string>();

  const manchete = manualPosts.manchete ?? featured ?? latest[0] ?? null;
  if (manchete) usedIds.add(manchete.id);

  const highlightPool = highlights.filter((post) => post.id !== manchete?.id);

  const destaque_lateral_1 = manualPosts.destaque_lateral_1 ?? nextUnused(highlightPool, usedIds);
  if (destaque_lateral_1) usedIds.add(destaque_lateral_1.id);

  const destaque_lateral_2 = manualPosts.destaque_lateral_2 ?? nextUnused(highlightPool, usedIds);
  if (destaque_lateral_2) usedIds.add(destaque_lateral_2.id);

  const destaque_lateral_3 = manualPosts.destaque_lateral_3 ?? nextUnused(highlightPool, usedIds);
  if (destaque_lateral_3) usedIds.add(destaque_lateral_3.id);

  const latestPool = latest.filter((post) => !usedIds.has(post.id));
  const em_destaque_agora =
    manualPosts.em_destaque_agora ?? latestPool.find((post) => post.is_featured) ?? latestPool[0] ?? null;

  const plantao_ativo =
    manualPosts.plantao_ativo ?? urgent.find((post) => post.is_urgent) ?? urgent[0] ?? null;

  return {
    manchete,
    destaque_lateral_1,
    destaque_lateral_2,
    destaque_lateral_3,
    em_destaque_agora,
    plantao_ativo,
  };
}

export async function getManualHomeSelections(): Promise<Record<HomeSlotKey, HomeSlotSelection | null>> {
  const empty = Object.fromEntries(HOME_SLOT_KEYS.map((key) => [key, null])) as Record<HomeSlotKey, HomeSlotSelection | null>;

  const { data, error } = await supabase
    .from("home_audit" as any)
    .select("position, post_id, created_at, changed_by, reason")
    .eq("action", "escolha_manual")
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) throw error;

  for (const row of ((data ?? []) as unknown as HomeAuditRow[])) {
    const slotKey = normalizeHomeSlotKey(row.position);
    if (!slotKey || empty[slotKey] || !row.post_id) continue;

    empty[slotKey] = {
      slotKey,
      label: HOME_SLOT_LABELS[slotKey],
      postId: row.post_id,
      selectedAt: row.created_at,
      selectedBy: row.changed_by ?? null,
      reason: row.reason ?? null,
    };
  }

  return empty;
}

export async function getManualHomePosts(): Promise<Partial<Record<HomeSlotKey, Post>>> {
  const selections = await getManualHomeSelections();
  const requestedIds = Array.from(
    new Set(
      Object.values(selections)
        .map((item) => item?.postId)
        .filter((value): value is string => Boolean(value)),
    ),
  );

  if (requestedIds.length === 0) return {};

  const { data, error } = await supabase
    .from("posts_public" as any)
    .select(`
      id, title, subtitle, excerpt, source_url, slug, content, cover_image_url, manual_image_url,
      category_id, author_id, tags, is_featured, is_main_featured, is_urgent, is_denuncia,
      meta_title, meta_description, views, published_at, created_at, updated_at,
      video_url_principal, videos_relacionados, home_expires_at, main_featured_expires_at, is_evergreen, source_id,
      categories ( name, slug, color, default_cover_image_url )
    `)
    .in("id", requestedIds);

  if (error) throw error;

  const byId = new Map((((data ?? []) as unknown as Post[])).map((post) => [post.id, post]));
  const result: Partial<Record<HomeSlotKey, Post>> = {};

  for (const [key, selection] of Object.entries(selections) as [HomeSlotKey, HomeSlotSelection | null][]) {
    if (!selection) continue;
    const post = byId.get(selection.postId);
    if (post) result[key] = post;
  }

  return result;
}