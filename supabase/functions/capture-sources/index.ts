// Captação automática de notícias a partir de fontes RSS cadastradas em
// `news_sources`. Itera sobre fontes ativas (ou apenas a fonte indicada via
// ?source_id), faz fetch do feed, parseia <item>/<entry>, valida duplicatas
// via RPC `find_duplicate_post` e insere posts com status="captada".
//
// Auth: apenas JWT válido de usuário staff (redator/editor/admin/super_admin).
// A verificação inicial de JWT é feita pelo gateway (verify_jwt=true) e revalidada
// no handler via `authenticateRequest` (ver ./auth.ts).
// SUPABASE_SERVICE_ROLE_KEY é usada apenas internamente pelo cliente admin;
// nunca é aceita como credencial enviada pelo chamador.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { authenticateRequest } from "./auth.ts";
import {
  corsHeaders,
  errorEnvelope,
  jsonResponse as json,
  logAuthorized,
  logAuthRejected,
  methodGuard,
  newRequestId,
} from "./handlers.ts";
import {
  createRunContext,
  evaluateMediaHost,
  fetchSourceText,
  type RunContext,
} from "./run-context.ts";

function slugify(s: string) {
  return s
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9 -]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);
}

function decodeEntities(s: string) {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ");
}

function stripCdata(s: string) {
  return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").trim();
}

