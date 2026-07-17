import { useEffect, useState } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
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
import { RefreshCw, CheckCircle2, AlertTriangle, Sparkles, Info, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { formatMaceio, formatMaceioLong } from "@/lib/timezone";

type AuditRow = { missing_in_public: number; stale_in_public: number };
type LogRow = {
  id: string;
  event_type: string;
  status: string;
  post_id: string | null;
  error: string | null;
  details: any;
  created_at: string;
};

type PreviewSample = { id: string; title: string | null };
type PreviewResult = {
  missing_in_public: number;
  stale_in_public: number;
  total_divergent: number;
  checked_at: string;
  missing_sample: PreviewSample[];
  stale_sample: PreviewSample[];
};

function humanizeCluster(row: LogRow): string {
  const d = row.details ?? {};
  if (row.event_type !== "cluster_post") return row.error ?? JSON.stringify(d ?? {});
  const reason = (d as any).reason as string | undefined;
  const mode = (d as any).mode as string | undefined;
  if (row.status === "ok") return `Agrupado por embeddings`;
  if (row.status === "trigram") return `Agrupado por similaridade local (embeddings desabilitados)`;
  if (row.status === "fallback_trgm") {
    if (reason === "credit_limit") return `IA indisponível (créditos esgotados) — usado agrupamento local`;
    if (reason === "rate_limited") return `IA limitada — usado agrupamento local`;
    if (reason === "unauthorized") return `IA sem autorização — usado agrupamento local`;
    if (reason === "config_missing") return `IA não configurada — usado agrupamento local`;
    if (reason === "attach_error") return `Falha ao anexar por embedding — usado agrupamento local`;
    return `Usado agrupamento local (${reason ?? "motivo técnico"})`;
  }
  return mode ?? row.status;
}

export default function AdminSync() {
  const [audit, setAudit] = useState<AuditRow | null>(null);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [lastCheckedAt, setLastCheckedAt] = useState<string | null>(null);

  // Preview / Confirm dialog
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);

  // Recluster local dialog
  const [reclusterOpen, setReclusterOpen] = useState(false);

  async function loadAll() {
    const [{ data: a }, { data: l }] = await Promise.all([
      supabase.rpc("audit_posts_public_drift" as any),
      supabase
        .from("sync_audit_log" as any)
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50),
    ]);
    const row = Array.isArray(a) ? a[0] : a;
    setAudit((row as any) ?? { missing_in_public: 0, stale_in_public: 0 });
    setLogs((l as unknown as LogRow[]) ?? []);
    setLastCheckedAt(new Date().toISOString());
  }

  useEffect(() => {
    loadAll();
  }, []);

  async function openPreview() {
    setPreviewLoading(true);
    setPreviewOpen(true);
    try {
      const { data, error } = await supabase.rpc("preview_posts_public_drift" as any, { _sample_limit: 10 });
      if (error) throw error;
      setPreview(data as PreviewResult);
    } catch (err: any) {
      toast(`Erro na prévia: ${err.message ?? err}`);
      setPreviewOpen(false);
    } finally {
      setPreviewLoading(false);
    }
  }

  async function confirmRepair() {
    if (!preview || confirming || busy) return;
    setConfirming(true);
    try {
      // Recalcula antes de executar (proteção contra dados mudarem entre prévia e execução)
      const { data: fresh, error: pErr } = await supabase.rpc("preview_posts_public_drift" as any, { _sample_limit: 10 });
      if (pErr) throw pErr;
      const freshResult = fresh as PreviewResult;
      if (freshResult.total_divergent !== preview.total_divergent) {
        setPreview(freshResult);
        toast(`A contagem mudou (${preview.total_divergent} → ${freshResult.total_divergent}). Revise antes de confirmar.`);
        setConfirming(false);
        return;
      }

      setBusy(true);
      const { data, error } = await supabase.rpc("auto_repair_posts_public" as any);
      if (error) throw error;
      toast(`Espelho público sincronizado: ${data} matéria(s).`);
      setPreviewOpen(false);
      setPreview(null);
      await loadAll();
    } catch (err: any) {
      toast(`Erro: ${err.message ?? err}`);
    } finally {
      setConfirming(false);
      setBusy(false);
    }
  }

  async function confirmReclusterLocal() {
    if (busy) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc("recluster_all_posts_local" as any, { _force: true });
      if (error) throw error;
      toast(`Agrupamento local concluído: ${data} matéria(s) processada(s).`);
      setReclusterOpen(false);
      await loadAll();
    } catch (err: any) {
      toast(`Erro: ${err.message ?? err}`);
    } finally {
      setBusy(false);
    }
  }

  const drift = (audit?.missing_in_public ?? 0) + (audit?.stale_in_public ?? 0);
  const mirrorSynced = drift === 0;

  return (
    <AdminLayout>
      <div className="space-y-8">
        <header>
          <h1 className="font-display text-2xl font-black">Auto Sync</h1>
          <p className="text-sm text-muted-foreground">
            Diagnóstico do espelho público e do agrupamento de matérias por similaridade.
          </p>
          {lastCheckedAt && (
            <p className="text-xs text-muted-foreground mt-1">
              Última verificação: {formatMaceioLong(lastCheckedAt)}
            </p>
          )}
        </header>

        {/* SEÇÃO A — Espelho público (essencial) */}
        <section className="space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <h2 className="font-display text-lg font-bold flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-emerald-600" /> Espelho público
                <span className="text-xs font-normal text-muted-foreground">(essencial)</span>
              </h2>
              <p className="text-xs text-muted-foreground">
                Mantém <code>posts_public</code> consistente com as notícias publicadas.
              </p>
            </div>
            <Button onClick={openPreview} disabled={busy || previewLoading} className="gap-2">
              <RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} />
              Ressincronizar agora
            </Button>
          </div>

          <div className="grid sm:grid-cols-3 gap-4">
            <div className="bg-white border rounded p-4">
              <div className="text-xs uppercase font-bold text-muted-foreground">Faltando no público</div>
              <div className="text-3xl font-black mt-1">{audit?.missing_in_public ?? "–"}</div>
            </div>
            <div className="bg-white border rounded p-4">
              <div className="text-xs uppercase font-bold text-muted-foreground">Obsoletas no público</div>
              <div className="text-3xl font-black mt-1">{audit?.stale_in_public ?? "–"}</div>
            </div>
            <div className="bg-white border rounded p-4 flex items-center gap-3">
              {mirrorSynced ? (
                <>
                  <CheckCircle2 className="h-8 w-8 text-emerald-600" />
                  <div>
                    <div className="text-xs uppercase font-bold text-muted-foreground">Espelho público</div>
                    <div className="text-lg font-black">Sincronizado</div>
                  </div>
                </>
              ) : (
                <>
                  <AlertTriangle className="h-8 w-8 text-amber-600" />
                  <div>
                    <div className="text-xs uppercase font-bold text-muted-foreground">Espelho público</div>
                    <div className="text-lg font-black">{drift} divergência(s)</div>
                  </div>
                </>
              )}
            </div>
          </div>
        </section>

        {/* SEÇÃO B — Agrupamento por similaridade (opcional) */}
        <section className="space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <h2 className="font-display text-lg font-bold flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-purple-600" /> Agrupamento por similaridade
                <span className="text-xs font-normal text-muted-foreground">(opcional)</span>
              </h2>
              <p className="text-xs text-muted-foreground">
                Agrupa matérias em eventos. Usa embeddings quando disponíveis; caso contrário, similaridade local.
                Falhas aqui <strong>não afetam</strong> o espelho público.
              </p>
            </div>
            <Button onClick={() => setReclusterOpen(true)} disabled={busy} variant="outline" className="gap-2">
              <Sparkles className="h-4 w-4" />
              Reagrupar (local)
            </Button>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded p-3 flex gap-2 text-sm text-blue-900">
            <Info className="h-4 w-4 shrink-0 mt-0.5" />
            <div>
              Modo padrão: <strong>similaridade local (trigram)</strong>. Embeddings só rodam quando explicitamente
              habilitados no servidor (<code>CLUSTER_EMBEDDINGS_ENABLED=true</code>) e o workspace tiver créditos de IA.
              O cliente não pode ativar esse modo.
            </div>
          </div>
        </section>

        {/* Últimos eventos */}
        <section>
          <h2 className="font-display text-lg font-bold mb-3">Últimos eventos de sincronização</h2>
          <div className="bg-white border rounded overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-secondary text-xs uppercase">
                <tr>
                  <th className="text-left px-3 py-2">Quando</th>
                  <th className="text-left px-3 py-2">Tipo</th>
                  <th className="text-left px-3 py-2">Status</th>
                  <th className="text-left px-3 py-2">Detalhes</th>
                </tr>
              </thead>
              <tbody>
                {logs.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">
                      Sem registros ainda.
                    </td>
                  </tr>
                )}
                {logs.map((row) => (
                  <tr key={row.id} className="border-t">
                    <td className="px-3 py-2 whitespace-nowrap">{formatMaceio(row.created_at)}</td>
                    <td className="px-3 py-2 font-mono text-xs">{row.event_type}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-bold ${
                          row.status === "ok"
                            ? "bg-emerald-100 text-emerald-800"
                            : row.status === "trigram"
                            ? "bg-blue-100 text-blue-800"
                            : row.status === "fallback_trgm"
                            ? "bg-amber-100 text-amber-800"
                            : "bg-red-100 text-red-800"
                        }`}
                      >
                        {row.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{humanizeCluster(row)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {/* Dialog: prévia da ressincronização */}
      <AlertDialog open={previewOpen} onOpenChange={(o) => !busy && !confirming && setPreviewOpen(o)}>
        <AlertDialogContent className="max-w-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Prévia da ressincronização</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm">
                {previewLoading || !preview ? (
                  <div className="text-muted-foreground">Calculando divergências…</div>
                ) : (
                  <>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="border rounded p-2">
                        <div className="text-xs uppercase text-muted-foreground">Faltando</div>
                        <div className="text-2xl font-black">{preview.missing_in_public}</div>
                      </div>
                      <div className="border rounded p-2">
                        <div className="text-xs uppercase text-muted-foreground">Obsoletas</div>
                        <div className="text-2xl font-black">{preview.stale_in_public}</div>
                      </div>
                      <div className="border rounded p-2">
                        <div className="text-xs uppercase text-muted-foreground">Total</div>
                        <div className="text-2xl font-black">{preview.total_divergent}</div>
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Referência: {formatMaceioLong(preview.checked_at)}
                    </div>

                    {preview.missing_sample.length > 0 && (
                      <div>
                        <div className="text-xs font-bold uppercase text-muted-foreground mb-1">
                          Amostra — faltando no público
                        </div>
                        <ul className="text-xs space-y-0.5 max-h-32 overflow-y-auto border rounded p-2 bg-secondary/40">
                          {preview.missing_sample.map((s) => (
                            <li key={s.id} className="truncate">• {s.title ?? s.id}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {preview.stale_sample.length > 0 && (
                      <div>
                        <div className="text-xs font-bold uppercase text-muted-foreground mb-1">
                          Amostra — obsoletas no público
                        </div>
                        <ul className="text-xs space-y-0.5 max-h-32 overflow-y-auto border rounded p-2 bg-secondary/40">
                          {preview.stale_sample.map((s) => (
                            <li key={s.id} className="truncate">• {s.title ?? s.id}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {preview.total_divergent === 0 && (
                      <div className="bg-emerald-50 border border-emerald-200 rounded p-3 text-emerald-800 text-sm flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4" />
                        Nada a fazer — o espelho público já está sincronizado.
                      </div>
                    )}
                  </>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy || confirming}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                confirmRepair();
              }}
              disabled={previewLoading || busy || confirming || !preview || preview.total_divergent === 0}
            >
              {confirming || busy ? "Executando…" : "Confirmar ressincronização"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog: recluster local */}
      <AlertDialog open={reclusterOpen} onOpenChange={(o) => !busy && setReclusterOpen(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reagrupar matérias por similaridade local?</AlertDialogTitle>
            <AlertDialogDescription>
              Vai limpar os eventos atuais e reprocessar todas as matérias publicadas usando similaridade textual
              (trigram) diretamente no banco. Não consome créditos de IA e não altera o conteúdo das matérias.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                confirmReclusterLocal();
              }}
              disabled={busy}
            >
              {busy ? "Processando…" : "Reagrupar agora"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  );
}
