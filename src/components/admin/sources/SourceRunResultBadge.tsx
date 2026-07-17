import { CheckCircle2, XCircle, MinusCircle } from "lucide-react";
import type { RunResultKind } from "@/lib/sourceRunParser";

export function SourceRunResultBadge({ kind }: { kind: RunResultKind }) {
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
