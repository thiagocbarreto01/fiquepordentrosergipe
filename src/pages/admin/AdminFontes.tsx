import { useEffect, useMemo, useState } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import {
  Loader2,
  PlusCircle,
  Rss,
  Zap,
  CheckCircle2,
  XCircle,
  Search,
  X,
  AlertTriangle,
  ExternalLink,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { DeleteSourceDialog } from "@/components/admin/sources/DeleteSourceDialog";
import { SourceAutomationSwitch } from "@/components/admin/sources/SourceAutomationSwitch";
import { getSourcePermissions } from "@/components/admin/sources/permissions";
import { SourceMetricsCards } from "@/components/admin/sources/SourceMetricsCards";
import { SourceActionsMenu } from "@/components/admin/sources/SourceActionsMenu";
import { SourceConfigDialog, type SourceConfigView } from "@/components/admin/sources/SourceConfigDialog";
import { SourceRunResultBadge } from "@/components/admin/sources/SourceRunResultBadge";
import { formatMaceio, formatMaceioLong, timeAgoPt } from "@/lib/timezone";
import { classifyRunStatus, parseRunMessage } from "@/lib/sourceRunParser";

type RunLog = {
  source_id: string;
  source_name: string;
  ok: boolean;
  captured: number;
  duplicates: number;
  skipped: number;
  errors: string[];
  message?: string;
};

type Source = {
  id: string;
  name: string;
  source_type: "rss" | "site" | "manual";
  url: string | null;
  default_category_id: string | null;
  is_active: boolean;
  frequency_minutes: number;
  max_items_per_run: number;
  last_run_at: string | null;
  last_run_status: string | null;
  last_run_message: string | null;
  total_captured: number;
};

type Category = { id: string; name: string };

const EMPTY: Partial<Source> = {
  name: "",
  source_type: "rss",
  url: "",
  default_category_id: null,
  is_active: true,
  frequency_minutes: 60,
  max_items_per_run: 10,
};

const UNCATEGORIZED = "__uncat__";

type ResultFilter = "all" | "ok" | "error" | "never";
type StatusFilter = "all" | "active" | "inactive";
type TypeFilter = "all" | "rss" | "site" | "manual";

function safeHostname(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

export default function AdminFontes() {
  const { isAdmin, isStaff, role } = useAuth();
  const perms = useMemo(
    () => getSourcePermissions({ isAdmin, isStaff, role }),
    [isAdmin, isStaff, role],
  );

  const [sources, setSources] = useState<Source[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [linkedCounts, setLinkedCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Partial<Source>>(EMPTY);
  const [running, setRunning] = useState<string | null>(null);
  const [runAllLoading, setRunAllLoading] = useState(false);
  const [lastRunLogs, setLastRunLogs] = useState<RunLog[] | null>(null);
  const [lastRunAt, setLastRunAt] = useState<Date | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<
    { id: string; name: string; linkedPosts: number } | null
  >(null);
  const [configTarget, setConfigTarget] = useState<SourceConfigView | null>(null);

  // filtros
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [resultFilter, setResultFilter] = useState<ResultFilter>("all");

  async function load() {
    setLoading(true);
    setLoadError(null);
    try {
      const [{ data: s, error: sErr }, { data: c, error: cErr }] = await Promise.all([
        supabase.from("news_sources").select("*").order("name", { ascending: true }),
        supabase.from("categories").select("id,name").order("position"),
      ]);
      if (sErr) throw sErr;
      if (cErr) throw cErr;
      const list = (s ?? []) as Source[];
      setSources(list);
      setCategories((c ?? []) as Category[]);

      // Contagem de posts vinculados (leitura leve, agrupada)
      const counts: Record<string, number> = {};
      await Promise.all(
        list.map(async (src) => {
          const { count } = await supabase
            .from("posts")
            .select("id", { count: "exact", head: true })
            .eq("source_id", src.id);
          counts[src.id] = count ?? 0;
        }),
      );
      setLinkedCounts(counts);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Falha ao carregar fontes.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    document.title = "Fontes de captação — Painel";
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const categoryMap = useMemo(() => {
    const m = new Map<string, string>();
    categories.forEach((c) => m.set(c.id, c.name));
    return m;
  }, [categories]);

  // Duplicidades por hostname (aviso visual)
  const duplicateHosts = useMemo(() => {
    const map = new Map<string, number>();
    sources.forEach((s) => {
      const h = safeHostname(s.url);
      if (!h) return;
      map.set(h, (map.get(h) ?? 0) + 1);
    });
    const dups = new Set<string>();
    map.forEach((count, host) => {
      if (count > 1) dups.add(host);
    });
    return dups;
  }, [sources]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sources.filter((s) => {
      if (categoryFilter === UNCATEGORIZED && s.default_category_id) return false;
      if (
        categoryFilter !== "all" &&
        categoryFilter !== UNCATEGORIZED &&
        s.default_category_id !== categoryFilter
      )
        return false;
      if (statusFilter === "active" && !s.is_active) return false;
      if (statusFilter === "inactive" && s.is_active) return false;
      if (typeFilter !== "all" && s.source_type !== typeFilter) return false;
      const kind = classifyRunStatus(s.last_run_at, s.last_run_status);
      if (resultFilter !== "all" && kind !== resultFilter) return false;
      if (!q) return true;
      return (
        s.name.toLowerCase().includes(q) ||
        (s.url ?? "").toLowerCase().includes(q)
      );
    });
  }, [sources, search, categoryFilter, statusFilter, typeFilter, resultFilter]);

  const countByCategory = useMemo(() => {
    const m = new Map<string, number>();
    sources.forEach((s) => {
      const key = s.default_category_id ?? UNCATEGORIZED;
      m.set(key, (m.get(key) ?? 0) + 1);
    });
    return m;
  }, [sources]);

  const activeFiltersCount =
    (search ? 1 : 0) +
    (statusFilter !== "all" ? 1 : 0) +
    (typeFilter !== "all" ? 1 : 0) +
    (categoryFilter !== "all" ? 1 : 0) +
    (resultFilter !== "all" ? 1 : 0);

  function clearAllFilters() {
    setSearch("");
    setStatusFilter("all");
    setTypeFilter("all");
    setCategoryFilter("all");
    setResultFilter("all");
  }

  function openNew() {
    setEditing(EMPTY);
    setOpen(true);
  }

  function openEdit(s: Source) {
    setEditing(s);
    setOpen(true);
  }

  function openConfig(s: Source) {
    setConfigTarget({
      id: s.id,
      name: s.name,
      source_type: s.source_type,
      url: s.url,
      category_name: s.default_category_id ? categoryMap.get(s.default_category_id) ?? null : null,
      frequency_minutes: s.frequency_minutes,
      is_active: s.is_active,
      max_items_per_run: s.max_items_per_run,
      last_run_at: s.last_run_at,
      last_run_status: s.last_run_status,
      last_run_message: s.last_run_message,
      total_captured: s.total_captured,
      linked_posts: linkedCounts[s.id] ?? null,
    });
  }

  async function save() {
    if (!editing.name || editing.name.trim().length < 2) {
      toast.error("Nome obrigatório");
      return;
    }
    if (editing.source_type === "rss" && !editing.url) {
      toast.error("URL obrigatória para fontes RSS");
      return;
    }

    const payload = {
      name: editing.name.trim(),
      source_type: editing.source_type ?? "rss",
      url: editing.url?.trim() || null,
      default_category_id: editing.default_category_id || null,
      is_active: editing.is_active ?? true,
      frequency_minutes: Math.max(5, Number(editing.frequency_minutes) || 60),
      max_items_per_run: Math.min(50, Math.max(1, Number(editing.max_items_per_run) || 10)),
    };

    const op = editing.id
      ? supabase.from("news_sources").update(payload).eq("id", editing.id)
      : supabase.from("news_sources").insert(payload);

    const { error } = await op;
    if (error) toast.error(error.message);
    else {
      toast.success(editing.id ? "Fonte atualizada" : "Fonte criada");
      setOpen(false);
      load();
    }
  }

  async function requestDelete(s: Source) {
    if (!perms.canDelete) {
      toast.error("Apenas administradores podem excluir fontes.");
      return;
    }
    const { count, error } = await supabase
      .from("posts")
      .select("id", { count: "exact", head: true })
      .eq("source_id", s.id);
    if (error) {
      toast.error(`Não foi possível contar notícias vinculadas: ${error.message}`);
      return;
    }
    setDeleteTarget({ id: s.id, name: s.name, linkedPosts: count ?? 0 });
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    const { error } = await supabase.from("news_sources").delete().eq("id", deleteTarget.id);
    if (error) {
      toast.error(`Falha ao excluir: ${error.message}`);
      throw error;
    }
    toast.success(`Fonte "${deleteTarget.name}" excluída`);
    setSources((prev) => prev.filter((p) => p.id !== deleteTarget.id));
  }

  async function persistToggle(id: string, nextChecked: boolean): Promise<{ error?: string | null }> {
    const { data, error } = await supabase
      .from("news_sources")
      .update({ is_active: nextChecked })
      .eq("id", id)
      .select("id, is_active")
      .maybeSingle();
    if (error) return { error: error.message };
    if (!data) return { error: "Sem permissão para alterar esta fonte (nenhuma linha atualizada)." };
    if (data.is_active !== nextChecked) return { error: "Alteração não persistida no banco." };
    return { error: null };
  }


  function updateSourceLocal(id: string, next: boolean) {
    setSources((prev) => prev.map((p) => (p.id === id ? { ...p, is_active: next } : p)));
  }

  async function captureNow(s: Source) {
    setRunning(s.id);
    try {
      const { data: summary, error: invokeError } = await supabase.functions.invoke(
        `capture-sources?source_id=${s.id}`,
        { method: "POST" }
      );
      if (invokeError) throw new Error(invokeError.message || "Falha ao chamar função");
      const run = summary?.runs?.[0]?.result;
      if (run) {
        toast.success(
          `${s.name}: ${run.captured ?? 0} captadas, ${run.duplicates ?? 0} duplicatas, ${run.skipped ?? 0} já existiam`,
        );
      } else {
        toast.success(`Captação concluída: ${s.name}`);
      }
      load();
      window.dispatchEvent(new CustomEvent("posts:refresh"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao captar");
    } finally {
      setRunning(null);
    }
  }

  async function runAllNow() {
    const active = sources.filter((s) => s.is_active);
    if (active.length === 0) {
      toast.error("Nenhuma fonte marcada para automação foi encontrada.");
      return;
    }
    setRunAllLoading(true);
    setLastRunLogs(null);
    toast.info(`Iniciando captação de ${active.length} fonte(s) marcada(s)…`);
    try {
      const { data: summary, error: invokeError } = await supabase.functions.invoke(
        "capture-sources?manual=1",
        { method: "POST" }
      );
      if (invokeError) throw new Error(invokeError.message || "Falha ao chamar função");

      const logs: RunLog[] = (summary?.runs ?? []).map((run: any) => ({
        source_id: run.source_id,
        source_name: run.source_name ?? sources.find((s) => s.id === run.source_id)?.name ?? "Fonte",
        ok: run.ok !== false && !(run.result?.errors?.length),
        captured: run.result?.captured ?? 0,
        duplicates: run.result?.duplicates ?? 0,
        skipped: run.result?.skipped ?? 0,
        errors: run.result?.errors ?? (run.error ? [run.error] : []),
        message: run.message,
      }));
      setLastRunLogs(logs);
      setLastRunAt(new Date());
      const totalCap = logs.reduce((a, l) => a + l.captured, 0);
      const totalDup = logs.reduce((a, l) => a + l.duplicates, 0);
      const failed = logs.filter((l) => !l.ok).length;
      if (failed > 0) {
        toast.warning(`Captação concluída: ${totalCap} nova(s), ${totalDup} dup., ${failed} com erro`);
      } else {
        toast.success(`Captação concluída: ${totalCap} nova(s), ${totalDup} duplicata(s)`);
      }
      load();
      window.dispatchEvent(new CustomEvent("posts:refresh"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao executar captação");
    } finally {
      setRunAllLoading(false);
    }
  }

  return (
    <AdminLayout>
      <TooltipProvider delayDuration={200}>
        {/* Cabeçalho */}
        <div className="mb-6">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="font-display text-3xl font-black flex items-center gap-2 text-navy">
                  <Rss className="h-6 w-6" /> Fontes de captação
                </h1>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-900 border border-amber-300 px-2 py-1 rounded">
                      <AlertTriangle className="h-3 w-3" /> Automação desligada
                    </span>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    Nenhum cron de captação está ativo. As fontes marcadas ficam prontas para uma
                    futura automação, mas hoje só executam via ação manual.
                  </TooltipContent>
                </Tooltip>
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                Gerencie portais e feeds usados na captação editorial.
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                As fontes continuam disponíveis para execução manual. Nenhuma captação automática
                está ativa.
              </p>
            </div>

            <div className="flex gap-2 flex-wrap">
              {perms.canCapture && (
                <Button
                  onClick={runAllNow}
                  disabled={runAllLoading}
                  className="bg-navy hover:bg-navy-deep text-primary-foreground font-bold min-h-11"
                >
                  {runAllLoading ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Zap className="h-4 w-4 mr-2" />
                  )}
                  {runAllLoading ? "Executando…" : "Executar captação manual"}
                </Button>
              )}
              <Dialog open={open} onOpenChange={setOpen}>
                <DialogTrigger asChild>
                  <Button
                    onClick={openNew}
                    variant="outline"
                    className="border-2 border-navy text-navy hover:bg-navy hover:text-primary-foreground font-bold min-h-11"
                  >
                    <PlusCircle className="h-4 w-4 mr-2" /> Nova fonte
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>{editing.id ? "Editar fonte" : "Nova fonte"}</DialogTitle>
                    <DialogDescription>
                      Cadastre um portal ou feed RSS para captação editorial.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <Label>Nome</Label>
                      <Input
                        value={editing.name ?? ""}
                        onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                        placeholder="Ex: G1 Sergipe"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label>Tipo</Label>
                        <Select
                          value={editing.source_type ?? "rss"}
                          onValueChange={(v) =>
                            setEditing({ ...editing, source_type: v as Source["source_type"] })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="rss">RSS / Atom</SelectItem>
                            <SelectItem value="site">Site (manual)</SelectItem>
                            <SelectItem value="manual">Manual</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Editoria</Label>
                        <Select
                          value={editing.default_category_id ?? "none"}
                          onValueChange={(v) =>
                            setEditing({
                              ...editing,
                              default_category_id: v === "none" ? null : v,
                            })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Sem categoria</SelectItem>
                            {categories.map((c) => (
                              <SelectItem key={c.id} value={c.id}>
                                {c.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div>
                      <Label>URL do feed</Label>
                      <Input
                        type="url"
                        value={editing.url ?? ""}
                        onChange={(e) => setEditing({ ...editing, url: e.target.value })}
                        placeholder="https://exemplo.com/feed.xml"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label>Frequência (min)</Label>
                        <Input
                          type="number"
                          min={5}
                          value={editing.frequency_minutes ?? 60}
                          onChange={(e) =>
                            setEditing({ ...editing, frequency_minutes: Number(e.target.value) })
                          }
                        />
                      </div>
                      <div>
                        <Label>Máx. por execução</Label>
                        <Input
                          type="number"
                          min={1}
                          max={50}
                          value={editing.max_items_per_run ?? 10}
                          onChange={(e) =>
                            setEditing({ ...editing, max_items_per_run: Number(e.target.value) })
                          }
                        />
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={editing.is_active ?? true}
                        onCheckedChange={(v) => setEditing({ ...editing, is_active: v })}
                      />
                      <Label>Marcada para automação</Label>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setOpen(false)}>
                      Cancelar
                    </Button>
                    <Button onClick={save}>Salvar</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </div>

        {/* Cards de métricas */}
        <SourceMetricsCards sources={sources} />

        {/* Barra de filtros */}
        <div className="bg-card border border-border mb-4 p-3 rounded-sm">
          <div className="flex flex-col md:flex-row md:flex-wrap gap-2 md:items-center">
            <div className="relative flex-1 min-w-0 md:min-w-[220px] w-full">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por nome ou URL…"
                className="pl-9 w-full min-h-11"
                aria-label="Buscar fonte por nome ou URL"
              />
            </div>

            <div className="grid grid-cols-2 md:flex md:items-center md:gap-2 gap-2">
              <Select
                value={statusFilter}
                onValueChange={(v) => setStatusFilter(v as StatusFilter)}
              >
                <SelectTrigger className="md:w-[170px] min-h-11" aria-label="Filtrar por status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  <SelectItem value="active">Marcadas</SelectItem>
                  <SelectItem value="inactive">Não marcadas</SelectItem>
                </SelectContent>
              </Select>

              <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as TypeFilter)}>
                <SelectTrigger className="md:w-[140px] min-h-11" aria-label="Filtrar por tipo">
                  <SelectValue placeholder="Tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os tipos</SelectItem>
                  <SelectItem value="rss">RSS</SelectItem>
                  <SelectItem value="site">Site</SelectItem>
                  <SelectItem value="manual">Manual</SelectItem>
                </SelectContent>
              </Select>

              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="md:w-[200px] min-h-11" aria-label="Filtrar por editoria">
                  <SelectValue placeholder="Editoria" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as editorias ({sources.length})</SelectItem>
                  <SelectItem value={UNCATEGORIZED}>
                    Sem categoria ({countByCategory.get(UNCATEGORIZED) ?? 0})
                  </SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name} ({countByCategory.get(c.id) ?? 0})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={resultFilter}
                onValueChange={(v) => setResultFilter(v as ResultFilter)}
              >
                <SelectTrigger className="md:w-[170px] min-h-11" aria-label="Filtrar por resultado">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os resultados</SelectItem>
                  <SelectItem value="ok">OK</SelectItem>
                  <SelectItem value="error">Erro</SelectItem>
                  <SelectItem value="never">Nunca executada</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <span className="text-xs text-muted-foreground md:ml-auto">
              {filtered.length} de {sources.length}
            </span>
          </div>

          {/* Chips de filtros ativos */}
          {activeFiltersCount > 0 && (
            <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-border">
              {search && (
                <FilterChip label={`Busca: "${search}"`} onRemove={() => setSearch("")} />
              )}
              {statusFilter !== "all" && (
                <FilterChip
                  label={`Status: ${statusFilter === "active" ? "Marcadas" : "Não marcadas"}`}
                  onRemove={() => setStatusFilter("all")}
                />
              )}
              {typeFilter !== "all" && (
                <FilterChip
                  label={`Tipo: ${typeFilter.toUpperCase()}`}
                  onRemove={() => setTypeFilter("all")}
                />
              )}
              {categoryFilter !== "all" && (
                <FilterChip
                  label={`Editoria: ${
                    categoryFilter === UNCATEGORIZED
                      ? "Sem categoria"
                      : categoryMap.get(categoryFilter) ?? categoryFilter
                  }`}
                  onRemove={() => setCategoryFilter("all")}
                />
              )}
              {resultFilter !== "all" && (
                <FilterChip
                  label={`Resultado: ${
                    resultFilter === "ok" ? "OK" : resultFilter === "error" ? "Erro" : "Nunca"
                  }`}
                  onRemove={() => setResultFilter("all")}
                />
              )}
              <Button variant="ghost" size="sm" onClick={clearAllFilters} className="h-7 text-xs">
                Limpar filtros
              </Button>
            </div>
          )}
        </div>

        {/* Log da última execução */}
        {lastRunLogs && (
          <div className="bg-card border-2 border-navy mb-6 p-4 rounded-sm">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-bold text-sm uppercase tracking-wider flex items-center gap-2 text-navy">
                <Zap className="h-4 w-4" /> Log da última execução
                {lastRunAt && (
                  <span className="text-xs font-normal text-muted-foreground">
                    · {lastRunAt.toLocaleTimeString("pt-BR", { timeZone: "America/Maceio" })}
                  </span>
                )}
              </h2>
              <button
                onClick={() => setLastRunLogs(null)}
                className="text-xs text-muted-foreground hover:text-foreground min-h-11 min-w-11 inline-flex items-center justify-center"
                aria-label="Fechar log"
              >
                fechar
              </button>
            </div>
            <div className="space-y-2">
              {lastRunLogs.length === 0 && (
                <p className="text-sm text-muted-foreground">Nenhuma fonte processada.</p>
              )}
              {lastRunLogs.map((log) => (
                <div
                  key={log.source_id}
                  className="flex items-start gap-3 p-2 border border-border bg-background"
                >
                  {log.ok ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
                  ) : (
                    <XCircle className="h-4 w-4 text-urgent mt-0.5 shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-sm">{log.source_name}</div>
                    <div className="text-xs text-muted-foreground flex flex-wrap gap-x-3 mt-0.5">
                      <span>
                        <strong className="text-primary">{log.captured}</strong> captadas
                      </span>
                      <span>
                        <strong>{log.duplicates}</strong> duplicatas
                      </span>
                      <span>
                        <strong>{log.skipped}</strong> já existiam
                      </span>
                    </div>
                    {log.message && (
                      <div className="text-xs text-muted-foreground mt-1">{log.message}</div>
                    )}
                    {log.errors.length > 0 && (
                      <ul className="text-xs text-urgent mt-1 list-disc list-inside">
                        {log.errors.map((err, i) => (
                          <li key={i}>{err}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Estados de carregamento / erro */}
        {loading && (
          <div className="bg-card border border-border p-8 text-center text-sm text-muted-foreground rounded-sm">
            <Loader2 className="h-5 w-5 animate-spin inline mr-2" />
            Carregando fontes…
          </div>
        )}
        {!loading && loadError && (
          <div className="bg-card border-2 border-urgent p-6 text-center rounded-sm">
            <XCircle className="h-6 w-6 text-urgent inline mb-2" />
            <p className="text-sm text-foreground font-semibold">Não foi possível carregar as fontes.</p>
            <p className="text-xs text-muted-foreground mt-1">{loadError}</p>
            <Button onClick={load} className="mt-3" variant="outline">
              Tentar novamente
            </Button>
          </div>
        )}

        {/* Tabela desktop (lg+) */}
        {!loading && !loadError && (
          <>
            <div className="hidden lg:block bg-card border border-border rounded-sm">
              <table className="w-full text-sm table-fixed">
                <thead className="bg-secondary text-xs uppercase tracking-wider">
                  <tr>
                    <th className="text-left p-3 w-[22%]">Fonte</th>
                    <th className="text-left p-3 w-[12%]">Tipo / Editoria</th>
                    <th className="text-left p-3 w-[12%]">Automação</th>
                    <th className="text-left p-3 w-[8%]">Frequência</th>
                    <th className="text-left p-3 w-[13%]">Última execução</th>
                    <th className="text-left p-3 w-[18%]">Último resultado</th>
                    <th className="text-left p-3 w-[9%]">Total captado</th>
                    <th className="text-right p-3 w-[6%]">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((s) => {
                    const catName = s.default_category_id
                      ? categoryMap.get(s.default_category_id)
                      : null;
                    const host = safeHostname(s.url);
                    const isDupHost = host && duplicateHosts.has(host);
                    const kind = classifyRunStatus(s.last_run_at, s.last_run_status);
                    const parsed = parseRunMessage(s.last_run_message);
                    const linked = linkedCounts[s.id];
                    return (
                      <tr key={s.id} className="border-t border-border hover:bg-muted/30 align-top">
                        <td className="p-3">
                          <div className="font-bold break-words">{s.name}</div>
                          {host && (
                            <div className="text-xs text-muted-foreground truncate">{host}</div>
                          )}
                          {isDupHost && (
                            <div className="text-[10px] text-amber-700 font-semibold mt-0.5 flex items-center gap-1">
                              <AlertTriangle className="h-3 w-3" /> possível duplicidade
                            </div>
                          )}
                        </td>
                        <td className="p-3">
                          <div className="text-[10px] font-bold uppercase tracking-wider bg-secondary inline-block px-2 py-0.5 rounded">
                            {s.source_type}
                          </div>
                          <div className="mt-1">
                            {catName ? (
                              <span className="inline-block text-[10px] font-bold uppercase tracking-wider bg-navy/10 text-navy px-2 py-0.5 rounded">
                                {catName}
                              </span>
                            ) : (
                              <span className="text-[10px] text-amber-700 font-semibold">
                                sem categoria
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            <SourceAutomationSwitch
                              checked={s.is_active}
                              sourceName={s.name}
                              disabled={!perms.canToggleActive}
                              onToggle={(next) => persistToggle(s.id, next)}
                              onLocalChange={(next) => updateSourceLocal(s.id, next)}
                            />
                            <div className="text-[10px] leading-tight">
                              <div className="font-bold">
                                {s.is_active ? "Marcada" : "Não marcada"}
                              </div>
                              <div className="text-muted-foreground">
                                Captação manual disponível
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="p-3 text-xs">
                          <div className="font-semibold">{s.frequency_minutes} min</div>
                          <div className="text-[10px] text-muted-foreground">configurada</div>
                        </td>
                        <td className="p-3 text-xs">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="font-semibold cursor-help underline decoration-dotted">
                                {s.last_run_at ? timeAgoPt(s.last_run_at) : "Nunca executada"}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>{formatMaceioLong(s.last_run_at)}</TooltipContent>
                          </Tooltip>
                        </td>
                        <td className="p-3 text-xs">
                          <div className="flex items-center gap-2 flex-wrap">
                            <SourceRunResultBadge kind={kind} />
                          </div>
                          {parsed ? (
                            <div className="text-[11px] text-muted-foreground mt-1">
                              {parsed.captured} captadas · {parsed.duplicates} dup. ·{" "}
                              {parsed.skipped} já existiam
                            </div>
                          ) : (
                            s.last_run_message && (
                              <div className="text-[11px] text-muted-foreground mt-1 break-words line-clamp-2">
                                {s.last_run_message}
                              </div>
                            )
                          )}
                        </td>
                        <td className="p-3 text-xs">
                          <div className="font-semibold">{s.total_captured}</div>
                          {typeof linked === "number" && (
                            <div className="text-[10px] text-muted-foreground">
                              {linked} vinculados
                            </div>
                          )}
                        </td>
                        <td className="p-3 text-right">
                          <SourceActionsMenu
                            sourceName={s.name}
                            canRunNow={s.source_type === "rss"}
                            running={running === s.id}
                            permissions={perms}
                            onEdit={() => openEdit(s)}
                            onViewConfig={() => openConfig(s)}
                            onRunNow={() => captureNow(s)}
                            onDelete={() => requestDelete(s)}
                          />
                        </td>
                      </tr>
                    );
                  })}
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={8} className="p-8 text-center text-muted-foreground">
                        {sources.length === 0
                          ? 'Nenhuma fonte cadastrada. Clique em "Nova fonte" para começar.'
                          : "Nenhuma fonte encontrada com os filtros atuais."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Tablet e mobile: cards em coluna única (< lg) */}
            <div className="lg:hidden space-y-3">
              {filtered.length === 0 && (
                <div className="bg-card border border-border p-8 text-center text-sm text-muted-foreground rounded-sm">
                  {sources.length === 0
                    ? 'Nenhuma fonte cadastrada. Toque em "Nova fonte" para começar.'
                    : "Nenhuma fonte encontrada com os filtros atuais."}
                </div>
              )}
              {filtered.map((s) => {
                const catName = s.default_category_id
                  ? categoryMap.get(s.default_category_id)
                  : null;
                const host = safeHostname(s.url);
                const isDupHost = host && duplicateHosts.has(host);
                const kind = classifyRunStatus(s.last_run_at, s.last_run_status);
                const parsed = parseRunMessage(s.last_run_message);
                const linked = linkedCounts[s.id];
                return (
                  <div
                    key={s.id}
                    className="bg-card border border-border p-4 space-y-3 rounded-sm"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="font-display font-black text-base leading-tight line-clamp-3 text-navy">
                          {s.name}
                        </div>
                        {host && (
                          <div className="text-xs text-muted-foreground mt-0.5 truncate">
                            {host}
                          </div>
                        )}
                        {s.url && (
                          <a
                            href={s.url}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-primary"
                          >
                            <ExternalLink className="h-3 w-3 shrink-0" />
                            <span className="truncate max-w-[220px]">{s.url}</span>
                          </a>
                        )}
                        {isDupHost && (
                          <div className="text-[10px] text-amber-700 font-semibold mt-1 flex items-center gap-1">
                            <AlertTriangle className="h-3 w-3" /> possível duplicidade
                          </div>
                        )}
                      </div>
                      <SourceActionsMenu
                        sourceName={s.name}
                        canRunNow={s.source_type === "rss"}
                        running={running === s.id}
                        permissions={perms}
                        onEdit={() => openEdit(s)}
                        onViewConfig={() => openConfig(s)}
                        onRunNow={() => captureNow(s)}
                        onDelete={() => requestDelete(s)}
                      />
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider bg-secondary px-2 py-0.5 rounded">
                        {s.source_type}
                      </span>
                      {catName ? (
                        <span className="text-[10px] font-bold uppercase tracking-wider bg-navy/10 text-navy px-2 py-0.5 rounded">
                          {catName}
                        </span>
                      ) : (
                        <span className="text-[10px] text-amber-700 font-semibold">
                          sem categoria
                        </span>
                      )}
                      <span
                        className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                          s.is_active
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-secondary text-muted-foreground"
                        }`}
                      >
                        {s.is_active ? "Marcada" : "Não marcada"}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <div className="text-muted-foreground uppercase tracking-wider text-[10px] font-bold">
                          Última execução
                        </div>
                        <div className="font-semibold mt-0.5">
                          {s.last_run_at ? timeAgoPt(s.last_run_at) : "Nunca executada"}
                        </div>
                        <div className="text-[10px] text-muted-foreground">
                          {formatMaceio(s.last_run_at)}
                        </div>
                      </div>
                      <div>
                        <div className="text-muted-foreground uppercase tracking-wider text-[10px] font-bold">
                          Último resultado
                        </div>
                        <div className="mt-0.5">
                          <SourceRunResultBadge kind={kind} />
                        </div>
                        {parsed && (
                          <div className="text-[10px] text-muted-foreground mt-1">
                            {parsed.captured} cap. · {parsed.duplicates} dup. · {parsed.skipped} já ex.
                          </div>
                        )}
                      </div>
                      <div>
                        <div className="text-muted-foreground uppercase tracking-wider text-[10px] font-bold">
                          Frequência
                        </div>
                        <div className="font-semibold mt-0.5">{s.frequency_minutes} min</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground uppercase tracking-wider text-[10px] font-bold">
                          Total captado
                        </div>
                        <div className="font-semibold mt-0.5">
                          {s.total_captured}
                          {typeof linked === "number" && (
                            <span className="text-[10px] text-muted-foreground font-normal">
                              {" "}
                              · {linked} vinculados
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                      <SourceAutomationSwitch
                        checked={s.is_active}
                        sourceName={s.name}
                        disabled={!perms.canToggleActive}
                        onToggle={(next) => persistToggle(s.id, next)}
                        onLocalChange={(next) => updateSourceLocal(s.id, next)}
                      />
                      <span className="text-[11px] text-muted-foreground">
                        Marcar/desmarcar para automação
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        <DeleteSourceDialog
          open={!!deleteTarget}
          onOpenChange={(v) => {
            if (!v) setDeleteTarget(null);
          }}
          sourceName={deleteTarget?.name ?? ""}
          linkedPostsCount={deleteTarget?.linkedPosts ?? 0}
          onConfirm={confirmDelete}
        />

        <SourceConfigDialog
          open={!!configTarget}
          onOpenChange={(v) => {
            if (!v) setConfigTarget(null);
          }}
          data={configTarget}
        />
      </TooltipProvider>
    </AdminLayout>
  );
}

function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <button
      type="button"
      onClick={onRemove}
      className="inline-flex items-center gap-1 text-xs bg-secondary hover:bg-secondary/80 px-2 py-1 rounded-sm border border-border"
      aria-label={`Remover filtro: ${label}`}
    >
      {label}
      <X className="h-3 w-3" />
    </button>
  );
}
