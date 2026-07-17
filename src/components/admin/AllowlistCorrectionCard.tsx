import { useState } from "react";
import { Wrench, PlayCircle, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

type ApplyPreview = {
  dry_run: true;
  request_id: string;
  planned_inserts: Array<{
    source_id: string;
    source_name: string;
    hostname: string;
    purpose: string;
    allow_subdomains: boolean;
  }>;
  existing_conflicts: Array<{ value?: unknown } | Record<string, unknown>>;
  source_update: {
    source_id: string;
    before: { url: string; source_type: string };
    after: { url: string; source_type: string };
    changes: number;
  };
  projected_inserted_count: number;
  projected_conflict_count: number;
  projected_updated_sources_count: number;
  rollback_snapshot: unknown;
};

type ApplyResult = {
  success: boolean;
  dry_run: false;
  batch_id: string;
  inserted_count: number;
  conflict_count: number;
  updated_sources_count: number;
  status: string;
  request_id: string;
};

type RemovePreview = {
  dry_run: true;
  request_id: string;
  legacy_host_present: boolean;
  new_host_present: boolean;
  will_remove: boolean;
  planned_removal: { source_id: string; hostname: string; purpose: string };
};

type RemoveResult = {
  success: boolean;
  dry_run: false;
  batch_id: string;
  removed_count: number;
  status: string;
  request_id: string;
};

interface Props {
  onDone?: () => void | Promise<void>;
}

export default function AllowlistCorrectionCard({ onDone }: Props) {
  const { toast } = useToast();
  const { isAdmin } = useAuth();
  const [applyPreview, setApplyPreview] = useState<ApplyPreview | null>(null);
  const [applyOpen, setApplyOpen] = useState(false);
  const [applying, setApplying] = useState(false);

  const [removePreview, setRemovePreview] = useState<RemovePreview | null>(null);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [removing, setRemoving] = useState(false);

  if (!isAdmin) return null;

  async function openApplyPreview() {
    try {
      const { data, error } = await supabase.rpc(
        "admin_apply_correction_f3d2d",
        { _dry_run: true },
      );
      if (error) throw error;
      setApplyPreview(data as unknown as ApplyPreview);
      setApplyOpen(true);
    } catch (err) {
      toast({
        title: "Falha na prévia da correção",
        description: err instanceof Error ? err.message : "Erro desconhecido",
        variant: "destructive",
      });
    }
  }

  async function runApply() {
    if (applying) return;
    setApplying(true);
    try {
      const { data, error } = await supabase.rpc(
        "admin_apply_correction_f3d2d",
        { _dry_run: false },
      );
      if (error) throw error;
      const res = data as unknown as ApplyResult;
      if (!res?.success || !res?.batch_id) {
        toast({
          title: "Resposta inesperada da correção",
          description: "Nada foi confirmado. Recarregue e verifique.",
          variant: "destructive",
        });
        return;
      }
      toast({
        title: "Correção F3D.2D aplicada",
        description: `Lote ${res.batch_id.slice(0, 8)}… • inseridos: ${res.inserted_count} • fonte atualizada: ${res.updated_sources_count}`,
      });
      setApplyOpen(false);
      setApplyPreview(null);
      await onDone?.();
    } catch (err) {
      toast({
        title: "Falha ao aplicar correção",
        description: err instanceof Error ? err.message : "Erro desconhecido",
        variant: "destructive",
      });
    } finally {
      setApplying(false);
    }
  }

  async function openRemovePreview() {
    try {
      const { data, error } = await supabase.rpc(
        "admin_remove_legacy_tjse_host",
        { _dry_run: true },
      );
      if (error) throw error;
      setRemovePreview(data as unknown as RemovePreview);
      setRemoveOpen(true);
    } catch (err) {
      toast({
        title: "Falha na prévia da remoção",
        description: err instanceof Error ? err.message : "Erro desconhecido",
        variant: "destructive",
      });
    }
  }

  async function runRemove() {
    if (removing) return;
    setRemoving(true);
    try {
      const { data, error } = await supabase.rpc(
        "admin_remove_legacy_tjse_host",
        { _dry_run: false },
      );
      if (error) throw error;
      const res = data as unknown as RemoveResult;
      if (!res?.success || !res?.batch_id) {
        toast({
          title: "Resposta inesperada da remoção",
          description: "Nada foi confirmado. Recarregue e verifique.",
          variant: "destructive",
        });
        return;
      }
      toast({
        title: "Host antigo removido",
        description: `Lote ${res.batch_id.slice(0, 8)}… • removidos: ${res.removed_count}`,
      });
      setRemoveOpen(false);
      setRemovePreview(null);
      await onDone?.();
    } catch (err) {
      toast({
        title: "Falha ao remover host antigo",
        description: err instanceof Error ? err.message : "Erro desconhecido",
        variant: "destructive",
      });
    } finally {
      setRemoving(false);
    }
  }

  const canRemove = removePreview?.legacy_host_present && removePreview?.new_host_present;

  return (
    <Card className="border-amber-300 bg-amber-50/40 dark:bg-amber-950/10">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Wrench className="h-4 w-4 text-amber-700" />
          Correções controladas (F3D.2D)
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Conjunto fechado de mudanças administrativas para Metrópoles e TJSE.
          Cada botão exige prévia + confirmação explícita. Nenhuma captação é
          executada; nenhum switch is_active é alterado.
        </p>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        <Button onClick={openApplyPreview} className="min-h-[44px]" data-testid="btn-preview-f3d2d">
          <PlayCircle className="h-4 w-4 mr-2" />
          Aplicar correção Metrópoles + TJSE
        </Button>
        <Button
          variant="outline"
          onClick={openRemovePreview}
          className="min-h-[44px]"
          data-testid="btn-preview-remove-legacy"
        >
          <AlertTriangle className="h-4 w-4 mr-2" />
          Remover host antigo do TJSE
        </Button>
      </CardContent>

      {/* Dialog: apply correction */}
      <AlertDialog
        open={applyOpen}
        onOpenChange={(o) => {
          if (applying) return;
          setApplyOpen(o);
        }}
      >
        <AlertDialogContent className="max-w-xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Prévia da correção F3D.2D</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm">
                <p>Nada foi gravado ainda. Confira o que será feito:</p>
                {applyPreview && (
                  <>
                    <div>
                      <div className="font-semibold text-xs uppercase text-muted-foreground mb-1">
                        Hosts a inserir ({applyPreview.projected_inserted_count})
                      </div>
                      <ul className="font-mono text-xs space-y-1">
                        {applyPreview.planned_inserts.map((p) => (
                          <li key={`${p.source_id}-${p.hostname}-${p.purpose}`}>
                            + {p.source_name} → <strong>{p.hostname}</strong> /{" "}
                            {p.purpose} / allow_subdomains={String(p.allow_subdomains)}
                          </li>
                        ))}
                      </ul>
                      {applyPreview.projected_conflict_count > 0 && (
                        <div className="text-xs text-amber-700 mt-1">
                          {applyPreview.projected_conflict_count} já existente(s); não serão duplicados.
                        </div>
                      )}
                    </div>
                    <div>
                      <div className="font-semibold text-xs uppercase text-muted-foreground mb-1">
                        Atualização da fonte TJSE
                      </div>
                      <div className="text-xs font-mono">
                        url: {applyPreview.source_update.before.url}
                        <br />→ {applyPreview.source_update.after.url}
                      </div>
                      <div className="text-xs font-mono">
                        source_type: {applyPreview.source_update.before.source_type}{" "}
                        → {applyPreview.source_update.after.source_type}
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      request_id: {applyPreview.request_id}
                    </p>
                  </>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={applying}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={runApply} disabled={applying}>
              {applying ? "Aplicando…" : "Confirmar aplicação"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog: remove legacy host */}
      <AlertDialog
        open={removeOpen}
        onOpenChange={(o) => {
          if (removing) return;
          setRemoveOpen(o);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover hostname antigo e não utilizado do TJSE?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                {removePreview && (
                  <ul className="text-xs space-y-1">
                    <li>
                      Host legado presente:{" "}
                      <strong>{String(removePreview.legacy_host_present)}</strong>
                    </li>
                    <li>
                      Novo host presente:{" "}
                      <strong>{String(removePreview.new_host_present)}</strong>
                    </li>
                    <li>
                      Alvo:{" "}
                      <code className="font-mono">
                        {removePreview.planned_removal.hostname} /{" "}
                        {removePreview.planned_removal.purpose}
                      </code>
                    </li>
                    <li>request_id: {removePreview.request_id}</li>
                  </ul>
                )}
                <p className="text-xs text-muted-foreground">
                  A remoção só é executada se o novo host{" "}
                  <code>agencia.tjse.jus.br/feed</code> estiver presente.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removing}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={runRemove}
              disabled={removing || !canRemove}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {removing ? "Removendo…" : "Confirmar remoção"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
