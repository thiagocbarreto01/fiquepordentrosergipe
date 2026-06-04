import { useEffect, useState } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Trash2, Edit, PlusCircle, Eye, CheckCircle2, Globe, ArchiveRestore, Archive, Clock, RotateCw, Flame, Pin, AlertCircle, Home, Check, GitMerge, AlertOctagon, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import {
  STATUS_ORDER,
  STATUS_LABEL,
  STATUS_COLOR,
  normalizeStatus,
  ARCHIVE_REASON_LABEL,
  type EditorialStatus,
} from "@/lib/statusFlow";
import {
  SourceBadge,
  OriginalLink,
  CaptureMethodChip,
  detectCaptureMethod,
} from "@/components/admin/SourceBadge";
import { classifyDuplicate, DUPLICATE_FILTERS, type DuplicateFilter } from "@/lib/duplicates";
import { getPostImage, handleImgError } from "@/lib/postImage";
import { RelevanceBadge } from "@/components/admin/RelevanceBadge";
import { useAuth } from "@/hooks/useAuth";
import { SourceGroupedView, type GroupSort } from "@/components/admin/SourceGroupedView";
import { KanbanBoard } from "@/components/admin/KanbanBoard";
import { List, FolderTree, KanbanSquare, Search } from "lucide-react";
import { Input } from "@/components/ui/input";

type Filter = "all" | EditorialStatus;
type HomeFilter = "all" | "active" | "expired" | "expiring_today";
type ViewMode = "list" | "grouped" | "kanban";

