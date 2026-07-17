import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  ShieldCheck,
  ShieldAlert,
  RefreshCw,
  PlayCircle,
  Undo2,
  Trash2,
} from "lucide-react";
import AdminLayout from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";

type Purpose = "feed" | "article" | "media";

interface AllowedHost {
  id: string;
  source_id: string;
  hostname: string;
  purpose: Purpose;
  allow_subdomains: boolean;
  created_at: string;
}

interface PreviewRow {
  source_id: string;
  source_name: string;
  purpose: Purpose;
  hostname: string;
  occurrences: number;
  already_allowed: boolean;
  is_valid: boolean;
  invalid_reason: string | null;
}

interface Batch {
  id: string;
  created_at: string;
  reference_time: string;
  candidate_count: number;
  inserted_count: number;
  conflict_count: number;
  invalid_count: number;
  status: string;
}

interface SourceLite {
  id: string;
  name: string;
}

interface DryRunResult {
  dry_run: boolean;
  status: string;
  candidates: number;
  would_insert: number;
  conflicts: number;
  invalid: number;
  items: Array<{
    source_id: string;
    hostname: string;
    purpose: Purpose;
    occurrences: number;
    action: string;
    validation_reason: string | null;
  }>;
}

interface RealResult {
  dry_run: boolean;
  status: string;
  batch_id: string | null;
  candidates: number;
  inserted_count: number;
  conflict_count: number;
  invalid_count: number;
}

const PURPOSE_LABEL: Record<Purpose, string> = {
  feed: "Feed",
  article: "Página original",
  media: "Mídia (imagens)",
};

const PURPOSE_COLOR: Record<Purpose, string> = {
  feed: "bg-blue-100 text-blue-800 border-blue-300",
  article: "bg-emerald-100 text-emerald-800 border-emerald-300",
  media: "bg-amber-100 text-amber-800 border-amber-300",
};

