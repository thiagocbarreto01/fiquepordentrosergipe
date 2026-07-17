import { useEffect, useMemo, useRef, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Download, Loader2 } from "lucide-react";
import {
  ArtFormat, FORMAT_LABEL, FORMAT_SIZE, RenderInput,
  renderArt, canvasToJpegBlob, sanitizeFilename,
} from "@/lib/instagramArt";
import { supabase } from "@/integrations/supabase/client";
import logoUrl from "@/assets/logo-fique-por-dentro.png";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  instagramPostId: string;
  initialHeadline: string;
  initialSubtitle?: string;
  initialEditoria?: string;
  fileNameBase?: string;
}

const FORMATS: ArtFormat[] = ["feed_4_5", "square", "story", "cover"];

/** Converte um asset local (URL relativa/absoluta) em data URL para uso no canvas sem CORS. */
async function assetToDataUrl(src: string): Promise<string | null> {
  try {
    const res = await fetch(src);
    const blob = await res.blob();
    return await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
  } catch { return null; }
}

export default function CriarArteDialog({
  open, onOpenChange, instagramPostId,
  initialHeadline, initialSubtitle, initialEditoria, fileNameBase,
}: Props) {
  const [format, setFormat] = useState<ArtFormat>("feed_4_5");
  const [headline, setHeadline] = useState(initialHeadline);
  const [subtitle, setSubtitle] = useState(initialSubtitle ?? "");
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);
  const [showSafe, setShowSafe] = useState(false);

  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(null);
  const [loadingImage, setLoadingImage] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [bytes, setBytes] = useState<number | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const previewRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setHeadline(initialHeadline);
    setSubtitle(initialSubtitle ?? "");
    setOffsetX(0); setOffsetY(0); setShowSafe(false);
    setBytes(null);
    (async () => {
      const l = await assetToDataUrl(logoUrl);
      setLogoDataUrl(l);
    })();
    (async () => {
      setLoadingImage(true);
      try {
        const { data, error } = await supabase.functions.invoke("fetch-instagram-package-image", {
          body: { instagram_post_id: instagramPostId },
        });
        if (error) throw error;
        const d = data as any;
        if (d?.success && d.data_url) setImageDataUrl(d.data_url);
        else setImageDataUrl(null);
      } catch (e: any) {
        toast.error(`Não foi possível carregar a imagem: ${e?.message ?? "erro"}`);
        setImageDataUrl(null);
      } finally {
        setLoadingImage(false);
      }
    })();
  }, [open, instagramPostId, initialHeadline, initialSubtitle]);

  const input = useMemo<RenderInput>(() => ({
    format,
    editoria: initialEditoria ?? "SERGIPE",
    manchete: headline,
    subtitulo: subtitle,
    imageDataUrl,
    logoDataUrl,
    offsetX, offsetY,
    showSafeArea: showSafe,
  }), [format, initialEditoria, headline, subtitle, imageDataUrl, logoDataUrl, offsetX, offsetY, showSafe]);

  // Renderiza no canvas oculto (tamanho real) + preview (proporcional).
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setRendering(true);
      const c = canvasRef.current;
      const p = previewRef.current;
      if (!c || !p) return;
      await renderArt(c, input);
      if (cancelled) return;
      // Copia para preview mantendo proporção.
      const { w, h } = FORMAT_SIZE[format];
      const previewW = 360;
      const previewH = Math.round((h / w) * previewW);
      p.width = previewW; p.height = previewH;
      const pctx = p.getContext("2d")!;
      pctx.imageSmoothingQuality = "high";
      pctx.drawImage(c, 0, 0, previewW, previewH);
      setRendering(false);
    })();
    return () => { cancelled = true; };
  }, [input, open, format]);

  async function download() {
    const c = canvasRef.current;
    if (!c || rendering) return;
    setDownloading(true);
    try {
      const blob = await canvasToJpegBlob(c, 0.92);
      setBytes(blob.size);
      const name = `${sanitizeFilename(fileNameBase ?? headline)}-${FORMAT_SIZE[format].w}x${FORMAT_SIZE[format].h}.jpg`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
      toast.success("Arte baixada com sucesso.");
    } catch (e: any) {
      toast.error(`Falha ao gerar JPEG: ${e?.message ?? "erro"}`);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Arte para Instagram</DialogTitle>
          <DialogDescription>
            Ajuste manchete, subtítulo e enquadramento. As alterações afetam apenas a arte — o pacote e a
            notícia permanecem inalterados.
          </DialogDescription>
        </DialogHeader>

        <div className="grid md:grid-cols-[1fr_360px] gap-6">
          {/* Controles */}
          <div className="space-y-4">
            <div>
              <Label>Formato</Label>
              <Select value={format} onValueChange={(v) => setFormat(v as ArtFormat)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FORMATS.map((f) => (
                    <SelectItem key={f} value={f}>{FORMAT_LABEL[f]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Manchete</Label>
              <Textarea rows={2} value={headline} onChange={(e) => setHeadline(e.target.value)} maxLength={140} />
              <div className="text-[11px] text-muted-foreground mt-1">{headline.length}/140</div>
            </div>

            <div>
              <Label>Subtítulo (opcional)</Label>
              <Input value={subtitle} onChange={(e) => setSubtitle(e.target.value)} maxLength={160} />
            </div>

            <div>
              <Label>Reposicionar horizontal</Label>
              <Slider min={-100} max={100} step={1} value={[offsetX * 100]} onValueChange={(v) => setOffsetX((v[0] ?? 0) / 100)} />
            </div>
            <div>
              <Label>Reposicionar vertical</Label>
              <Slider min={-100} max={100} step={1} value={[offsetY * 100]} onValueChange={(v) => setOffsetY((v[0] ?? 0) / 100)} />
            </div>

            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={showSafe} onCheckedChange={(c) => setShowSafe(!!c)} />
              Mostrar área segura (não aparece no arquivo final)
            </label>

            {loadingImage && (
              <div className="text-xs text-muted-foreground flex items-center gap-2">
                <Loader2 className="h-3 w-3 animate-spin" /> Carregando imagem com segurança…
              </div>
            )}
            {!loadingImage && !imageDataUrl && (
              <div className="text-xs text-amber-700 bg-amber-50 border border-amber-300 p-2 rounded">
                Sem imagem disponível — a arte será renderizada apenas com fundo navy.
              </div>
            )}
            {bytes !== null && (
              <div className="text-[11px] text-muted-foreground">
                Último JPEG gerado: ~{(bytes / 1024).toFixed(0)} KB
              </div>
            )}
          </div>

          {/* Preview */}
          <div className="flex flex-col items-center gap-3">
            <div className="border border-border bg-secondary p-2 rounded-sm">
              <canvas ref={previewRef} className="block max-w-full" />
            </div>
            <div className="text-[11px] text-muted-foreground text-center">
              Prévia proporcional • Export: {FORMAT_SIZE[format].w}×{FORMAT_SIZE[format].h}
            </div>
            {/* Canvas oculto em tamanho real */}
            <canvas ref={canvasRef} className="hidden" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
          <Button onClick={download} disabled={rendering || downloading || loadingImage}>
            {downloading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
            Baixar arte {FORMAT_SIZE[format].w}×{FORMAT_SIZE[format].h}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
