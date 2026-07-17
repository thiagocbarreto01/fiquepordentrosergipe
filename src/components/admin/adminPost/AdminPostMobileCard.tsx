import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Edit, MoreVertical, ImageOff } from "lucide-react";
import { SourceBadge } from "@/components/admin/SourceBadge";
import { normalizeStatus, STATUS_COLOR, STATUS_LABEL } from "@/lib/statusFlow";
import { classifyDuplicate } from "@/lib/duplicates";
import { getPostImage, handleImgError } from "@/lib/postImage";
import { getPrimaryAction } from "./primaryAction";

interface Props {
  post: any;
  sourceName: string;
  onPrimary: (p: any) => void;
  onMore: (p: any) => void;
}

/**
 * Cartão único usado em tablet/mobile (larguras < lg).
 * Foto 72×72, título até 3 linhas, botões ≥ 44px, ação principal contextual.
 */
export function AdminPostMobileCard({ post, sourceName, onPrimary, onMore }: Props) {
  const p = post;
  const s = normalizeStatus(p.status);
  const dup = classifyDuplicate(p.similarity_score);
  const dupTier = p.status === "duplicada" ? "duplicada" : dup.tier;
  const dupLabel =
    dupTier === "duplicada" ? "Duplicada" :
    dupTier === "similar" ? `Similar · ${dup.pct}%` : "Nova";
  const dupClass =
    dupTier === "duplicada" ? "bg-red-100 text-red-800 border-red-300" :
    dupTier === "similar" ? "bg-yellow-100 text-yellow-800 border-yellow-300" :
    "bg-emerald-100 text-emerald-800 border-emerald-300";
  const previewImg = getPostImage(p);
  const hasOwnImage = !!p.manual_image_url || !!p.cover_image_url;
  const capturedIso = p.captured_at ?? p.created_at;
  const primary = getPrimaryAction(p);
  const PrimaryIcon = primary.icon;

  return (
    <div className="bg-card border border-border rounded-sm p-3 space-y-3">
      <div className="flex gap-3">
        <div className="relative w-[72px] h-[72px] shrink-0 bg-secondary border border-border overflow-hidden rounded-sm">
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
              <ImageOff className="h-4 w-4" />
              <span className="text-[8px] font-bold uppercase mt-0.5">Sem imagem</span>
            </div>
          )}
          {!hasOwnImage && previewImg && (
            <span
              className="absolute bottom-0 inset-x-0 text-[8px] font-bold uppercase text-white bg-amber-600/90 text-center leading-tight py-0.5"
              title="Sem imagem própria"
            >
              Sem imagem
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap gap-1 mb-1">
            <SourceBadge name={sourceName} />
            <span className="text-[10px] font-bold text-primary uppercase tracking-wider bg-primary/5 px-1.5 py-0.5 rounded-sm border border-primary/10">
              {p.categories?.name ?? "Sem categoria"}
            </span>
          </div>
          <div className="font-display font-bold text-sm leading-tight line-clamp-3 break-words">
            {p.title}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5 items-center text-[11px]">
        <span className={`px-2 py-0.5 text-[10px] font-black uppercase tracking-widest border rounded-sm ${STATUS_COLOR[s]}`}>
          {STATUS_LABEL[s]}
        </span>
        <span className={`px-2 py-0.5 text-[10px] font-black uppercase tracking-widest border rounded-sm ${dupClass}`}>
          {dupLabel}
        </span>
        <span className="text-muted-foreground">
          {new Date(capturedIso).toLocaleDateString("pt-BR")}
        </span>
        <span className="font-mono text-muted-foreground">
          · {p.views?.toLocaleString("pt-BR") || 0} views
        </span>
      </div>

      <div className="grid grid-cols-[1fr_auto_auto] gap-2">
        {primary.kind === "open_portal" && primary.href ? (
          <Button asChild className={`w-full min-h-[44px] font-bold ${primary.className ?? ""}`}>
            <a href={primary.href} target="_blank" rel="noreferrer">
              <PrimaryIcon className="h-4 w-4 mr-2" /> {primary.label}
            </a>
          </Button>
        ) : (
          <Button
            className={`w-full min-h-[44px] font-bold ${primary.className ?? ""}`}
            onClick={() => onPrimary(p)}
          >
            <PrimaryIcon className="h-4 w-4 mr-2" /> {primary.label}
          </Button>
        )}
        <Button asChild variant="outline" className="min-h-[44px] font-bold px-3">
          <Link to={`/admin/posts/${p.id}`} aria-label="Editar">
            <Edit className="h-4 w-4" />
          </Link>
        </Button>
        <Button
          variant="outline"
          className="min-h-[44px] min-w-[44px] px-3"
          onClick={() => onMore(p)}
          aria-label="Mais ações"
        >
          <MoreVertical className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
