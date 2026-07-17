import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AdaptiveCoverImage } from "@/components/site/AdaptiveCoverImage";
import { ImageActionButtons } from "@/components/admin/ImageActionButtons";
import { Upload, RotateCcw, Loader2, ImagePlus, Trash2, ExternalLink } from "lucide-react";

export type EditorCoverValues = {
  cover_image_url: string;
  manual_image_url: string;
  cover_image_original: string;
  cover_image_source: string | null;
  image_caption: string;
  image_credit: string;
  slug: string;
  title: string;
  subtitle: string;
  excerpt?: string;
  instagram_headline?: string;
  is_urgent?: boolean;
  published_at?: string | null;
};

export interface EditorCoverSectionProps {
  values: EditorCoverValues;
  categoryName: string;
  sourceName: string;
  uploading: boolean;
  isNew: boolean;
  onChange: (patch: Partial<EditorCoverValues>) => void;
  onUpload: (file: File) => void | Promise<void>;
  onReprocess: () => void | Promise<void>;
}

const SOURCE_LABEL: Record<string, string> = {
  manual: "Manual",
  rss: "Feed RSS",
  extracted: "Extraída da URL",
  category_fallback: "Padrão da Categoria",
};

/**
 * Seção de Capa do Editor.
 *
 * Preserva integralmente o comportamento existente:
 *  - upload seguro (o handler externo já valida MIME/dimensões via helper),
 *  - substituição manual por URL,
 *  - imagem captada automaticamente com fallback,
 *  - legenda / crédito,
 *  - integração Instagram / arte (ImageActionButtons),
 *  - "Reprocessar automática" para notícias existentes.
 *
 * Novidades desta passada:
 *  - estado vazio compacto e profissional (sem placeholder cinza gigante),
 *  - remoção de capa via AlertDialog acessível, sem `window.confirm`,
 *  - apenas remove a referência (`manual_image_url = ""`), nunca apaga
 *    fisicamente arquivos do Storage.
 */
