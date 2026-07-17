/**
 * PublishDialog — diálogo unificado de publicação com checklist.
 *
 * Modos (para editor/admin):
 *  - "Publicar agora" — chama onConfirm() e vira publicada.
 *  - "Agendar publicação" — chama onSchedule(iso) → RPC schedule_post.
 *
 * Redator: apenas o modo "publicar" (sem botão de agendar) — mas o RLS/RPC
 * também bloqueia caso a UI seja contornada.
 *
 * Bloqueios: título, categoria, conteúdo, capa (com exceção editorial),
 * plantão válido, fixação válida.
 */

import { useMemo, useState, useEffect } from "react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

  if (form.is_urgent) {
    const exp = form.home_expires_at ? new Date(form.home_expires_at) : null;
    if (!exp || isNaN(exp.getTime()) || exp.getTime() <= Date.now()) {
      missing.push("Plantão exige validade futura");
    }
  }

  if (form.is_pinned) {
    const until = form.pinned_until ? new Date(form.pinned_until) : null;
    if (!until || isNaN(until.getTime()) || until.getTime() <= Date.now()) {
      missing.push("Fixação exige data futura");
    } else if (until.getTime() - Date.now() > 24 * 3600 * 1000) {
      missing.push("Fixação limitada a 24 horas");
    }
    if (!form.pinned_reason?.trim()) missing.push("Motivo da fixação");
  }

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

const MACEIO_TZ = "America/Maceio";
function formatMaceio(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString("pt-BR", {
      timeZone: MACEIO_TZ,
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch { return iso; }
}

export function PublishDialog({
  open, onOpenChange, form, canOverrideCover, canSchedule = false,
  submitting, onConfirm, onSchedule,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  form: PublishFormSnapshot;
  canOverrideCover: boolean;
  /** editor/admin vê "Agendar publicação"; redator não. */
  canSchedule?: boolean;
  submitting: boolean;
  onConfirm: () => void;
  onSchedule?: (isoUtc: string) => void | Promise<void>;
}) {
  const [overrideCover, setOverrideCover] = useState(false);
  const [mode, setMode] = useState<"now" | "schedule">("now");
  const [scheduleLocal, setScheduleLocal] = useState<string>("");

  useEffect(() => {
    if (open) {
      setOverrideCover(false);
      setMode("now");
      // sugestão default: agora + 1h, em horário local
      const d = new Date(Date.now() + 60 * 60 * 1000);
      const pad = (n: number) => String(n).padStart(2, "0");
      setScheduleLocal(
        `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
      );
    }
  }, [open]);

  const checklist = useMemo(() => computeChecklist(form), [form]);

  const missingWithoutCover = checklist.missing.filter((m) => m !== "Imagem de capa");
  const coverIsOnlyBlocker =
    checklist.missing.includes("Imagem de capa") && missingWithoutCover.length === 0;
  const contentBlocked = overrideCover && coverIsOnlyBlocker
    ? false
    : checklist.missing.length > 0;

  const scheduleIso = useMemo(() => {
    if (!scheduleLocal) return null;
    const d = new Date(scheduleLocal);
    if (isNaN(d.getTime())) return null;
    return d.toISOString();
  }, [scheduleLocal]);

  const scheduleTooEarly = useMemo(() => {
    if (!scheduleIso) return true;
    return new Date(scheduleIso).getTime() < Date.now() + 60_000;
  }, [scheduleIso]);

  const isSchedule = mode === "schedule" && canSchedule;
  const actionBlocked =
    submitting ||
    contentBlocked ||
    (isSchedule && (!scheduleIso || scheduleTooEarly));

  const actionLabel = isSchedule
    ? (submitting ? "Agendando…" : "Agendar publicação")
    : (submitting ? "Publicando…" : "Publicar agora");

  return (
    <AlertDialog open={open} onOpenChange={(o) => { if (submitting && !o) return; onOpenChange(o); }}>
      <AlertDialogContent className="max-w-lg" onEscapeKeyDown={(e) => submitting && e.preventDefault()}>
        <AlertDialogHeader>
          <AlertDialogTitle>Publicar notícia</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-sm">
              <p>A notícia ficará visível publicamente na Home e no portal.</p>

              {canSchedule && (
                <div className="flex items-center gap-2 rounded-sm border border-border p-1 text-xs">
                  <button
                    type="button"
                    onClick={() => setMode("now")}
                    disabled={submitting}
                    className={`flex-1 py-2 min-h-[36px] font-bold uppercase tracking-wider rounded-sm ${
                      mode === "now" ? "bg-emerald-600 text-white" : "hover:bg-secondary"
                    }`}
                  >
                    Publicar agora
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode("schedule")}
                    disabled={submitting}
                    className={`flex-1 py-2 min-h-[36px] font-bold uppercase tracking-wider rounded-sm ${
                      mode === "schedule" ? "bg-blue-600 text-white" : "hover:bg-secondary"
                    }`}
                  >
                    Agendar
                  </button>
                </div>
              )}

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

              {isSchedule && (
                <div className="rounded-sm border border-blue-200 bg-blue-50 p-2 space-y-2">
                  <Label className="text-[11px] uppercase font-bold tracking-wider text-blue-900">
                    Data e hora da publicação
                  </Label>
                  <Input
                    type="datetime-local"
                    value={scheduleLocal}
                    onChange={(e) => setScheduleLocal(e.target.value)}
                    disabled={submitting}
                    min={(() => {
                      const d = new Date(Date.now() + 60_000);
                      const pad = (n: number) => String(n).padStart(2, "0");
                      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
                    })()}
                    className="bg-white"
                  />
                  {scheduleIso && !scheduleTooEarly && (
                    <p className="text-[11px] text-blue-900">
                      Será publicada em <strong>{formatMaceio(scheduleIso)}</strong>{" "}
                      (horário de Maceió).
                    </p>
                  )}
                  {scheduleTooEarly && (
                    <p className="text-[11px] text-red-700">
                      Escolha uma data futura (pelo menos 1 minuto).
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
            disabled={actionBlocked}
            onClick={(e) => {
              e.preventDefault();
              if (actionBlocked) return;
              if (isSchedule && scheduleIso && onSchedule) {
                void onSchedule(scheduleIso);
              } else {
                onConfirm();
              }
            }}
            className={
              isSchedule
                ? "bg-blue-600 hover:bg-blue-700 focus:ring-blue-600 text-white"
                : "bg-emerald-600 hover:bg-emerald-700 focus:ring-emerald-600 text-white"
            }
          >
            {actionLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
