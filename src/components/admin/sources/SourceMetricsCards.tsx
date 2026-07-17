import { Rss, ToggleRight, Clock, Activity, CheckCircle2, XCircle, MinusCircle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { formatMaceioLong, timeAgoPt } from "@/lib/timezone";
import { classifyRunStatus, parseRunMessage } from "@/lib/sourceRunParser";

export interface SourceMetricsSource {
  id: string;
  name: string;
  is_active: boolean;
  last_run_at: string | null;
  last_run_status: string | null;
  last_run_message: string | null;
}

interface Props {
  sources: SourceMetricsSource[];
}

export function SourceMetricsCards({ sources }: Props) {
  const total = sources.length;
  const marked = sources.filter((s) => s.is_active).length;

  // Última execução registrada
  const withRuns = sources.filter((s) => s.last_run_at);
  const latest = withRuns.sort((a, b) =>
    (b.last_run_at ?? "").localeCompare(a.last_run_at ?? ""),
  )[0];

  const kind = latest ? classifyRunStatus(latest.last_run_at, latest.last_run_status) : "never";
  const parsed = latest ? parseRunMessage(latest.last_run_message) : null;

  return (
    <TooltipProvider delayDuration={200}>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <MetricCard
          icon={<Rss className="h-5 w-5" />}
          label="Fontes cadastradas"
          value={String(total)}
          subtitle="Portais e feeds cadastrados"
        />
        <MetricCard
          icon={<ToggleRight className="h-5 w-5" />}
          label="Marcadas para automação"
          value={String(marked)}
          subtitle={`de ${total} habilitadas`}
          tooltip="A marcação apenas indica quais fontes estão habilitadas para uma futura automação. Nenhum cron de captação está ativo hoje."
        />
        <MetricCard
          icon={<Clock className="h-5 w-5" />}
          label="Última execução registrada"
          value={latest ? timeAgoPt(latest.last_run_at) : "Nunca"}
          subtitle={latest ? formatMaceioLong(latest.last_run_at) : "Sem execuções registradas"}
          tooltip="Baseado no maior last_run_at das fontes. O schema não registra o gatilho (manual ou automático)."
          subtitleClassName="text-[10px]"
        />
        <MetricCard
          icon={<Activity className="h-5 w-5" />}
          label="Resultado da última execução"
          value={latest ? latest.name : "—"}
          subtitle={
            parsed
              ? `${parsed.captured} captadas · ${parsed.duplicates} dup. · ${parsed.skipped} já existiam`
              : latest?.last_run_message || "Sem mensagem"
          }
          badge={<RunKindBadge kind={kind} />}
        />
      </div>
    </TooltipProvider>
  );
}

interface MetricProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  subtitle: string;
  subtitleClassName?: string;
  tooltip?: string;
  badge?: React.ReactNode;
}

function MetricCard({ icon, label, value, subtitle, tooltip, badge, subtitleClassName }: MetricProps) {
  const header = (
    <div className="flex items-center gap-2 text-navy">
      {icon}
      <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
    </div>
  );

  return (
    <div className="bg-card border-2 border-border rounded-md p-4 min-h-[128px] flex flex-col justify-between">
      {tooltip ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <button type="button" className="text-left cursor-help">
              {header}
            </button>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">{tooltip}</TooltipContent>
        </Tooltip>
      ) : (
        header
      )}
      <div className="mt-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-display font-black text-2xl leading-none text-foreground break-words">
            {value}
          </span>
          {badge}
        </div>
        <p className={`mt-1 text-xs text-muted-foreground break-words ${subtitleClassName ?? ""}`}>
          {subtitle}
        </p>
      </div>
    </div>
  );
}

function RunKindBadge({ kind }: { kind: "ok" | "error" | "never" }) {
  if (kind === "ok") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded">
        <CheckCircle2 className="h-3 w-3" /> OK
      </span>
    );
  }
  if (kind === "error") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider bg-urgent/10 text-urgent px-2 py-0.5 rounded">
        <XCircle className="h-3 w-3" /> Erro
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider bg-secondary text-muted-foreground px-2 py-0.5 rounded">
      <MinusCircle className="h-3 w-3" /> Nunca
    </span>
  );
}
