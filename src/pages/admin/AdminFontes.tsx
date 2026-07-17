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
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Loader2,
  PlusCircle,
  RefreshCcw,
  Trash2,
  Edit,
  Rss,
  Zap,
  CheckCircle2,
  XCircle,
  Search,
  ChevronDown,
  ExternalLink,
} from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useAuth } from "@/hooks/useAuth";
import { DeleteSourceDialog } from "@/components/admin/sources/DeleteSourceDialog";
import { SourceAutomationSwitch } from "@/components/admin/sources/SourceAutomationSwitch";
import { getSourcePermissions } from "@/components/admin/sources/permissions";


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

function timeAgo(iso: string | null) {
  if (!iso) return "nunca";
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "agora";
  if (diff < 3600) return `há ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `há ${Math.floor(diff / 3600)} h`;
  const days = Math.floor(diff / 86400);
  if (days < 30) return `há ${days} d`;
  return new Date(iso).toLocaleDateString("pt-BR");
}

export default function AdminFontes() {
  const { isAdmin, isStaff, role } = useAuth();
  const perms = useMemo(
    () => getSourcePermissions({ isAdmin, isStaff, role }),
    [isAdmin, isStaff, role],
  );

  const [sources, setSources] = useState<Source[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Partial<Source>>(EMPTY);
  const [running, setRunning] = useState<string | null>(null);
  const [runAllLoading, setRunAllLoading] = useState(false);
  const [lastRunLogs, setLastRunLogs] = useState<RunLog[] | null>(null);
  const [lastRunAt, setLastRunAt] = useState<Date | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<
    { id: string; name: string; linkedPosts: number } | null
  >(null);

  // filtros
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");

  async function load() {
    const [{ data: s }, { data: c }] = await Promise.all([
      supabase.from("news_sources").select("*").order("name", { ascending: true }),
      supabase.from("categories").select("id,name").order("position"),
    ]);
    setSources((s ?? []) as Source[]);
    setCategories((c ?? []) as Category[]);
  }

  useEffect(() => {
    document.title = "Fontes de captação — Painel";
    load();
  }, []);

  const categoryMap = useMemo(() => {
    const m = new Map<string, string>();
    categories.forEach((c) => m.set(c.id, c.name));
    return m;
  }, [categories]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sources.filter((s) => {
      if (categoryFilter === UNCATEGORIZED && s.default_category_id) return false;
      if (categoryFilter !== "all" && categoryFilter !== UNCATEGORIZED && s.default_category_id !== categoryFilter) return false;
      if (statusFilter === "active" && !s.is_active) return false;
      if (statusFilter === "inactive" && s.is_active) return false;
      if (!q) return true;
      return (
        s.name.toLowerCase().includes(q) ||
        (s.url ?? "").toLowerCase().includes(q)
      );
    });
  }, [sources, search, categoryFilter, statusFilter]);

  // contagem por categoria para o seletor
  const countByCategory = useMemo(() => {
    const m = new Map<string, number>();
    sources.forEach((s) => {
      const key = s.default_category_id ?? UNCATEGORIZED;
      m.set(key, (m.get(key) ?? 0) + 1);
    });
    return m;
  }, [sources]);

  function openNew() {
    setEditing(EMPTY);
    setOpen(true);
  }

  function openEdit(s: Source) {
    setEditing(s);
    setOpen(true);
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
    // Busca contagem real de posts vinculados no momento da confirmação
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

  // Toggle server: retorna erro para o SourceAutomationSwitch tratar rollback
  async function persistToggle(id: string, nextChecked: boolean): Promise<{ error?: string | null }> {
    const { error } = await supabase
      .from("news_sources")
      .update({ is_active: nextChecked })
      .eq("id", id);
    return { error: error?.message ?? null };
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
      toast.error("Nenhuma fonte ativa encontrada.");
      return;
    }
    setRunAllLoading(true);
    setLastRunLogs(null);
    toast.info(`Iniciando captação de ${active.length} fonte(s) ativa(s)…`);
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

  const activeCount = sources.filter((s) => s.is_active).length;
  const uncatCount = sources.filter((s) => !s.default_category_id).length;

  return (
    <AdminLayout>
      <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-3xl font-black flex items-center gap-2">
            <Rss className="h-6 w-6" /> Fontes de captação
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Cadastre feeds RSS ou portais e organize por editoria. Tudo entra como{" "}
            <span className="font-semibold">captada</span> e passa pelo fluxo editorial.
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            <span className="font-semibold">{sources.length}</span> cadastrada(s) ·{" "}
            <span className="font-semibold text-emerald-700">{activeCount}</span> ativa(s) ·{" "}
            <span className="font-semibold text-muted-foreground">{sources.length - activeCount}</span> inativa(s)
            {uncatCount > 0 && (
              <>
                {" · "}
                <span className="font-semibold text-amber-700">{uncatCount}</span> sem categoria
              </>
            )}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button
            onClick={runAllNow}
            disabled={runAllLoading}
            variant="outline"
            className="border-2 border-foreground font-bold"
          >
            {runAllLoading ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Zap className="h-4 w-4 mr-2" />
            )}
            {runAllLoading ? "Executando…" : "Executar captação agora"}
          </Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button onClick={openNew} className="bg-urgent hover:bg-urgent/90">
                <PlusCircle className="h-4 w-4 mr-2" /> Nova fonte
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>{editing.id ? "Editar fonte" : "Nova fonte"}</DialogTitle>
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
                  <Label>Fonte ativa</Label>
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

      {/* Barra de filtros — mobile: busca full width + filtros recolhíveis */}
      <div className="bg-card border border-border mb-4 p-3">
        <div className="flex flex-col md:flex-row md:flex-wrap gap-3 md:items-center">
          <div className="relative flex-1 min-w-0 md:min-w-[220px] w-full">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nome ou URL…"
              className="pl-9 w-full"
            />
          </div>

          {/* Mobile ações rápidas full-width */}
          <div className="grid grid-cols-2 gap-2 md:hidden">
            <Button
              onClick={runAllNow}
              disabled={runAllLoading}
              variant="outline"
              className="border-2 border-foreground font-bold w-full"
              size="sm"
            >
              {runAllLoading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Zap className="h-4 w-4 mr-1" />}
              Captar
            </Button>
            <Button onClick={openNew} className="bg-urgent hover:bg-urgent/90 w-full" size="sm">
              <PlusCircle className="h-4 w-4 mr-1" /> Nova fonte
            </Button>
          </div>

          {/* Filtros: sempre visíveis no desktop, colapsáveis no mobile */}
          <Collapsible className="md:hidden w-full">
            <CollapsibleTrigger className="w-full flex items-center justify-between px-3 py-2 text-xs font-bold uppercase tracking-wider border border-border rounded-sm bg-secondary">
              Filtros <ChevronDown className="h-4 w-4" />
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-2 space-y-2">
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Editoria" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as editorias ({sources.length})</SelectItem>
                  <SelectItem value={UNCATEGORIZED}>Sem categoria ({countByCategory.get(UNCATEGORIZED) ?? 0})</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name} ({countByCategory.get(c.id) ?? 0})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os status</SelectItem>
                  <SelectItem value="active">Apenas ativas</SelectItem>
                  <SelectItem value="inactive">Apenas inativas</SelectItem>
                </SelectContent>
              </Select>
              {(search || categoryFilter !== "all" || statusFilter !== "all") && (
                <Button variant="ghost" size="sm" className="w-full" onClick={() => { setSearch(""); setCategoryFilter("all"); setStatusFilter("all"); }}>
                  Limpar filtros
                </Button>
              )}
            </CollapsibleContent>
          </Collapsible>

          <div className="hidden md:flex md:items-center md:gap-3 md:flex-wrap">
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-[200px]"><SelectValue placeholder="Editoria" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as editorias ({sources.length})</SelectItem>
                <SelectItem value={UNCATEGORIZED}>Sem categoria ({countByCategory.get(UNCATEGORIZED) ?? 0})</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name} ({countByCategory.get(c.id) ?? 0})</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
              <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os status</SelectItem>
                <SelectItem value="active">Apenas ativas</SelectItem>
                <SelectItem value="inactive">Apenas inativas</SelectItem>
              </SelectContent>
            </Select>
            {(search || categoryFilter !== "all" || statusFilter !== "all") && (
              <Button variant="ghost" size="sm" onClick={() => { setSearch(""); setCategoryFilter("all"); setStatusFilter("all"); }}>
                Limpar filtros
              </Button>
            )}
            <span className="text-xs text-muted-foreground ml-auto">
              {filtered.length} de {sources.length}
            </span>
          </div>
        </div>
      </div>


      {lastRunLogs && (
        <div className="bg-card border-2 border-foreground mb-6 p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-sm uppercase tracking-wider flex items-center gap-2">
              <Zap className="h-4 w-4" /> Log da última execução
              {lastRunAt && (
                <span className="text-xs font-normal text-muted-foreground">
                  · {lastRunAt.toLocaleTimeString("pt-BR")}
                </span>
              )}
            </h2>
            <button
              onClick={() => setLastRunLogs(null)}
              className="text-xs text-muted-foreground hover:text-foreground"
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
                  <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                ) : (
                  <XCircle className="h-4 w-4 text-urgent mt-0.5 shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-sm">{log.source_name}</div>
                  <div className="text-xs text-muted-foreground flex flex-wrap gap-x-3 mt-0.5">
                    <span><strong className="text-primary">{log.captured}</strong> captadas</span>
                    <span><strong>{log.duplicates}</strong> duplicatas</span>
                    <span><strong>{log.skipped}</strong> já existiam</span>
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

      {/* Mobile: cards */}
      <div className="md:hidden space-y-3">
        {filtered.length === 0 && (
          <div className="bg-card border border-border p-8 text-center text-sm text-muted-foreground">
            {sources.length === 0
              ? 'Nenhuma fonte cadastrada. Toque em "Nova fonte" para começar.'
              : "Nenhuma fonte encontrada com os filtros atuais."}
          </div>
        )}
        {filtered.map((s) => {
          const catName = s.default_category_id ? categoryMap.get(s.default_category_id) : null;
          return (
            <div key={s.id} className="bg-card border border-border p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="font-display font-black text-base leading-tight">{s.name}</div>
                  {s.url && (
                    <a href={s.url} target="_blank" rel="noreferrer" className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground hover:text-primary break-all">
                      <ExternalLink className="h-3 w-3 shrink-0" />
                      <span className="truncate">{s.url}</span>
                    </a>
                  )}
                </div>
                <SourceAutomationSwitch
                  checked={s.is_active}
                  sourceName={s.name}
                  disabled={!perms.canToggleActive}
                  onToggle={(next) => persistToggle(s.id, next)}
                  onLocalChange={(next) => updateSourceLocal(s.id, next)}
                />
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <div className="text-muted-foreground uppercase tracking-wider text-[10px] font-bold">Editorial</div>
                  <div className="mt-0.5">
                    {catName ? (
                      <span className="inline-block font-bold uppercase tracking-wider bg-secondary px-2 py-0.5">{catName}</span>
                    ) : (
                      <span className="text-amber-700 font-semibold">sem categoria</span>
                    )}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground uppercase tracking-wider text-[10px] font-bold">Tipo</div>
                  <div className="font-bold uppercase mt-0.5">{s.source_type}</div>
                </div>
                <div>
                  <div className="text-muted-foreground uppercase tracking-wider text-[10px] font-bold">Frequência</div>
                  <div className="font-semibold mt-0.5">{s.frequency_minutes} min</div>
                </div>
                <div>
                  <div className="text-muted-foreground uppercase tracking-wider text-[10px] font-bold">Captado</div>
                  <div className="font-semibold mt-0.5">{s.total_captured}</div>
                </div>
                <div className="col-span-2">
                  <div className="text-muted-foreground uppercase tracking-wider text-[10px] font-bold">Última atualização</div>
                  <div className="font-semibold mt-0.5">
                    {timeAgo(s.last_run_at)}
                    {s.last_run_status === "error" && <span className="ml-2 text-urgent">· erro</span>}
                  </div>
                </div>
              </div>

              <div className="grid gap-2 pt-1">
                <Button onClick={() => openEdit(s)} variant="outline" className="w-full font-bold">
                  <Edit className="h-4 w-4 mr-2" /> Editar
                </Button>
                {s.source_type === "rss" && (
                  <Button onClick={() => captureNow(s)} disabled={running === s.id} className="w-full font-bold">
                    {running === s.id ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCcw className="h-4 w-4 mr-2" />}
                    Executar captação
                  </Button>
                )}
                {perms.canDelete && (
                  <Button onClick={() => requestDelete(s)} variant="outline" className="w-full font-bold border-urgent text-urgent hover:bg-urgent/10 min-h-[44px]">
                    <Trash2 className="h-4 w-4 mr-2" /> Excluir
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Desktop: tabela */}
      <div className="hidden md:block bg-card border border-border overflow-x-auto">

        <table className="w-full text-sm">
          <thead className="bg-secondary text-xs uppercase tracking-wider">
            <tr>
              <th className="text-left p-3">Fonte</th>
              <th className="text-left p-3">Editoria</th>
              <th className="text-left p-3">Tipo</th>
              <th className="text-left p-3">Frequência</th>
              <th className="text-left p-3">Última atualização</th>
              <th className="text-left p-3">Captado</th>
              <th className="text-left p-3">Ativa</th>
              <th className="text-right p-3">Ações</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((s) => {
              const catName = s.default_category_id ? categoryMap.get(s.default_category_id) : null;
              return (
                <tr key={s.id} className="border-t border-border hover:bg-muted/30">
                  <td className="p-3">
                    <div className="font-bold">{s.name}</div>
                    {s.url && (
                      <a
                        href={s.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-muted-foreground hover:text-primary truncate block max-w-xs"
                      >
                        {s.url}
                      </a>
                    )}
                  </td>
                  <td className="p-3">
                    {catName ? (
                      <span className="inline-block text-xs font-bold uppercase tracking-wider bg-secondary px-2 py-1">
                        {catName}
                      </span>
                    ) : (
                      <span className="text-xs text-amber-700 font-semibold">sem categoria</span>
                    )}
                  </td>
                  <td className="p-3 uppercase text-xs font-bold">{s.source_type}</td>
                  <td className="p-3 text-xs">{s.frequency_minutes} min</td>
                  <td className="p-3 text-xs">
                    <div className="font-semibold">{timeAgo(s.last_run_at)}</div>
                    {s.last_run_at && (
                      <div className="text-muted-foreground">
                        {new Date(s.last_run_at).toLocaleString("pt-BR")}
                      </div>
                    )}
                    {s.last_run_status === "error" && (
                      <div className="text-urgent text-xs mt-0.5">erro</div>
                    )}
                  </td>
                  <td className="p-3">{s.total_captured}</td>
                  <td className="p-3">
                    <SourceAutomationSwitch
                      checked={s.is_active}
                      sourceName={s.name}
                      disabled={!perms.canToggleActive}
                      onToggle={(next) => persistToggle(s.id, next)}
                      onLocalChange={(next) => updateSourceLocal(s.id, next)}
                    />
                  </td>
                  <td className="p-3 text-right">
                    <div className="inline-flex gap-1">
                      {s.source_type === "rss" && (
                        <button
                          onClick={() => captureNow(s)}
                          disabled={running === s.id}
                          className="p-2 hover:bg-secondary disabled:opacity-50"
                          title="Captar agora"
                        >
                          {running === s.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <RefreshCcw className="h-4 w-4" />
                          )}
                        </button>
                      )}
                      <button
                        onClick={() => openEdit(s)}
                        className="p-2 hover:bg-secondary"
                        title="Editar"
                      >
                        <Edit className="h-4 w-4" />
                      </button>
                      {perms.canDelete && (
                        <button
                          onClick={() => requestDelete(s)}
                          className="p-2 hover:bg-urgent/10 text-urgent min-w-[44px] min-h-[44px] inline-flex items-center justify-center"
                          title="Excluir"
                          aria-label={`Excluir fonte ${s.name}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
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
    </AdminLayout>
  );
}
