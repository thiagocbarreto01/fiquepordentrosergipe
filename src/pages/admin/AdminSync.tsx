import { useEffect, useState } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { RefreshCw, CheckCircle2, AlertTriangle, Sparkles } from "lucide-react";
import { toast } from "sonner";

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

export default function AdminSync() {
  const [audit, setAudit] = useState<AuditRow | null>(null);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [busy, setBusy] = useState(false);

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
  }

  useEffect(() => {
    loadAll();
  }, []);

  async function runRepair() {
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc("auto_repair_posts_public" as any);
      if (error) throw error;
      toast(`Sincronização concluída: ${data} matéria(s).`);
      await loadAll();
    } catch (err: any) {
      toast(`Erro: ${err.message ?? err}`);
    } finally {
      setBusy(false);
    }
  }

  async function runRecluster() {
    if (!confirm("Recluster vai apagar os eventos atuais e reprocessar todas as matérias publicadas usando embeddings. Continuar?")) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc("recluster_all_posts" as any, { _force: true });
      if (error) throw error;
      toast(`Reclusterização enfileirada: ${data} matéria(s). Aguarde ~1min.`);
      await loadAll();
    } catch (err: any) {
      toast(`Erro: ${err.message ?? err}`);
    } finally {
      setBusy(false);
    }
  }

  const drift = (audit?.missing_in_public ?? 0) + (audit?.stale_in_public ?? 0);

  return (
    <AdminLayout>
      <div className="space-y-6">
        <header className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="font-display text-2xl font-black">Auto Sync & Clustering</h1>
            <p className="text-sm text-muted-foreground">
              Diagnóstico de espelho público e reclusterização semântica por embeddings.
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={runRecluster} disabled={busy} variant="outline" className="gap-2">
              <Sparkles className={`h-4 w-4 ${busy ? "animate-pulse" : ""}`} />
              Reclusterizar (embeddings)
            </Button>
            <Button onClick={runRepair} disabled={busy} className="gap-2">
              <RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} />
              Ressincronizar agora
            </Button>
          </div>
        </header>

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
            {drift === 0 ? (
              <>
                <CheckCircle2 className="h-8 w-8 text-emerald-600" />
                <div>
                  <div className="text-xs uppercase font-bold text-muted-foreground">Estado</div>
                  <div className="text-lg font-black">Sincronizado</div>
                </div>
              </>
            ) : (
              <>
                <AlertTriangle className="h-8 w-8 text-amber-600" />
                <div>
                  <div className="text-xs uppercase font-bold text-muted-foreground">Estado</div>
                  <div className="text-lg font-black">{drift} divergência(s)</div>
                </div>
              </>
            )}
          </div>
        </div>

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
                    <td className="px-3 py-2 whitespace-nowrap">
                      {new Date(row.created_at).toLocaleString("pt-BR")}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{row.event_type}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-bold ${
                          row.status === "ok"
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-red-100 text-red-800"
                        }`}
                      >
                        {row.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {row.error ?? JSON.stringify(row.details ?? {})}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </AdminLayout>
  );
}
