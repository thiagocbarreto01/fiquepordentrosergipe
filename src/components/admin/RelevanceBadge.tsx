import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Flame, Activity, Circle } from "lucide-react";

export type RelevanceLevel = "baixa" | "media" | "alta" | "urgente" | null | undefined;

export const RELEVANCE_LEVEL_LABEL: Record<string, string> = {
  baixa: "Baixa",
  media: "Média",
  alta: "Alta",
  urgente: "Urgente",
};

export const PLACEMENT_LABEL: Record<string, string> = {
  ultimas_noticias: "Últimas Notícias",
  destaque_secundario: "Destaque Secundário",
  destaque_principal: "Destaque Principal",
  plantao: "Plantão",
  manchete_principal: "Manchete Principal",
};

export function levelFromScore(score: number | null | undefined): RelevanceLevel {
  if (score == null) return null;
  if (score >= 90) return "urgente";
  if (score >= 70) return "alta";
  if (score >= 40) return "media";
  return "baixa";
}

export function RelevanceBadge({
  level,
  score,
  showScore = true,
  className,
}: {
  level: RelevanceLevel;
  score?: number | null;
  showScore?: boolean;
  className?: string;
}) {
  if (!level) {
    return (
      <Badge variant="outline" className={className}>
        <Circle className="h-3 w-3 mr-1" /> Sem análise
      </Badge>
    );
  }
  const map: Record<string, { cls: string; Icon: any; emoji: string }> = {
    baixa:   { cls: "bg-emerald-100 text-emerald-800 border-emerald-300", Icon: Circle, emoji: "🟢" },
    media:   { cls: "bg-amber-100 text-amber-800 border-amber-300",       Icon: Activity, emoji: "🟡" },
    alta:    { cls: "bg-orange-100 text-orange-800 border-orange-300",    Icon: Flame, emoji: "🟠" },
    urgente: { cls: "bg-red-100 text-red-800 border-red-300 animate-pulse", Icon: AlertTriangle, emoji: "🔴" },
  };
  const { cls, emoji } = map[level];
  return (
    <Badge variant="outline" className={`${cls} ${className ?? ""}`}>
      <span className="mr-1">{emoji}</span>
      {RELEVANCE_LEVEL_LABEL[level]}
      {showScore && typeof score === "number" ? ` — ${score}%` : ""}
    </Badge>
  );
}
