import { type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Loader2,
  Globe,
  Eye,
  Save,
  MoreVertical,
  CalendarClock,
  History as HistoryIcon,
  Send,
  CheckCircle2,
  ArchiveRestore,
  ExternalLink,
} from "lucide-react";
import { STATUS_LABEL, STATUS_COLOR, type EditorialStatus } from "@/lib/statusFlow";
import {
  getPrimaryAction,
  getSecondaryActions,
  type EditorRole,
  type EditorPrimaryActionKind,
  type EditorSecondaryActionKind,
} from "@/lib/editorActions";

export type PublicationSaveState =
  | { kind: "idle" }
  | { kind: "dirty" }
  | { kind: "local"; at: Date }
  | { kind: "saving" }
  | { kind: "saved"; at: Date }
  | { kind: "error"; message: string };

export interface EditorPublicationPanelProps {
  role: EditorRole;
  status: EditorialStatus;
  isNew: boolean;
  saving: boolean;
  saveState: PublicationSaveState;
  lastServerSavedAt: Date | null;

  // Plantão
  isUrgent: boolean;
  urgentValidUntil: string;
  onToggleUrgent: (v: boolean) => void;
  onUrgentValidUntilChange: (iso: string) => void;

  // Denúncia
  isDenuncia: boolean;
  onToggleDenuncia: (v: boolean) => void;

  // Agendamento
  scheduledAt: string;                 // ISO se agendada, "" caso contrário
  onCancelSchedule?: () => void;
  cancellingSchedule?: boolean;

  // Fixação (renderizada pelo pai para evitar duplicação)
  pinningSlot?: ReactNode;

  // Histórico opcional
  history?: Array<{
    from_status: string | null;
    to_status: string;
    created_at: string;
  }>;
  normalizeStatus: (s: string | null | undefined) => EditorialStatus;

  // Ações
  onAction: (kind: EditorPrimaryActionKind | EditorSecondaryActionKind) => void;
}

