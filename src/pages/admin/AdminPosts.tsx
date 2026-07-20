import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";

import AdminLayout from "@/components/admin/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  PlusCircle, Flame, Archive, Clock, X,
  SlidersHorizontal, FileCheck2, ClipboardList, Globe, CalendarDays,
} from "lucide-react";
import DayPostsModal from "@/components/admin/DayPostsModal";
import { toast } from "sonner";
import {
  STATUS_ORDER, STATUS_LABEL,
  type EditorialStatus,
} from "@/lib/statusFlow";
import {
  SourceBadge,
} from "@/components/admin/SourceBadge";
import { type DuplicateFilter } from "@/lib/duplicates";
import { useAuth } from "@/hooks/useAuth";
import { SourceGroupedView, type GroupSort } from "@/components/admin/SourceGroupedView";
import { KanbanBoard } from "@/components/admin/KanbanBoard";
import { List, FolderTree, KanbanSquare, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { getSocialShareUrl } from "@/lib/socialShare";
import { sanitizeSearch, escapeIlike, maceioDayBoundsIso } from "@/lib/postSearch";
import { AdminPostsPagination, PER_PAGE_OPTIONS } from "@/components/admin/adminPost/AdminPostsPagination";
import { AdminPostsDesktopTable } from "@/components/admin/adminPost/AdminPostsDesktopTable";
import { AdminPostMobileCard } from "@/components/admin/adminPost/AdminPostMobileCard";
import { AdminPostActionsMenu } from "@/components/admin/adminPost/AdminPostActionsMenu";
import {
  DEFAULT_SORT, DEFAULT_DIR, SORT_OPTIONS,
  type PostSortColumn, type PostSortDir,
} from "@/components/admin/adminPost/primaryAction";
import { getPrimaryAction } from "@/components/admin/adminPost/primaryAction";
import {
  DeletePostDialog, ArchivePostDialog, RestorePostDialog, ArchiveBatchDialog,
  StatusChangeDialog, ReclassifyDialog, AutoArchiveDialog,
  type StatusKind, type AutoArchivePreview,
} from "@/components/admin/adminPost/AdminPostDialogs";

// Checklist editorial reutilizado por Aprovar/Publicar.
function buildChecklist(p: any, kind: StatusKind) {
  const missing: string[] = [];
  const warnings: string[] = [];
  if (kind === "em_revisao") return { missing, warnings };
  if (!p?.title?.trim()) missing.push("Título");
  if (!p?.categories && !p?.category_id) warnings.push("Sem categoria detectada — verifique antes de publicar");
  if (!p?.content?.trim()) missing.push("Conteúdo");
  const hasCover = p?.cover_image_url || p?.manual_image_url || p?.cover_image_original;
  if (!hasCover) missing.push("Imagem de capa");
  if (!p?.subtitle) warnings.push("Sem subtítulo");
  if (!p?.image_caption) warnings.push("Sem legenda da imagem");
  if (!p?.image_credit) warnings.push("Sem crédito da imagem");
  if (!p?.meta_description) warnings.push("Sem meta description (SEO)");
  if (typeof p?.content === "string" && p.content.length < 300) warnings.push("Texto muito curto");
  if (kind === "publicada" && p?.is_urgent) {
    const exp = p?.home_expires_at ? new Date(p.home_expires_at).getTime() : 0;
    if (!exp || exp <= Date.now()) missing.push("Plantão exige validade futura em home_expires_at");
  }
  return { missing, warnings };
}

type Filter = "all" | EditorialStatus;
type HomeFilter = "all" | "active" | "expired" | "expiring_today";
type ArchivedFilter = "hide" | "only" | "all";
type PeriodFilter = "today" | "last3" | "all";
type ViewMode = "list" | "grouped" | "kanban";
type RelevanceFilter = "all" | "baixa" | "media" | "alta" | "urgente";

const DEFAULT_PER = 25;


function formatExpiration(iso: string | null | undefined, isEvergreen: boolean) {
  if (isEvergreen) return { label: "Destaque permanente", tone: "evergreen" as const, expired: false };
  if (!iso) return null;
  const now = Date.now();
  const exp = new Date(iso).getTime();
  const diffMs = exp - now;
  const absMin = Math.abs(diffMs) / 60000;
  const absHours = absMin / 60;
  const absDays = absHours / 24;
  if (diffMs <= 0) {
    if (absHours < 1) return { label: `Expirada há ${Math.max(1, Math.round(absMin))} min`, tone: "expired" as const, expired: true };
    if (absHours < 24) return { label: `Expirada há ${Math.round(absHours)}h`, tone: "expired" as const, expired: true };
    return { label: `Expirada há ${Math.round(absDays)}d`, tone: "expired" as const, expired: true };
  }
  if (absHours < 1) return { label: `Expira em ${Math.max(1, Math.round(absMin))} min`, tone: "critical" as const, expired: false };
  if (absHours < 12) return { label: `Expira em ${Math.round(absHours)}h`, tone: "critical" as const, expired: false };
  if (absHours < 24) return { label: "Expira hoje", tone: "warn" as const, expired: false };
  if (absHours < 48) return { label: "Expira amanhã", tone: "warn" as const, expired: false };
  if (absDays < 7) return { label: `Expira em ${Math.round(absDays)}d`, tone: "ok" as const, expired: false };
  return { label: `Home até ${new Date(iso).toLocaleDateString("pt-BR")}`, tone: "ok" as const, expired: false };
}

const TONE_CLASS: Record<string, string> = {
  evergreen: "text-emerald-700 bg-emerald-50 border-emerald-200",
  expired: "text-muted-foreground bg-secondary border-border",
  critical: "text-red-700 bg-red-50 border-red-200 animate-pulse",
  warn: "text-amber-700 bg-amber-50 border-amber-200",
  ok: "text-sky-700 bg-sky-50 border-sky-200",
};

// sanitizeSearch, escapeIlike e maceioDayBoundsIso vivem em @/lib/postSearch
// (testados em src/lib/postSearch.test.ts).


// Mapa "em_revisao" agrega três status legados/nova nomenclatura.
// "rascunho" agora é uma aba separada — não é mais agrupada com "captada".
const STATUS_MAP: Record<EditorialStatus, string[]> = {
  rascunho: ["rascunho"],
  captada: ["captada"],
  pronta_para_revisao: ["pronta_para_revisao"],
  em_revisao: ["pronta_para_revisao", "em_revisao", "revisao"],
  aprovada: ["aprovada"],
  rejeitada: ["rejeitada"],
  publicada: ["publicada", "publicado"],
  duplicada: ["duplicada"],
  arquivada: ["arquivada"],
};

// -----------------------------------------------------------
// Aplica filtros server-side ANTES de count/order/range
// -----------------------------------------------------------
function applyServerFilters(
  q: any,
  opts: {
    filter: Filter;
    archivedFilter: ArchivedFilter;
    homeFilter: HomeFilter;
    sourceFilter: string;
    duplicateFilter: DuplicateFilter;
    relevanceFilter: RelevanceFilter;
    period: PeriodFilter;
    searchTerm: string;
    searchSourceIds: string[];
    searchCategoryIds: string[];
    normalizedSourceIds: string[] | null; // Etapa 7: agrupar fontes com mesmo nome
  },
) {
  const now = new Date().toISOString();
  const {
    filter, archivedFilter, homeFilter, sourceFilter, duplicateFilter,
    relevanceFilter, period, searchTerm, searchSourceIds, searchCategoryIds,
    normalizedSourceIds,
  } = opts;

  // Status
  if (filter !== "all") q = q.in("status", STATUS_MAP[filter] as any);

  // Arquivamento (Arquivada é aba dedicada, não aplica quando explicitamente pedido)
  if (filter !== "arquivada") {
    if (archivedFilter === "hide") q = q.neq("status", "arquivada");
    else if (archivedFilter === "only") q = q.eq("status", "arquivada");
  }

  // Validade na Home
  if (homeFilter === "active") {
    q = q.or(`is_evergreen.eq.true,home_expires_at.is.null,home_expires_at.gt.${now}`);
  } else if (homeFilter === "expired") {
    q = q.eq("is_evergreen", false).lte("home_expires_at", now);
  } else if (homeFilter === "expiring_today") {
    const end = new Date(); end.setHours(23, 59, 59, 999);
    q = q.eq("is_evergreen", false).gte("home_expires_at", now).lte("home_expires_at", end.toISOString());
  }

  // Fonte
  if (sourceFilter === "__manual") {
    q = q.is("source_id", null).is("source_url", null);
  } else if (sourceFilter === "__instagram") {
    q = q.is("source_id", null).ilike("source_url", "%instagram.com%");
  } else if (sourceFilter !== "all") {
    if (normalizedSourceIds && normalizedSourceIds.length > 1) {
      q = q.in("source_id", normalizedSourceIds);
    } else {
      q = q.eq("source_id", sourceFilter);
    }
  }

  // Duplicidade (partição exclusiva — auditada no banco: 1092+40+48=1180)
  if (duplicateFilter === "nova") {
    q = q.neq("status", "duplicada").or("similarity_score.is.null,similarity_score.lt.0.71");
  } else if (duplicateFilter === "similar") {
    q = q.neq("status", "duplicada").gte("similarity_score", 0.71).lt("similarity_score", 0.91);
  } else if (duplicateFilter === "duplicada") {
    q = q.or("status.eq.duplicada,similarity_score.gte.0.91");
  }

  // Relevância
  if (relevanceFilter !== "all") q = q.eq("relevance_level", relevanceFilter);

  // Período (America/Maceio)
  if (period === "today") {
    const { startIso, endIso } = maceioDayBoundsIso(0);
    q = q.gte("captured_at", startIso).lte("captured_at", endIso);
  } else if (period === "last3") {
    const { startIso } = maceioDayBoundsIso(-2);
    const { endIso } = maceioDayBoundsIso(0);
    q = q.gte("captured_at", startIso).lte("captured_at", endIso);
  }

  // Busca: título ILIKE OU source_id IN OU category_id IN
  // Escapamos %, _ e \ no padrão ILIKE para tratar o termo literalmente.
  if (searchTerm) {
    const t = escapeIlike(searchTerm);
    const parts: string[] = [`title.ilike.%${t}%`];
    if (searchSourceIds.length) parts.push(`source_id.in.(${searchSourceIds.join(",")})`);
    if (searchCategoryIds.length) parts.push(`category_id.in.(${searchCategoryIds.join(",")})`);
    q = q.or(parts.join(","));
  }


  return q;
}

export default function AdminPosts() {
  const { user, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();


  // -------- URL-persisted state ----------
  const validStatus = new Set<Filter>([
    "all", "rascunho", "captada", "pronta_para_revisao", "em_revisao", "aprovada",
    "rejeitada", "publicada", "duplicada", "arquivada",
  ]);
  const initialStatus = (searchParams.get("status") as Filter) || "captada";
  const initialPeriod = (searchParams.get("period") as PeriodFilter) || "today";
  const initialSource = searchParams.get("source") || "all";
  const initialSearch = searchParams.get("q") || "";
  const initialDup = (searchParams.get("duplicate") as DuplicateFilter) || "all";
  const initialRel = (searchParams.get("relevance") as RelevanceFilter) || "all";
  const initialHome = (searchParams.get("home") as HomeFilter) || "all";
  const initialArchived = (searchParams.get("archived") as ArchivedFilter) || "hide";
  const initialPage = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
  const initialPerRaw = parseInt(searchParams.get("per") || String(DEFAULT_PER), 10) || DEFAULT_PER;
  const initialPer = (PER_PAGE_OPTIONS as readonly number[]).includes(initialPerRaw) ? initialPerRaw : DEFAULT_PER;
  const initialAdv = searchParams.get("adv") === "1";
  const rawSort = (searchParams.get("sort") as PostSortColumn) || DEFAULT_SORT;
  const initialSort: PostSortColumn = (SORT_OPTIONS.some((o) => o.value === rawSort) ? rawSort : DEFAULT_SORT);
  const rawDir = (searchParams.get("dir") as PostSortDir) || DEFAULT_DIR;
  const initialDir: PostSortDir = rawDir === "asc" ? "asc" : "desc";


  const [filter, setFilter] = useState<Filter>(validStatus.has(initialStatus) ? initialStatus : "captada");
  const [period, setPeriod] = useState<PeriodFilter>(initialPeriod);
  const [sourceFilter, setSourceFilter] = useState<string>(initialSource);
  const [searchInput, setSearchInput] = useState<string>(initialSearch);
  const [searchTerm, setSearchTerm] = useState<string>(sanitizeSearch(initialSearch));
  const [duplicateFilter, setDuplicateFilter] = useState<DuplicateFilter>(initialDup);
  const [relevanceFilter, setRelevanceFilter] = useState<RelevanceFilter>(initialRel);
  const [homeFilter, setHomeFilter] = useState<HomeFilter>(initialHome);
  const [archivedFilter, setArchivedFilter] = useState<ArchivedFilter>(initialArchived);
  const [page, setPage] = useState<number>(initialPage);
  const [perPage, setPerPage] = useState<number>(initialPer);
  const [advOpen, setAdvOpen] = useState<boolean>(initialAdv);
  const [sort, setSort] = useState<PostSortColumn>(initialSort);
  const [dir, setDir] = useState<PostSortDir>(initialDir);
  const [actionsPost, setActionsPost] = useState<any | null>(null);


  // -------- não persistido ----------
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [groupSort, setGroupSort] = useState<GroupSort>("count_desc");
  const [posts, setPosts] = useState<any[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [sources, setSources] = useState<any[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [dayModalPost, setDayModalPost] = useState<any | null>(null);
  const [cards, setCards] = useState({ publicadas: 0, em_revisao: 0, plantoes: 0, arquivadas: 0 });
  const [reclassifying, setReclassifying] = useState(false);

  // ---- Estado dos diálogos (substitui window.confirm) ----
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<any | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<any | null>(null);
  const [archiveBatchOpen, setArchiveBatchOpen] = useState(false);
  const [statusTarget, setStatusTarget] = useState<{ p: any; kind: StatusKind } | null>(null);
  const [reclassifyOpen, setReclassifyOpen] = useState(false);
  const [autoArchiveOpen, setAutoArchiveOpen] = useState(false);
  const [autoArchivePreview, setAutoArchivePreview] = useState<AutoArchivePreview | null>(null);
  const [autoArchivePrevTotal, setAutoArchivePrevTotal] = useState<number | null>(null);
  const [autoArchiveLoadingPreview, setAutoArchiveLoadingPreview] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);

  // Agrupamento de fontes duplicadas (Etapa 7)
  // Para a fonte selecionada, retorna todos os source_id com mesmo nome normalizado.
  const normalizedSourceIds = useCallback((): string[] | null => {
    if (sourceFilter === "all" || sourceFilter === "__manual" || sourceFilter === "__instagram") return null;
    const cur = sources.find((s) => s.id === sourceFilter);
    if (!cur) return null;
    const norm = String(cur.name || "").toLowerCase().trim();
    const ids = sources.filter((s) => String(s.name || "").toLowerCase().trim() === norm).map((s) => s.id);
    return ids.length > 1 ? ids : null;
  }, [sourceFilter, sources]);

  // Aborter + requestId para descartar respostas obsoletas
  const abortRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);

  // -------- Sync URL -----------
  useEffect(() => {
    const p = new URLSearchParams();
    if (filter !== "captada") p.set("status", filter);
    if (period !== "today") p.set("period", period);
    if (sourceFilter !== "all") p.set("source", sourceFilter);
    if (searchTerm) p.set("q", searchTerm);
    if (duplicateFilter !== "all") p.set("duplicate", duplicateFilter);
    if (relevanceFilter !== "all") p.set("relevance", relevanceFilter);
    if (homeFilter !== "all") p.set("home", homeFilter);
    if (archivedFilter !== "hide") p.set("archived", archivedFilter);
    if (page !== 1) p.set("page", String(page));
    if (perPage !== DEFAULT_PER) p.set("per", String(perPage));
    if (advOpen) p.set("adv", "1");
    if (sort !== DEFAULT_SORT) p.set("sort", sort);
    if (dir !== DEFAULT_DIR) p.set("dir", dir);
    setSearchParams(p, { replace: true });
  }, [filter, period, sourceFilter, searchTerm, duplicateFilter, relevanceFilter, homeFilter, archivedFilter, page, perPage, advOpen, sort, dir, setSearchParams]);


  // -------- debounce da busca (400 ms) -----------
  useEffect(() => {
    const clean = sanitizeSearch(searchInput);
    if (clean === searchTerm) return;
    setSearching(true);
    const id = setTimeout(() => {
      setSearchTerm(clean);
      setPage(1);
      setSearching(false);
    }, 400);
    return () => clearTimeout(id);
  }, [searchInput, searchTerm]);

  // Reset de página quando qualquer filtro muda (exceto page/perPage)
  const filtersKey = JSON.stringify({
    filter, period, sourceFilter, duplicateFilter, relevanceFilter, homeFilter, archivedFilter,
  });
  const firstMount = useRef(true);
  useEffect(() => {
    if (firstMount.current) { firstMount.current = false; return; }
    setPage(1);
  }, [filtersKey]);

  // -------- Carga: cards + fontes -----------
  useEffect(() => {
    document.title = "Notícias — Painel";
    (async () => {
      const { data } = await supabase.from("news_sources").select("id,name,source_type").order("name");
      setSources(data ?? []);
    })();
    loadCards();
  }, []);

  async function loadCards() {
    const now = new Date().toISOString();
    const [pub, rev, plant, arq] = await Promise.all([
      supabase.from("posts").select("id", { count: "exact", head: true }).in("status", ["publicada", "publicado"]),
      supabase.from("posts").select("id", { count: "exact", head: true }).in("status", ["pronta_para_revisao", "em_revisao", "revisao"]),
      supabase.from("posts").select("id", { count: "exact", head: true }).eq("is_urgent", true).gt("home_expires_at", now),
      supabase.from("posts").select("id", { count: "exact", head: true }).eq("status", "arquivada"),
    ]);
    setCards({
      publicadas: pub.count ?? 0,
      em_revisao: rev.count ?? 0,
      plantoes: plant.count ?? 0,
      arquivadas: arq.count ?? 0,
    });
  }

  // Resolve IDs de fontes e categorias que casam com o termo de busca
  async function resolveSearchIds(term: string): Promise<{ sourceIds: string[]; categoryIds: string[] }> {
    if (!term) return { sourceIds: [], categoryIds: [] };
    const like = `%${escapeIlike(term)}%`;
    const [srcRes, catRes] = await Promise.all([
      supabase.from("news_sources").select("id").ilike("name", like).limit(50),
      supabase.from("categories").select("id").ilike("name", like).limit(50),
    ]);
    return {
      sourceIds: (srcRes.data ?? []).map((r: any) => r.id),
      categoryIds: (catRes.data ?? []).map((r: any) => r.id),
    };
  }

  // -------- Carga da lista paginada -----------
  useEffect(() => {
    let cancelled = false;
    const rid = ++requestIdRef.current;

    // Aborta requisição anterior
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    (async () => {
      setLoading(true);
      try {
        const { sourceIds, categoryIds } = await resolveSearchIds(searchTerm);
        if (controller.signal.aborted || rid !== requestIdRef.current) return;

        const from = (page - 1) * perPage;
        const to = from + perPage - 1;
        const cols =
          "id,title,slug,status,is_urgent,is_featured,is_evergreen,home_expires_at,views,published_at,scheduled_at,created_at,captured_at,source_id,source_url,similarity_score,similar_to,duplicate_of,duplicate_match_reason,cover_image_url,manual_image_url,cover_image_original,archived_at,archived_reason,content,relevance_level,relevance_score,categories!posts_category_id_fkey(name,default_cover_image_url)";

        let q = supabase.from("posts").select(cols, { count: "exact" });
        q = applyServerFilters(q, {
          filter, archivedFilter, homeFilter, sourceFilter, duplicateFilter,
          relevanceFilter, period, searchTerm,
          searchSourceIds: sourceIds, searchCategoryIds: categoryIds,
          normalizedSourceIds: normalizedSourceIds(),
        });
        // Ordenação escolhida + fallback determinístico (created_at DESC, id DESC).
        const asc = dir === "asc";
        q = q
          .order(sort, { ascending: asc, nullsFirst: false })
          .order("created_at", { ascending: false })
          .order("id", { ascending: false })
          .range(from, to)
          .abortSignal(controller.signal);


        const { data, count, error } = await q;
        if (cancelled || rid !== requestIdRef.current) return;
        if (error) {
          if (error.message?.toLowerCase().includes("abort")) return;
          console.error("[AdminPosts] Falha ao carregar lista:", error);
          toast.error(`Erro ao carregar notícias: ${error.message}`);
          setLoading(false);
          return;
        }

        const list = (data ?? []) as any[];
        // Enriquecimento: refs para similar/duplicate e nomes de fonte
        const refIds = Array.from(new Set(list.map((p) => p.similar_to || p.duplicate_of).filter(Boolean) as string[]));
        let refMap: Record<string, { title: string; published_at: string | null; slug: string }> = {};
        if (refIds.length) {
          const { data: refs } = await supabase.from("posts").select("id,title,published_at,slug").in("id", refIds);
          (refs ?? []).forEach((r: any) => { refMap[r.id] = { title: r.title, published_at: r.published_at, slug: r.slug }; });
        }
        const srcMap = new Map<string, string>();
        sources.forEach((s) => srcMap.set(s.id, s.name));
        const enriched = list.map((p) => {
          const method = p.source_id ? "automatic" : p.source_url && /instagram\.com/i.test(p.source_url) ? "instagram" : "manual";
          const _sourceName = (p.source_id && srcMap.get(p.source_id)) || (method === "instagram" ? "Instagram" : "Manual");
          return { ...p, _ref: refMap[p.similar_to || p.duplicate_of], _sourceName };
        });

        if (rid !== requestIdRef.current) return;
        setPosts(enriched);
        setTotalCount(count ?? 0);
        setLoading(false);
      } catch (err: any) {
        if (err?.name === "AbortError") return;
        console.error("[AdminPosts] erro inesperado:", err);
        setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [filter, period, sourceFilter, duplicateFilter, relevanceFilter, homeFilter, archivedFilter, searchTerm, page, perPage, sort, dir, sources, normalizedSourceIds]);

  // Refresh externo
  useEffect(() => {
    const handler = () => { loadCards(); requestIdRef.current++; setPage((p) => p); };
    window.addEventListener("posts:refresh", handler);
    return () => window.removeEventListener("posts:refresh", handler);
  }, []);

  // ---------- ações (Passada 3 — diálogos AlertDialog + submittingRef) ----------
  // Guarda global contra clique duplo. Cada *Perform seta submittingRef antes
  // do await e limpa no finally, para nunca deixar a UI travada em erro.
  async function withSubmit(fn: () => Promise<void>) {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    try { await fn(); }
    finally { submittingRef.current = false; setSubmitting(false); }
  }

  // Abridores de diálogo (chamados pelo menu/tabela/cartão)
  function archiveNow(p: any)   { setArchiveTarget(p); }
  function restoreOne(p: any)   { setRestoreTarget(p); }
  function remove(id: string)   {
    const p = posts.find((x) => x.id === id) || { id, title: "Notícia" };
    setDeleteTarget(p);
  }
  function updateStatus(p: any, newStatus: EditorialStatus) {
    if (newStatus === "aprovada" || newStatus === "publicada" || newStatus === "em_revisao") {
      setStatusTarget({ p, kind: newStatus });
    }
  }
  function archiveSelected() {
    if (!selected.size) return;
    setArchiveBatchOpen(true);
  }
  function runAutoArchive() {
    setAutoArchivePrevTotal(null);
    setAutoArchivePreview(null);
    setAutoArchiveOpen(true);
    void loadAutoArchivePreview(null);
  }
  function reclassify() { setReclassifyOpen(true); }

  // Executores reais (server-side) — usados pelos diálogos
  async function archivePerform(p: any) {
    await withSubmit(async () => {
      const { error } = await supabase.rpc("archive_post", { _post_id: p.id, _reason: "manual" });
      if (error) { toast.error(error.message); return; }
      toast.success("Notícia arquivada");
      setArchiveTarget(null); setSelected(new Set());
      loadCards(); requestIdRef.current++; setPage((v) => v);
    });
  }
  async function restorePerform(p: any) {
    await withSubmit(async () => {
      const { error } = await supabase.rpc("restore_post", { _post_id: p.id });
      if (error) { toast.error(error.message); return; }
      toast.success("Notícia restaurada");
      setRestoreTarget(null);
      loadCards(); requestIdRef.current++; setPage((v) => v);
    });
  }
  async function archiveBatchPerform() {
    const ids = Array.from(selected);
    if (!ids.length) return;
    await withSubmit(async () => {
      let ok = 0;
      for (const id of ids) {
        const { error } = await supabase.rpc("archive_post", { _post_id: id, _reason: "manual" });
        if (!error) ok++;
      }
      toast.success(`${ok}/${ids.length} arquivada(s)`);
      setArchiveBatchOpen(false); setSelected(new Set());
      loadCards(); requestIdRef.current++; setPage((v) => v);
    });
  }
  async function loadAutoArchivePreview(prev: number | null) {
    setAutoArchiveLoadingPreview(true);
    try {
      const { data, error } = await supabase.rpc("auto_archive_preview");
      if (error) { toast.error(`Falha na prévia: ${error.message}`); return; }
      const pv = data as unknown as AutoArchivePreview;
      setAutoArchivePrevTotal(prev);
      setAutoArchivePreview(pv);
    } finally { setAutoArchiveLoadingPreview(false); }
  }
  async function autoArchivePerform() {
    if (!autoArchivePreview) return;
    const prevTotal = autoArchivePreview.total;
    await withSubmit(async () => {
      // Recalcula antes de executar para evitar deriva silenciosa
      const { data: fresh, error: pErr } = await supabase.rpc("auto_archive_preview");
      if (pErr) { toast.error(`Falha ao revalidar prévia: ${pErr.message}`); return; }
      const freshPv = fresh as unknown as AutoArchivePreview;
      if (freshPv.total !== prevTotal) {
        setAutoArchivePrevTotal(prevTotal);
        setAutoArchivePreview(freshPv);
        toast.warning("A contagem mudou. Revise novamente antes de arquivar.");
        return;
      }
      const { data, error } = await supabase.rpc("auto_archive_posts");
      if (error) { toast.error(error.message); return; }
      const n = Array.isArray(data) ? (data[0] as any)?.archived_count ?? 0 : (data as any)?.archived_count ?? 0;
      toast.success(`${n} notícia(s) arquivada(s) automaticamente`);
      setAutoArchiveOpen(false);
      loadCards(); requestIdRef.current++; setPage((v) => v);
    });
  }
  function toggleSelected(id: string) {
    setSelected((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }
  async function deletePerform(p: any) {
    await withSubmit(async () => {
      const { error } = await supabase.from("posts").delete().eq("id", p.id);
      if (error) { toast.error(error.message); return; }
      toast.success("Notícia excluída");
      setDeleteTarget(null);
      loadCards(); requestIdRef.current++; setPage((v) => v);
    });
  }
  async function statusPerform(p: any, newStatus: EditorialStatus) {
    await withSubmit(async () => {
      const payload: any = { status: newStatus };
      if (newStatus === "publicada") payload.published_at = p.published_at ?? new Date().toISOString();
      // .select() garante que RLS silencioso (0 linhas afetadas) seja detectado.
      const { data, error } = await supabase
        .from("posts")
        .update(payload)
        .eq("id", p.id)
        .select("id,status");
      if (error) { toast.error(error.message); return; }
      if (!data || data.length === 0) {
        toast.error("Sem permissão para alterar o status desta notícia.");
        return;
      }
      toast.success(
        newStatus === "publicada" ? "Notícia publicada" :
        newStatus === "aprovada"  ? "Notícia aprovada"  :
                                    "Notícia movida para revisão"
      );
      setStatusTarget(null);
      loadCards(); requestIdRef.current++; setPage((v) => v);
    });
  }
  async function toggleFeatured(p: any) {
    const { error } = await supabase.from("posts").update({ is_featured: !p.is_featured }).eq("id", p.id);
    if (error) toast.error(error.message);
    else { toast.success(p.is_featured ? "Destaque removido" : "Definido como destaque"); requestIdRef.current++; setPage((v) => v); }
  }
  async function renewExpiration(p: any, hours: number) {
    const newExp = new Date(); newExp.setHours(newExp.getHours() + hours);
    const { error } = await supabase.from("posts").update({ home_expires_at: newExp.toISOString() }).eq("id", p.id);
    if (error) toast.error(error.message);
    else { toast.success(`Destaque renovado por mais ${hours >= 24 ? `${hours / 24}d` : `${hours}h`}`); loadCards(); requestIdRef.current++; setPage((v) => v); }
  }
  async function reclassifyPerform() {
    await withSubmit(async () => {
      setReclassifying(true);
      try {
        const { data, error } = await supabase.functions.invoke("reclassify-categories");
        if (error) {
          const msg = String(error?.message || "").toLowerCase();
          if (msg.includes("credit") || msg.includes("payment") || msg.includes("402")) {
            toast.error("Créditos de IA indisponíveis. Adicione créditos e tente novamente.");
          } else {
            toast.error("Erro ao reclassificar: " + (error.message || "falha desconhecida"));
          }
          return;
        }
        toast.success(`${(data as any)?.atualizados ?? 0} notícias reclassificadas.`);
        setReclassifyOpen(false);
        requestIdRef.current++; setPage((v) => v);
      } finally { setReclassifying(false); }
    });
  }
  async function recordDecision(p: any, decision: "manter" | "mesclar" | "marcar_duplicada") {
    const refId = p.similar_to || p.duplicate_of || null;
    const { error } = await supabase.from("duplicate_decisions").insert({
      post_id: p.id, reference_post_id: refId, decision,
      similarity_score: p.similarity_score ?? null, decided_by: user?.id ?? null,
    });
    if (error) { toast.error(error.message); return false; }
    return true;
  }
  async function decideKeep(p: any) {
    if (!(await recordDecision(p, "manter"))) return;
    const { error } = await supabase.from("posts")
      .update({ similar_to: null, duplicate_of: null, status: p.status === "duplicada" ? "em_revisao" : p.status })
      .eq("id", p.id);
    if (error) return toast.error(error.message);
    toast.success("Notícia mantida como original");
    loadCards(); requestIdRef.current++; setPage((v) => v);
  }
  async function decideMerge(p: any) {
    if (!p._ref) return;
    if (!(await recordDecision(p, "mesclar"))) return;
    const { error } = await supabase.from("posts")
      .update({ status: "duplicada", duplicate_of: p.similar_to || p.duplicate_of, similar_to: null })
      .eq("id", p.id);
    if (error) return toast.error(error.message);
    toast.success("Marcada como duplicada. Abrindo a notícia original para mesclagem…");
    window.open(`/admin/posts/${p.similar_to || p.duplicate_of}`, "_blank");
    loadCards(); requestIdRef.current++; setPage((v) => v);
  }
  async function decideMarkDuplicate(p: any) {
    if (!(await recordDecision(p, "marcar_duplicada"))) return;
    const { error } = await supabase.from("posts")
      .update({ status: "duplicada", duplicate_of: p.similar_to || p.duplicate_of, similar_to: null })
      .eq("id", p.id);
    if (error) return toast.error(error.message);
    toast.success("Marcada como duplicada");
    loadCards(); requestIdRef.current++; setPage((v) => v);
  }

  // ---------- helpers UI ----------
  const totalPages = Math.max(1, Math.ceil(totalCount / perPage));
  const from = totalCount === 0 ? 0 : (page - 1) * perPage + 1;
  const to = Math.min(page * perPage, totalCount);

  const sourcesById = useMemo(() => {
    const m = new Map<string, string>();
    sources.forEach((s: any) => m.set(s.id, s.name));
    return m;
  }, [sources]);

  // Dispatcher da ação principal — usa helper compartilhado (getPrimaryAction).
  // Preserva callbacks existentes: apenas roteia a decisão.
  const handlePrimary = useCallback((p: any) => {
    const spec = getPrimaryAction(p);
    switch (spec.kind) {
      case "approve":  updateStatus(p, "aprovada"); break;
      case "publish":  updateStatus(p, "publicada"); break;
      case "restore":  restoreOne(p); break;
      case "open_portal":
        if (p.slug) window.open(`/noticia/${p.slug}`, "_blank");
        break;
      case "review_duplicate":
      case "edit":
      case "continue_edit":
      default:
        navigate(`/admin/posts/${p.id}`);
        break;
    }
  }, [navigate]);

  const activeChips: { key: string; label: string; onClear: () => void }[] = [];

  if (filter !== "captada") activeChips.push({ key: "status", label: `Status: ${filter === "all" ? "Todas" : STATUS_LABEL[filter as EditorialStatus]}`, onClear: () => setFilter("captada") });
  if (period !== "today") activeChips.push({ key: "period", label: `Período: ${period === "last3" ? "Últimos 3 dias" : "Todas"}`, onClear: () => setPeriod("today") });
  if (sourceFilter !== "all") {
    const src = sources.find((s) => s.id === sourceFilter);
    const nm = sourceFilter === "__manual" ? "Manual" : sourceFilter === "__instagram" ? "Instagram" : src?.name || "Fonte";
    activeChips.push({ key: "source", label: `Fonte: ${nm}`, onClear: () => setSourceFilter("all") });
  }
  if (searchTerm) activeChips.push({ key: "q", label: `Busca: "${searchTerm}"`, onClear: () => { setSearchInput(""); setSearchTerm(""); } });
  if (duplicateFilter !== "all") activeChips.push({ key: "dup", label: `Duplicidade: ${duplicateFilter}`, onClear: () => setDuplicateFilter("all") });
  if (relevanceFilter !== "all") activeChips.push({ key: "rel", label: `Relevância: ${relevanceFilter}`, onClear: () => setRelevanceFilter("all") });
  if (homeFilter !== "all") activeChips.push({ key: "home", label: `Home: ${homeFilter}`, onClear: () => setHomeFilter("all") });
  if (archivedFilter !== "hide") activeChips.push({ key: "arq", label: `Arquivamento: ${archivedFilter === "only" ? "Somente" : "Todas"}`, onClear: () => setArchivedFilter("hide") });

  function clearAll() {
    setFilter("captada"); setPeriod("today"); setSourceFilter("all");
    setSearchInput(""); setSearchTerm("");
    setDuplicateFilter("all"); setRelevanceFilter("all");
    setHomeFilter("all"); setArchivedFilter("hide"); setPage(1);
  }

  // Cards do topo (Etapa 6)
  const statCards = [
    { label: "Publicadas", value: cards.publicadas, icon: Globe, color: "text-emerald-700 bg-emerald-50 border-emerald-200" },
    { label: "Em revisão", value: cards.em_revisao, icon: FileCheck2, color: "text-amber-700 bg-amber-50 border-amber-200" },
    { label: "Plantões ativos", value: cards.plantoes, icon: Flame, color: "text-red-700 bg-red-50 border-red-200" },
    { label: "Arquivadas", value: cards.arquivadas, icon: Archive, color: "text-zinc-700 bg-zinc-50 border-zinc-200" },
  ];

  // Como todos os filtros são server-side, a lista renderizada = posts
  const filteredPosts = posts;

  // Fontes visíveis: colapsa nomes normalizados iguais em uma única entrada
  const visibleSources = (() => {
    const seen = new Map<string, any>();
    for (const s of sources) {
      const key = String(s.name || "").toLowerCase().trim();
      if (!seen.has(key)) seen.set(key, s);
    }
    return Array.from(seen.values());
  })();

  return (
    <AdminLayout>
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-display text-3xl font-black">Notícias</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={reclassify} disabled={reclassifying} className="text-xs uppercase font-bold tracking-wider">
            {reclassifying ? "Reclassificando..." : "Reclassificar por IA"}
          </Button>
          <Button asChild className="bg-urgent hover:bg-urgent/90">
            <Link to="/admin/posts/novo"><PlusCircle className="h-4 w-4 mr-2" /> Nova</Link>
          </Button>
        </div>
      </div>

      {/* Cards: Publicadas / Em revisão / Plantões ativos / Arquivadas */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 mb-6">
        {statCards.map((s) => {
          const Icon = s.icon;
          return (
            <div
              key={s.label}
              className={`border rounded-sm p-3 flex items-center gap-3 min-h-[76px] ${s.color}`}
            >
              <Icon className="h-5 w-5 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="text-2xl font-black leading-none">
                  {s.value.toLocaleString("pt-BR")}
                </div>
                <div className="text-[10px] uppercase font-bold tracking-wider mt-1 break-words whitespace-normal">
                  {s.label}
                </div>
              </div>
            </div>
          );
        })}
      </div>


      {/* Filtros principais: Status */}
      <div className="flex flex-wrap gap-2 mb-3">
        <button onClick={() => setFilter("all")}
          className={`px-3 py-1.5 text-xs uppercase font-bold tracking-wider rounded-sm ${filter === "all" ? "bg-primary text-primary-foreground" : "bg-secondary"}`}>
          Todas
        </button>
        {STATUS_ORDER.map((s) => (
          <button key={s} onClick={() => setFilter(s)}
            className={`px-3 py-1.5 text-xs uppercase font-bold tracking-wider rounded-sm ${filter === s ? "bg-primary text-primary-foreground" : "bg-secondary"}`}>
            {STATUS_LABEL[s]}
          </button>
        ))}
      </div>

      {/* Período (America/Maceio) */}
      <div className="flex flex-wrap gap-2 mb-4 items-center">
        <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mr-1">Período (Maceió):</span>
        {([
          { key: "today", label: "Capturadas hoje", icon: CalendarDays },
          { key: "last3", label: "Últimos 3 dias", icon: Clock },
          { key: "all", label: "Todas", icon: ClipboardList },
        ] as { key: PeriodFilter; label: string; icon: any }[]).map((opt) => {
          const Ic = opt.icon;
          return (
            <button key={opt.key} onClick={() => setPeriod(opt.key)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] uppercase font-bold tracking-wider rounded-sm border min-h-[44px] ${
                period === opt.key ? "bg-red-600 text-white border-red-700" : "bg-white border-border hover:bg-secondary"
              }`}>
              <Ic className="h-3.5 w-3.5" /> {opt.label}
            </button>
          );
        })}
      </div>

      {/* Fonte */}
      <div className="flex flex-wrap gap-2 mb-4 items-center">
        <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mr-1">Fonte:</span>
        <button onClick={() => setSourceFilter("all")}
          className={`px-3 py-1.5 text-[11px] uppercase font-bold tracking-wider rounded-sm border ${
            sourceFilter === "all" ? "bg-foreground text-background border-foreground" : "bg-white border-border hover:bg-secondary"
          }`}>Todas</button>
        {visibleSources.map((src) => (
          <button key={src.id} onClick={() => setSourceFilter(src.id)}
            className={`px-2 py-1 rounded-sm border ${sourceFilter === src.id ? "ring-2 ring-foreground" : "opacity-80 hover:opacity-100"}`}
            title={src.name}>
            <SourceBadge name={src.name} />
          </button>
        ))}
        <button onClick={() => setSourceFilter("__instagram")}
          className={`px-2 py-1 rounded-sm border ${sourceFilter === "__instagram" ? "ring-2 ring-foreground" : "opacity-80 hover:opacity-100"}`}>
          <SourceBadge name="Instagram" />
        </button>
        <button onClick={() => setSourceFilter("__manual")}
          className={`px-2 py-1 rounded-sm border ${sourceFilter === "__manual" ? "ring-2 ring-foreground" : "opacity-80 hover:opacity-100"}`}>
          <SourceBadge name="Manual" />
        </button>
      </div>

      {/* Busca + toggle "Mais filtros" */}
      <div className="flex flex-wrap gap-2 mb-3 items-center">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Pesquisar título, fonte, categoria…"
            className="h-11 pl-7 text-sm"
            aria-label="Buscar notícias"
          />
          {searching && (
            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] uppercase font-bold text-muted-foreground">Buscando…</span>
          )}
        </div>
        <button
          onClick={() => setAdvOpen((v) => !v)}
          className={`inline-flex items-center gap-1.5 px-3 py-2 text-[11px] uppercase font-bold tracking-wider rounded-sm border min-h-[44px] ${
            advOpen ? "bg-foreground text-background border-foreground" : "bg-white border-border hover:bg-secondary"
          }`}
        >
          <SlidersHorizontal className="h-3.5 w-3.5" /> Mais filtros
          {(duplicateFilter !== "all" || relevanceFilter !== "all" || homeFilter !== "all" || archivedFilter !== "hide") && (
            <span className="ml-1 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-600 text-white text-[9px] font-black">
              ●
            </span>
          )}
        </button>
      </div>

      {/* Chips de filtros ativos */}
      {activeChips.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4 items-center">
          {activeChips.map((c) => (
            <span key={c.key} className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider bg-secondary border border-border rounded-sm px-2 py-1">
              {c.label}
              <button onClick={c.onClear} className="hover:text-red-600" aria-label={`Remover filtro ${c.label}`}>
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          <button onClick={clearAll} className="text-[11px] uppercase font-bold tracking-wider text-red-700 hover:underline">
            Limpar todos
          </button>
        </div>
      )}

      {/* Mais filtros (colapsável) */}
      {advOpen && (
        <div className="border border-border rounded-sm p-3 mb-4 bg-secondary/30 space-y-3">
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mr-1">Validade na Home:</span>
            {([
              { key: "all", label: "Todas" },
              { key: "active", label: "Ativas na Home" },
              { key: "expiring_today", label: "Vencendo hoje" },
              { key: "expired", label: "Expiradas da Home" },
            ] as { key: HomeFilter; label: string }[]).map((opt) => (
              <button key={opt.key} onClick={() => setHomeFilter(opt.key)}
                className={`px-3 py-1.5 text-[11px] uppercase font-bold tracking-wider rounded-sm border ${
                  homeFilter === opt.key ? "bg-emerald-600 text-white border-emerald-700" : "bg-white border-border text-foreground hover:bg-secondary"
                }`}>{opt.label}</button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mr-1">Duplicidade:</span>
            {([
              { key: "all", label: "Todas" },
              { key: "nova", label: "Apenas novas" },
              { key: "similar", label: "Apenas similares" },
              { key: "duplicada", label: "Apenas duplicadas" },
            ] as { key: DuplicateFilter; label: string }[]).map((opt) => (
              <button key={opt.key} onClick={() => setDuplicateFilter(opt.key)}
                className={`px-3 py-1.5 text-[11px] uppercase font-bold tracking-wider rounded-sm border ${
                  duplicateFilter === opt.key ? "bg-foreground text-background border-foreground" : "bg-white border-border hover:bg-secondary"
                }`}>{opt.label}</button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mr-1">Relevância:</span>
            {([
              { key: "all", label: "Todas" },
              { key: "urgente", label: "🔴 Urgente" },
              { key: "alta", label: "🟠 Alta" },
              { key: "media", label: "🟡 Média" },
              { key: "baixa", label: "🟢 Baixa" },
            ] as { key: RelevanceFilter; label: string }[]).map((opt) => (
              <button key={opt.key} onClick={() => setRelevanceFilter(opt.key)}
                className={`px-3 py-1.5 text-[11px] uppercase font-bold tracking-wider rounded-sm border ${
                  relevanceFilter === opt.key ? "bg-foreground text-background border-foreground" : "bg-white border-border hover:bg-secondary"
                }`}>{opt.label}</button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mr-1">Arquivamento:</span>
            {([
              { key: "hide", label: "Não arquivadas" },
              { key: "only", label: `Arquivadas (${cards.arquivadas})` },
              { key: "all", label: "Todas" },
            ] as { key: ArchivedFilter; label: string }[]).map((opt) => (
              <button key={opt.key} onClick={() => setArchivedFilter(opt.key)}
                className={`px-3 py-1.5 text-[11px] uppercase font-bold tracking-wider rounded-sm border ${
                  archivedFilter === opt.key ? "bg-zinc-800 text-white border-zinc-900" : "bg-white border-border hover:bg-secondary"
                }`}>{opt.label}</button>
            ))}
            <Button variant="outline" size="sm" onClick={runAutoArchive} className="text-[11px] uppercase font-bold tracking-wider ml-2">
              Rodar arquivamento automático
            </Button>
            {selected.size > 0 && (
              <Button size="sm" variant="destructive" onClick={archiveSelected} className="text-[11px] uppercase font-bold tracking-wider">
                Arquivar selecionadas ({selected.size})
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Modo de visualização + paginação (topo) */}
      <div className="flex flex-wrap gap-2 mb-4 items-center">
        <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mr-1">Visualização:</span>
        <button onClick={() => setViewMode("list")}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] uppercase font-bold tracking-wider rounded-sm border ${
            viewMode === "list" ? "bg-foreground text-background border-foreground" : "bg-white border-border hover:bg-secondary"
          }`}><List className="h-3 w-3" /> Lista</button>
        <button onClick={() => setViewMode("grouped")}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] uppercase font-bold tracking-wider rounded-sm border ${
            viewMode === "grouped" ? "bg-foreground text-background border-foreground" : "bg-white border-border hover:bg-secondary"
          }`}><FolderTree className="h-3 w-3" /> Agrupado por Fonte</button>
        <button onClick={() => setViewMode("kanban")}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] uppercase font-bold tracking-wider rounded-sm border ${
            viewMode === "kanban" ? "bg-foreground text-background border-foreground" : "bg-white border-border hover:bg-secondary"
          }`}><KanbanSquare className="h-3 w-3" /> Kanban</button>

        {viewMode === "list" && (
          <label className="ml-auto inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider">
            Ordenar por:
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as PostSortColumn)}
              className="h-11 min-h-[44px] border border-border rounded-sm px-2 text-xs bg-white"
              aria-label="Coluna de ordenação"
            >
              {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <select
              value={dir}
              onChange={(e) => setDir(e.target.value as PostSortDir)}
              className="h-11 min-h-[44px] border border-border rounded-sm px-2 text-xs bg-white"
              aria-label="Direção da ordenação"
            >
              <option value="desc">Descendente</option>
              <option value="asc">Ascendente</option>
            </select>
          </label>
        )}
      </div>

      {viewMode === "list" && (
        <div className="mb-3">
          <AdminPostsPagination
            page={page}
            perPage={perPage}
            totalCount={totalCount}
            loading={loading}
            onPage={setPage}
            onPerPage={(n) => { setPerPage(n); setPage(1); }}
            ariaLabel="Paginação (topo)"
          />
        </div>
      )}

      {viewMode === "kanban" ? (
        <KanbanBoard posts={filteredPosts} onChangeStatus={(p, st) => { void updateStatus(p, st); }} />
      ) : viewMode === "grouped" ? (
        <SourceGroupedView posts={filteredPosts} sort={groupSort} onSortChange={setGroupSort} />
      ) : (
        <>
          {/* Tablet / Mobile: cartões em uma coluna (< lg) */}
          <div className="lg:hidden space-y-3">
            {filteredPosts.length === 0 && !loading && (
              <div className="bg-card border border-border p-8 text-center text-sm text-muted-foreground">Nenhuma notícia.</div>
            )}
            {loading && (
              <div className="bg-card border border-border p-8 text-center text-sm text-muted-foreground">Carregando…</div>
            )}
            {filteredPosts.map((p) => {
              const sourceName = sourcesById.get(p.source_id) ||
                (p.source_url && /instagram\.com/i.test(p.source_url) ? "Instagram" : "Manual");
              return (
                <AdminPostMobileCard
                  key={p.id}
                  post={p}
                  sourceName={sourceName}
                  onPrimary={handlePrimary}
                  onMore={setActionsPost}
                />
              );
            })}
          </div>

          {/* Desktop: tabela (>= lg) */}
          <div className="hidden lg:block">
            <AdminPostsDesktopTable
              posts={filteredPosts}
              sourcesById={sourcesById}
              loading={loading}
              sort={sort}
              dir={dir}
              onSortChange={(s, d) => { setSort(s); setDir(d); }}
              onPrimary={handlePrimary}
              onMore={setActionsPost}
            />
          </div>

          <div className="mt-4">
            <AdminPostsPagination
              page={page}
              perPage={perPage}
              totalCount={totalCount}
              loading={loading}
              onPage={setPage}
              onPerPage={(n) => { setPerPage(n); setPage(1); }}
              showPerPage={false}
              ariaLabel="Paginação (rodapé)"
            />
          </div>
        </>
      )}

      <AdminPostActionsMenu
        open={!!actionsPost}
        onOpenChange={(o) => { if (!o) setActionsPost(null); }}
        post={actionsPost}
        onApprove={(p) => updateStatus(p, "aprovada")}
        onPublish={(p) => updateStatus(p, "publicada")}
        onUnpublish={(p) => updateStatus(p, "em_revisao")}
        onArchive={(p) => archiveNow(p)}
        onRestore={(p) => restoreOne(p)}
        onDelete={(p) => remove(p.id)}
        onShare={async (p) => {
          try { await navigator.clipboard.writeText(getSocialShareUrl(p.slug)); toast.success("Link com prévia copiado"); }
          catch { toast.error("Falha ao copiar link"); }
        }}
        onSeeDay={(p) => setDayModalPost(p)}
        onRenew={(p, h) => renewExpiration(p, h)}
        canDelete={isAdmin}
      />


      <DayPostsModal
        open={!!dayModalPost}
        onOpenChange={(o) => !o && setDayModalPost(null)}
        referencePost={dayModalPost}
      />

      {/* ===== Diálogos profissionais (substituem window.confirm) ===== */}
      <DeletePostDialog
        open={!!deleteTarget}
        onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}
        title={deleteTarget?.title || ""}
        submitting={submitting}
        onConfirm={() => deleteTarget && void deletePerform(deleteTarget)}
      />
      <ArchivePostDialog
        open={!!archiveTarget}
        onOpenChange={(o) => { if (!o) setArchiveTarget(null); }}
        title={archiveTarget?.title || ""}
        submitting={submitting}
        onConfirm={() => archiveTarget && void archivePerform(archiveTarget)}
      />
      <RestorePostDialog
        open={!!restoreTarget}
        onOpenChange={(o) => { if (!o) setRestoreTarget(null); }}
        title={restoreTarget?.title || ""}
        submitting={submitting}
        onConfirm={() => restoreTarget && void restorePerform(restoreTarget)}
      />
      <ArchiveBatchDialog
        open={archiveBatchOpen}
        onOpenChange={setArchiveBatchOpen}
        count={selected.size}
        sampleTitles={posts.filter((p) => selected.has(p.id)).slice(0, 5).map((p) => p.title)}
        submitting={submitting}
        onConfirm={() => void archiveBatchPerform()}
      />
      <StatusChangeDialog
        open={!!statusTarget}
        onOpenChange={(o) => { if (!o) setStatusTarget(null); }}
        title={statusTarget?.p?.title || ""}
        kind={statusTarget?.kind || "aprovada"}
        checklist={statusTarget ? buildChecklist(statusTarget.p, statusTarget.kind) : { missing: [], warnings: [] }}
        submitting={submitting}
        onConfirm={() => statusTarget && void statusPerform(statusTarget.p, statusTarget.kind)}
      />
      <ReclassifyDialog
        open={reclassifyOpen}
        onOpenChange={(o) => { if (!o) setReclassifyOpen(false); }}
        submitting={submitting || reclassifying}
        onConfirm={() => void reclassifyPerform()}
      />
      <AutoArchiveDialog
        open={autoArchiveOpen}
        onOpenChange={(o) => { if (!o) setAutoArchiveOpen(false); }}
        preview={autoArchivePreview}
        previousTotal={autoArchivePrevTotal}
        loadingPreview={autoArchiveLoadingPreview}
        submitting={submitting}
        onReview={() => void loadAutoArchivePreview(autoArchivePreview?.total ?? null)}
        onConfirm={() => void autoArchivePerform()}
      />
    </AdminLayout>
  );
}
