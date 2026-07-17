/**
 * ArticlePreviewDialog — pré-visualização fiel do template público.
 *
 * Reproduz a ordem: categoria → título → subtítulo → capa → legenda/crédito
 * → autor/data → conteúdo. Alterna entre Desktop e Celular.
 * Não publica, não altera banco. Usa os dados atuais do formulário.
 */

import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Monitor, Smartphone } from "lucide-react";
import { normalizeEditorContent } from "@/lib/normalizeEditorContent";

export type PreviewSnapshot = {
  title?: string | null;
  subtitle?: string | null;
  content?: string | null;
  cover_image_url?: string | null;
  manual_image_url?: string | null;
  image_caption?: string | null;
  image_credit?: string | null;
  categoryName?: string | null;
  authorLabel?: string | null;
  publishedAtIso?: string | null;
};

function dedupeCover(html: string, coverSrc: string | null): string {
  if (!coverSrc) return html;
  try {
    const esc = coverSrc.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(
      `<(?:figure|p)[^>]*>\\s*<img[^>]*src=["']${esc}["'][^>]*>[\\s\\S]*?</(?:figure|p)>|<img[^>]*src=["']${esc}["'][^>]*/?>`,
      "gi",
    );
    return html.replace(re, "");
  } catch { return html; }
}

export function ArticlePreviewDialog({
  open, onOpenChange, snapshot,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  snapshot: PreviewSnapshot;
}) {
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const cover = snapshot.manual_image_url || snapshot.cover_image_url || null;
  const caption = snapshot.image_caption?.trim() || null;
  const credit = snapshot.image_credit?.trim() || null;
  const rawContent = normalizeEditorContent(snapshot.content || "");
  const deduped = dedupeCover(rawContent, cover);
  const looksHtml = /<\/?(p|img|figure|h[1-6]|ul|ol|blockquote|br)\b/i.test(deduped);

  const frameCls =
    device === "desktop"
      ? "mx-auto w-full max-w-[900px]"
      : "mx-auto w-[390px] max-w-full border-2 border-border rounded-2xl shadow-inner p-3 bg-white";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col p-0">
        <DialogHeader className="border-b border-border p-4 flex-row items-center justify-between space-y-0 gap-2">
          <DialogTitle className="text-base">Pré-visualização — sem publicar</DialogTitle>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant={device === "desktop" ? "default" : "outline"}
              size="sm"
              onClick={() => setDevice("desktop")}
              className="gap-1"
            >
              <Monitor className="h-4 w-4" /> Computador
            </Button>
            <Button
              type="button"
              variant={device === "mobile" ? "default" : "outline"}
              size="sm"
              onClick={() => setDevice("mobile")}
              className="gap-1"
            >
              <Smartphone className="h-4 w-4" /> Celular
            </Button>
          </div>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto bg-secondary/30 p-4">
          <article className={frameCls}>
            <div className="flex items-center gap-2 mb-2">
              {snapshot.categoryName && (
                <span className="text-[10px] uppercase font-black tracking-widest bg-primary text-primary-foreground px-2 py-0.5 rounded-sm">
                  {snapshot.categoryName}
                </span>
              )}
            </div>
            <h1 className={`font-display font-black leading-[1.1] ${device === "mobile" ? "text-2xl" : "text-4xl md:text-5xl"}`}>
              {snapshot.title || <span className="text-muted-foreground italic">Sem título</span>}
            </h1>
            {snapshot.subtitle && (
              <p className={`mt-3 text-muted-foreground font-serif-news ${device === "mobile" ? "text-base" : "text-lg md:text-xl"}`}>
                {snapshot.subtitle}
              </p>
            )}
            {cover && (
              <figure className={`mt-5 ${device === "mobile" ? "" : "mx-auto max-w-[760px]"}`}>
                <img src={cover} alt={snapshot.title || ""} className="w-full h-auto rounded-md" />
                {(caption || credit) && (
                  <figcaption className="mt-2 text-sm text-muted-foreground leading-snug">
                    {caption && <span>{caption}</span>}
                    {caption && credit && <span className="mx-1">·</span>}
                    {credit && <span className="italic">Crédito: {credit}</span>}
                  </figcaption>
                )}
              </figure>
            )}
            <div className="mt-5 pb-4 border-b border-border text-sm text-muted-foreground flex flex-wrap items-center gap-3">
              <span>Por <strong className="text-foreground">{snapshot.authorLabel || "Redação Fique Por Dentro Sergipe"}</strong></span>
              <span>·</span>
              <span>{snapshot.publishedAtIso ? new Date(snapshot.publishedAtIso).toLocaleString("pt-BR") : "Data a definir"}</span>
            </div>
            <div className="article-content prose prose-lg max-w-none mt-5 font-serif-news leading-relaxed text-foreground/90">
              {looksHtml ? (
                <div dangerouslySetInnerHTML={{ __html: deduped }} />
              ) : (
                <div className="whitespace-pre-wrap">{deduped || <span className="text-muted-foreground italic">Sem conteúdo</span>}</div>
              )}
            </div>
          </article>
        </div>
      </DialogContent>
    </Dialog>
  );
}
