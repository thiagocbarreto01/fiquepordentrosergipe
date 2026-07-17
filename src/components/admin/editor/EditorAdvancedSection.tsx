import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Sparkles, Loader2, Lock, ChevronDown } from "lucide-react";
import { deriveMetaTitle, deriveMetaDescription } from "@/lib/seoAuto";

export type EditorSeoValues = {
  meta_title: string;
  meta_description: string;
};

export type EditorVideoValues = {
  video_url_principal: string;
  videos_relacionados_text: string;
};

export type EditorAdvancedValues = {
  slug: string;
  meta_title: string;
  meta_description: string;
  video_url_principal: string;
  videos_relacionados_text: string;
  instagram_headline: string;
  // Contexto para SEO preview (não editável aqui):
  title: string;
  subtitle: string;
  content: string;
};

export interface EditorAdvancedSectionProps {
  values: EditorAdvancedValues;
  /** slug fica bloqueado quando notícia já publicada (evita quebrar URL). */
  slugLocked: boolean;
  isNew: boolean;
  genIgHeadline: boolean;
  canGenIgHeadline: boolean;
  onChange: (patch: Partial<EditorAdvancedValues>) => void;
  onGenerateIgHeadline: () => void | Promise<void>;
  slugify: (s: string) => string;
}

function trimSpaces(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/**
 * Seção "5. Opções avançadas" — recolhida por padrão via <details>.
 *
 * Contém: slug, SEO, vídeo principal, vídeos relacionados, manchete Instagram.
 *
 * NÃO grava nada; apenas emite `onChange` para o AdminPostEditor.
 * SEO exibido como sugestão quando manual estiver vazio, sem escrever no form.
 */
export function EditorAdvancedSection({
  values,
  slugLocked,
  isNew,
  genIgHeadline,
  canGenIgHeadline,
  onChange,
  onGenerateIgHeadline,
  slugify,
}: EditorAdvancedSectionProps) {
  const [open, setOpen] = useState(false);

  const publicUrl = useMemo(() => {
    const s = (values.slug || "").trim();
    if (!s) return "";
    if (typeof window === "undefined") return `/noticia/${s}`;
    return `${window.location.origin}/noticia/${s}`;
  }, [values.slug]);

  const suggestedMetaTitle = useMemo(
    () => deriveMetaTitle(values.title || values.subtitle || ""),
    [values.title, values.subtitle],
  );
  const suggestedMetaDescription = useMemo(
    () => deriveMetaDescription(values.subtitle || "", values.content || ""),
    [values.subtitle, values.content],
  );

  const metaTitleValue = values.meta_title ?? "";
  const metaDescValue = values.meta_description ?? "";
  const metaTitleAuto = trimSpaces(metaTitleValue).length === 0;
  const metaDescAuto = trimSpaces(metaDescValue).length === 0;

  const igLen = (values.instagram_headline ?? "").length;

  return (
    <details
      className="bg-card border border-border rounded-md group"
      open={open}
      onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}
    >
      <summary
        className="cursor-pointer list-none flex items-center justify-between p-4 select-none min-h-[44px]"
        aria-label="Alternar opções avançadas"
      >
        <div>
          <h3 className="font-bold uppercase tracking-wider text-xs">
            5. Opções avançadas
          </h3>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Slug, SEO, vídeos e manchete Instagram. Recolhido por padrão.
          </p>
        </div>
        <ChevronDown
          className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </summary>

      <div className="border-t border-border p-4 space-y-6">
        {/* SLUG */}
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="adv-slug" className="text-xs uppercase font-semibold">
              Slug (URL pública)
            </Label>
            {slugLocked && (
              <span className="inline-flex items-center gap-1 text-[10px] uppercase font-bold px-2 py-0.5 bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/30 rounded-full">
                <Lock className="h-3 w-3" /> Bloqueado
              </span>
            )}
          </div>
          <Input
            id="adv-slug"
            value={values.slug ?? ""}
            disabled={slugLocked}
            onChange={(e) => onChange({ slug: slugify(e.target.value) })}
          />
          {publicUrl && (
            <p className="text-[11px] text-muted-foreground break-all">
              URL: <span className="font-mono">{publicUrl}</span>
            </p>
          )}
          {slugLocked ? (
            <p className="text-[11px] text-amber-700 dark:text-amber-400">
              A alteração de URL de matéria publicada será disponibilizada após
              a implementação do histórico de redirecionamentos.
            </p>
          ) : isNew ? (
            <p className="text-[11px] text-muted-foreground">
              Preview gerado a partir do título. Só é salvo quando a notícia
              for salva pela primeira vez.
            </p>
          ) : (
            <p className="text-[11px] text-muted-foreground">
              Ajuste apenas antes da primeira publicação. Depois de publicada,
              a URL fica bloqueada.
            </p>
          )}
        </div>

        {/* SEO */}
        <div className="space-y-3 pt-2 border-t border-border">
          <div className="flex items-center justify-between">
            <h4 className="text-xs uppercase font-semibold">SEO</h4>
            <p className="text-[10px] text-muted-foreground">
              Preenchimento manual nunca é sobrescrito. Vazio é derivado ao
              salvar.
            </p>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <Label htmlFor="adv-meta-title">Meta title</Label>
              <span
                className={`text-[10px] font-mono ${
                  metaTitleValue.length > 65
                    ? "text-destructive"
                    : metaTitleValue.length > 55
                      ? "text-amber-500"
                      : "text-muted-foreground"
                }`}
              >
                {metaTitleValue.length}/60{" "}
                {metaTitleAuto ? "(automático)" : "(personalizado)"}
              </span>
            </div>
            <Input
              id="adv-meta-title"
              value={metaTitleValue}
              placeholder={suggestedMetaTitle || "Automático a partir do título"}
              onChange={(e) => onChange({ meta_title: e.target.value })}
            />
            {metaTitleAuto && suggestedMetaTitle && (
              <p className="text-[11px] text-muted-foreground mt-1">
                Sugestão (será usada ao salvar):{" "}
                <span className="italic">{suggestedMetaTitle}</span>
              </p>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between">
              <Label htmlFor="adv-meta-desc">Meta description</Label>
              <span
                className={`text-[10px] font-mono ${
                  metaDescValue.length > 160
                    ? "text-destructive"
                    : metaDescValue.length > 140
                      ? "text-amber-500"
                      : "text-muted-foreground"
                }`}
              >
                {metaDescValue.length}/155{" "}
                {metaDescAuto ? "(automático)" : "(personalizado)"}
              </span>
            </div>
            <Textarea
              id="adv-meta-desc"
              rows={3}
              value={metaDescValue}
              placeholder={
                suggestedMetaDescription ||
                "Automático a partir do subtítulo ou do primeiro parágrafo"
              }
              onChange={(e) => onChange({ meta_description: e.target.value })}
            />
            {metaDescAuto && suggestedMetaDescription && (
              <p className="text-[11px] text-muted-foreground mt-1">
                Sugestão (será usada ao salvar):{" "}
                <span className="italic">{suggestedMetaDescription}</span>
              </p>
            )}
          </div>
        </div>

        {/* VÍDEOS */}
        <div className="space-y-3 pt-2 border-t border-border">
          <h4 className="text-xs uppercase font-semibold">Vídeos</h4>
          <div>
            <Label htmlFor="adv-video-main">Vídeo principal (URL)</Label>
            <p className="text-[11px] text-muted-foreground mb-1">
              YouTube, Instagram (post/reel), Vimeo ou embed. Quando preenchido,
              o vídeo aparece no topo da matéria, acima da imagem de capa.
            </p>
            <Input
              id="adv-video-main"
              placeholder="https://www.youtube.com/watch?v=… ou https://www.instagram.com/reel/…"
              value={values.video_url_principal ?? ""}
              onChange={(e) => onChange({ video_url_principal: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor="adv-videos-rel">
              Vídeos relacionados (uma URL por linha)
            </Label>
            <p className="text-[11px] text-muted-foreground mb-1">
              Aparecem abaixo do conteúdo da matéria.
            </p>
            <Textarea
              id="adv-videos-rel"
              rows={3}
              placeholder={
                "https://www.youtube.com/watch?v=...\nhttps://www.instagram.com/reel/..."
              }
              value={values.videos_relacionados_text ?? ""}
              onChange={(e) =>
                onChange({ videos_relacionados_text: e.target.value })
              }
            />
          </div>
        </div>

        {/* INSTAGRAM */}
        <div className="space-y-2 pt-2 border-t border-border">
          <h4 className="text-xs uppercase font-semibold">Instagram</h4>
          <div>
            <Label htmlFor="adv-ig" className="flex items-center justify-between">
              <span>Manchete Instagram (curta, usada só na arte)</span>
              <span
                className={`text-[10px] font-mono ${
                  igLen > 80
                    ? "text-destructive"
                    : igLen > 60
                      ? "text-amber-500"
                      : "text-muted-foreground"
                }`}
              >
                {igLen}/80 (ideal ≤60)
              </span>
            </Label>
            <div className="flex flex-col sm:flex-row gap-2 mt-1">
              <Input
                id="adv-ig"
                value={values.instagram_headline ?? ""}
                maxLength={80}
                placeholder="Ex.: Pré-candidatos devem deixar rádio e TV em junho"
                onChange={(e) => onChange({ instagram_headline: e.target.value })}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={genIgHeadline || !canGenIgHeadline}
                onClick={() => onGenerateIgHeadline()}
                className="min-h-[44px]"
              >
                {genIgHeadline ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4 mr-1" />
                )}
                Gerar com IA
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">
              Se vazio, a arte usa o título completo com ajuste automático de
              fonte e reticências.
            </p>
          </div>
        </div>
      </div>
    </details>
  );
}
