import { Link } from "react-router-dom";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import {
  Edit, Eye, Share2, CheckCircle2, Globe, Archive, ArchiveRestore, Trash2,
  CalendarDays, RotateCw,
} from "lucide-react";
import { normalizeStatus } from "@/lib/statusFlow";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  post: any | null;
  onApprove: (p: any) => void;
  onPublish: (p: any) => void;
  onUnpublish: (p: any) => void;
  onArchive: (p: any) => void;
  onRestore: (p: any) => void;
  onDelete: (p: any) => void;
  /** Somente admin/super_admin pode ver e acionar exclusão permanente. */
  canDelete?: boolean;
  onShare: (p: any) => void;
  onSeeDay: (p: any) => void;
  onRenew: (p: any, hours: number) => void;
}

/**
 * Bottom sheet reutilizável de ações secundárias do post em tablet/mobile.
 * Nesta passada NÃO substitui os confirm() legados — apenas centraliza a UI
 * e permite navegação por teclado (foco preso, Escape fecha, clique fora
 * fecha, título/descrição para leitores de tela).
 */
export function AdminPostActionsMenu({
  open, onOpenChange, post,
  onApprove, onPublish, onUnpublish, onArchive, onRestore, onDelete,
  onShare, onSeeDay, onRenew,
}: Props) {
  if (!post) return null;
  const s = normalizeStatus(post.status);
  const close = () => onOpenChange(false);
  const wrap = (fn: () => void) => () => { close(); fn(); };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="rounded-t-2xl max-h-[85vh] overflow-y-auto pb-[max(env(safe-area-inset-bottom),1rem)]"
      >
        <SheetHeader className="text-left">
          <SheetTitle className="line-clamp-2 text-base">{post.title}</SheetTitle>
          <SheetDescription>Ações rápidas para esta notícia.</SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-2">
          {/* Grupo: edição / visualização */}
          <div className="grid gap-2">
            <Button asChild variant="outline" className="w-full justify-start min-h-[44px]">
              <Link to={`/admin/posts/${post.id}`} onClick={close}>
                <Edit className="h-4 w-4 mr-2" /> Editar notícia
              </Link>
            </Button>
            {s === "publicada" && (
              <>
                <Button asChild variant="outline" className="w-full justify-start min-h-[44px]">
                  <a target="_blank" rel="noreferrer" href={`/noticia/${post.slug}`} onClick={close}>
                    <Eye className="h-4 w-4 mr-2" /> Ver no portal
                  </a>
                </Button>
                <Button variant="outline" className="w-full justify-start min-h-[44px]" onClick={wrap(() => onShare(post))}>
                  <Share2 className="h-4 w-4 mr-2" /> Copiar link com prévia
                </Button>
              </>
            )}
            <Button variant="outline" className="w-full justify-start min-h-[44px]" onClick={wrap(() => onSeeDay(post))}>
              <CalendarDays className="h-4 w-4 mr-2" /> Ver notícias do dia
            </Button>
          </div>

          {/* Grupo: fluxo editorial */}
          <div className="grid gap-2 pt-2 border-t border-border">
            {(s === "captada" || s === "em_revisao" || s === "pronta_para_revisao") && (
              <Button variant="outline" className="w-full justify-start min-h-[44px]" onClick={wrap(() => onApprove(post))}>
                <CheckCircle2 className="h-4 w-4 mr-2" /> Aprovar
              </Button>
            )}
            {s === "aprovada" && (
              <Button variant="outline" className="w-full justify-start min-h-[44px]" onClick={wrap(() => onPublish(post))}>
                <Globe className="h-4 w-4 mr-2" /> Publicar
              </Button>
            )}
            {s === "publicada" && (
              <>
                <Button variant="outline" className="w-full justify-start min-h-[44px]" onClick={wrap(() => onRenew(post, 24))}>
                  <RotateCw className="h-4 w-4 mr-2" /> Renovar Home por 24h
                </Button>
                <Button variant="outline" className="w-full justify-start min-h-[44px]" onClick={wrap(() => onRenew(post, 24 * 7))}>
                  <RotateCw className="h-4 w-4 mr-2" /> Renovar Home por 7 dias
                </Button>
                <Button variant="outline" className="w-full justify-start min-h-[44px]" onClick={wrap(() => onUnpublish(post))}>
                  <ArchiveRestore className="h-4 w-4 mr-2" /> Despublicar (voltar à revisão)
                </Button>
              </>
            )}
          </div>

          {/* Grupo: destrutivas — separadas e em vermelho */}
          <div className="grid gap-2 pt-2 border-t border-border">
            {s === "arquivada" ? (
              <Button
                variant="outline"
                className="w-full justify-start min-h-[44px] border-emerald-500 text-emerald-700 hover:bg-emerald-50"
                onClick={wrap(() => onRestore(post))}
              >
                <ArchiveRestore className="h-4 w-4 mr-2" /> Restaurar do arquivo
              </Button>
            ) : (
              <Button
                variant="outline"
                className="w-full justify-start min-h-[44px] text-zinc-800"
                onClick={wrap(() => onArchive(post))}
              >
                <Archive className="h-4 w-4 mr-2" /> Arquivar
              </Button>
            )}
            <Button
              variant="outline"
              className="w-full justify-start min-h-[44px] border-red-500 text-red-700 hover:bg-red-50"
              onClick={wrap(() => onDelete(post))}
            >
              <Trash2 className="h-4 w-4 mr-2" /> Excluir permanentemente
            </Button>
          </div>
        </div>

        <SheetFooter className="mt-4">
          <Button variant="ghost" onClick={close} className="min-h-[44px] w-full">
            Cancelar
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