function stripTags(s: string) {
  return decodeEntities(s.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

// Normaliza string para comparação: lowercase, sem acento, trim.
function norm(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

// Mapa de categorias externas (vindas do RSS) → slug de categoria interna.
// Chaves devem estar normalizadas (lowercase, sem acento).
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

// Mapa de palavras-chave (no título + resumo) → slug de categoria interna.
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

// Palavras-chave FORTES que forçam uma categoria mesmo sem tag do RSS.
const STRONG_KEYWORDS: Record<string, string[]> = {
  "denuncias": ["denuncia", "denunciar", "reclamacao"],
  "policia": ["policia", "preso", "prisao", "homicidio", "feminicidio", "trafico", "assalto", "roubo"],
};

function matchesCategory(slug: string, text: string, rssCategories: string[]): boolean {
  const t = ` ${norm(text)} `;
  
  // 1. Check RSS Categories
  for (const raw of rssCategories) {
    if (CATEGORY_MAP[norm(raw)] === slug) return true;
  }

  // 2. Check Strong Keywords (if any)
  if (STRONG_KEYWORDS[slug]) {
    for (const kw of STRONG_KEYWORDS[slug]) {
      const re = new RegExp(`[^a-z0-9]${kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[^a-z0-9]`);
      if (re.test(t)) return true;
    }
  }

  // 3. Check General Keywords
  if (KEYWORD_MAP[slug]) {
    for (const kw of KEYWORD_MAP[slug]) {
      const re = new RegExp(`[^a-z0-9]${kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[^a-z0-9]`);
      if (re.test(t)) return true;
    }
  }

  return false;
}

// Extrai todas as categorias de um bloco <item>/<entry>:
// - RSS 2.0: <category>...</category>
// - Atom: <category term="..." /> (também label="...")
// - Media RSS: <media:category>...</media:category>
function extractCategoriesFromBlock(block: string): string[] {
  const out: string[] = [];

  // <category>texto</category>
  const reText = /<category[^>]*>([\s\S]*?)<\/category>/gi;
  let m: RegExpExecArray | null;
  while ((m = reText.exec(block)) !== null) {
    const v = stripTags(stripCdata(m[1]));
    if (v) out.push(v);
  }

  // <category term="..." /> ou <category label="..." />
  const reAttr = /<category\b[^>]*\b(?:term|label)=['"]([^'"]+)['"][^>]*\/?>/gi;
  while ((m = reAttr.exec(block)) !== null) {
    if (m[1]) out.push(m[1]);
  }

  // <media:category>...</media:category>
  const reMedia = /<media:category[^>]*>([\s\S]*?)<\/media:category>/gi;
  while ((m = reMedia.exec(block)) !== null) {
    const v = stripTags(stripCdata(m[1]));
    if (v) out.push(v);
  }

  // dedup (case/acento insensível)
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const c of out) {
    const k = norm(c);
    if (k && !seen.has(k)) {
      seen.add(k);
      unique.push(c);
    }
  }
  return unique;
}

// Limpeza profunda do conteúdo vindo de RSS:
// - remove tags HTML residuais
// - remove URLs soltas (http/https/www)
// - remove "Leia mais", "Continue lendo", "The post ... appeared first on"
// - remove múltiplas quebras / espaços
// - remove linhas com "[...]" ou "..."
function cleanContent(raw: string | null | undefined): string {
  if (!raw) return "";
  let t = stripTags(raw);
  t = t.replace(/https?:\/\/\S+/gi, "");
  t = t.replace(/\bwww\.\S+/gi, "");
  t = t.replace(/\b(leia mais|continue lendo|saiba mais|veja também|read more|the post .* appeared first on .*)\b.*$/gim, "");
  t = t.replace(/\[\s*\.\.\.\s*\]/g, "");
  t = t.replace(/\.{3,}/g, ".");
  t = t.replace(/[ \t]+/g, " ");
  t = t.replace(/\n{2,}/g, "\n\n");
  return t.trim();
}

function getTag(block: string, tag: string): string | null {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const m = block.match(re);
  if (!m) return null;
  return stripCdata(m[1]).trim();
}

function getAttr(block: string, tag: string, attr: string): string | null {
  const re = new RegExp(`<${tag}[^>]*\\b${attr}=['"]([^'"]+)['"][^>]*\\/?>`, "i");
  const m = block.match(re);
  return m ? m[1] : null;
}

// Extrai a melhor imagem possível de um bloco <item>/<entry> RSS/Atom.
// Ordem de preferência: media:content > media:thumbnail > enclosure[image/*]
//   > <image>...</image> > primeira <img src="..."> dentro de description/content.
function extractImageFromBlock(block: string): string | null {
  const tryAttr = (tag: string, attr: string) => getAttr(block, tag, attr);

  // media:content url="..."  (com tipo imagem ou sem tipo)
  const mediaContent = block.match(
    /<media:content[^>]*url=['"]([^'"]+)['"][^>]*\/?>/i,
  );
  if (mediaContent && /\.(jpe?g|png|webp|gif)(\?|$)/i.test(mediaContent[1])) {
    return mediaContent[1];
  }
  if (mediaContent && !/type=['"](?!image)/i.test(mediaContent[0])) {
    return mediaContent[1];
  }

  // media:thumbnail url="..."
  const mediaThumb = tryAttr("media:thumbnail", "url");
  if (mediaThumb) return mediaThumb;

  // enclosure url="..." type="image/*"
  const enc = block.match(
    /<enclosure[^>]*url=['"]([^'"]+)['"][^>]*type=['"]image\/[^'"]+['"][^>]*\/?>/i,
  );
  if (enc) return enc[1];
  // enclosure url terminada em extensão de imagem
  const enc2 = block.match(/<enclosure[^>]*url=['"]([^'"]+\.(?:jpe?g|png|webp|gif))['"][^>]*\/?>/i);
  if (enc2) return enc2[1];

  // <image><url>...</url></image> (raro em <item>, comum em <channel>)
  const imageTagUrl = block.match(/<image[^>]*>[\s\S]*?<url>([\s\S]*?)<\/url>[\s\S]*?<\/image>/i);
  if (imageTagUrl) return stripCdata(imageTagUrl[1]).trim();

  // primeira <img src="..."> dentro de qualquer texto HTML embutido (description/content:encoded)
  const imgSrc = block.match(/<img[^>]*\bsrc=['"]([^'"]+)['"][^>]*\/?>/i);
  if (imgSrc) return imgSrc[1];

  return null;
}

interface FeedItem {
  title: string;
  link: string | null;
  description: string | null;
  pubDate: string | null;
  guid: string | null;
  image: string | null;
  categories: string[];
}

function parseFeed(xml: string): FeedItem[] {
  // RSS 2.0 (<item>) ou Atom (<entry>)
  const items: FeedItem[] = [];
  const itemBlocks = xml.match(/<item[\s\S]*?<\/item>/gi) ?? [];
  const entryBlocks = xml.match(/<entry[\s\S]*?<\/entry>/gi) ?? [];

  for (const block of itemBlocks) {
    const title = stripTags(getTag(block, "title") ?? "");
    if (!title) continue;
    items.push({
      title,
      link: getTag(block, "link"),
      description:
        stripTags(getTag(block, "description") ?? "") ||
        stripTags(getTag(block, "content:encoded") ?? "") ||
        null,
      pubDate: getTag(block, "pubDate") ?? getTag(block, "dc:date"),
      guid: getTag(block, "guid") ?? getTag(block, "link"),
      image: extractImageFromBlock(block),
      categories: extractCategoriesFromBlock(block),
    });
  }
  for (const block of entryBlocks) {
    const title = stripTags(getTag(block, "title") ?? "");
    if (!title) continue;
    items.push({
      title,
      link: getAttr(block, "link", "href") ?? getTag(block, "link"),
      description:
        stripTags(getTag(block, "summary") ?? "") ||
        stripTags(getTag(block, "content") ?? "") ||
        null,
      pubDate: getTag(block, "updated") ?? getTag(block, "published"),
      guid: getTag(block, "id"),
      image: extractImageFromBlock(block),
      categories: extractCategoriesFromBlock(block),
    });
  }
  return items;
}

// ============================================================
// Captação de fontes do tipo SITE (sem RSS)
// Estratégia: baixa a home, extrai links candidatos a artigo,
// e enriquece cada um com Open Graph / metadados da página alvo.
// ============================================================
async function fetchSiteItems(
  ctx: RunContext,
  sourceId: string,
  homeUrl: string,
  maxItems: number,
): Promise<FeedItem[]> {
  const base = new URL(homeUrl);
  const baseHost = base.host.replace(/^www\./, "");

  // Legacy closure — comportamento IDÊNTICO ao anterior à F3D.3A.2.
  const homeLegacy = () => fetch(homeUrl, {
    headers: {
      "User-Agent": "FiquePorDentroSE-Captador/1.0 (+https://barretao-news-hub.lovable.app)",
      Accept: "text/html,application/xhtml+xml",
    },
    signal: AbortSignal.timeout(15000),
  }).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status} ao baixar home`);
    return r.text();
  });
  // hostPurpose=feed: página principal de fonte SITE é listagem, não artigo.
  const homeHtml = await fetchSourceText(ctx, sourceId, homeUrl, "feed", "html", homeLegacy);

  // Extrai todos os <a href="..."> da home
  const linkRe = /<a\b[^>]*href=['"]([^'"]+)['"][^>]*>([\s\S]*?)<\/a>/gi;
  const seen = new Set<string>();
  const candidates: { url: string; anchor: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = linkRe.exec(homeHtml)) && candidates.length < maxItems * 8) {
    let href = m[1].trim();
    if (!href || href.startsWith("#") || href.startsWith("javascript:") || href.startsWith("mailto:")) continue;
    try {
      const abs = new URL(href, base).toString();
      const u = new URL(abs);
      if (u.host.replace(/^www\./, "") !== baseHost) continue;
      // Heurística: artigo costuma ter path com 2+ segmentos ou extensão .html ou termina sem trailing index
      const path = u.pathname.replace(/\/+$/, "");
      const segs = path.split("/").filter(Boolean);
      if (segs.length < 2 && !/\.html?$/i.test(path)) continue;
      // Ignora categorias/tags/paginação óbvias
      if (/\/(category|categoria|tag|tags|page|pagina|autor|author|search|busca)\b/i.test(u.pathname)) continue;
      const key = u.toString().split("#")[0];
      if (seen.has(key)) continue;
      seen.add(key);
      candidates.push({ url: key, anchor: stripTags(m[2] ?? "").trim() });
    } catch { /* url inválida — ignora */ }
  }

  const articles: FeedItem[] = [];
  for (const c of candidates) {
    if (articles.length >= maxItems) break;
    try {
      const articleLegacy = () => fetch(c.url, {
        headers: {
          "User-Agent": "FiquePorDentroSE-Captador/1.0 (+https://barretao-news-hub.lovable.app)",
          Accept: "text/html,application/xhtml+xml",
        },
        signal: AbortSignal.timeout(12000),
      }).then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.text();
      });
      // hostPurpose=article: página individual de matéria.
      const html = await fetchSourceText(ctx, sourceId, c.url, "article", "html", articleLegacy);

      const meta = (prop: string) => {
        const re1 = new RegExp(`<meta[^>]*property=['"]${prop}['"][^>]*content=['"]([^'"]+)['"]`, "i");
        const re2 = new RegExp(`<meta[^>]*name=['"]${prop}['"][^>]*content=['"]([^'"]+)['"]`, "i");
        const re3 = new RegExp(`<meta[^>]*content=['"]([^'"]+)['"][^>]*property=['"]${prop}['"]`, "i");
        return (html.match(re1)?.[1] ?? html.match(re2)?.[1] ?? html.match(re3)?.[1] ?? null);
      };

      const ogTitle = meta("og:title") ?? meta("twitter:title");
      const pageTitle = stripTags(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "");
      const title = (ogTitle || pageTitle || c.anchor || "").trim();
      if (!title || title.length < 8) continue;

      const description =
        meta("og:description") ?? meta("twitter:description") ?? meta("description") ?? null;

      // Imagem com prioridade: og:image > <img> primeira do artigo > twitter:image
      let image = meta("og:image");
      if (!image) {
        const firstImg = html.match(/<article[\s\S]*?<img[^>]*src=['"]([^'"]+)['"]/i)?.[1]
          ?? html.match(/<img[^>]*src=['"]([^'"]+\.(?:jpe?g|png|webp))['"][^>]*>/i)?.[1] ?? null;
        if (firstImg) {
          try { image = new URL(firstImg, c.url).toString(); } catch { /* ignora */ }
        }
      }
      if (!image) image = meta("twitter:image");

      const pubDate =
        meta("article:published_time") ??
        meta("og:updated_time") ??
        meta("article:modified_time") ??
        null;

      articles.push({
        title: title.slice(0, 300),
        link: c.url,
        description,
        pubDate,
        guid: c.url,
        image: image ?? null,
        categories: [],
      });
    } catch { /* artigo individual com falha — segue */ }
  }
  return articles;
}


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

// Cadeia completa de resolução de categoria, seguindo a prioridade definida.
function resolveFinalCategoryId(args: {
  rssCategories: string[];
  title: string;
  excerpt: string | null;
  sourceDefaultCategoryId: string | null;
  categoryBySlug: Map<string, string>;
  categoryById: Map<string, string>;
}): string | null {
  const text = `${args.title} ${args.excerpt ?? ""}`;

  // 1. Tenta encontrar por prioridade (RSS + Keywords + Strong Keywords)
  for (const slug of PRIORITY_SLUGS) {
    if (matchesCategory(slug, text, args.rssCategories)) {
      const id = args.categoryBySlug.get(slug);
      if (id) return id;
    }
  }

  // 2. Default da fonte
  if (args.sourceDefaultCategoryId) return args.sourceDefaultCategoryId;

  // 3. Fallback por âmbito da fonte
  const defaultSlug = args.sourceDefaultCategoryId
    ? args.categoryById.get(args.sourceDefaultCategoryId)
    : undefined;

  if (defaultSlug === "brasil" || defaultSlug === "mundo") {
    return args.categoryBySlug.get("brasil") ?? args.categoryBySlug.get("municipios") ?? null;
  }
  return args.categoryBySlug.get("municipios") ?? args.categoryBySlug.get("sergipe") ?? args.categoryBySlug.get("brasil") ?? null;
}

// Tenta buscar og:image / twitter:image da própria URL da matéria como fallback.
// Best-effort: timeout curto, ignora qualquer erro silenciosamente.
// Também extrai vídeos embedados na página (iframes, og:video, <video>).
interface PageMedia {
  ogImage: string | null;
  mainVideo: string | null;
  relatedVideos: string[];
}

// Hosts conhecidos como players de vídeo (YouTube, Vimeo, Instagram, Dailymotion,
// Globo Player, UOL, R7, players genéricos /embed/, /player/, /video/).
const VIDEO_HOST_RE =
  /(youtube\.com|youtu\.be|youtube-nocookie\.com|vimeo\.com|player\.vimeo\.com|instagram\.com|dailymotion\.com|globo\.com|globoplay\.globo\.com|uol\.com\.br\/.*\/video|r7\.com|tiktok\.com|facebook\.com\/.*\/videos)/i;
const VIDEO_PATH_HINT_RE = /\/(embed|player|video|videos|reels?|shorts|watch)\b/i;

function looksLikeVideoUrl(raw: string): boolean {
  if (!raw) return false;
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" && u.protocol !== "http:") return false;
    if (VIDEO_HOST_RE.test(u.hostname)) return true;
    if (VIDEO_PATH_HINT_RE.test(u.pathname)) return true;
    return false;
  } catch {
    return false;
  }
}

