import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ShieldAlert, ExternalLink } from "lucide-react";
import { formatMaceioLong } from "@/lib/timezone";
import { SourceRunResultBadge } from "./SourceRunResultBadge";
import { classifyRunStatus, parseRunMessage } from "@/lib/sourceRunParser";

export interface SourceConfigView {
  id: string;
  name: string;
  source_type: string;
  url: string | null;
  category_name: string | null;
  frequency_minutes: number;
  is_active: boolean;
  max_items_per_run: number;
  last_run_at: string | null;
  last_run_status: string | null;
  last_run_message: string | null;
  total_captured: number;
  linked_posts: number | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: SourceConfigView | null;
}

export function SourceConfigDialog({ open, onOpenChange, data }: Props) {
  if (!data) return null;
  const kind = classifyRunStatus(data.last_run_at, data.last_run_status);
  const parsed = parseRunMessage(data.last_run_message);
  let hostname: string | null = null;
  try {
    hostname = data.url ? new URL(data.url).hostname : null;
  } catch {
    hostname = null;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Configuração da fonte</DialogTitle>
          <DialogDescription>
            Visualização somente leitura. Nenhuma ação será executada aqui.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <Field label="Nome" value={data.name} />
          <Field label="Tipo" value={data.source_type.toUpperCase()} />
          <div>
            <Label>URL completa</Label>
            {data.url ? (
              <a
                href={data.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-primary hover:underline break-all"
              >
                <ExternalLink className="h-3 w-3 shrink-0" />
                <span>{data.url}</span>
              </a>
            ) : (
              <p className="text-muted-foreground">—</p>
            )}
          </div>
          <Field label="Hostname" value={hostname ?? "—"} />
          <Field label="Editoria" value={data.category_name ?? "sem categoria"} />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Frequência configurada" value={`${data.frequency_minutes} min`} />
            <Field label="Máximo por execução" value={String(data.max_items_per_run)} />
          </div>
          <Field
            label="Marcada para automação"
            value={data.is_active ? "Sim" : "Não"}
          />
          <div>
            <Label>Última execução</Label>
            <p>{formatMaceioLong(data.last_run_at)}</p>
          </div>
          <div>
            <Label>Último resultado</Label>
            <div className="flex items-center gap-2">
              <SourceRunResultBadge kind={kind} />
              {parsed && (
                <span className="text-xs text-muted-foreground">
                  {parsed.captured} captadas · {parsed.duplicates} dup. · {parsed.skipped} já existiam
                </span>
              )}
            </div>
          </div>
          <div>
            <Label>Mensagem completa</Label>
            <p className="text-xs text-muted-foreground whitespace-pre-wrap break-words">
              {data.last_run_message || "—"}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Total captado" value={String(data.total_captured)} />
            <Field
              label="Posts vinculados"
              value={data.linked_posts === null ? "—" : String(data.linked_posts)}
            />
          </div>

          <div className="border-2 border-dashed border-amber-400 bg-amber-50 dark:bg-amber-950/20 p-3 rounded-sm flex gap-2">
            <ShieldAlert className="h-4 w-4 text-amber-700 shrink-0 mt-0.5" />
            <div className="text-xs text-amber-900 dark:text-amber-200">
              <strong>Proteção de hosts ainda não configurada.</strong>{" "}
              Será tratada na etapa de segurança <span className="font-mono">F3</span>.
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-0.5">
      {children}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <Label>{label}</Label>
      <p className="break-words">{value}</p>
    </div>
  );
}