function formatExpiration(iso: string | null | undefined, isEvergreen: boolean) {
  if (isEvergreen) {
    return { label: "Destaque permanente", tone: "evergreen" as const, expired: false };
  }
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

export default function AdminPosts() {
  const { user } = useAuth();
  const [posts, setPosts] = useState<any[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [homeFilter, setHomeFilter] = useState<HomeFilter>("all");
  const [sourceFilter, setSourceFilter] = useState<string>("all"); // "all" | source_id | "__manual" | "__instagram"
  const [duplicateFilter, setDuplicateFilter] = useState<DuplicateFilter>("all");
  const [relevanceFilter, setRelevanceFilter] = useState<"all" | "baixa" | "media" | "alta" | "urgente">("all");
  const [archivedFilter, setArchivedFilter] = useState<"hide" | "only" | "all">("hide");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [archivedCount, setArchivedCount] = useState(0);
  const [sources, setSources] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    const v = typeof window !== "undefined" ? localStorage.getItem("admin:posts:viewMode") : null;
    return (v === "kanban" || v === "grouped" || v === "list") ? v : "list";
  });
  const [groupSort, setGroupSort] = useState<GroupSort>("count_desc");
  const [search, setSearch] = useState("");
  const [stats, setStats] = useState({ activeHome: 0, expired: 0, evergreen: 0, urgent: 0 });

  useEffect(() => {
    try { localStorage.setItem("admin:posts:viewMode", viewMode); } catch {}
  }, [viewMode]);

  async function loadStats() {
    const now = new Date().toISOString();
    const [activeRes, expiredRes, evergreenRes, urgentRes, archivedRes] = await Promise.all([
      supabase.from("posts").select("id", { count: "exact", head: true })
        .eq("status", "publicada")
        .or(`is_evergreen.eq.true,home_expires_at.is.null,home_expires_at.gt.${now}`),
      supabase.from("posts").select("id", { count: "exact", head: true })
        .eq("status", "publicada").eq("is_evergreen", false).lte("home_expires_at", now),
      supabase.from("posts").select("id", { count: "exact", head: true })
        .eq("status", "publicada").eq("is_evergreen", true),
      supabase.from("posts").select("id", { count: "exact", head: true })
        .eq("status", "publicada").eq("is_urgent", true)
        .or(`is_evergreen.eq.true,home_expires_at.is.null,home_expires_at.gt.${now}`),
      supabase.from("posts").select("id", { count: "exact", head: true }).eq("status", "arquivada"),
    ]);
    setStats({
      activeHome: activeRes.count ?? 0,
      expired: expiredRes.count ?? 0,
      evergreen: evergreenRes.count ?? 0,
      urgent: urgentRes.count ?? 0,
    });
    setArchivedCount(archivedRes.count ?? 0);
  }

  async function load() {
    let q = supabase
      .from("posts")
      .select("id,title,slug,status,is_urgent,is_featured,is_evergreen,home_expires_at,views,published_at,created_at,source_id,source_url,similarity_score,similar_to,duplicate_of,duplicate_match_reason,cover_image_url,manual_image_url,cover_image_original,archived_at,archived_reason,categories(name,default_cover_image_url)")
      .order("published_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false });
    if (filter !== "all") {
      const map: Record<EditorialStatus, string[]> = {
        captada: ["captada", "rascunho"],
        pronta_para_revisao: ["pronta_para_revisao"],
        em_revisao: ["em_revisao", "revisao"],
        aprovada: ["aprovada"],
        rejeitada: ["rejeitada"],
        publicada: ["publicada", "publicado"],
        duplicada: ["duplicada"],
        arquivada: ["arquivada"],
      };
      q = q.in("status", map[filter] as any);
    }

    // Filtro arquivadas (não aplica se o usuário pediu explicitamente Arquivada)
    if (filter !== "arquivada") {
      if (archivedFilter === "hide") q = q.neq("status", "arquivada");
      else if (archivedFilter === "only") q = q.eq("status", "arquivada");
    }

    const now = new Date();
    if (homeFilter === "active") {
      q = q.or(`is_evergreen.eq.true,home_expires_at.is.null,home_expires_at.gt.${now.toISOString()}`);
    } else if (homeFilter === "expired") {
      q = q.eq("is_evergreen", false).lte("home_expires_at", now.toISOString());
    } else if (homeFilter === "expiring_today") {
      const endOfDay = new Date();
      endOfDay.setHours(23, 59, 59, 999);
      q = q.eq("is_evergreen", false)
        .gte("home_expires_at", now.toISOString())
        .lte("home_expires_at", endOfDay.toISOString());
    }

    if (sourceFilter === "__manual") {
      q = q.is("source_id", null).is("source_url", null);
    } else if (sourceFilter === "__instagram") {
      q = q.is("source_id", null).ilike("source_url", "%instagram.com%");
    } else if (sourceFilter !== "all") {
      q = q.eq("source_id", sourceFilter);
    }

    const { data } = await q;
    const list = data ?? [];

    // Buscar títulos/datas dos posts referenciados (similar_to ou duplicate_of)
    const refIds = Array.from(
      new Set(
        list
          .map((p: any) => p.similar_to || p.duplicate_of)
          .filter(Boolean) as string[],
      ),
    );
    let refMap: Record<string, { title: string; published_at: string | null; slug: string }> = {};
    if (refIds.length) {
      const { data: refs } = await supabase
        .from("posts")
        .select("id,title,published_at,slug")
        .in("id", refIds);
      (refs ?? []).forEach((r: any) => {
        refMap[r.id] = { title: r.title, published_at: r.published_at, slug: r.slug };
      });
    }
    const { data: srcAll } = await supabase.from("news_sources").select("id,name");
    const srcMap = new Map<string, string>();
    (srcAll ?? []).forEach((s: any) => srcMap.set(s.id, s.name));
    setPosts(
      list.map((p: any) => {
        const method = p.source_id ? "automatic" : p.source_url && /instagram\.com/i.test(p.source_url) ? "instagram" : "manual";
        const _sourceName = (p.source_id && srcMap.get(p.source_id)) || (method === "instagram" ? "Instagram" : "Manual");
        return { ...p, _ref: refMap[p.similar_to || p.duplicate_of], _sourceName };
      }),
    );
  }

  async function loadSources() {
    const { data } = await supabase.from("news_sources").select("id,name,source_type").order("name");
    setSources(data ?? []);
  }

  useEffect(() => {
    document.title = "Notícias — Painel";
    loadSources();
  }, []);

  useEffect(() => {
    load();
    loadStats();
  }, [filter, homeFilter, sourceFilter, archivedFilter]);

  async function archiveNow(p: any) {
    if (!confirm(`Arquivar "${p.title}"?`)) return;
    const { error } = await supabase.rpc("archive_post", { _post_id: p.id, _reason: "manual" });
    if (error) toast.error(error.message);
    else { toast.success("Notícia arquivada"); setSelected(new Set()); load(); loadStats(); }
  }
  async function restoreOne(p: any) {
    const { error } = await supabase.rpc("restore_post", { _post_id: p.id });
    if (error) toast.error(error.message);
    else { toast.success("Notícia restaurada"); load(); loadStats(); }
  }
  async function archiveSelected() {
    const ids = Array.from(selected);
    if (!ids.length) return;
    if (!confirm(`Arquivar ${ids.length} notícia(s) selecionada(s)?`)) return;
    let ok = 0;
    for (const id of ids) {
      const { error } = await supabase.rpc("archive_post", { _post_id: id, _reason: "manual" });
      if (!error) ok++;
    }
    toast.success(`${ok}/${ids.length} arquivada(s)`);
    setSelected(new Set());
    load(); loadStats();
  }
  async function runAutoArchive() {
    const { data, error } = await supabase.rpc("auto_archive_posts");
    if (error) return toast.error(error.message);
    const n = Array.isArray(data) ? (data[0] as any)?.archived_count ?? 0 : (data as any)?.archived_count ?? 0;
    toast.success(`${n} notícia(s) arquivada(s) automaticamente`);
    load(); loadStats();
  }
  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function remove(id: string) {
    if (!confirm("Excluir esta notícia?")) return;
    const { error } = await supabase.from("posts").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Excluída"); load(); loadStats(); }
  }

  async function updateStatus(p: any, newStatus: EditorialStatus) {
    let confirmMsg = "";
    if (newStatus === "aprovada") confirmMsg = `Aprovar "${p.title}"?`;
    if (newStatus === "publicada") confirmMsg = `Publicar "${p.title}"?`;
    if (newStatus === "em_revisao") confirmMsg = `Despublicar "${p.title}"?`;
    if (confirmMsg && !confirm(confirmMsg)) return;

    const payload: any = { status: newStatus };
    if (newStatus === "publicada") payload.published_at = p.published_at ?? new Date().toISOString();

    const { error } = await supabase.from("posts").update(payload).eq("id", p.id);
    if (error) { toast.error(error.message); return; }
    toast.success(
      newStatus === "publicada" ? "Notícia publicada" :
      newStatus === "aprovada" ? "Notícia aprovada" : "Notícia movida para revisão"
    );
    load(); loadStats();
  }

  async function toggleFeatured(p: any) {
    const { error } = await supabase.from("posts").update({ is_featured: !p.is_featured }).eq("id", p.id);
    if (error) toast.error(error.message);
    else { toast.success(p.is_featured ? "Destaque removido" : "Definido como destaque"); load(); }
  }

  async function renewExpiration(p: any, hours: number) {
    const newExp = new Date();
    newExp.setHours(newExp.getHours() + hours);
    const { error } = await supabase.from("posts")
      .update({ home_expires_at: newExp.toISOString() })
      .eq("id", p.id);
    if (error) toast.error(error.message);
    else {
      toast.success(`Destaque renovado por mais ${hours >= 24 ? `${hours / 24}d` : `${hours}h`}`);
      load(); loadStats();
    }
  }

  async function reclassify() {
    if (!confirm("Isso irá analisar as últimas notícias e reclassificar suas categorias com base na nova IA. Continuar?")) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("reclassify-categories");
      if (error) throw error;
      toast.success(`${data.atualizados} notícias foram reclassificadas.`);
      load();
    } catch (err: any) {
      toast.error("Erro ao reclassificar: " + err.message);
    } finally { setLoading(false); }
  }

  async function recordDecision(p: any, decision: "manter" | "mesclar" | "marcar_duplicada") {
    const refId = p.similar_to || p.duplicate_of || null;
    const { error: decErr } = await supabase.from("duplicate_decisions").insert({
      post_id: p.id,
      reference_post_id: refId,
      decision,
      similarity_score: p.similarity_score ?? null,
      decided_by: user?.id ?? null,
    });
    if (decErr) {
      toast.error(decErr.message);
      return false;
    }
    return true;
  }

  async function decideKeep(p: any) {
    if (!(await recordDecision(p, "manter"))) return;
    const { error } = await supabase
      .from("posts")
      .update({ similar_to: null, duplicate_of: null, status: p.status === "duplicada" ? "em_revisao" : p.status })
      .eq("id", p.id);
    if (error) return toast.error(error.message);
    toast.success("Notícia mantida como original");
    load(); loadStats();
  }

  async function decideMerge(p: any) {
    if (!p._ref) return;
    if (!(await recordDecision(p, "mesclar"))) return;
    const { error } = await supabase
      .from("posts")
      .update({ status: "duplicada", duplicate_of: p.similar_to || p.duplicate_of, similar_to: null })
      .eq("id", p.id);
    if (error) return toast.error(error.message);
    toast.success("Marcada como duplicada. Abrindo a notícia original para mesclagem…");
    window.open(`/admin/posts/${p.similar_to || p.duplicate_of}`, "_blank");
    load(); loadStats();
  }

  async function decideMarkDuplicate(p: any) {
    if (!(await recordDecision(p, "marcar_duplicada"))) return;
    const { error } = await supabase
      .from("posts")
      .update({ status: "duplicada", duplicate_of: p.similar_to || p.duplicate_of, similar_to: null })
      .eq("id", p.id);
    if (error) return toast.error(error.message);
    toast.success("Marcada como duplicada");
    load(); loadStats();
  }



  const statCards = [
    { label: "Ativas na Home", value: stats.activeHome, icon: Home, color: "text-emerald-700 bg-emerald-50 border-emerald-200" },
    { label: "Expiradas", value: stats.expired, icon: AlertCircle, color: "text-muted-foreground bg-secondary border-border" },
    { label: "Destaques permanentes", value: stats.evergreen, icon: Pin, color: "text-sky-700 bg-sky-50 border-sky-200" },
    { label: "Plantões ativos", value: stats.urgent, icon: Flame, color: "text-red-700 bg-red-50 border-red-200" },
  ];

  const filteredPosts = posts.filter((p) => {
    if (duplicateFilter !== "all") {
      const tier = classifyDuplicate(p.similarity_score).tier;
      const effectiveTier = p.status === "duplicada" ? "duplicada" : tier;
      if (effectiveTier !== duplicateFilter) return false;
    }
    if (relevanceFilter !== "all") {
      if ((p as any).relevance_level !== relevanceFilter) return false;
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      const hay = `${p.title ?? ""} ${p._sourceName ?? ""} ${p.categories?.name ?? ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });



  return (
    <AdminLayout>
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-display text-3xl font-black">Notícias</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={reclassify} disabled={loading} className="text-xs uppercase font-bold tracking-wider">
            {loading ? "Reclassificando..." : "Reclassificar por IA"}
          </Button>
          <Button asChild className="bg-urgent hover:bg-urgent/90">
            <Link to="/admin/posts/novo"><PlusCircle className="h-4 w-4 mr-2" /> Nova</Link>
          </Button>
        </div>
      </div>

      {/* Painel de estatísticas */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {statCards.map((s) => {
          const Icon = s.icon;
          return (
            <div key={s.label} className={`border rounded-sm p-3 flex items-center gap-3 ${s.color}`}>
              <Icon className="h-5 w-5 shrink-0" />
              <div className="min-w-0">
                <div className="text-2xl font-black leading-none">{s.value}</div>
                <div className="text-[10px] uppercase font-bold tracking-wider mt-1 truncate">{s.label}</div>
              </div>
            </div>
          );
        })}
      </div>

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

      <div className="flex flex-wrap gap-2 mb-4 items-center">
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
            }`}>
            {opt.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 mb-4 items-center">
        <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mr-1">Fonte:</span>
        <button
          onClick={() => setSourceFilter("all")}
          className={`px-3 py-1.5 text-[11px] uppercase font-bold tracking-wider rounded-sm border ${
            sourceFilter === "all" ? "bg-foreground text-background border-foreground" : "bg-white border-border hover:bg-secondary"
          }`}
        >
          Todas
        </button>
        {sources.map((src) => (
          <button
            key={src.id}
            onClick={() => setSourceFilter(src.id)}
            className={`px-2 py-1 rounded-sm border ${
              sourceFilter === src.id ? "ring-2 ring-foreground" : "opacity-80 hover:opacity-100"
            }`}
            title={src.name}
          >
            <SourceBadge name={src.name} />
          </button>
        ))}
        <button
          onClick={() => setSourceFilter("__instagram")}
          className={`px-2 py-1 rounded-sm border ${sourceFilter === "__instagram" ? "ring-2 ring-foreground" : "opacity-80 hover:opacity-100"}`}
        >
          <SourceBadge name="Instagram" />
        </button>
        <button
          onClick={() => setSourceFilter("__manual")}
          className={`px-2 py-1 rounded-sm border ${sourceFilter === "__manual" ? "ring-2 ring-foreground" : "opacity-80 hover:opacity-100"}`}
        >
          <SourceBadge name="Manual" />
        </button>
      </div>

      <div className="flex flex-wrap gap-2 mb-4 items-center">
        <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mr-1">Duplicidade:</span>
        {DUPLICATE_FILTERS.map((opt) => (
          <button
            key={opt.key}
            onClick={() => setDuplicateFilter(opt.key)}
            className={`px-3 py-1.5 text-[11px] uppercase font-bold tracking-wider rounded-sm border ${
              duplicateFilter === opt.key
                ? "bg-foreground text-background border-foreground"
                : "bg-white border-border hover:bg-secondary"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 mb-4 items-center">
        <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mr-1">Relevância:</span>
        {([
          { key: "all", label: "Todas" },
          { key: "urgente", label: "🔴 Urgente" },
          { key: "alta", label: "🟠 Alta" },
          { key: "media", label: "🟡 Média" },
          { key: "baixa", label: "🟢 Baixa" },
        ] as const).map((opt) => (
          <button
            key={opt.key}
            onClick={() => setRelevanceFilter(opt.key as any)}
            className={`px-3 py-1.5 text-[11px] uppercase font-bold tracking-wider rounded-sm border ${
              relevanceFilter === opt.key
                ? "bg-foreground text-background border-foreground"
                : "bg-white border-border hover:bg-secondary"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 mb-4 items-center">
        <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mr-1">Arquivamento:</span>
        {([
          { key: "hide", label: "Não arquivadas" },
          { key: "only", label: `Arquivadas (${archivedCount})` },
          { key: "all", label: "Todas" },
        ] as { key: "hide" | "only" | "all"; label: string }[]).map((opt) => (
          <button key={opt.key} onClick={() => setArchivedFilter(opt.key)}
            className={`px-3 py-1.5 text-[11px] uppercase font-bold tracking-wider rounded-sm border ${
              archivedFilter === opt.key ? "bg-zinc-800 text-white border-zinc-900" : "bg-white border-border hover:bg-secondary"
            }`}>
            {opt.label}
          </button>
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

      <div className="flex flex-wrap gap-2 mb-4 items-center">
        <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mr-1">Visualização:</span>
        <button
          onClick={() => setViewMode("list")}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] uppercase font-bold tracking-wider rounded-sm border ${
            viewMode === "list" ? "bg-foreground text-background border-foreground" : "bg-white border-border hover:bg-secondary"
          }`}
        >
          <List className="h-3 w-3" /> Lista
        </button>
        <button
          onClick={() => setViewMode("grouped")}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] uppercase font-bold tracking-wider rounded-sm border ${
            viewMode === "grouped" ? "bg-foreground text-background border-foreground" : "bg-white border-border hover:bg-secondary"
          }`}
        >
          <FolderTree className="h-3 w-3" /> Agrupado por Fonte
        </button>
        <button
          onClick={() => setViewMode("kanban")}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] uppercase font-bold tracking-wider rounded-sm border ${
            viewMode === "kanban" ? "bg-foreground text-background border-foreground" : "bg-white border-border hover:bg-secondary"
          }`}
        >
          <KanbanSquare className="h-3 w-3" /> Kanban
        </button>
        <div className="relative ml-auto w-full sm:w-64">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Pesquisar título, fonte, categoria…"
            className="h-9 pl-7 text-xs"
          />
        </div>
      </div>

      {viewMode === "kanban" ? (
        <KanbanBoard
          posts={filteredPosts}
          onChangeStatus={(p, st) => updateStatus(p, st)}
        />
      ) : viewMode === "grouped" ? (
        <SourceGroupedView posts={filteredPosts} sort={groupSort} onSortChange={setGroupSort} />
      ) : (
      <div className="bg-card border border-border overflow-x-auto">

        <table className="w-full text-sm">
          <thead className="bg-secondary text-xs uppercase tracking-wider">
            <tr>
              <th className="text-left p-3 w-[90px]">Imagem</th>
              <th className="text-left p-3">Título</th>
              <th className="text-left p-3">Fonte / Origem</th>
              <th className="text-left p-3">Categoria</th>
              <th className="text-left p-3">Duplicidade</th>
              <th className="text-left p-3">Capturada em</th>
              <th className="text-left p-3">Status / Validade</th>
              <th className="text-left p-3">Views</th>
              <th className="text-right p-3">Ações</th>
            </tr>
          </thead>
          <tbody>
            {filteredPosts.map((p) => {
              const s = normalizeStatus(p.status);
              const exp = formatExpiration(p.home_expires_at, !!p.is_evergreen);
              const showRenew = s === "publicada" && !p.is_evergreen && (p.is_featured || p.is_urgent || (exp && (exp.expired || exp.tone === "critical" || exp.tone === "warn")));
              const method = detectCaptureMethod({ source_id: p.source_id, source_url: p.source_url });
              const sourceName = (p.source_id && sources.find((src) => src.id === p.source_id)?.name) || (method === "instagram" ? "Instagram" : "Manual");
              const previewImg = getPostImage(p as any);
              const hasOwnImage = !!(p as any).manual_image_url || !!(p as any).cover_image_url;
              return (
                <tr key={p.id} className="border-t border-border hover:bg-secondary/20 transition-colors align-top">
                  <td className="p-3">
                    <div className="relative w-[72px] h-[48px] bg-secondary border border-border overflow-hidden rounded-sm">
                      <img
                        src={previewImg}
                        alt={`Miniatura: ${p.title}`}
                        className="w-full h-full object-cover"
                        loading="lazy"
                        onError={(e) => handleImgError(e, p as any)}
                      />
                      {!hasOwnImage && (
                        <span
                          className="absolute bottom-0 left-0 right-0 text-[8px] font-bold uppercase text-white bg-amber-600/90 text-center leading-tight py-0.5"
                          title="Esta notícia não tem imagem própria. Está usando o default da categoria ou o placeholder do Fique Por Dentro Sergipe."
                        >
                          Sem imagem
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="p-4">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <SourceBadge name={sourceName} />
                      <div className="font-display font-bold text-base text-foreground leading-tight">{p.title}</div>
                    </div>
                    <div className="flex flex-wrap gap-2 items-center">
                      {p.is_urgent && (
                        <span className="urgent-badge scale-90 origin-left">
                          <span className="h-1 w-1 bg-white rounded-full pulse-dot shrink-0" />URGENTE
                        </span>
                      )}
                      {p.is_featured && (
                        <button onClick={() => toggleFeatured(p)} className="alert-badge scale-90 origin-left hover:bg-amber-200 transition-colors" title="Clique para remover destaque">
                          DESTAQUE
                        </button>
                      )}
                      {(p as any).relevance_level && (
                        <RelevanceBadge level={(p as any).relevance_level} score={(p as any).relevance_score} />
                      )}
                      <span className="text-[10px] uppercase font-bold text-muted-foreground">
                        {p.published_at ? `Publicada ${new Date(p.published_at).toLocaleDateString("pt-BR")}` : "Não publicada"}
                      </span>
                    </div>
                  </td>
                  <td className="p-4">
                    <div className="flex flex-col gap-1.5">
                      <CaptureMethodChip method={method} />
                      <OriginalLink url={p.source_url} />
                    </div>
                  </td>
                  <td className="p-4">
                    <span className="text-xs font-bold text-primary uppercase tracking-wider bg-primary/5 px-2 py-1 rounded-sm border border-primary/10">
                      {p.categories?.name ?? "Geral"}
                    </span>
                  </td>
                  <td className="p-4">
                    {(() => {
                      const dup = classifyDuplicate(p.similarity_score);
                      const tier = p.status === "duplicada" ? "duplicada" : dup.tier;
                      const tierMeta =
                        tier === "duplicada"
                          ? { color: "bg-red-100 text-red-800 border-red-300", dot: "bg-red-500", label: "Possível Duplicada" }
                          : tier === "similar"
                          ? { color: "bg-yellow-100 text-yellow-800 border-yellow-300", dot: "bg-yellow-500", label: "Similar" }
                          : { color: "bg-emerald-100 text-emerald-800 border-emerald-300", dot: "bg-emerald-500", label: "Nova" };
                      const ref = p._ref;
                      return (
                        <div className="flex flex-col gap-1.5 max-w-[220px]">
                          <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-[10px] font-black uppercase tracking-widest border rounded-sm w-fit ${tierMeta.color}`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${tierMeta.dot}`} />
                            {tierMeta.label} {dup.pct > 0 ? `· ${dup.pct}%` : ""}
                          </span>
                          {ref && (
                            <div className="text-[10px] text-muted-foreground leading-tight">
                              <div className="font-bold uppercase tracking-wider text-[9px]">Possível duplicada de:</div>
                              <Link to={`/admin/posts/${p.similar_to || p.duplicate_of}`} className="line-clamp-2 hover:underline">
                                {ref.title}
                              </Link>
                              {ref.published_at && (
                                <div className="font-mono text-[9px] mt-0.5">
                                  Publicada em {new Date(ref.published_at).toLocaleDateString("pt-BR")}
                                </div>
                              )}
                            </div>
                          )}
                          {ref && tier !== "nova" && (
                            <div className="flex flex-wrap gap-1">
                              <button onClick={() => decideKeep(p)} className="inline-flex items-center gap-1 text-[9px] font-black uppercase px-1.5 py-1 rounded-sm border border-emerald-300 text-emerald-700 hover:bg-emerald-50" title="Manter como original">
                                <Check className="h-2.5 w-2.5" />Manter
                              </button>
                              <button onClick={() => decideMerge(p)} className="inline-flex items-center gap-1 text-[9px] font-black uppercase px-1.5 py-1 rounded-sm border border-sky-300 text-sky-700 hover:bg-sky-50" title="Abrir a notícia original e marcar esta como duplicada">
                                <GitMerge className="h-2.5 w-2.5" />Mesclar
                              </button>
                              {p.status !== "duplicada" && (
                                <button onClick={() => decideMarkDuplicate(p)} className="inline-flex items-center gap-1 text-[9px] font-black uppercase px-1.5 py-1 rounded-sm border border-red-300 text-red-700 hover:bg-red-50" title="Marcar como duplicada">
                                  <AlertOctagon className="h-2.5 w-2.5" />Duplicada
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </td>
                  <td className="p-4 text-xs text-muted-foreground">
                    <div>{new Date(p.created_at).toLocaleDateString("pt-BR")}</div>
                    <div className="font-mono">{new Date(p.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</div>
                  </td>
                  <td className="p-4">
                    <div className="flex flex-col gap-1.5">
                      <span className={`px-2 py-1 text-[10px] font-black uppercase tracking-widest border rounded-sm w-fit ${STATUS_COLOR[s]}`}>
                        {STATUS_LABEL[s]}
                      </span>
                      {exp && (
                        <span
                          title={p.home_expires_at ? new Date(p.home_expires_at).toLocaleString("pt-BR") : undefined}
                          className={`inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-sm border w-fit ${TONE_CLASS[exp.tone]}`}
                        >
                          <Clock className="h-2.5 w-2.5" />{exp.label}
                        </span>
                      )}
                      {showRenew && (
                        <div className="flex gap-1 mt-1">
                          <button onClick={() => renewExpiration(p, 24)}
                            className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-widest px-1.5 py-1 rounded-sm border bg-white border-emerald-300 text-emerald-700 hover:bg-emerald-50">
                            <RotateCw className="h-2.5 w-2.5" />+24h
                          </button>
                          <button onClick={() => renewExpiration(p, 24 * 7)}
                            className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-widest px-1.5 py-1 rounded-sm border bg-white border-emerald-300 text-emerald-700 hover:bg-emerald-50">
                            <RotateCw className="h-2.5 w-2.5" />+7d
                          </button>
                        </div>
                      )}
                      {p.archived_at && (
                        <span
                          title={ARCHIVE_REASON_LABEL[p.archived_reason] ?? p.archived_reason ?? ""}
                          className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-sm border bg-zinc-100 text-zinc-700 border-zinc-300 w-fit"
                        >
                          <Archive className="h-2.5 w-2.5" />
                          Arquivada {new Date(p.archived_at).toLocaleDateString("pt-BR")}
                          {p.archived_reason && (
                            <span className="ml-1 normal-case font-bold text-[8px] text-zinc-500">
                              · {ARCHIVE_REASON_LABEL[p.archived_reason] ?? p.archived_reason}
                            </span>
                          )}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="p-4 font-mono text-xs font-bold text-muted-foreground">{p.views?.toLocaleString("pt-BR") || 0}</td>
                  <td className="p-4 text-right">
                    <div className="inline-flex gap-1 items-center">
                      {(s === "em_revisao" || s === "captada") && (
                        <Button variant="outline" size="sm" onClick={() => updateStatus(p, "aprovada")} className="h-8 px-3 text-amber-700 border-amber-200 hover:bg-amber-50 hover:text-amber-800" title="Aprovar">
                          <CheckCircle2 className="h-3.5 w-3.5 mr-1" />Aprovar
                        </Button>
                      )}
                      {s === "aprovada" && (
                        <Button variant="outline" size="sm" onClick={() => updateStatus(p, "publicada")} className="h-8 px-3 text-sky-700 border-sky-200 hover:bg-sky-50 hover:text-sky-800" title="Publicar">
                          <Globe className="h-3.5 w-3.5 mr-1" />Publicar
                        </Button>
                      )}
                      {s === "publicada" && (
                        <Button variant="ghost" size="sm" onClick={() => updateStatus(p, "em_revisao")} className="h-8 px-3 text-muted-foreground hover:bg-secondary" title="Despublicar">
                          <ArchiveRestore className="h-3.5 w-3.5 mr-1" />Despublicar
                        </Button>
                      )}
                      <div className="w-px h-4 bg-border mx-1" />
                      {s === "publicada" && (
                        <Button variant="ghost" size="icon" asChild className="h-8 w-8 hover:bg-secondary" title="Ver no site">
                          <a target="_blank" rel="noreferrer" href={`/noticia/${p.slug}`}><Eye className="h-4 w-4" /></a>
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" asChild className="h-8 w-8 hover:bg-secondary" title="Editar">
                        <Link to={`/admin/posts/${p.id}`}><Edit className="h-4 w-4" /></Link>
                      </Button>
                      {s === "arquivada" ? (
                        <Button variant="ghost" size="icon" onClick={() => restoreOne(p)} className="h-8 w-8 text-emerald-700 hover:bg-emerald-50" title="Restaurar">
                          <ArchiveRestore className="h-4 w-4" />
                        </Button>
                      ) : (
                        <Button variant="ghost" size="icon" onClick={() => archiveNow(p)} className="h-8 w-8 text-zinc-700 hover:bg-zinc-100" title="Arquivar agora">
                          <Archive className="h-4 w-4" />
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" onClick={() => remove(p.id)} className="h-8 w-8 text-urgent hover:bg-urgent/10" title="Excluir">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                      <label className="ml-1 inline-flex items-center cursor-pointer" title="Selecionar para ação em lote">
                        <input
                          type="checkbox"
                          checked={selected.has(p.id)}
                          onChange={() => toggleSelected(p.id)}
                          className="h-4 w-4 accent-zinc-700"
                        />
                      </label>
                    </div>
                  </td>
                </tr>
              );
            })}
            {filteredPosts.length === 0 && (
              <tr><td colSpan={9} className="p-8 text-center text-muted-foreground">Nenhuma notícia.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      )}

    </AdminLayout>
  );
}
