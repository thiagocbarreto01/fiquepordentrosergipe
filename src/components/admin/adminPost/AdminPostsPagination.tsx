import { Button } from "@/components/ui/button";
import {
  ChevronsLeft, ChevronLeft, ChevronRight, ChevronsRight,
} from "lucide-react";

const PER_PAGE_OPTIONS = [25, 50, 100] as const;

interface Props {
  page: number;
  perPage: number;
  totalCount: number;
  loading?: boolean;
  onPage: (n: number) => void;
  onPerPage: (n: number) => void;
  /** Mostra o seletor "por página". Em rodapé costuma ser omitido. */
  showPerPage?: boolean;
  ariaLabel?: string;
}

export function AdminPostsPagination({
  page, perPage, totalCount, loading,
  onPage, onPerPage, showPerPage = true, ariaLabel,
}: Props) {
  const totalPages = Math.max(1, Math.ceil(totalCount / perPage));
  const from = totalCount === 0 ? 0 : (page - 1) * perPage + 1;
  const to = Math.min(page * perPage, totalCount);

  return (
    <div
      className="flex flex-wrap items-center justify-between gap-3"
      aria-label={ariaLabel ?? "Paginação de notícias"}
    >
      <span
        className="text-[11px] font-bold text-muted-foreground"
        aria-live="polite"
        aria-atomic="true"
      >
        {loading
          ? "Carregando…"
          : `Mostrando ${from.toLocaleString("pt-BR")}–${to.toLocaleString("pt-BR")} de ${totalCount.toLocaleString("pt-BR")}`}
      </span>

      <div className="flex flex-wrap items-center gap-3">
        {showPerPage && (
          <label className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider">
            Por página:
            <select
              value={perPage}
              onChange={(e) => onPerPage(Number(e.target.value))}
              className="h-11 min-h-[44px] border border-border rounded-sm px-2 text-xs bg-white"
              aria-label="Registros por página"
            >
              {PER_PAGE_OPTIONS.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </label>
        )}

        <div className="inline-flex items-center gap-1">
          <Button
            variant="outline" size="icon"
            className="h-11 w-11 min-h-[44px] min-w-[44px]"
            disabled={page <= 1} onClick={() => onPage(1)}
            aria-label="Primeira página"
          >
            <ChevronsLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline" size="icon"
            className="h-11 w-11 min-h-[44px] min-w-[44px]"
            disabled={page <= 1} onClick={() => onPage(Math.max(1, page - 1))}
            aria-label="Página anterior"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span
            className="text-[11px] font-bold px-2 min-w-[96px] text-center"
            aria-live="polite"
          >
            Página {page} de {totalPages}
          </span>
          <Button
            variant="outline" size="icon"
            className="h-11 w-11 min-h-[44px] min-w-[44px]"
            disabled={page >= totalPages} onClick={() => onPage(Math.min(totalPages, page + 1))}
            aria-label="Próxima página"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            variant="outline" size="icon"
            className="h-11 w-11 min-h-[44px] min-w-[44px]"
            disabled={page >= totalPages} onClick={() => onPage(totalPages)}
            aria-label="Última página"
          >
            <ChevronsRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

export { PER_PAGE_OPTIONS };
