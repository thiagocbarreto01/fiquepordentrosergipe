/**
 * PublishDialog — diálogo unificado de publicação com checklist.
 *
 * Bloqueios (obrigatórios): título, categoria, conteúdo, capa*, plantão válido, fixação válida.
 *   *capa: editor/admin pode confirmar exceção editorial.
 * Avisos (não bloqueantes): subtítulo, legenda, crédito, tags, texto curto, SEO incompleto.
 *
 * O diálogo:
 *  - não fecha durante o envio (submitting=true trava close/Escape);
 *  - desabilita o botão principal enquanto envia (impede duplo clique real);
 *  - só permite publicar quando não houver bloqueios OU quando editor/admin marcar exceção de capa.
 */

import { useMemo, useState, useEffect } from "react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { getContentQuality } from "@/lib/contentQuality";

export type PublishFormSnapshot = {
  title?: string | null;
  subtitle?: string | null;
  category_id?: string | null;
  content?: string | null;
  cover_image_url?: string | null;
  manual_image_url?: string | null;
  image_caption?: string | null;
  image_credit?: string | null;
  tags?: string | string[] | null;
  meta_title?: string | null;
  meta_description?: string | null;
  is_urgent?: boolean;
  home_expires_at?: string | null;
  is_pinned?: boolean;
  pinned_until?: string | null;
  pinned_reason?: string | null;
};

type Checklist = { missing: string[]; warnings: string[] };

export function computeChecklist(form: PublishFormSnapshot): Checklist {
  const missing: string[] = [];
  const warnings: string[] = [];

  if (!form.title?.trim()) missing.push("Título");
  if (!form.category_id) missing.push("Categoria");

  const text = (form.content || "").replace(/<[^>]+>/g, " ").trim();
  if (!text) missing.push("Conteúdo");

  const hasCover = !!(form.cover_image_url?.trim() || form.manual_image_url?.trim());
  if (!hasCover) missing.push("Imagem de capa");

  // Plantão precisa ter validade futura obrigatória
  if (form.is_urgent) {
    const exp = form.home_expires_at ? new Date(form.home_expires_at) : null;
    if (!exp || isNaN(exp.getTime()) || exp.getTime() <= Date.now()) {
      missing.push("Plantão exige validade futura");
    }
  }

  // Fixação: até 24h e com motivo
  if (form.is_pinned) {
    const until = form.pinned_until ? new Date(form.pinned_until) : null;
    if (!until || isNaN(until.getTime()) || until.getTime() <= Date.now()) {
      missing.push("Fixação exige data futura");
    } else if (until.getTime() - Date.now() > 24 * 3600 * 1000) {
      missing.push("Fixação limitada a 24 horas");
    }
    if (!form.pinned_reason?.trim()) missing.push("Motivo da fixação");
  }

  // Avisos
  if (!form.subtitle?.trim()) warnings.push("Subtítulo vazio");
  if (!form.image_caption?.trim()) warnings.push("Legenda da imagem vazia");
  if (!form.image_credit?.trim()) warnings.push("Crédito da imagem vazio");
  const tagsStr = Array.isArray(form.tags) ? form.tags.join(",") : (form.tags || "");
  if (!tagsStr.trim()) warnings.push("Nenhuma tag");
  const q = getContentQuality(form.content || "");
  if (q.level === "curto") warnings.push(`Texto curto (${q.chars} caracteres)`);
  if (!form.meta_title?.trim() || !form.meta_description?.trim())
    warnings.push("SEO incompleto (será preenchido automaticamente se possível)");

  return { missing, warnings };
}

export function PublishDialog({
  open, onOpenChange, form, canOverrideCover, submitting, onConfirm,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  form: PublishFormSnapshot;
  /** Editor/admin pode dispensar a obrigatoriedade da capa. */
  canOverrideCover: boolean;
  submitting: boolean;
  onConfirm: () => void;
}) {
  const [overrideCover, setOverrideCover] = useState(false);
  useEffect(() => { if (open) setOverrideCover(false); }, [open]);

  const checklist = useMemo(() => computeChecklist(form), [form]);

  // Se a única pendência bloqueante é a capa e o editor/admin marcou a exceção → libera.
  const missingWithoutCover = checklist.missing.filter((m) => m !== "Imagem de capa");
  const coverIsOnlyBlocker =
    checklist.missing.includes("Imagem de capa") && missingWithoutCover.length === 0;
  const blocked = overrideCover && coverIsOnlyBlocker
    ? false
    : checklist.missing.length > 0;

  return (
    <AlertDialog open={open} onOpenChange={(o) => { if (submitting && !o) return; onOpenChange(o); }}>
      <AlertDialogContent className="max-w-lg" onEscapeKeyDown={(e) => submitting && e.preventDefault()}>
        <AlertDialogHeader>
          <AlertDialogTitle>Publicar notícia</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-sm">
              <p>A notícia ficará visível publicamente na Home e no portal assim que confirmada.</p>

              {checklist.missing.length > 0 && (
                <div className="border border-red-200 bg-red-50 p-2 rounded-sm">
                  <p className="text-[11px] uppercase font-bold tracking-wider text-red-800">Obrigatórios ausentes</p>
                  <ul className="list-disc list-inside text-xs text-red-800 mt-1 space-y-0.5">
                    {checklist.missing.map((m) => <li key={m}>{m}</li>)}
                  </ul>
                  {coverIsOnlyBlocker && canOverrideCover && (
                    <label className="flex items-start gap-2 mt-3 pt-2 border-t border-red-200 text-xs text-red-900 cursor-pointer">
                      <Checkbox
                        checked={overrideCover}
                        onCheckedChange={(v) => setOverrideCover(!!v)}
                        className="mt-0.5"
                        disabled={submitting}
                      />
                      <span>
                        <strong>Exceção editorial:</strong> publicar sem imagem de capa.
                        Só marque quando a matéria justificar (nota curta, alerta, etc.).
                      </span>
                    </label>
                  )}
                </div>
              )}

              {checklist.warnings.length > 0 && (
                <div className="border border-amber-200 bg-amber-50 p-2 rounded-sm">
                  <p className="text-[11px] uppercase font-bold tracking-wider text-amber-800">Avisos</p>
                  <ul className="list-disc list-inside text-xs text-amber-800 mt-1 space-y-0.5">
                    {checklist.warnings.map((w) => <li key={w}>{w}</li>)}
                  </ul>
                </div>
              )}

              <div className="border border-dashed border-border p-2 rounded-sm text-xs text-muted-foreground">
                <strong>Agendamento:</strong> Agendamento automático será ativado
                após a configuração segura do serviço. Enquanto isso, use “Publicar agora”.
              </div>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={submitting}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            disabled={submitting || blocked}
            onClick={(e) => { e.preventDefault(); if (!blocked && !submitting) onConfirm(); }}
            className="bg-emerald-600 hover:bg-emerald-700 focus:ring-emerald-600 text-white"
          >
            {submitting ? "Publicando…" : "Publicar agora"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