export default function AdminFontesAllowlist() {
  const { toast } = useToast();
  const { isAdmin } = useAuth();
  const [loading, setLoading] = useState(true);
  const [allowed, setAllowed] = useState<AllowedHost[]>([]);
  const [preview, setPreview] = useState<PreviewRow[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [sources, setSources] = useState<Record<string, string>>({});
  const [q, setQ] = useState("");

  // dialogs
  const [dryRun, setDryRun] = useState<DryRunResult | null>(null);
  const [dryRunOpen, setDryRunOpen] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [rollbackTarget, setRollbackTarget] = useState<Batch | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AllowedHost | null>(null);

  async function load() {
    setLoading(true);
    try {
      const [
        { data: rows, error: e1 },
        { data: prev, error: e2 },
        { data: srcs, error: e3 },
        { data: bs, error: e4 },
      ] = await Promise.all([
        supabase
          .from("news_source_allowed_hosts")
          .select("id, source_id, hostname, purpose, allow_subdomains, created_at")
          .order("hostname"),
        supabase.rpc("preview_allowed_hosts_backfill"),
        supabase.from("news_sources").select("id, name"),
        supabase
          .from("source_allowed_hosts_batches")
          .select(
            "id, created_at, reference_time, candidate_count, inserted_count, conflict_count, invalid_count, status",
          )
          .order("created_at", { ascending: false })
          .limit(20),
      ]);
      if (e1) throw e1;
      if (e2) throw e2;
      if (e3) throw e3;
      if (e4) throw e4;
      setAllowed((rows ?? []) as AllowedHost[]);
      setPreview((prev ?? []) as PreviewRow[]);
      setSources(
        Object.fromEntries(((srcs ?? []) as SourceLite[]).map((s) => [s.id, s.name])),
      );
      setBatches((bs ?? []) as Batch[]);
    } catch (err) {
      toast({
        title: "Erro ao carregar allowlist",
        description: err instanceof Error ? err.message : "Falha desconhecida",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function runDryRun() {
    try {
      const { data, error } = await supabase.rpc(
        "admin_backfill_source_allowed_hosts",
        { _dry_run: true },
      );
      if (error) throw error;
      setDryRun(data as unknown as DryRunResult);
      setDryRunOpen(true);
    } catch (err) {
      toast({
        title: "Falha no dry-run",
        description: err instanceof Error ? err.message : "Erro desconhecido",
        variant: "destructive",
      });
    }
  }

  async function runReal() {
    if (executing) return; // trava contra clique duplo
    setExecuting(true);
    try {
      const { data, error, status } = await supabase.rpc(
        "admin_backfill_source_allowed_hosts",
        { _dry_run: false }, // explícito; não depender do default
      );
      if (error) throw error;

      const res = (data ?? {}) as Partial<RealResult>;
      const ok =
        !!res.batch_id &&
        res.status === "completed" &&
        typeof res.inserted_count === "number" &&
        typeof res.conflict_count === "number" &&
        typeof res.invalid_count === "number";

      if (!ok) {
        // eslint-disable-next-line no-console
        console.error("[allowlist] resposta inesperada", {
          http_status: status,
          rpc_status: res.status ?? null,
          has_batch: !!res.batch_id,
        });
        toast({
          title: "Resposta inesperada do backfill",
          description:
            "A execução não retornou um lote válido. Nada foi confirmado. Recarregue e verifique.",
          variant: "destructive",
        });
        return; // mantém o diálogo aberto para revisão
      }

      toast({
        title: "Backfill concluído",
        description: `Lote ${res.batch_id!.slice(0, 8)}… • inseridos: ${res.inserted_count} • conflitos: ${res.conflict_count} • inválidos: ${res.invalid_count}`,
      });
      setDryRunOpen(false);
      setDryRun(null);
      await load();
    } catch (err) {
      toast({
        title: "Falha ao executar backfill",
        description: err instanceof Error ? err.message : "Erro desconhecido",
        variant: "destructive",
      });
    } finally {
      setExecuting(false);
    }
  }

  async function runRollback(batch: Batch) {
    try {
      const { data, error } = await supabase.rpc(
        "admin_rollback_source_allowed_hosts_batch",
        { _batch_id: batch.id },
      );
      if (error) throw error;
      const res = data as {
        removed: number;
        kept_modified: number;
        not_found: number;
      };
      toast({
        title: "Rollback executado",
        description: `Removidos: ${res.removed} • preservados (modificados): ${res.kept_modified} • não encontrados: ${res.not_found}`,
      });
      setRollbackTarget(null);
      await load();
    } catch (err) {
      toast({
        title: "Falha no rollback",
        description: err instanceof Error ? err.message : "Erro desconhecido",
        variant: "destructive",
      });
    }
  }

  async function deleteOne(h: AllowedHost) {
    try {
      const { error } = await supabase.rpc("admin_delete_source_allowed_host", {
        _id: h.id,
      });
      if (error) throw error;
      toast({ title: "Host removido da allowlist" });
      setDeleteTarget(null);
      await load();
    } catch (err) {
      toast({
        title: "Falha ao remover",
        description: err instanceof Error ? err.message : "Erro desconhecido",
        variant: "destructive",
      });
    }
  }

  const filteredPreview = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return preview;
    return preview.filter(
      (r) =>
        r.hostname.includes(term) ||
        r.source_name.toLowerCase().includes(term) ||
        r.purpose.includes(term),
    );
  }, [q, preview]);

  const stats = useMemo(() => {
    const total = preview.length;
    const invalid = preview.filter((r) => !r.is_valid).length;
    const missing = preview.filter((r) => r.is_valid && !r.already_allowed).length;
    const covered = preview.filter((r) => r.already_allowed).length;
    return { total, invalid, missing, covered };
  }, [preview]);

  // Group current allowed by source name
  const groupedAllowed = useMemo(() => {
    const map = new Map<string, AllowedHost[]>();
    for (const h of allowed) {
      const name = sources[h.source_id] ?? h.source_id;
      const arr = map.get(name) ?? [];
      arr.push(h);
      map.set(name, arr);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [allowed, sources]);

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <Button variant="ghost" size="sm" asChild className="mb-2 -ml-2 h-8">
              <Link to="/admin/fontes">
                <ArrowLeft className="h-4 w-4 mr-1" /> Voltar para Fontes
              </Link>
            </Button>
            <h1 className="text-2xl font-bold">Allowlist de hosts</h1>
            <p className="text-sm text-muted-foreground max-w-2xl">
              A allowlist está cadastrada, mas <strong>ainda não está sendo aplicada
              à captação</strong>. Esta tela permite fazer o backfill controlado com
              snapshot e rollback (F3C.2).
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={load}
              disabled={loading}
              className="min-h-[44px]"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
              Recarregar
            </Button>
            {isAdmin && (
              <Button onClick={runDryRun} className="min-h-[44px]">
                <PlayCircle className="h-4 w-4 mr-2" />
                Executar backfill
              </Button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="Registros na allowlist" value={allowed.length} tone="neutral" />
          <StatCard label="Hosts na prévia" value={stats.total} tone="neutral" />
          <StatCard label="Já cobertos" value={stats.covered} tone="ok" />
          <StatCard
            label="Faltando cadastrar"
            value={stats.missing}
            tone={stats.missing > 0 ? "warn" : "ok"}
          />
        </div>

        <Tabs defaultValue="preview" className="space-y-4">
          <TabsList>
            <TabsTrigger value="preview">Prévia ({stats.total})</TabsTrigger>
            <TabsTrigger value="current">Cadastrados ({allowed.length})</TabsTrigger>
            <TabsTrigger value="batches">Lotes ({batches.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="preview" className="space-y-3">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Hosts observados nos dados</CardTitle>
                <p className="text-xs text-muted-foreground">
                  Agrupamento por fonte × host × finalidade. Nada é inserido
                  automaticamente. Hosts inválidos são recusados pelo backfill.
                </p>
              </CardHeader>
              <CardContent className="space-y-3">
                <Input
                  placeholder="Filtrar por host, fonte ou finalidade…"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  className="max-w-md"
                />
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Fonte</TableHead>
                        <TableHead>Finalidade</TableHead>
                        <TableHead>Hostname</TableHead>
                        <TableHead className="text-right">Ocorrências</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredPreview.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center text-muted-foreground py-6">
                            {loading ? "Carregando…" : "Nenhum host encontrado."}
                          </TableCell>
                        </TableRow>
                      )}
                      {filteredPreview.map((r) => (
                        <TableRow key={`${r.source_id}-${r.purpose}-${r.hostname}`}>
                          <TableCell className="font-medium">{r.source_name}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={PURPOSE_COLOR[r.purpose]}>
                              {PURPOSE_LABEL[r.purpose]}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-mono text-xs break-all">
                            {r.hostname}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {r.occurrences.toLocaleString("pt-BR")}
                          </TableCell>
                          <TableCell>
                            {!r.is_valid ? (
                              <Badge variant="destructive" className="gap-1">
                                <ShieldAlert className="h-3 w-3" />
                                inválido: {r.invalid_reason}
                              </Badge>
                            ) : r.already_allowed ? (
                              <Badge className="bg-emerald-600 hover:bg-emerald-600 gap-1">
                                <ShieldCheck className="h-3 w-3" /> na allowlist
                              </Badge>
                            ) : (
                              <Badge variant="secondary">a cadastrar</Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="current" className="space-y-3">
            {groupedAllowed.length === 0 ? (
              <Card>
                <CardContent className="p-6 text-center text-sm text-muted-foreground">
                  Nenhum host cadastrado.
                </CardContent>
              </Card>
            ) : (
              groupedAllowed.map(([name, hosts]) => (
                <Card key={name}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">{name}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Hostname</TableHead>
                            <TableHead>Finalidade</TableHead>
                            <TableHead>Subdomínios</TableHead>
                            <TableHead>Criado em</TableHead>
                            <TableHead />
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {hosts.map((h) => (
                            <TableRow key={h.id}>
                              <TableCell className="font-mono text-xs">{h.hostname}</TableCell>
                              <TableCell>
                                <Badge variant="outline" className={PURPOSE_COLOR[h.purpose]}>
                                  {PURPOSE_LABEL[h.purpose]}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-xs">
                                {h.allow_subdomains ? "sim" : "não permitidos"}
                              </TableCell>
                              <TableCell className="text-xs">
                                {new Date(h.created_at).toLocaleString("pt-BR", {
                                  timeZone: "America/Maceio",
                                })}
                              </TableCell>
                              <TableCell className="text-right">
                                {isAdmin && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-9 min-w-[44px] text-destructive"
                                    onClick={() => setDeleteTarget(h)}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          <TabsContent value="batches" className="space-y-3">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Histórico de lotes</CardTitle>
                <p className="text-xs text-muted-foreground">
                  Cada execução real do backfill gera um lote com snapshot dos itens
                  para permitir rollback seletivo.
                </p>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Data</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Candidatos</TableHead>
                        <TableHead className="text-right">Inseridos</TableHead>
                        <TableHead className="text-right">Conflitos</TableHead>
                        <TableHead className="text-right">Inválidos</TableHead>
                        <TableHead />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {batches.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center text-muted-foreground py-6">
                            Nenhum lote executado.
                          </TableCell>
                        </TableRow>
                      )}
                      {batches.map((b) => (
                        <TableRow key={b.id}>
                          <TableCell className="text-xs">
                            {new Date(b.created_at).toLocaleString("pt-BR", {
                              timeZone: "America/Maceio",
                            })}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={b.status === "rolled_back" ? "secondary" : "outline"}
                            >
                              {b.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {b.candidate_count}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {b.inserted_count}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {b.conflict_count}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {b.invalid_count}
                          </TableCell>
                          <TableCell className="text-right">
                            {isAdmin && b.status !== "rolled_back" && b.inserted_count > 0 && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="min-h-[44px]"
                                onClick={() => setRollbackTarget(b)}
                              >
                                <Undo2 className="h-4 w-4 mr-1" /> Rollback
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Dry-run confirmation dialog */}
      <AlertDialog
        open={dryRunOpen}
        onOpenChange={(o) => {
          if (executing) return; // não permite fechar durante a execução real
          setDryRunOpen(o);
        }}
      >
        <AlertDialogContent className="max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar backfill da allowlist</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>Resultado do dry-run (ainda nada foi gravado):</p>
                {dryRun && (() => {
                  const byPurpose = (p: Purpose) =>
                    dryRun.items.filter((i) => i.purpose === p && i.action !== "invalid").length;
                  return (
                    <ul className="text-sm space-y-1">
                      <li>• Candidatos totais: <strong>{dryRun.candidates}</strong></li>
                      <li className="pl-4">– Feed: <strong>{byPurpose("feed")}</strong></li>
                      <li className="pl-4">– Página original: <strong>{byPurpose("article")}</strong></li>
                      <li className="pl-4">– Mídia: <strong>{byPurpose("media")}</strong></li>
                      <li>• Serão inseridos: <strong>{dryRun.would_insert}</strong></li>
                      <li>• Conflitos (já existem): <strong>{dryRun.conflicts}</strong></li>
                      <li>• Inválidos: <strong>{dryRun.invalid}</strong></li>
                    </ul>
                  );
                })()}
                <p className="text-xs text-muted-foreground">
                  Ao confirmar, os hosts válidos ausentes serão inseridos em um único
                  lote atômico. Conflitos não serão sobrescritos. Nenhuma captação
                  será acionada.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={executing}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={runReal} disabled={executing}>
              {executing ? "Executando…" : "Confirmar execução"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Rollback dialog */}
      <AlertDialog
        open={!!rollbackTarget}
        onOpenChange={(o) => !o && setRollbackTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Fazer rollback do lote?</AlertDialogTitle>
            <AlertDialogDescription>
              Serão removidas somente as linhas realmente inseridas por este lote.
              Linhas modificadas após a execução serão preservadas. Conflitos não
              são tocados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => rollbackTarget && runRollback(rollbackTarget)}
            >
              Executar rollback
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete host dialog */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover host da allowlist?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget && (
                <>
                  Remover <code className="font-mono">{deleteTarget.hostname}</code>{" "}
                  ({PURPOSE_LABEL[deleteTarget.purpose]}) da allowlist? Esta ação
                  não afeta captação atual (bloqueio ainda não está ativo).
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTarget && deleteOne(deleteTarget)}
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "ok" | "warn" | "neutral";
}) {
  const toneClass =
    tone === "warn"
      ? "border-amber-300 bg-amber-50 dark:bg-amber-950/20"
      : tone === "ok"
        ? "border-emerald-300 bg-emerald-50 dark:bg-emerald-950/20"
        : "";
  return (
    <Card className={toneClass}>
      <CardContent className="p-4">
        <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
          {label}
        </div>
        <div className="text-2xl font-bold tabular-nums mt-1">
          {value.toLocaleString("pt-BR")}
        </div>
      </CardContent>
    </Card>
  );
}
