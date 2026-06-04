// Reclassifica categorias de posts existentes aplicando a mesma cadeia de
// regras usada na captação:
//   1. Prioridade definida pelo usuário (Denúncias, Polícia, Política, etc.)
//   2. RSS Tags
//   3. Keywords
//   4. default_category_id da fonte
//   5. Fallback heurístico
//
// Auth: somente staff (admin/editor/redator) via JWT.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function norm(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

const CATEGORY_MAP: Record<string, string> = {
  "politica": "politica", "eleicoes": "politica", "governo": "politica", "congresso": "politica",
  "esporte": "esporte", "futebol": "esporte", "esportes": "esporte",
  "aracaju": "aracaju", "capital": "aracaju",
  "denuncia": "denuncias", "denuncias": "denuncias",
  "policia": "policia", "seguranca": "policia", "crime": "policia", "violencia": "policia",
  "brasil": "brasil", "nacional": "brasil",
  "mundo": "mundo", "internacional": "mundo", "exterior": "mundo",
  "municipio": "municipios", "municipios": "municipios", "interior": "municipios", "cidade": "municipios", "cidades": "municipios",
  "sergipe": "sergipe", "estado": "sergipe",
  "entretenimento": "entretenimento", "cultura": "entretenimento", "celebridades": "entretenimento", "tv": "entretenimento", "musica": "entretenimento", "viral": "entretenimento", "famosos": "entretenimento",
  "video": "videos", "videos": "videos",
  "opiniao": "opiniao", "editorial": "opiniao", "coluna": "opiniao", "artigo": "opiniao",
};

const KEYWORD_MAP: Record<string, string[]> = {
  "denuncias": ["denuncia", "irregularidade", "reclamacao", "denunciar", "criminoso"],
  "policia": ["crime", "policia", "operacao", "preso", "assalto", "homicidio", "feminicidio", "trafico", "drogas", "assaltante", "roubo", "delegado", "viatura", "pmse", "prf", "pcse"],
  "politica": ["governo", "congresso", "camara", "senado", "prefeito", "eleicao", "parlamentar", "ministerio", "politica", "vereador", "deputado", "governador", "prefeitura", "alesse"],
  "esporte": ["futebol", "jogo", "campeonato", "selecao", "jogador", "gol", "tecnico", "time", "brasileirao", "copa", "libertadores", "esporte", "confianca", "sergipe", "itabaiana"],
  "aracaju": ["aracaju", "capital sergipana", "bairro de aracaju", "atalaia", "jardins", "13 de julho", "ponto novo", "farolandia", "santos dumont", "bugio", "augusto franco", "siqueira campos", "soledade", "jabotiana", "piazza", "aeroporto", "santa maria"],
  "municipios": ["interior", "municipio", "lagarto", "itabaiana", "estancia", "socorro", "barra dos coqueiros", "propria", "sao cristovao", "tobias barreto", "capela", "simao dias", "itabaianinha", "caninde", "laranjeiras", "itaporanga", "poco redondo", "neopolis", "boquim", "umbauba", "cristinapolis", "aquidaba"],
  "sergipe": ["sergipe", "sergipano", "estado", "governo do estado", "tce", "mp-se", "mpe", "tribunal de contas", "governo de sergipe", "governo estadual", "governador de sergipe"],
  "brasil": ["brasil", "nacional", "brasilia", "stf", "stj", "lula", "bolsonaro"],
  "mundo": ["mundo", "exterior", "internacional", "eua", "europa", "guerra", "china"],
  "entretenimento": ["cantor", "tv", "musica", "cinema", "reality", "famosos", "celebridades", "viral", "cultura", "show"],
  "opiniao": ["opiniao", "analise", "coluna", "artigo", "editorial"],
};

const STRONG_KEYWORDS: Record<string, string[]> = {
  "denuncias": ["denuncia", "denunciar", "reclamacao"],
  "policia": ["policia", "preso", "prisao", "homicidio", "feminicidio", "trafico", "assalto", "roubo"],
};

const PRIORITY_SLUGS = [
  "denuncias",
  "policia",
  "politica",
  "esporte",
  "aracaju",
  "municipios",
  "sergipe",
  "brasil",
  "mundo",
  "entretenimento",
  "opiniao"
];

