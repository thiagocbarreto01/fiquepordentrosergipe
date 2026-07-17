/**
 * AdminPostDialogs — diálogos profissionais que substituem window.confirm.
 *
 * Cada componente exporta um AlertDialog controlado. Todos:
 *  - travam o botão de confirmação enquanto submitting=true;
 *  - não fecham durante execução;
 *  - mostram mensagens em PT-BR;
 *  - respeitam o foco (AlertDialog do Radix já isola foco).
 */

import { useEffect, useState } from "react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

// ---------------- Excluir ----------------

export function DeletePostDialog({
  open, onOpenChange, title, submitting, onConfirm,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  submitting: boolean;
  onConfirm: () => void;
}) {
  const [typed, setTyped] = useState("");
  useEffect(() => { if (open) setTyped(""); }, [open]);

  const canConfirm = typed.trim().toUpperCase() === "EXCLUIR" && !submitting;

  return (
    <AlertDialog open={open} onOpenChange={(o) => { if (submitting && !o) return; onOpenChange(o); }}>
      <AlertDialogContent onEscapeKeyDown={(e) => submitting && e.preventDefault()}>
        <AlertDialogHeader>
          <AlertDialogTitle>Excluir notícia permanentemente</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-sm">
              <p className="font-medium text-foreground">{title}</p>
              <p><strong>Esta ação é irreversível.</strong> O registro será removido do banco de dados.</p>
              <p className="text-amber-700">O link público desta notícia poderá quebrar em qualquer lugar onde tenha sido compartilhado.</p>
              <p>Para confirmar, digite <strong>EXCLUIR</strong> no campo abaixo.</p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="my-2">
          <Input
            autoFocus
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder="Digite EXCLUIR"
            aria-label="Confirmação de exclusão"
            disabled={submitting}
            className="uppercase"
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={submitting}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            disabled={!canConfirm}
            onClick={(e) => { e.preventDefault(); if (canConfirm) onConfirm(); }}
            className="bg-red-600 hover:bg-red-700 focus:ring-red-600 text-white disabled:opacity-50"
          >
            {submitting ? "Excluindo…" : "Excluir permanentemente"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ---------------- Arquivar (individual) ----------------

export function ArchivePostDialog({
  open, onOpenChange, title, submitting, onConfirm,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  submitting: boolean;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={(o) => { if (submitting && !o) return; onOpenChange(o); }}>
      <AlertDialogContent onEscapeKeyDown={(e) => submitting && e.preventDefault()}>
        <AlertDialogHeader>
          <AlertDialogTitle>Arquivar notícia</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-sm">
              <p className="font-medium text-foreground">{title}</p>
              <p>A notícia sairá das listagens administrativas padrão e da Home pública.</p>
              <p className="text-emerald-700">Esta ação é <strong>reversível</strong> — você pode restaurá-la depois.</p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={submitting}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            disabled={submitting}
            onClick={(e) => { e.preventDefault(); onConfirm(); }}
          >
            {submitting ? "Arquivando…" : "Arquivar"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ---------------- Restaurar ----------------

export function RestorePostDialog({
  open, onOpenChange, title, submitting, onConfirm,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  submitting: boolean;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={(o) => { if (submitting && !o) return; onOpenChange(o); }}>
      <AlertDialogContent onEscapeKeyDown={(e) => submitting && e.preventDefault()}>
        <AlertDialogHeader>
          <AlertDialogTitle>Restaurar notícia</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-sm">
              <p className="font-medium text-foreground">{title}</p>
              <p>A notícia voltará para o status anterior ao arquivamento (ou <em>Em revisão</em>, se não houver histórico).</p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={submitting}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            disabled={submitting}
            onClick={(e) => { e.preventDefault(); onConfirm(); }}
          >
            {submitting ? "Restaurando…" : "Restaurar"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ---------------- Arquivar em lote ----------------

export function ArchiveBatchDialog({
  open, onOpenChange, count, sampleTitles, submitting, onConfirm,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  count: number;
  sampleTitles: string[];
  submitting: boolean;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={(o) => { if (submitting && !o) return; onOpenChange(o); }}>
      <AlertDialogContent onEscapeKeyDown={(e) => submitting && e.preventDefault()}>
        <AlertDialogHeader>
          <AlertDialogTitle>Arquivar {count} notícia{count === 1 ? "" : "s"} selecionada{count === 1 ? "" : "s"}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-sm">
              <p>Você está prestes a arquivar <strong>{count}</strong> notícia{count === 1 ? "" : "s"}. A ação é reversível.</p>
              {sampleTitles.length > 0 && (
                <div>
                  <p className="text-[11px] uppercase font-bold tracking-wider text-muted-foreground mt-2">Amostra:</p>
                  <ul className="list-disc list-inside text-xs mt-1 max-h-32 overflow-y-auto">
                    {sampleTitles.slice(0, 5).map((t, i) => <li key={i} className="truncate">{t}</li>)}
                  </ul>
                  {count > sampleTitles.length && (
                    <p className="text-[11px] text-muted-foreground mt-1">
                      … e mais {count - sampleTitles.length}
                    </p>
                  )}
                </div>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={submitting}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            disabled={submitting}
            onClick={(e) => { e.preventDefault(); onConfirm(); }}
          >
            {submitting ? "Arquivando…" : `Arquivar ${count}`}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ---------------- Aprovar / Publicar / Despublicar ----------------

export type StatusKind = "aprovada" | "publicada" | "em_revisao";

const STATUS_COPY: Record<StatusKind, { title: string; verb: string; body: string }> = {
  aprovada: { title: "Aprovar notícia", verb: "Aprovar", body: "A notícia ficará pronta para publicação." },
  publicada: { title: "Publicar notícia", verb: "Publicar", body: "A notícia ficará visível publicamente na Home e no portal." },
  em_revisao: { title: "Despublicar notícia", verb: "Despublicar", body: "A notícia sairá do portal público e voltará para Em revisão." },
};

export function StatusChangeDialog({
  open, onOpenChange, title, kind, checklist, submitting, onConfirm,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  kind: StatusKind;
  checklist: { missing: string[]; warnings: string[] };
  submitting: boolean;
  onConfirm: () => void;
}) {
  const copy = STATUS_COPY[kind];
  const blocked = kind !== "em_revisao" && checklist.missing.length > 0;

  return (
    <AlertDialog open={open} onOpenChange={(o) => { if (submitting && !o) return; onOpenChange(o); }}>
      <AlertDialogContent onEscapeKeyDown={(e) => submitting && e.preventDefault()}>
        <AlertDialogHeader>
          <AlertDialogTitle>{copy.title}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-sm">
              <p className="font-medium text-foreground">{title}</p>
              <p>{copy.body}</p>

              {checklist.missing.length > 0 && (
                <div className="border border-red-200 bg-red-50 p-2 rounded-sm">
                  <p className="text-[11px] uppercase font-bold tracking-wider text-red-800">Obrigatórios ausentes</p>
                  <ul className="list-disc list-inside text-xs text-red-800 mt-1">
                    {checklist.missing.map((m, i) => <li key={i}>{m}</li>)}
                  </ul>
                </div>
              )}
              {checklist.warnings.length > 0 && (
                <div className="border border-amber-200 bg-amber-50 p-2 rounded-sm">
                  <p className="text-[11px] uppercase font-bold tracking-wider text-amber-800">Avisos</p>
                  <ul className="list-disc list-inside text-xs text-amber-800 mt-1">
                    {checklist.warnings.map((w, i) => <li key={i}>{w}</li>)}
                  </ul>
                </div>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={submitting}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            disabled={submitting || blocked}
            onClick={(e) => { e.preventDefault(); if (!blocked) onConfirm(); }}
            className={kind === "publicada" ? "bg-emerald-600 hover:bg-emerald-700 text-white" : undefined}
          >
            {submitting ? `${copy.verb}…` : copy.verb}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ---------------- Reclassificar por IA ----------------

export function ReclassifyDialog({
  open, onOpenChange, submitting, onConfirm,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  submitting: boolean;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={(o) => { if (submitting && !o) return; onOpenChange(o); }}>
      <AlertDialogContent onEscapeKeyDown={(e) => submitting && e.preventDefault()}>
        <AlertDialogHeader>
          <AlertDialogTitle>Reclassificar categorias por IA</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-sm">
              <p>A IA analisará notícias recentes e ajustará suas categorias com base nos critérios atualizados.</p>
              <p className="text-amber-700"><strong>Atenção:</strong> essa operação consome créditos da IA. Execute apenas quando necessário.</p>
              <p className="text-muted-foreground text-xs">Nada será executado ao abrir esta tela. A execução ocorre somente ao confirmar.</p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={submitting}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            disabled={submitting}
            onClick={(e) => { e.preventDefault(); onConfirm(); }}
          >
            {submitting ? "Reclassificando…" : "Reclassificar"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ---------------- Arquivamento automático (dry-run + confirmação) ----------------

export type AutoArchivePreview = {
  total: number;
  by_rule: Record<string, number>;
  sample: { id: string; title: string; status: string; updated_at: string }[];
  generated_at: string;
  reference_tz: string;
};

const RULE_LABEL: Record<string, string> = {
  captada_30d: "Captadas há mais de 30 dias",
  duplicada_15d: "Duplicadas há mais de 15 dias",
  rejeitada_15d: "Rejeitadas há mais de 15 dias",
  em_revisao_60d: "Em revisão há mais de 60 dias",
};

export function AutoArchiveDialog({
  open, onOpenChange, preview, previousTotal, loadingPreview,
  submitting, onReview, onConfirm,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  preview: AutoArchivePreview | null;
  previousTotal: number | null;
  loadingPreview: boolean;
  submitting: boolean;
  onReview: () => void;
  onConfirm: () => void;
}) {
  const changed = previousTotal !== null && preview !== null && preview.total !== previousTotal;

  return (
    <AlertDialog open={open} onOpenChange={(o) => { if (submitting && !o) return; onOpenChange(o); }}>
      <AlertDialogContent className="max-w-lg" onEscapeKeyDown={(e) => submitting && e.preventDefault()}>
        <AlertDialogHeader>
          <AlertDialogTitle>Arquivamento automático</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-sm">
              {loadingPreview && <p>Calculando prévia…</p>}

              {!loadingPreview && preview && (
                <>
                  <p>
                    Serão arquivadas <strong>{preview.total}</strong> notícia{preview.total === 1 ? "" : "s"} conforme os critérios abaixo.
                  </p>

                  <div className="border border-border rounded-sm bg-secondary/40 p-2">
                    <p className="text-[11px] uppercase font-bold tracking-wider text-muted-foreground mb-1">Critérios</p>
                    <ul className="text-xs space-y-0.5">
                      {Object.entries(preview.by_rule).map(([k, v]) => (
                        <li key={k} className="flex justify-between">
                          <span>{RULE_LABEL[k] || k}</span>
                          <span className="font-bold">{v as number}</span>
                        </li>
                      ))}
                    </ul>
                    <p className="text-[11px] text-muted-foreground mt-2">
                      Horário de referência: {new Date(preview.generated_at).toLocaleString("pt-BR", { timeZone: "America/Maceio" })} ({preview.reference_tz})
                    </p>
                  </div>

                  {preview.sample.length > 0 && (
                    <div>
                      <p className="text-[11px] uppercase font-bold tracking-wider text-muted-foreground mt-2">5 mais antigas</p>
                      <ul className="list-disc list-inside text-xs mt-1 max-h-32 overflow-y-auto">
                        {preview.sample.map((s) => (
                          <li key={s.id} className="truncate">
                            {s.title}
                            <span className="text-muted-foreground"> — {s.status}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {changed && (
                    <div className="border-2 border-amber-400 bg-amber-50 p-2 rounded-sm">
                      <p className="text-[11px] uppercase font-bold tracking-wider text-amber-900">Contagem mudou</p>
                      <p className="text-xs text-amber-900 mt-1">
                        Prévia anterior: <strong>{previousTotal}</strong> → Agora: <strong>{preview.total}</strong>.
                        Revise antes de continuar.
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-wrap gap-2">
          <AlertDialogCancel disabled={submitting}>Cancelar</AlertDialogCancel>
          <Button variant="outline" onClick={onReview} disabled={submitting || loadingPreview}>
            Revisar novamente
          </Button>
          <AlertDialogAction
            disabled={submitting || loadingPreview || !preview || preview.total === 0 || changed}
            onClick={(e) => { e.preventDefault(); onConfirm(); }}
          >
            {submitting ? "Arquivando…" : preview ? `Arquivar ${preview.total} matéria${preview.total === 1 ? "" : "s"}` : "Arquivar"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
