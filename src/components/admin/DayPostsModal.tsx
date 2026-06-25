import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Edit, ExternalLink, Loader2, CheckSquare, Square, ArrowRightCircle, Eye } from "lucide-react";
import { toast } from "sonner";
import { STATUS_LABEL, STATUS_COLOR, normalizeStatus, type EditorialStatus } from "@/lib/statusFlow";
import { getPostImage, handleImgError } from "@/lib/postImage";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Notícia de referência: define o dia e é destacada na lista. */
  referencePost: {
    id: string;
    title?: string;
    captured_at?: string | null;
    created_at: string;
  } | null;
};

type DayFilter = "all" | "publicadas" | "nao_publicadas" | "duplicadas";

const FILTERS: { value: DayFilter; label: string }[] = [
  { value: "all", label: "Todas" },
  { value: "publicadas", label: "Publicadas" },
  { value: "nao_publicadas", label: "Não Publicadas" },
  { value: "duplicadas", label: "Duplicadas" },
];

function dayBounds(iso: string) {
  const d = new Date(iso);
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
  const end = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
  return { start: start.toISOString(), end: end.toISOString(), dayLabel: start.toLocaleDateString("pt-BR") };
}

export default function DayPostsModal({ open, onOpenChange, referencePost }: Props) {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<any[]>([]);
  const [filter, setFilter] = useState<DayFilter>("all");
  const [sourcesMap, setSourcesMap] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);

  const anchorIso = referencePost?.captured_at || referencePost?.created_at || null;
  const { start, end, dayLabel } = useMemo(
    () => (anchorIso ? dayBounds(anchorIso) : { start: "", end: "", dayLabel: "" }),
    [anchorIso],
  );

  useEffect(() => {
    if (!open || !anchorIso) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        // Carrega tudo do dia ordenado por captura desc
        const { data, error } = await supabase
          .from("posts")
          .select(
            "id,title,slug,status,source_id,source_url,cover_image_url,manual_image_url,cover_image_original,created_at,captured_at,published_at,categories(name,default_cover_image_url)",
          )
          .gte("created_at", start)
          .lte("created_at", end)
          .order("created_at", { ascending: false });
        if (error) throw error;

        const sourceIds = Array.from(
          new Set((data ?? []).map((r: any) => r.source_id).filter(Boolean) as string[]),
        );
        let srcMap: Record<string, string> = {};
        if (sourceIds.length) {
          const { data: src } = await supabase
            .from("news_sources")
            .select("id,name")
            .in("id", sourceIds);
          (src ?? []).forEach((s: any) => (srcMap[s.id] = s.name));
        }
        if (!cancelled) {
          setSourcesMap(srcMap);
          setRows(data ?? []);
        }
      } catch (err) {
        console.error("[DayPostsModal] load failed", err);
        if (!cancelled) setRows([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, anchorIso, start, end]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      const s = normalizeStatus(r.status) as EditorialStatus;
      if (filter === "publicadas") return s === "publicada";
      if (filter === "nao_publicadas") return s !== "publicada" && s !== "duplicada";
      if (filter === "duplicadas") return s === "duplicada";
      return true;
    });
  }, [rows, filter]);

  const counts = useMemo(() => {
    let pub = 0, nao = 0, dup = 0;
    rows.forEach((r) => {
      const s = normalizeStatus(r.status) as EditorialStatus;
      if (s === "publicada") pub++;
      else if (s === "duplicada") dup++;
      else nao++;
    });
    return { total: rows.length, pub, nao, dup };
  }, [rows]);

  // Reset selection when modal closes or filter changes
  useEffect(() => {
    setSelected(new Set());
  }, [open, filter]);

  const isUnpublished = (r: any) => {
    const s = normalizeStatus(r.status) as EditorialStatus;
    return s !== "publicada" && s !== "duplicada" && s !== "arquivada";
  };

  const unpublishedRows = useMemo(() => filtered.filter(isUnpublished), [filtered]);
  const allUnpubSelected =
    unpublishedRows.length > 0 && unpublishedRows.every((r) => selected.has(r.id));

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllUnpublished() {
    if (allUnpubSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(unpublishedRows.map((r) => r.id)));
    }
  }

  async function moveSelectedToReview() {
    const ids = Array.from(selected);
    if (!ids.length) return;
    setBulkLoading(true);
    try {
      const { error } = await supabase
        .from("posts")
        .update({ status: "pronta_para_revisao" })
        .in("id", ids);
      if (error) throw error;
      toast.success(`${ids.length} notícia${ids.length === 1 ? "" : "s"} movida${ids.length === 1 ? "" : "s"} para Pronta para Revisão`);
      setRows((prev) =>
        prev.map((r) => (selected.has(r.id) ? { ...r, status: "pronta_para_revisao" } : r)),
      );
      setSelected(new Set());
      // Avisa a listagem para recarregar
      window.dispatchEvent(new CustomEvent("posts:refresh"));
    } catch (err: any) {
      toast.error(err.message ?? "Falha ao mover notícias");
    } finally {
      setBulkLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden p-0 flex flex-col">
        <DialogHeader className="px-6 pt-6 pb-4 border-b bg-zinc-900 text-white">
          <DialogTitle className="font-display text-2xl font-black">
            Notícias captadas em {dayLabel || "—"}
          </DialogTitle>
          <DialogDescription className="text-zinc-300">
            {loading ? "Carregando…" : `${counts.total} notícia${counts.total === 1 ? "" : "s"} no total`}
            {!loading && counts.total > 0 && (
              <>
                {" · "}
                <span className="text-emerald-300 font-bold">{counts.pub} publicada{counts.pub === 1 ? "" : "s"}</span>
                {" · "}
                <span className="text-amber-200 font-bold">{counts.nao} não publicada{counts.nao === 1 ? "" : "s"}</span>
                {" · "}
                <span className="text-red-300 font-bold">{counts.dup} duplicada{counts.dup === 1 ? "" : "s"}</span>
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 py-3 border-b bg-secondary/40 flex flex-wrap gap-2 items-center">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={`px-3 py-1.5 text-[11px] font-black uppercase tracking-widest rounded-sm border transition ${
                filter === f.value
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-white text-foreground border-border hover:bg-secondary"
              }`}
            >
              {f.label}
              {f.value !== "all" && (
                <span className="ml-1.5 opacity-80">
                  ({f.value === "publicadas" ? counts.pub : f.value === "duplicadas" ? counts.dup : counts.nao})
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Barra de ações em massa */}
        <div className="px-6 py-2 border-b bg-white flex flex-wrap gap-2 items-center text-xs">
          <button
            type="button"
            onClick={selectAllUnpublished}
            disabled={unpublishedRows.length === 0}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-sm border border-border hover:bg-secondary disabled:opacity-40 disabled:cursor-not-allowed font-bold uppercase tracking-wider text-[10px]"
          >
            {allUnpubSelected ? <CheckSquare className="h-3.5 w-3.5" /> : <Square className="h-3.5 w-3.5" />}
            Selecionar todas Não Publicadas ({unpublishedRows.length})
          </button>
          <span className="text-muted-foreground">·</span>
          <span className="font-mono text-[11px] text-muted-foreground">
            {selected.size} selecionada{selected.size === 1 ? "" : "s"}
          </span>
          <div className="ml-auto flex gap-2">
            {selected.size > 0 && (
              <button
                type="button"
                onClick={() => setSelected(new Set())}
                className="px-2.5 py-1.5 rounded-sm border border-border hover:bg-secondary font-bold uppercase tracking-wider text-[10px]"
              >
                Limpar
              </button>
            )}
            <button
              type="button"
              onClick={moveSelectedToReview}
              disabled={selected.size === 0 || bulkLoading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-sm bg-violet-600 hover:bg-violet-700 text-white font-bold uppercase tracking-wider text-[10px] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {bulkLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowRightCircle className="h-3.5 w-3.5" />}
              Mover para Pronta para Revisão
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" /> Carregando notícias do dia…
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              Nenhuma notícia neste filtro.
            </div>
          ) : (
            <ul className="space-y-2">
              {filtered.map((r) => {
                const s = normalizeStatus(r.status) as EditorialStatus;
                const isCurrent = r.id === referencePost?.id;
                const img = getPostImage(r as any);
                const sourceName = r.source_id
                  ? sourcesMap[r.source_id] || "Fonte"
                  : r.source_url && /instagram\.com/i.test(r.source_url)
                    ? "Instagram"
                    : "Manual";
                const hora = new Date(r.created_at).toLocaleTimeString("pt-BR", {
                  hour: "2-digit",
                  minute: "2-digit",
                });
                return (
                  <li
                    key={r.id}
                    className={`flex gap-3 p-3 rounded-sm border transition ${
                      isCurrent
                        ? "border-sky-500 bg-sky-50 ring-2 ring-sky-200"
                        : selected.has(r.id)
                          ? "border-violet-400 bg-violet-50/60"
                          : "border-border bg-white hover:bg-secondary/30"
                    }`}
                  >
                    {isUnpublished(r) ? (
                      <input
                        type="checkbox"
                        checked={selected.has(r.id)}
                        onChange={() => toggleSelect(r.id)}
                        className="mt-1 h-4 w-4 accent-violet-600 shrink-0"
                        title="Selecionar para ação em massa"
                      />
                    ) : (
                      <div className="w-4 shrink-0" />
                    )}
                    <div className="w-[88px] h-[60px] shrink-0 bg-secondary border border-border overflow-hidden rounded-sm">
                      <img
                        src={img}
                        alt=""
                        loading="lazy"
                        className="w-full h-full object-cover"
                        onError={(e) => handleImgError(e, r as any)}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2 mb-1">
                            <span
                              className={`px-1.5 py-0.5 text-[9px] font-black uppercase tracking-widest border rounded-sm ${STATUS_COLOR[s]}`}
                            >
                              {STATUS_LABEL[s]}
                            </span>
                            {isCurrent && (
                              <span className="px-1.5 py-0.5 text-[9px] font-black uppercase tracking-widest border rounded-sm bg-sky-600 text-white border-sky-700">
                                Esta notícia
                              </span>
                            )}
                            <span className="font-mono text-[10px] text-muted-foreground">
                              {hora}
                            </span>
                          </div>
                          <div className="font-display font-bold text-sm leading-tight line-clamp-2">
                            {r.title}
                          </div>
                          <div className="flex flex-wrap items-center gap-2 mt-1 text-[10px] uppercase font-bold tracking-wider text-muted-foreground">
                            <span className="text-foreground">{sourceName}</span>
                            <span>·</span>
                            <span>{r.categories?.name ?? "Geral"}</span>
                            {r.source_url && (
                              <>
                                <span>·</span>
                                <a
                                  href={r.source_url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-1 hover:text-foreground"
                                >
                                  Origem <ExternalLink className="h-2.5 w-2.5" />
                                </a>
                              </>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-col sm:flex-row gap-1.5 shrink-0">
                          {s === "publicada" && r.slug && (
                            <Button
                              asChild
                              size="sm"
                              variant="outline"
                              className="h-8 text-emerald-700 border-emerald-200 hover:bg-emerald-50"
                              title="Ver no portal"
                            >
                              <a href={`/noticia/${r.slug}`} target="_blank" rel="noreferrer">
                                <Eye className="h-3.5 w-3.5 sm:mr-1" />
                                <span className="hidden sm:inline">Portal</span>
                              </a>
                            </Button>
                          )}
                          <Button
                            asChild
                            size="sm"
                            variant="outline"
                            className="h-8"
                            onClick={() => onOpenChange(false)}
                          >
                            <Link to={`/admin/posts/${r.id}`}>
                              <Edit className="h-3.5 w-3.5 mr-1" /> Editar
                            </Link>
                          </Button>
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