function SaveStateBadge({ state }: { state: PublicationSaveState }) {
  let text: ReactNode;
  let cls = "text-muted-foreground";
  switch (state.kind) {
    case "idle":
      text = "Sem alterações";
      break;
    case "dirty":
      text = "Alterações não salvas";
      cls = "text-blue-700 dark:text-blue-400";
      break;
    case "local":
      text = (
        <>
          Rascunho local salvo às{" "}
          {state.at.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
        </>
      );
      cls = "text-blue-700 dark:text-blue-400";
      break;
    case "saving":
      text = (
        <>
          <Loader2 className="inline h-3 w-3 animate-spin mr-1" /> Salvando…
        </>
      );
      cls = "text-amber-700 dark:text-amber-400";
      break;
    case "saved":
      text = (
        <>
          <CheckCircle2 className="inline h-3 w-3 mr-1" />
          Salvo às {state.at.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
        </>
      );
      cls = "text-emerald-700 dark:text-emerald-400";
      break;
    case "error":
      text = <>Erro: {state.message}</>;
      cls = "text-destructive";
      break;
  }
  return (
    <p role="status" aria-live="polite" className={`text-[11px] leading-snug ${cls}`}>
      {text}
    </p>
  );
}

/**
 * Seção "4. Publicação".
 *
 * Fonte única de:
 *  - status e badge;
 *  - indicador de salvamento (local + servidor);
 *  - ação principal contextual por papel/status;
 *  - Plantão (checkbox + validade + presets);
 *  - Denúncia;
 *  - Agendamento (desabilitado nesta etapa);
 *  - Fixação temporária (renderizada pelo pai);
 *  - menu de ações secundárias.
 *
 * NÃO grava no banco, NÃO decide RLS. Apenas dispara `onAction`.
 */
export function EditorPublicationPanel({
  role,
  status,
  isNew,
  saving,
  saveState,
  lastServerSavedAt,
  isUrgent,
  urgentValidUntil,
  onToggleUrgent,
  onUrgentValidUntilChange,
  isDenuncia,
  onToggleDenuncia,
  scheduledAt,
  onCancelSchedule,
  cancellingSchedule,
  pinningSlot,
  history,
  normalizeStatus,
  onAction,
}: EditorPublicationPanelProps) {
  const primary = getPrimaryAction(role, status);
  const secondary = getSecondaryActions(role, status);

  const ICONS: Record<EditorPrimaryActionKind | EditorSecondaryActionKind, ReactNode> = {
    save: <Save className="h-4 w-4 mr-2" />,
    save_draft: <Save className="h-4 w-4 mr-2" />,
    submit_review: <Send className="h-4 w-4 mr-2" />,
    send_to_review: <Send className="h-4 w-4 mr-2" />,
    approve: <CheckCircle2 className="h-4 w-4 mr-2" />,
    publish: <Globe className="h-4 w-4 mr-2" />,
    preview: <Eye className="h-4 w-4 mr-2" />,
    unpublish: <ArchiveRestore className="h-4 w-4 mr-2" />,
    open_public: <ExternalLink className="h-4 w-4 mr-2" />,
  };

  const primaryClasses =
    primary.kind === "publish"
      ? "bg-emerald-600 hover:bg-emerald-700 text-white font-black"
      : "";

  return (
    <section
      aria-label="4. Publicação"
      className="bg-card border border-border p-4 space-y-4 shadow-sm rounded-md"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-bold uppercase tracking-wider text-xs">
            4. Publicação
          </h3>
          <p className="text-[11px] text-muted-foreground">
            Status, salvamento, plantão e ações finais.
          </p>
        </div>
        <span
          className={`px-2 py-0.5 text-[10px] font-bold uppercase border rounded-full ${STATUS_COLOR[status]}`}
        >
          {STATUS_LABEL[status]}
        </span>
      </div>

      <div className="space-y-1 border-t border-border pt-3">
        <SaveStateBadge state={saveState} />
        {lastServerSavedAt && (
          <p className="text-[11px] text-muted-foreground">
            Último salvamento no servidor:{" "}
            {lastServerSavedAt.toLocaleString("pt-BR", {
              day: "2-digit",
              month: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Button
          type="button"
          className={`w-full min-h-[44px] ${primaryClasses}`}
          disabled={saving}
          onClick={() => onAction(primary.kind)}
        >
          {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : ICONS[primary.kind]}
          {primary.label}
        </Button>

        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            className="flex-1 min-h-[44px]"
            onClick={() => onAction("preview")}
          >
            <Eye className="h-4 w-4 mr-2" /> Visualizar
          </Button>
          {primary.kind !== "save" && (
            <Button
              type="button"
              variant="outline"
              className="flex-1 min-h-[44px]"
              disabled={saving}
              onClick={() => onAction("save_draft")}
            >
              <Save className="h-4 w-4 mr-2" /> Salvar
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="outline"
                className="min-h-[44px] min-w-[44px]"
                aria-label="Mais ações"
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              {secondary.map((a, i) => (
                <div key={a.kind}>
                  {i > 0 && a.destructive && <DropdownMenuSeparator />}
                  <DropdownMenuItem
                    onSelect={() => onAction(a.kind)}
                    className={a.destructive ? "text-destructive" : ""}
                  >
                    {ICONS[a.kind]}
                    {a.label}
                  </DropdownMenuItem>
                </div>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="rounded-md border border-dashed border-border bg-secondary/40 p-3">
        <Label className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground flex items-center gap-1">
          <CalendarClock className="h-3 w-3" /> Publicação agendada
        </Label>
        <Input
          type="datetime-local"
          value={scheduledAt}
          disabled
          aria-disabled="true"
          readOnly
          className="mt-1 cursor-not-allowed opacity-60"
        />
        <p className="text-[11px] text-muted-foreground mt-1 leading-snug">
          Agendamento automático ainda não configurado. Enquanto isso, use{" "}
          <strong>Publicar agora</strong>.
        </p>
      </div>

      <div className="space-y-3 rounded-md border border-border bg-secondary/30 p-3">
        <p className="text-[10px] uppercase font-black tracking-widest text-muted-foreground">
          Plantão / Urgente
        </p>
        <label className="flex items-start gap-2 cursor-pointer">
          <Checkbox
            checked={isUrgent}
            onCheckedChange={(v) => onToggleUrgent(!!v)}
            className="mt-0.5"
            aria-label="Marcar como plantão urgente"
          />
          <span className="text-sm">
            <span className="font-bold text-red-700">Marcar como Plantão/Urgente</span>
            <span className="block text-xs text-muted-foreground">
              Aparece na faixa vermelha de Plantão no topo do site. Exige validade
              futura.
            </span>
          </span>
        </label>

        {isUrgent && (
          <div className="ml-6 space-y-2">
            <Label className="text-xs font-bold">Plantão válido até</Label>
            <Input
              type="datetime-local"
              value={urgentValidUntil}
              onChange={(e) => onUrgentValidUntilChange(e.target.value)}
            />
            <div className="grid grid-cols-4 gap-1.5">
              {[
                { label: "2h", h: 2 },
                { label: "4h", h: 4 },
                { label: "6h", h: 6 },
                { label: "12h", h: 12 },
              ].map((opt) => (
                <button
                  type="button"
                  key={opt.label}
                  onClick={() => {
                    const d = new Date(Date.now() + opt.h * 3600_000);
                    onUrgentValidUntilChange(d.toISOString().slice(0, 16));
                  }}
                  className="text-[11px] font-bold uppercase tracking-wider bg-background hover:bg-destructive hover:text-destructive-foreground border border-border rounded-sm py-1.5 min-h-[36px] transition-colors"
                >
                  +{opt.label}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Plantão sem validade futura é bloqueado pelo checklist de publicação.
            </p>
          </div>
        )}

        <label className="flex items-start gap-2 cursor-pointer pt-2 border-t border-border">
          <Checkbox
            checked={isDenuncia}
            onCheckedChange={(v) => onToggleDenuncia(!!v)}
            className="mt-0.5"
            aria-label="Marcar como denúncia"
          />
          <span className="text-sm font-bold">É uma denúncia</span>
        </label>
      </div>

      {!isNew && pinningSlot}

      {!isNew && history && history.length > 0 && (
        <div className="rounded-md border border-border p-3">
          <h4 className="font-bold uppercase tracking-wider text-xs flex items-center gap-2 mb-2">
            <HistoryIcon className="h-3.5 w-3.5" /> Histórico
          </h4>
          <ul className="space-y-2 text-xs max-h-48 overflow-y-auto">
            {history.slice(0, 10).map((h, i) => {
              const from = h.from_status ? normalizeStatus(h.from_status) : null;
              const to = normalizeStatus(h.to_status);
              return (
                <li key={i} className="border-l-2 border-primary pl-2">
                  <div className="font-mono text-muted-foreground text-[10px]">
                    {new Date(h.created_at).toLocaleString("pt-BR")}
                  </div>
                  <div>
                    {from ? (
                      <>
                        <span className="text-muted-foreground">
                          {STATUS_LABEL[from]}
                        </span>{" "}
                        → <strong>{STATUS_LABEL[to]}</strong>
                      </>
                    ) : (
                      <strong>Criada como {STATUS_LABEL[to]}</strong>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