function matchesCategory(slug: string, text: string, tags: string[] | null): { matched: boolean; origin: string } {
  const t = ` ${norm(text)} `;
  
  // 1. Check Tags
  if (tags) {
    for (const raw of tags) {
      if (CATEGORY_MAP[norm(raw)] === slug) return { matched: true, origin: "rss_tag" };
    }
  }

  // 2. Check Strong Keywords
  if (STRONG_KEYWORDS[slug]) {
    for (const kw of STRONG_KEYWORDS[slug]) {
      const re = new RegExp(`[^a-z0-9]${kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[^a-z0-9]`);
      if (re.test(t)) return { matched: true, origin: `${slug}_strong` };
    }
  }

  // 3. Check General Keywords
  if (KEYWORD_MAP[slug]) {
    for (const kw of KEYWORD_MAP[slug]) {
      const re = new RegExp(`[^a-z0-9]${kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[^a-z0-9]`);
      if (re.test(t)) return { matched: true, origin: "keyword" };
    }
  }

  return { matched: false, origin: "" };
}

function resolveFinalCategoryId(args: {
  tags: string[] | null;
  title: string;
  excerpt: string | null;
  sourceDefaultCategoryId: string | null;
  categoryBySlug: Map<string, string>;
  categoryById: Map<string, string>;
}): { id: string | null; origin: string } {
  const text = `${args.title} ${args.excerpt ?? ""}`;

  for (const slug of PRIORITY_SLUGS) {
    const { matched, origin } = matchesCategory(slug, text, args.tags);
    if (matched) {
      const id = args.categoryBySlug.get(slug);
      if (id) return { id, origin };
    }
  }

  if (args.sourceDefaultCategoryId) {
    return { id: args.sourceDefaultCategoryId, origin: "source_default" };
  }

  const defaultSlug = args.sourceDefaultCategoryId
    ? args.categoryById.get(args.sourceDefaultCategoryId)
    : undefined;
  
  if (defaultSlug === "brasil" || defaultSlug === "mundo") {
    const id = args.categoryBySlug.get("brasil") ?? args.categoryBySlug.get("municipios") ?? null;
    return { id, origin: "fallback_brasil" };
  }
  
  const id = args.categoryBySlug.get("municipios") ?? args.categoryBySlug.get("sergipe") ?? args.categoryBySlug.get("brasil") ?? null;
  return { id, origin: "fallback_municipios" };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return json(401, { error: "Unauthorized" });
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const token = authHeader.replace("Bearer ", "");
  const { data: claims, error: claimsErr } = await userClient.auth.getClaims(token);
  if (claimsErr || !claims?.claims?.sub) {
    return json(401, { error: "Unauthorized" });
  }

  const userId = claims.claims.sub as string;
  const admin = createClient(supabaseUrl, serviceKey);

  const { data: isStaff } = await admin.rpc("is_staff", { _user_id: userId });
  if (!isStaff) {
    return json(403, { error: "Forbidden: staff only" });
  }

  // Carrega categorias internas
  const { data: cats, error: catsErr } = await admin
    .from("categories")
    .select("id, slug");
  if (catsErr) return json(500, { error: catsErr.message });

  const categoryBySlug = new Map<string, string>();
  const categoryById = new Map<string, string>();
  for (const c of cats ?? []) {
    categoryBySlug.set((c as any).slug as string, (c as any).id as string);
    categoryById.set((c as any).id as string, (c as any).slug as string);
  }

  // Carrega posts (limitado a 1000 — limite default do PostgREST)
  const { data: posts, error: postsErr } = await admin
    .from("posts")
    .select("id, title, excerpt, tags, category_id, source_id, news_sources(default_category_id)")
    .in("status", ["captada", "em_revisao", "aprovada", "publicada"])
    .order("created_at", { ascending: false })
    .limit(1000);

  if (postsErr) return json(500, { error: postsErr.message });

  let total = posts?.length ?? 0;
  let updated = 0;
  let unchanged = 0;
  const byOrigin: Record<string, number> = {};

  for (const p of posts ?? []) {
    const sourceDefault =
      ((p as any).news_sources?.default_category_id as string | null) ?? null;

    const result = resolveFinalCategoryId({
      tags: ((p as any).tags as string[] | null) ?? null,
      title: ((p as any).title as string) ?? "",
      excerpt: ((p as any).excerpt as string | null) ?? null,
      sourceDefaultCategoryId: sourceDefault,
      categoryBySlug,
      categoryById,
    });

    if (!result.id || result.id === (p as any).category_id) {
      unchanged++;
      continue;
    }

    const { error: upErr } = await admin
      .from("posts")
      .update({ category_id: result.id })
      .eq("id", (p as any).id);

    if (upErr) {
      unchanged++;
      continue;
    }
    updated++;
    byOrigin[result.origin] = (byOrigin[result.origin] ?? 0) + 1;
  }

  return json(200, {
    ok: true,
    total_verificados: total,
    atualizados: updated,
    inalterados: unchanged,
    por_origem: byOrigin,
  });
});