function absolutize(raw: string, base: string): string | null {
  try {
    return new URL(raw, base).toString();
  } catch {
    return null;
  }
}

function extractVideosFromHtml(html: string, baseUrl: string): { main: string | null; related: string[] } {
  const found = new Set<string>();
  const ordered: string[] = [];
  const push = (raw: string | null | undefined) => {
    if (!raw) return;
    const abs = absolutize(raw.trim(), baseUrl);
    if (!abs) return;
    if (!looksLikeVideoUrl(abs)) return;
    if (found.has(abs)) return;
    found.add(abs);
    ordered.push(abs);
  };

  // 1) og:video / og:video:url / og:video:secure_url / twitter:player
  const metaPatterns = [
    /<meta[^>]+property=['"]og:video(?::url|:secure_url)?['"][^>]*content=['"]([^'"]+)['"]/gi,
    /<meta[^>]+content=['"]([^'"]+)['"][^>]*property=['"]og:video(?::url|:secure_url)?['"]/gi,
    /<meta[^>]+name=['"]twitter:player['"][^>]*content=['"]([^'"]+)['"]/gi,
  ];
  for (const re of metaPatterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) push(m[1]);
  }

  // 2) <iframe src="...">
  const iframeRe = /<iframe[^>]+src=['"]([^'"]+)['"]/gi;
  let im: RegExpExecArray | null;
  while ((im = iframeRe.exec(html)) !== null) push(im[1]);

  // 3) <video src="..."> e <video><source src="...">
  const videoRe = /<video[^>]*\bsrc=['"]([^'"]+)['"]/gi;
  let vm: RegExpExecArray | null;
  while ((vm = videoRe.exec(html)) !== null) push(vm[1]);
  const sourceRe = /<source[^>]+src=['"]([^'"]+\.(?:mp4|webm|m3u8|mov))['"]/gi;
  let sm: RegExpExecArray | null;
  while ((sm = sourceRe.exec(html)) !== null) push(sm[1]);

  // 4) <a href="..."> apontando para youtube/vimeo/etc (player linkado no corpo)
  const anchorRe = /<a[^>]+href=['"]([^'"]+)['"]/gi;
  let am: RegExpExecArray | null;
  while ((am = anchorRe.exec(html)) !== null) push(am[1]);

  return { main: ordered[0] ?? null, related: ordered.slice(1, 6) };
}

// Extrai o corpo principal do artigo (heurística leve, sem libs externas).
// Tenta <article>, depois <main>, depois maior bloco de <p>. Retorna texto limpo.
function extractArticleText(html: string): string {
  const clean = (s: string) =>
    s
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<(figure|aside|nav|header|footer|form)[\s\S]*?<\/\1>/gi, " ");

  const paragraphsFrom = (chunk: string): string => {
    const ps: string[] = [];
    const re = /<p[^>]*>([\s\S]*?)<\/p>/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(chunk)) !== null) {
      const t = m[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      if (t.length >= 40) ps.push(t);
    }
    return ps.join("\n\n");
  };

  const cleaned = clean(html);
  const candidates: string[] = [];
  const artMatches = cleaned.match(/<article[\s\S]*?<\/article>/gi) ?? [];
  for (const a of artMatches) candidates.push(paragraphsFrom(a));
  const mainMatch = cleaned.match(/<main[\s\S]*?<\/main>/i);
  if (mainMatch) candidates.push(paragraphsFrom(mainMatch[0]));
  const entryMatch = cleaned.match(/<div[^>]+class=['"][^'"]*(entry-content|post-content|article-content|content-body|td-post-content|single-content)[^'"]*['"][^>]*>[\s\S]*?<\/div>/i);
  if (entryMatch) candidates.push(paragraphsFrom(entryMatch[0]));
  candidates.push(paragraphsFrom(cleaned));

  let best = "";
  for (const c of candidates) if (c.length > best.length) best = c;
  return best.slice(0, 20_000);
}

interface PageFetchResult extends PageMedia { articleText: string; html: string | null }

async function fetchPage(
  ctx: RunContext,
  sourceId: string,
  url: string,
): Promise<PageFetchResult> {
  const empty: PageFetchResult = { ogImage: null, mainVideo: null, relatedVideos: [], articleText: "", html: null };
  try {
    // Legacy closure — comportamento IDÊNTICO ao anterior à F3D.3A.2:
    // valida !ok e content-type text/html devolvendo string vazia como
    // sinal para o caller tratar como "empty".
    const legacy = () => fetch(url, {
      headers: { "User-Agent": "FiquePorDentroSE-Captador/1.0" },
      signal: AbortSignal.timeout(10000),
    }).then(async (r) => {
      if (!r.ok) return "";
      const ct = r.headers.get("content-type") ?? "";
      if (!ct.includes("text/html")) return "";
      return (await r.text()).slice(0, 600_000);
    });
    const raw = await fetchSourceText(ctx, sourceId, url, "article", "html", legacy);
    if (!raw) return empty;
    const html = raw.slice(0, 600_000);

    const og =
      html.match(/<meta[^>]+property=['"]og:image['"][^>]*content=['"]([^'"]+)['"]/i) ??
      html.match(/<meta[^>]+content=['"]([^'"]+)['"][^>]*property=['"]og:image['"]/i) ??
      html.match(/<meta[^>]+name=['"]twitter:image['"][^>]*content=['"]([^'"]+)['"]/i);

    let ogImage: string | null = null;
    if (og) {
      try { ogImage = new URL(og[1], url).toString(); }
      catch { ogImage = og[1]; }
    }

    if (!ogImage) {
      const bodyOnly = html.split(/<\/head>/i)[1] || html;
      const imgMatch = bodyOnly.match(/<img[^>]+src=['"]([^'"]+\.(?:jpe?g|png|webp|gif)[^'"]*)['"]/i);
      if (imgMatch) {
        try { ogImage = new URL(imgMatch[1], url).toString(); }
        catch { ogImage = imgMatch[1]; }
      }
    }

    const { main, related } = extractVideosFromHtml(html, url);
    const articleText = extractArticleText(html);
    return { ogImage, mainVideo: main, relatedVideos: related, articleText, html };
  } catch {
    return empty;
  }
}

async function fetchPageMedia(
  ctx: RunContext,
  sourceId: string,
  url: string,
): Promise<PageMedia> {
  const r = await fetchPage(ctx, sourceId, url);
  return { ogImage: r.ogImage, mainVideo: r.mainVideo, relatedVideos: r.relatedVideos };
}

// fetchOgImage removido (usar fetchPageMedia)

async function ensureUniqueSlug(
  supabase: ReturnType<typeof createClient>,
  base: string,
): Promise<string> {
  const root = base || "noticia";
  let candidate = root;
  for (let i = 2; i < 50; i++) {
    const { data } = await supabase
      .from("posts")
      .select("id")
      .eq("slug", candidate)
      .maybeSingle();
    if (!data) return candidate;
    candidate = `${root}-${i}`.slice(0, 80);
  }
  return `${root}-${Date.now()}`.slice(0, 80);
}

interface SourceRow {
  id: string;
  name: string;
  source_type: string;
  url: string | null;
  default_category_id: string | null;
  is_active: boolean;
  frequency_minutes: number;
  max_items_per_run: number;
  last_run_at: string | null;
  total_captured: number;
  // Resolvido em runtime (não vem direto da query) — imagem padrão da categoria default da fonte
  default_cover_image_url?: string | null;
}

async function captureFromSource(
  supabase: ReturnType<typeof createClient>,
  ctx: RunContext,
  source: SourceRow,
  categoryBySlug: Map<string, string>,
  categoryById: Map<string, string>,
): Promise<{ captured: number; skipped: number; duplicates: number; errors: string[] }> {
  const result = { captured: 0, skipped: 0, duplicates: 0, errors: [] as string[] };

  if (!source.url) {
    result.errors.push("Fonte sem URL configurada");
    return result;
  }

  const kind = String(source.source_type ?? "").toLowerCase();
  let items: FeedItem[] = [];

  if (kind === "rss" || kind === "feed" || kind === "xml" || kind === "sitemap") {
    let xml: string;
    try {
      // Legacy closure — headers/timeout/erro IDÊNTICOS ao anterior à F3D.3A.2.
      const rssLegacy = () => fetch(source.url!, {
        headers: { "User-Agent": "FiquePorDentroSE-Captador/1.0 (+https://barretao-news-hub.lovable.app)" },
        signal: AbortSignal.timeout(15000),
      }).then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.text();
      });
      xml = await fetchSourceText(ctx, source.id, source.url, "feed", "xml", rssLegacy);
    } catch (e) {
      result.errors.push(`fetch falhou: ${e instanceof Error ? e.message : "erro"}`);
      return result;
    }
    items = parseFeed(xml).slice(0, source.max_items_per_run);
  } else if (kind === "site" || kind === "html") {
    try {
      items = await fetchSiteItems(ctx, source.id, source.url, source.max_items_per_run);
    } catch (e) {
      result.errors.push(`scrape falhou: ${e instanceof Error ? e.message : "erro"}`);
      return result;
    }
  } else {
    result.errors.push(`Tipo de fonte não suportado: ${source.source_type}`);
    return result;
  }

  console.log(`[capture-sources] ${source.name}: ${items.length} itens encontrados`);

  for (const item of items) {
    try {
      const externalId = item.guid ?? item.link ?? item.title;

      // Skip por external_id já capturado dessa fonte
      const { data: existing } = await supabase
        .from("posts")
        .select("id")
        .eq("source_id", source.id)
        .eq("external_id", externalId)
        .maybeSingle();
      if (existing) {
        result.skipped++;
        continue;
      }

      const baseSlug = slugify(item.title);
      const sourceUrl = item.link ?? null;

      // Detecta duplicatas globais
      const { data: dupes } = await supabase.rpc("find_duplicate_post", {
        _title: item.title,
        _slug: baseSlug,
        _source_url: sourceUrl,
        _exclude_id: null,
      });

      let videoUrlPrincipal: string | null = null;
      let videosRelacionados: string[] = [];
      let duplicate_of: string | null = null;
      let similar_to: string | null = null;
      let similarity_score: number | null = null;
      let duplicate_match_reason: string | null = null;
      // Fluxo simplificado: toda notícia capturada nasce como "captada".
      // Duplicatas (>= 91%) viram "duplicada". A transição para "em_revisao"
      // ocorre apenas quando um editor abre o post no painel.
      let status: "captada" | "duplicada" = "captada";
      if (dupes && dupes.length > 0) {
        const best = dupes[0];
        const rawScore = typeof best.similarity === "number" ? best.similarity : 0;
        // Slug exato e fonte_igual valem 100% conceitualmente
        const score = best.match_reason === "slug_exato" || best.match_reason === "fonte_igual"
          ? 1.0
          : rawScore;
        similarity_score = score;
        duplicate_match_reason = best.match_reason ?? null;
        if (score >= 0.91) {
          duplicate_of = best.id;
          status = "duplicada";
          result.duplicates++;
        } else if (score >= 0.71) {
          similar_to = best.id;
        }
      }

      const finalSlug = await ensureUniqueSlug(
        supabase,
        duplicate_of ? baseSlug + "-dup" : baseSlug,
      );

      let publishedAt: string | null = null;
      if (item.pubDate) {
        const d = new Date(item.pubDate);
        if (!isNaN(d.getTime())) publishedAt = d.toISOString();
      }

      const cleanDesc = cleanContent(item.description);
      const originalTitle = item.title.slice(0, 300);

      // Fase 5: sempre que possível, buscar o CORPO COMPLETO do artigo na página da fonte.
      // Reaproveita o mesmo fetch para extrair mídia (og:image + vídeos) — evita chamada dupla.
      let prefetched: PageFetchResult | null = null;
      let fullArticleText = "";
      if (sourceUrl) {
        try {
          prefetched = await fetchPage(ctx, source.id, sourceUrl);
          fullArticleText = prefetched.articleText ?? "";
        } catch { /* ignorar; segue com o que veio do RSS */ }
      }

      // Escolhe o texto mais rico: página completa (se substancialmente maior) ou descrição RSS.
      const chosenBody =
        fullArticleText && fullArticleText.length > Math.max(600, cleanDesc.length + 200)
          ? fullArticleText
          : cleanDesc;
      const excerpt = chosenBody ? chosenBody.slice(0, 500) : null;
      const originalContent = chosenBody
        ? `${chosenBody}\n\n[Fonte original: ${sourceUrl ?? source.name}]`
        : `Notícia captada de ${source.name}. Acesse a fonte original: ${sourceUrl ?? source.url}`;

      // Reescrita por IA — qualidade JORNALÍSTICA padrão, com limpeza profunda.
      // Resultado: texto que parece produzido pela própria redação da Fique Por Dentro Sergipe.
      let aiRewrite: {
        titulo_gerado?: string;
        subtitle_gerado?: string;
        resumo_gerado?: string;
        conteudo_gerado?: string;
        meta_keywords?: string[];
        categoria_sugerida?: string | null;
        tags_sugeridas?: string[];
      } = {};
      let aiRewrittenAt: string | null = null;
      let aiReviewStatus: "pendente" | "reescrito_ia" = "pendente";
      let aiVersionUsed: "original" | "gerada" = "original";
      const aiQuality: "basica" | "jornalistica" | "premium" = "jornalistica";
      const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

      const BANNED_INLINE: RegExp[] = [
        /\bcontinuar?\s+lendo\b.*$/gim,
        /\bleia\s+(mais|também|tamb[eé]m)\b.*$/gim,
        /\bsaiba\s+mais\b.*$/gim,
        /\bveja\s+(mais|também|tamb[eé]m)\b.*$/gim,
        /\bclique\s+(aqui|para)\b.*$/gim,
        /\bassista\s+(também|tamb[eé]m|abaixo|ao\s+v[ií]deo)\b.*$/gim,
        /\bfonte\s*:.*$/gim,
        /\bcr[eé]ditos?\s*:.*$/gim,
        /\bvia\s+@?\w+\b/gim,
        /https?:\/\/\S+/gi,
        /\bwww\.\S+/gi,
        /\[\s*Fonte\s+original\s*:[^\]]*\]/gi,
      ];
      const sanitizeFinal = (s: string) => {
        let t = s.replace(/<[^>]+>/g, " ");
        for (const re of BANNED_INLINE) t = t.replace(re, "");
        return t.replace(/\.{3,}/g, ".").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
      };
      const violates = (s: string) =>
        /continuar\s+lendo|\bleia\s+mais\b|\bsaiba\s+mais\b|\bclique\s+aqui\b|\bfonte\s*:|https?:\/\/|<\w+[^>]*>/i.test(s);
      const countParagraphs = (s: string) =>
        s.split(/\n{2,}|\r\n{2,}/).map(p => p.trim()).filter(p => p.length > 30).length;

      if (status !== "duplicada" && LOVABLE_API_KEY && originalContent.length >= 40) {
        try {
          const systemPrompt = `Você é editor da redação da Fique Por Dentro Sergipe, portal de notícias profissional brasileiro.
REGRAS ABSOLUTAS:
- Reescreva COMPLETAMENTE com suas próprias palavras (não copie frases literais).
- Mantenha apenas FATOS verificáveis. NÃO invente nada.
- NÃO mencione fonte original, veículo de origem, "fonte:", "via", "créditos".
- NÃO inclua "continuar lendo", "leia mais", "saiba mais", "clique aqui", "veja também", "assista".
- NÃO inclua URLs, links nem referências externas.
- Português do Brasil, linguagem jornalística clara, neutra e objetiva.
- O texto deve parecer produzido pela própria redação da Fique Por Dentro Sergipe.
- Parágrafos curtos (2-4 frases), separados por linha em branco.

NÍVEL: JORNALÍSTICO — lide claro no primeiro parágrafo (quem, o quê, quando, onde). 3-6 parágrafos. Título informativo até 100 chars. Linha fina (subtítulo) complementar.`;
          const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${LOVABLE_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "google/gemini-3-flash-preview",
              messages: [
                { role: "system", content: systemPrompt },
                {
                  role: "user",
                  content: `TÍTULO ORIGINAL:\n${originalTitle}\n\nCONTEÚDO ORIGINAL (apenas para extrair fatos — não copie literalmente):\n${originalContent.slice(0, 8000)}`,
                },
              ],
              tools: [
                {
                  type: "function",
                  function: {
                    name: "salvar_materia",
                    description: "Matéria reescrita pela redação da Fique Por Dentro Sergipe.",
                    parameters: {
                      type: "object",
                      properties: {
                        titulo_gerado: { type: "string" },
                        subtitle_gerado: { type: "string" },
                        resumo_gerado: { type: "string" },
                        conteudo_gerado: { type: "string" },
                        meta_keywords: { type: "array", items: { type: "string" } },
                        categoria_sugerida: {
                          type: "string",
                          enum: ["denuncias","policia","politica","esporte","aracaju","municipios","sergipe","brasil","mundo","entretenimento","opiniao","videos"],
                          description: "Slug da categoria mais adequada.",
                        },
                        tags_sugeridas: {
                          type: "array",
                          items: { type: "string" },
                          description: "3 a 6 tags editoriais curtas (entidades, lugares, temas).",
                        },
                      },
                      required: ["titulo_gerado", "subtitle_gerado", "resumo_gerado", "conteudo_gerado", "meta_keywords", "categoria_sugerida", "tags_sugeridas"],
                      additionalProperties: false,
                    },
                  },
                },
              ],
              tool_choice: { type: "function", function: { name: "salvar_materia" } },
            }),
            signal: AbortSignal.timeout(45000),
          });
          if (aiRes.ok) {
            const j = await aiRes.json();
            const tc = j?.choices?.[0]?.message?.tool_calls?.[0];
            if (tc) {
              const args = JSON.parse(tc.function.arguments);
              const titulo = sanitizeFinal(String(args.titulo_gerado || "")).slice(0, 200);
              const subtitulo = sanitizeFinal(String(args.subtitle_gerado || "")).slice(0, 280);
              const resumo = sanitizeFinal(String(args.resumo_gerado || "")).slice(0, 500);
              const conteudo = sanitizeFinal(String(args.conteudo_gerado || ""));
              const keywords: string[] = Array.isArray(args.meta_keywords)
                ? args.meta_keywords
                    .map((k: unknown) => String(k || "").toLowerCase().replace(/^#+/, "").trim())
                    .filter((k: string) => k.length >= 2 && k.length <= 40)
                    .slice(0, 10)
                : [];
              const tagsSug: string[] = Array.isArray(args.tags_sugeridas)
                ? args.tags_sugeridas
                    .map((k: unknown) => String(k || "").toLowerCase().replace(/^#+/, "").trim())
                    .filter((k: string) => k.length >= 2 && k.length <= 50)
                    .slice(0, 6)
                : [];
              const CATS_OK = ["denuncias","policia","politica","esporte","aracaju","municipios","sergipe","brasil","mundo","entretenimento","opiniao","videos"];
              const catRaw = String(args.categoria_sugerida || "").toLowerCase().trim();
              const catSug = CATS_OK.includes(catRaw) ? catRaw : null;
              // Validação pré-publicação (Etapa 1 Fique Por Dentro Sergipe 2.0):
              // - mínimo 4 parágrafos
              // - mínimo 200 chars
              // - sem "continuar lendo", "leia mais", URLs externas, HTML
              const paragraphs = countParagraphs(conteudo);
              const ok =
                conteudo.length >= 200 &&
                paragraphs >= 4 &&
                !violates(conteudo) &&
                !violates(titulo) &&
                !violates(subtitulo);
              if (ok) {
                aiRewrite = {
                  titulo_gerado: titulo,
                  subtitle_gerado: subtitulo,
                  resumo_gerado: resumo,
                  conteudo_gerado: conteudo,
                  meta_keywords: keywords,
                  categoria_sugerida: catSug,
                  tags_sugeridas: tagsSug,
                };
                aiRewrittenAt = new Date().toISOString();
                aiReviewStatus = "reescrito_ia";
                aiVersionUsed = "gerada";
                // Fluxo editorial: toda captura permanece como "captada" até ação manual da redação.
                // A reescrita por IA fica registrada (ai_review_status/ai_rewritten_at) mas NÃO promove status.
              } else {
                console.warn(`[capture-sources] reescrita rejeitada (validação): paragraphs=${paragraphs} len=${conteudo.length} "${originalTitle.slice(0,40)}"`);
              }
            }
          } else if (aiRes.status === 429 || aiRes.status === 402) {
            console.warn(`[capture-sources] IA indisponível (${aiRes.status}) — salvando só original`);
          }
        } catch (aiErr) {
          console.warn(`[capture-sources] reescrita IA falhou: ${aiErr instanceof Error ? aiErr.message : "erro"}`);
        }
      }

      // === Resolução da imagem de capa + vídeos embedados ===
      let coverOriginal: string | null = item.image ?? null;
      let coverSource: "rss" | "extracted" | "category_fallback" = "rss";

      // Reutiliza o fetch feito antes (Fase 5) para evitar 2ª requisição na mesma URL.
      const media = prefetched ?? (sourceUrl ? await fetchPage(ctx, source.id, sourceUrl) : null);
      if (!coverOriginal) {
        coverSource = "extracted";
        if (media) {
          coverOriginal = media.ogImage;
          videoUrlPrincipal = media.mainVideo;
          videosRelacionados = media.relatedVideos;
        }
      } else if (media) {
        videoUrlPrincipal = media.mainVideo;
        videosRelacionados = media.relatedVideos;
      }

      // F3D.3A.2 — Avaliação lexical de mídia (sem download). Em mode=off,
      // no-op; em shadow, apenas emite telemetria. Nunca altera a URL.
      await evaluateMediaHost(ctx, source.id, coverOriginal);

      let finalCoverUrl = coverOriginal;
      if (!finalCoverUrl) {
        finalCoverUrl = source.default_cover_image_url ?? null;
        coverSource = "category_fallback";
      }

      // O title/content públicos passam a usar a versão gerada (se houver), para
      // que o leitor NUNCA veja o texto bruto da fonte. Original fica preservado
      // em titulo_original/conteudo_original para auditoria interna.
      const displayTitle = aiRewrite.titulo_gerado ?? originalTitle;
      const displayContent = aiRewrite.conteudo_gerado ?? originalContent;
      const displaySubtitle = aiRewrite.subtitle_gerado ?? null;
      const displayExcerpt = aiRewrite.resumo_gerado ?? excerpt;

      const { error } = await supabase.from("posts").insert({
        title: displayTitle,
        subtitle: displaySubtitle,
        slug: finalSlug,
        excerpt: displayExcerpt,
        content: displayContent,
        titulo_original: originalTitle,
        conteudo_original: originalContent,
        titulo_gerado: aiRewrite.titulo_gerado ?? null,
        resumo_gerado: aiRewrite.resumo_gerado ?? null,
        conteudo_gerado: aiRewrite.conteudo_gerado ?? null,
        meta_keywords: aiRewrite.meta_keywords ?? [],
        meta_description: aiRewrite.resumo_gerado ? aiRewrite.resumo_gerado.slice(0, 160) : null,
        ai_rewrite_quality: aiQuality,
        ai_review_status: aiReviewStatus,
        ai_rewritten_at: aiRewrittenAt,
        ai_version_used: aiVersionUsed,
        source_url: sourceUrl,
        source_id: source.id,
        external_id: externalId,
        category_id:
          // Prioridade 1: categoria sugerida pela IA (se válida no banco)
          (aiRewrite.categoria_sugerida && categoryBySlug.get(aiRewrite.categoria_sugerida)) ||
          // Fallback: resolução por palavras-chave + default da fonte
          resolveFinalCategoryId({
            rssCategories: item.categories,
            title: originalTitle,
            excerpt: displayExcerpt,
            sourceDefaultCategoryId: source.default_category_id,
            categoryBySlug,
            categoryById,
          }),
        cover_image_url: finalCoverUrl,
        cover_image_original: coverOriginal,
        cover_image_source: coverSource,
        video_url_principal: videoUrlPrincipal,
        videos_relacionados: videosRelacionados,
        status,
        duplicate_of,
        similar_to,
        similarity_score,
        duplicate_match_reason,
        source_published_at: publishedAt,
        published_at: null,
        is_denuncia: false,
        is_featured: false,
        is_urgent: false,
        tags: (aiRewrite.tags_sugeridas && aiRewrite.tags_sugeridas.length ? aiRewrite.tags_sugeridas : aiRewrite.meta_keywords) ?? [],
      });

      if (error) {
        if (error.code === "23505") {
          result.skipped++;
        } else {
          result.errors.push(`insert "${item.title.slice(0, 40)}": ${error.message}`);
        }
      } else {
        result.captured++;
      }
    } catch (e) {
      result.errors.push(`item "${item.title.slice(0, 40)}": ${e instanceof Error ? e.message : "erro"}`);
    }
  }

  // Atualiza estatísticas da fonte
  await supabase
    .from("news_sources")
    .update({
      last_run_at: new Date().toISOString(),
      last_run_status: result.errors.length > 0 ? "parcial" : "ok",
      last_run_message: `${result.captured} captadas, ${result.duplicates} duplicatas, ${result.skipped} já existiam${result.errors.length ? `, ${result.errors.length} erros` : ""}`,
      total_captured: source.total_captured + result.captured,
    })
    .eq("id", source.id);

  return result;
}

Deno.serve(async (req) => {
  const requestId = newRequestId();

  // Trata OPTIONS e rejeita métodos não suportados ANTES da autenticação.
  const methodResp = methodGuard(req, requestId);
  if (methodResp) return methodResp;

  // Tenta extrair post_id tanto da query quanto do body (se for POST)
  const url = new URL(req.url);
  let postIdParam = url.searchParams.get("post_id");
  let sourceIdParam = url.searchParams.get("source_id");

  if (req.method === "POST" && !postIdParam) {
    try {
      const b = await req.json();
      if (b.post_id) postIdParam = b.post_id;
      if (b.source_id) sourceIdParam = b.source_id;
    } catch { /* ignore */ }
  }

  // Cliente administrativo interno. SUPABASE_SERVICE_ROLE_KEY nunca é aceita
  // como credencial do chamador — somente usada aqui, no servidor.
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  // Autenticação: exclusivamente JWT de usuário staff.
  const authResult = await authenticateRequest(req, supabase);
  if (!authResult.ok) {
    logAuthRejected(requestId, authResult.code);
    return errorEnvelope(
      authResult.status,
      authResult.code,
      authResult.message,
      requestId,
    );
  }
  const actor = authResult.actor;
  logAuthorized(requestId, actor);



  try {
    // Usamos postIdParam e sourceIdParam extraídos no início do serve

    // Lógica para REPROCESSAR imagem de uma única notícia
    if (postIdParam) {
      console.log(`[capture-sources] 🔄 Reprocessando notícia ID: ${postIdParam}`);
      const { data: post, error: postErr } = await supabase
        .from("posts")
        .select("id, title, source_url, source_id, category_id")
        .eq("id", postIdParam)
        .single();
      
      if (postErr || !post) {
        return json(404, { error: "Notícia não encontrada" });
      }

      // 1. Tenta buscar no feed se ainda estiver lá (difícil, pulamos)
      // 2. Tenta extrair da URL
      let newCover: string | null = null;
      let source: "extracted" | "category_fallback" = "extracted";
      
      if (post.source_url) {
        const media = await fetchPageMedia(post.source_url);
        newCover = media.ogImage;
      }

      // 3. Fallback: categoria
      if (!newCover && post.category_id) {
        const { data: cat } = await supabase
          .from("categories")
          .select("default_cover_image_url")
          .eq("id", post.category_id)
          .single();
        newCover = cat?.default_cover_image_url ?? null;
        source = "category_fallback";
      }

      const { error: updErr } = await supabase
        .from("posts")
        .update({
          cover_image_url: newCover,
          cover_image_original: newCover, // para permitir restaurar
          cover_image_source: source,
        })
        .eq("id", post.id);

      if (updErr) throw updErr;
      
      return json(200, { ok: true, message: "Imagem reprocessada", cover_image_url: newCover, source });
    }

    let query = supabase
      .from("news_sources")
      .select(
        "id,name,source_type,url,default_category_id,is_active,frequency_minutes,max_items_per_run,last_run_at,total_captured,categories:default_category_id(default_cover_image_url)",
      )
      .eq("is_active", true);

    if (sourceIdParam) {
      query = query.eq("id", sourceIdParam);
    }

    const { data: sources, error } = await query;
    if (error) throw error;
    if (!sources || sources.length === 0) {
      return json(200, { ok: true, message: "Nenhuma fonte ativa", sources: 0 });
    }

    // Carrega catálogo de categorias internas (uma vez por execução)
    const { data: cats } = await supabase.from("categories").select("id,slug");
    const categoryBySlug = new Map<string, string>();
    const categoryById = new Map<string, string>();
    for (const c of (cats ?? []) as Array<{ id: string; slug: string }>) {
      if (c?.slug && c?.id) {
        categoryBySlug.set(norm(c.slug), c.id);
        categoryById.set(c.id, norm(c.slug));
      }
    }

    const now = Date.now();

    // Achata + filtra por frequência antes de disparar em paralelo
    const toRun: SourceRow[] = [];
    const summary: Array<{ source: string; result: any }> = [];

    for (const raw of sources) {
      const source: SourceRow = {
        ...(raw as unknown as SourceRow),
        default_cover_image_url:
          (raw as { categories?: { default_cover_image_url?: string | null } }).categories
            ?.default_cover_image_url ?? null,
      };

      if (!sourceIdParam && source.last_run_at) {
        const last = new Date(source.last_run_at).getTime();
        if (now - last < source.frequency_minutes * 60 * 1000) {
          summary.push({ source: source.name, result: { skipped_due_to_frequency: true } });
          continue;
        }
      }
      toRun.push(source);
    }

    // Processa todas as fontes em PARALELO (evita timeout de 150s)
    const results = await Promise.all(
      toRun.map(async (source) => {
        console.log(`[capture-sources] ▶ captando ${source.name} (${source.url})`);
        try {
          const r = await captureFromSource(supabase, source, categoryBySlug, categoryById);
          console.log(
            `[capture-sources] ✅ ${source.name} | captadas=${r.captured} duplicatas=${r.duplicates} skipped=${r.skipped} erros=${r.errors.length}`,
          );
          return { source: source.name, result: r };
        } catch (e) {
          const msg = e instanceof Error ? e.message : "erro";
          console.error(`[capture-sources] ❌ ${source.name}: ${msg}`);
          return { source: source.name, result: { captured: 0, duplicates: 0, skipped: 0, errors: [msg] } };
        }
      }),
    );
    summary.push(...results);


    return json(200, { ok: true, runs: summary });
  } catch (err) {
    console.error("[capture-sources] erro:", err);
    return json(500, { error: err instanceof Error ? err.message : "erro" });
  }
});
