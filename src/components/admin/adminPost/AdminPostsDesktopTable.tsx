import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Edit, MoreVertical, ImageOff, Clock, Archive,
} from "lucide-react";
import { SourceBadge, CaptureMethodChip, detectCaptureMethod } from "@/components/admin/SourceBadge";
import { RelevanceBadge } from "@/components/admin/RelevanceBadge";
import {
  normalizeStatus, STATUS_COLOR, STATUS_LABEL, ARCHIVE_REASON_LABEL,
} from "@/lib/statusFlow";
import { classifyDuplicate } from "@/lib/duplicates";
import { getPostImage, handleImgError } from "@/lib/postImage";
import {
  getPrimaryAction,
  type PostSortColumn,
  type PostSortDir,
  SORT_OPTIONS,
} from "./primaryAction";
import { ChevronDown, ChevronUp } from "lucide-react";

interface Props {
  posts: any[];
  sourcesById: Map<string, string>;
  loading: boolean;
  sort: PostSortColumn;
  dir: PostSortDir;
  onSortChange: (s: PostSortColumn, d: PostSortDir) => void;
  onPrimary: (p: any) => void;
  onMore: (p: any) => void;
}

/**
 * Tabela desktop (>= lg). Sete colunas conforme especificação.
 * Toda decisão de ação é delegada ao chamador — este componente é apresentação.
 */
