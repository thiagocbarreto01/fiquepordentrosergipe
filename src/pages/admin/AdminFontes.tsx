import { useEffect, useState } from "react";
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
import { Loader2, PlusCircle, RefreshCcw, Trash2, Edit, Rss, Zap, CheckCircle2, XCircle } from "lucide-react";

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

export default function AdminFontes() {
  const [sources, setSources] = useState<Source[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Partial<Source>>(EMPTY);
  const [running, setRunning] = useState<string | null>(null);
  const [runAllLoading, setRunAllLoading] = useState(false);
  const [lastRunLogs, setLastRunLogs] = useState<RunLog[] | null>(null);
  const [lastRunAt, setLastRunAt] = useState<Date | null>(null);

  async function load() {
    const [{ data: s }, { data: c }] = await Promise.all([
      supabase.from("news_sources").select("*").order("created_at", { ascending: false }),
      supabase.from("categories").select("id,name").order("position"),
    ]);
    setSources((s ?? []) as Source[]);
    setCategories((c ?? []) as Category[]);
  }

  useEffect(() => {
    document.title = "Fontes de captação — Painel";
    load();
  }, []);

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

  async function remove(id: string) {
    if (!confirm("Excluir esta fonte? As notícias captadas serão mantidas.")) return;
    const { error } = await supabase.from("news_sources").delete().eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success("Fonte excluída");
      load();
    }
  }

  async function toggleActive(s: Source) {
    const { error } = await supabase
      .from("news_sources")
      .update({ is_active: !s.is_active })
      .eq("id", s.id);
    if (error) toast.error(error.message);
    else load();
  }

  async function captureNow(s: Source) {
    setRunning(s.id);
    try {
      const { data: summary, error: invokeError } = await supabase.functions.invoke(`capture-sources?source_id=${s.id}`, {
        method: "POST",
      });

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
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao captar");
    } finally {
      setRunning(null);
    }
  }

  async function runAllNow() {
    const active = sources.filter((s) => s.is_active);
    const inactive = sources.length - active.length;
    if (active.length === 0) {
      toast.error("Nenhuma fonte ativa encontrada.", {
        description: `Total: ${sources.length} cadastrada(s) · ${inactive} inativa(s)`,
      });
      return;
    }
    setRunAllLoading(true);
    setLastRunLogs(null);
    toast.info(`Iniciando captação de ${active.length} fonte(s) ativa(s)…`);
    try {
      const { data: summary, error: invokeError } = await supabase.functions.invoke("capture-sources?manual=1", {
        method: "POST",
      });

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
        toast.warning(
          `Captação concluída em ${logs.length} fonte(s): ${totalCap} nova(s), ${totalDup} duplicata(s), ${failed} com erro`,
        );
      } else {
        toast.success(
          `Captação concluída: ${totalCap} notícia(s) nova(s), ${totalDup} duplicata(s) em ${logs.length} fonte(s)`,
        );
      }
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao executar captação");
    } finally {
      setRunAllLoading(false);
    }
  }

  return (
    <AdminLayout>
      <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-3xl font-black flex items-center gap-2">
            <Rss className="h-6 w-6" /> Fontes de captação
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Cadastre feeds RSS ou portais (HTML) para captar notícias automaticamente. Tudo entra como
            <span className="font-semibold"> captada</span> e passa pelo fluxo editorial.
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            <span className="font-semibold">{sources.length}</span> cadastrada(s) ·{" "}
            <span className="font-semibold text-emerald-700">{sources.filter(s => s.is_active).length}</span> ativa(s) ·{" "}
            <span className="font-semibold text-muted-foreground">{sources.filter(s => !s.is_active).length}</span> inativa(s)
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
                  placeholder="Ex: G1 Ribeirão Preto"
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
                  <Label>Categoria padrão</Label>
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

      <div className="bg-card border border-border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-secondary text-xs uppercase tracking-wider">
            <tr>
              <th className="text-left p-3">Fonte</th>
              <th className="text-left p-3">Tipo</th>
              <th className="text-left p-3">Frequência</th>
              <th className="text-left p-3">Última execução</th>
              <th className="text-left p-3">Total captado</th>
              <th className="text-left p-3">Ativa</th>
              <th className="text-right p-3">Ações</th>
            </tr>
          </thead>
          <tbody>
            {sources.map((s) => (
              <tr key={s.id} className="border-t border-border">
                <td className="p-3">
                  <div className="font-bold">{s.name}</div>
                  {s.url && (
                    <div className="text-xs text-muted-foreground truncate max-w-xs">
                      {s.url}
                    </div>
                  )}
                </td>
                <td className="p-3 uppercase text-xs font-bold">{s.source_type}</td>
                <td className="p-3">{s.frequency_minutes} min</td>
                <td className="p-3 text-xs">
                  {s.last_run_at ? (
                    <>
                      <div>{new Date(s.last_run_at).toLocaleString("pt-BR")}</div>
                      {s.last_run_message && (
                        <div className="text-muted-foreground">{s.last_run_message}</div>
                      )}
                    </>
                  ) : (
                    <span className="text-muted-foreground">nunca</span>
                  )}
                </td>
                <td className="p-3">{s.total_captured}</td>
                <td className="p-3">
                  <Switch checked={s.is_active} onCheckedChange={() => toggleActive(s)} />
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
                    <button
                      onClick={() => remove(s.id)}
                      className="p-2 hover:bg-urgent/10 text-urgent"
                      title="Excluir"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {sources.length === 0 && (
              <tr>
                <td colSpan={7} className="p-8 text-center text-muted-foreground">
                  Nenhuma fonte cadastrada. Clique em "Nova fonte" para começar.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </AdminLayout>
  );
}