export function EditorCoverSection({
  values,
  categoryName,
  sourceName,
  uploading,
  isNew,
  onChange,
  onUpload,
  onReprocess,
}: EditorCoverSectionProps) {
  const [removeOpen, setRemoveOpen] = useState(false);
  const [removing, setRemoving] = useState(false);

  const displayedUrl = values.manual_image_url || values.cover_image_url || "";
  const hasCover = Boolean(displayedUrl);

  function confirmRemove() {
    if (removing) return;
    setRemoving(true);
    try {
      // Apenas remove a referência editorial. Nunca apaga do Storage.
      // Cai para cover_image_url (imagem captada) ou default de categoria/placeholder.
      onChange({ manual_image_url: "" });
      setRemoveOpen(false);
    } finally {
      // pequeno atraso evita clique duplo
      setTimeout(() => setRemoving(false), 300);
    }
  }

  return (
    <section
      aria-label="Imagem de capa"
      className="bg-card border border-border p-4 space-y-4"
    >
      <div className="flex items-center justify-between gap-2">
        <Label className="font-bold uppercase tracking-wider text-xs">
          2. Imagem de capa
        </Label>
        {values.cover_image_source && (
          <span className="text-[10px] px-2 py-0.5 bg-secondary border border-border rounded-full font-bold uppercase text-muted-foreground">
            Origem: {SOURCE_LABEL[values.cover_image_source] ?? values.cover_image_source}
          </span>
        )}
      </div>

      {hasCover ? (
        <div className="relative group border border-border bg-secondary/30">
          <AdaptiveCoverImage src={displayedUrl} alt="preview" maxHeight={480} />
          {values.manual_image_url && (
            <div className="absolute top-2 left-2 bg-primary text-primary-foreground text-[10px] font-bold px-2 py-0.5 uppercase">
              Substituição Manual Ativa
            </div>
          )}
          {!isNew && !values.manual_image_url && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => onReprocess()}
              disabled={uploading}
              className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
            >
              {uploading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <>
                  <RotateCcw className="h-3.5 w-3.5 mr-1" /> Reprocessar automática
                </>
              )}
            </Button>
          )}
        </div>
      ) : (
        <div
          className="border border-dashed border-border rounded-md bg-muted/20 px-4 py-5 flex flex-col sm:flex-row sm:items-center gap-3"
          role="group"
          aria-label="Sem imagem de capa"
        >
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="h-10 w-10 rounded-md bg-muted flex items-center justify-center text-muted-foreground shrink-0">
              <ImagePlus className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">
                Nenhuma imagem de capa adicionada
              </p>
              <p className="text-[11px] text-muted-foreground leading-snug">
                JPEG, PNG ou WebP • até 8&nbsp;MB • mínimo 400×250 (recomendado 1200×675).
              </p>
            </div>
          </div>
          <label className="inline-flex items-center justify-center gap-2 px-3 py-2 border border-border bg-secondary hover:bg-secondary/80 cursor-pointer text-sm min-h-[44px] rounded-md">
            <Upload className="h-4 w-4" />
            {uploading ? "Enviando…" : "Adicionar imagem"}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              hidden
              onChange={(e) => e.target.files?.[0] && onUpload(e.target.files[0])}
            />
          </label>
        </div>
      )}

      {hasCover && (
        <ImageActionButtons
          imageUrl={displayedUrl}
          slug={values.slug || "noticia"}
          title={values.title || ""}
          instagramHeadline={values.instagram_headline || ""}
          subtitle={values.subtitle || values.excerpt || ""}
          isUrgent={!!values.is_urgent}
          sourceName={sourceName || ""}
          publishedAt={values.published_at || undefined}
          categoryName={categoryName}
        />
      )}

      <div className="space-y-4">
        <div>
          <Label className="text-xs uppercase text-muted-foreground">
            Substituir imagem manualmente
          </Label>
          <div className="flex flex-col sm:flex-row gap-2 mt-1">
            <label className="inline-flex items-center justify-center gap-2 px-3 py-2 border border-border bg-secondary cursor-pointer text-sm hover:bg-secondary/80 transition-colors min-h-[44px] rounded-md sm:flex-shrink-0">
              <Upload className="h-4 w-4" /> {uploading ? "Enviando…" : "Upload"}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                hidden
                onChange={(e) => e.target.files?.[0] && onUpload(e.target.files[0])}
              />
            </label>
            <Input
              placeholder="URL da imagem manual..."
              value={values.manual_image_url ?? ""}
              onChange={(e) => onChange({ manual_image_url: e.target.value })}
            />
            {values.manual_image_url && (
              <div className="flex gap-2">
                {/^https?:\/\//i.test(values.manual_image_url) && (
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    title="Abrir imagem original"
                    aria-label="Abrir imagem original em nova aba"
                    onClick={() =>
                      window.open(values.manual_image_url, "_blank", "noopener,noreferrer")
                    }
                    className="min-h-[44px] min-w-[44px]"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                )}
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  title="Remover capa"
                  aria-label="Remover capa da notícia"
                  onClick={() => setRemoveOpen(true)}
                  className="min-h-[44px] min-w-[44px]"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
          <p className="text-[10px] text-muted-foreground mt-1">
            Se preenchido, esta imagem será exibida no site no lugar da imagem
            captada automaticamente.
          </p>
        </div>

        {!values.manual_image_url && (
          <div>
            <Label className="text-xs uppercase text-muted-foreground">
              Imagem captada automaticamente
            </Label>
            <Input
              className="mt-1 bg-secondary/50"
              placeholder="URL automática..."
              value={values.cover_image_url ?? ""}
              onChange={(e) =>
                onChange({
                  cover_image_url: e.target.value,
                  cover_image_source: "manual",
                })
              }
            />
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 border-t border-border">
          <div>
            <Label className="text-xs uppercase text-muted-foreground">
              Legenda da imagem
            </Label>
            <Input
              className="mt-1"
              placeholder="Ex: Vista aérea da orla de Aracaju"
              value={values.image_caption ?? ""}
              onChange={(e) => onChange({ image_caption: e.target.value })}
            />
            <p className="text-[10px] text-muted-foreground mt-1">
              Exibida abaixo da imagem principal. Se vazia, nada é mostrado.
            </p>
          </div>
          <div>
            <Label className="text-xs uppercase text-muted-foreground">
              Crédito da imagem
            </Label>
            <Input
              className="mt-1"
              placeholder="Ex: Assessoria de Comunicação"
              value={values.image_credit ?? ""}
              onChange={(e) => onChange({ image_credit: e.target.value })}
            />
            <p className="text-[10px] text-muted-foreground mt-1">
              Exibido abaixo da legenda (opcional).
            </p>
          </div>
        </div>
      </div>

      <AlertDialog open={removeOpen} onOpenChange={(o) => !removing && setRemoveOpen(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover capa da notícia?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>
                  Notícia:{" "}
                  <span className="font-semibold text-foreground">
                    {values.title || "(sem título)"}
                  </span>
                </p>
                <p>
                  A capa deixará de aparecer na matéria e nas prévias de
                  compartilhamento em redes sociais.
                </p>
                <p className="text-xs text-muted-foreground">
                  Imagens dentro do conteúdo da matéria não serão removidas. O
                  arquivo continua no armazenamento — apenas a referência
                  editorial é removida.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removing}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={removing}
              onClick={(e) => {
                e.preventDefault();
                confirmRemove();
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {removing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Removendo…
                </>
              ) : (
                "Remover capa"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