export function AdminPostsDesktopTable({
  posts, sourcesById, loading, sort, dir, onSortChange, onPrimary, onMore,
}: Props) {
  function SortHeader({ col, label, className }: { col: PostSortColumn; label: string; className?: string }) {
    const active = sort === col;
    const nextDir: PostSortDir = active && dir === "desc" ? "asc" : "desc";
    return (
      <th className={`text-left p-3 ${className ?? ""}`}>
        <button
          onClick={() => onSortChange(col, active ? (dir === "desc" ? "asc" : "desc") : nextDir)}
          className={`inline-flex items-center gap-1 uppercase tracking-wider ${active ? "text-foreground font-black" : "text-muted-foreground"}`}
          aria-label={`Ordenar por ${label}`}
          aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}
        >
          {label}
          {active && (dir === "desc" ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />)}
        </button>
      </th>
    );
  }

  const sortLabels = Object.fromEntries(SORT_OPTIONS.map((s) => [s.value, s.label])) as Record<PostSortColumn, string>;

  return (
    <div className="bg-card border border-border overflow-hidden">
      <table className="w-full text-sm table-fixed">
        <colgroup>
          <col style={{ width: "8%" }} />
          <col style={{ width: "26%" }} />
          <col style={{ width: "9%" }} />
          <col style={{ width: "18%" }} />
          <col style={{ width: "12%" }} />
          <col style={{ width: "10%" }} />
          <col style={{ width: "17%" }} />
        </colgroup>
        <thead className="bg-secondary text-xs">
          <tr>
            <th className="text-left p-3">Imagem</th>
            <SortHeader col="title" label="Título / Fonte / Views" />
            <th className="text-left p-3 uppercase tracking-wider text-muted-foreground">Categoria</th>
            <th className="text-left p-3 uppercase tracking-wider text-muted-foreground">Duplicidade</th>
            <SortHeader col={sort === "captured_at" ? "captured_at" : "published_at"} label={sortLabels[sort === "captured_at" ? "captured_at" : "published_at"]} />
            <th className="text-left p-3 uppercase tracking-wider text-muted-foreground">Status</th>
            <th className="text-right p-3 uppercase tracking-wider text-muted-foreground">Ações</th>
          </tr>
        </thead>
        <tbody>
          {posts.length === 0 && !loading && (
            <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">Nenhuma notícia.</td></tr>
          )}
          {loading && (
            <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">Carregando…</td></tr>
          )}
          {posts.map((p) => {
            const s = normalizeStatus(p.status);
            const method = detectCaptureMethod({ source_id: p.source_id, source_url: p.source_url });
            const sourceName = (p.source_id && sourcesById.get(p.source_id)) || (method === "instagram" ? "Instagram" : "Manual");
            const previewImg = getPostImage(p);
            const hasOwnImage = !!p.manual_image_url || !!p.cover_image_url;
            const dup = classifyDuplicate(p.similarity_score);
            const dupTier = p.status === "duplicada" ? "duplicada" : dup.tier;
            const dupClass =
              dupTier === "duplicada" ? "bg-red-100 text-red-800 border-red-300" :
              dupTier === "similar" ? "bg-yellow-100 text-yellow-800 border-yellow-300" :
              "bg-emerald-100 text-emerald-800 border-emerald-300";
            const dupLabel =
              dupTier === "duplicada" ? "Duplicada" :
              dupTier === "similar" ? `Similar · ${dup.pct}%` : "Nova";
            const ref = p._ref;
            const capturedIso = p.captured_at ?? p.created_at;
            const primary = getPrimaryAction(p);
            const PrimaryIcon = primary.icon;

            return (
              <tr key={p.id} className="border-t border-border align-top hover:bg-secondary/20 transition-colors">
                {/* 1. Imagem */}
                <td className="p-3">
                  <div className="relative w-[72px] h-[48px] bg-secondary border border-border overflow-hidden rounded-sm">
                    {previewImg ? (
                      <img
                        src={previewImg}
                        alt={`Miniatura: ${p.title}`}
                        className="w-full h-full object-cover"
                        loading="lazy"
                        onError={(e) => handleImgError(e, p)}
                      />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground">
                        <ImageOff className="h-3.5 w-3.5" />
                        <span className="text-[7px] uppercase font-bold">Sem imagem</span>
                      </div>
                    )}
                    {!hasOwnImage && previewImg && (
                      <span
                        className="absolute bottom-0 inset-x-0 text-[7px] font-bold uppercase text-white bg-amber-600/90 text-center leading-tight py-0.5"
                        title="Sem imagem própria"
                      >
                        Sem imagem
                      </span>
                    )}
                  </div>
                </td>

                {/* 2. Título + fonte + views */}
                <td className="p-3 min-w-0">
                  <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5 mb-1">
                    <SourceBadge name={sourceName} />
                    <CaptureMethodChip method={method} />
                    {p.relevance_level && (
                      <RelevanceBadge level={p.relevance_level} score={p.relevance_score} />
                    )}
                  </div>
                  <div
                    className="font-display font-bold text-[15px] leading-tight line-clamp-3 break-words [overflow-wrap:anywhere]"
                    title={p.title}
                  >
                    {p.title}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-2 items-center text-[10px] text-muted-foreground uppercase font-bold tracking-wider">
                    <span className="font-mono">{p.views?.toLocaleString("pt-BR") || 0} views</span>
                    {p.published_at && (
                      <span>Publicada {new Date(p.published_at).toLocaleDateString("pt-BR")}</span>
                    )}
                  </div>
                  </div>
                </td>

                {/* 3. Categoria */}
                <td className="p-3">
                  <span className="text-[11px] font-bold text-primary uppercase tracking-wider bg-primary/5 px-2 py-1 rounded-sm border border-primary/10">
                    {p.categories?.name ?? "Sem categoria"}
                  </span>
                </td>

                {/* 4. Duplicidade */}
                <td className="p-3">
                  <div className="flex flex-col gap-1">
                    <span className={`inline-flex w-fit px-2 py-0.5 text-[10px] font-black uppercase tracking-widest border rounded-sm ${dupClass}`}>
                      {dupLabel}
                    </span>
                    {ref && (
                      <div className="text-[10px] text-muted-foreground leading-tight">
                        <div className="uppercase tracking-wider text-[9px] font-black">Possível duplicada de:</div>
                        <Link
                          to={`/admin/posts/${p.similar_to || p.duplicate_of}`}
                          className="line-clamp-2 hover:underline"
                        >
                          {ref.title}
                        </Link>
                        {ref.published_at && (
                          <div className="font-mono text-[9px] mt-0.5">
                            Publicada em {new Date(ref.published_at).toLocaleDateString("pt-BR")}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </td>

                {/* 5. Captura / Publicação */}
                <td className="p-3 text-xs">
                  <div className="text-muted-foreground uppercase text-[9px] font-black tracking-widest">Captura</div>
                  <div>{new Date(capturedIso).toLocaleDateString("pt-BR")}</div>
                  <div className="font-mono text-muted-foreground">
                    {new Date(capturedIso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Maceio" })}
                  </div>
                  {p.published_at && (
                    <div className="mt-1.5">
                      <div className="text-muted-foreground uppercase text-[9px] font-black tracking-widest">Publicação</div>
                      <div>{new Date(p.published_at).toLocaleDateString("pt-BR")}</div>
                      <div className="font-mono text-muted-foreground">
                        {new Date(p.published_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Maceio" })}
                      </div>
                    </div>
                  )}
                </td>

                {/* 6. Status */}
                <td className="p-3">
                  <div className="flex flex-col gap-1.5">
                    <span className={`inline-flex w-fit px-2 py-1 text-[10px] font-black uppercase tracking-widest border rounded-sm ${STATUS_COLOR[s]}`}>
                      {STATUS_LABEL[s]}
                    </span>
                    {p.home_expires_at && !p.is_evergreen && (
                      <span
                        className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-sm border bg-sky-50 text-sky-700 border-sky-200 w-fit"
                        title={new Date(p.home_expires_at).toLocaleString("pt-BR")}
                      >
                        <Clock className="h-2.5 w-2.5" />
                        Home até {new Date(p.home_expires_at).toLocaleDateString("pt-BR")}
                      </span>
                    )}
                    {p.is_urgent && p.home_expires_at && new Date(p.home_expires_at).getTime() > Date.now() && (
                      <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-sm border bg-red-100 text-red-800 border-red-300 w-fit">
                        Plantão ativo
                      </span>
                    )}
                    {p.archived_at && (
                      <span
                        title={ARCHIVE_REASON_LABEL[p.archived_reason] ?? p.archived_reason ?? ""}
                        className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-sm border bg-zinc-100 text-zinc-700 border-zinc-300 w-fit"
                      >
                        <Archive className="h-2.5 w-2.5" />
                        Arquivada {new Date(p.archived_at).toLocaleDateString("pt-BR")}
                      </span>
                    )}
                  </div>
                </td>

                {/* 7. Ações */}
                <td className="p-3 text-right">
                  <div className="inline-flex gap-1 items-center flex-wrap justify-end">
                    {primary.kind === "open_portal" && primary.href ? (
                      <Button asChild size="sm" className={`h-9 min-h-[44px] px-3 font-bold ${primary.className ?? ""}`}>
                        <a href={primary.href} target="_blank" rel="noreferrer">
                          <PrimaryIcon className="h-3.5 w-3.5 mr-1" /> {primary.label}
                        </a>
                      </Button>
                    ) : (
                      <Button size="sm" className={`h-9 min-h-[44px] px-3 font-bold ${primary.className ?? ""}`} onClick={() => onPrimary(p)}>
                        <PrimaryIcon className="h-3.5 w-3.5 mr-1" /> {primary.label}
                      </Button>
                    )}
                    <Button asChild variant="outline" size="sm" className="h-9 min-h-[44px] px-3">
                      <Link to={`/admin/posts/${p.id}`} title="Editar">
                        <Edit className="h-3.5 w-3.5 mr-1" /> Editar
                      </Link>
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-11 w-11 min-h-[44px] min-w-[44px]"
                      onClick={() => onMore(p)}
                      aria-label="Mais ações"
                    >
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
