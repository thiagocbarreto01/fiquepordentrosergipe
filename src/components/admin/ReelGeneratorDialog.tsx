import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Download, Copy, Film, Sparkles, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { renderReelMp4, type RenderProgress } from "@/lib/reelRenderer";
import type { Post } from "@/lib/noticias";

async function getFunctionErrorMessage(error: unknown): Promise<string> {
  const context = (error as { context?: Response })?.context;
  if (context instanceof Response) {
    try {
      const payload = await context.clone().json();
      return payload?.message || payload?.error || `Erro HTTP ${context.status}`;
    } catch {
      try {
        const text = await context.clone().text();
        return text || `Erro HTTP ${context.status}`;
      } catch {
        return `Erro HTTP ${context.status}`;
      }
    }
  }

  return String((error as Error)?.message ?? error ?? "Falha ao gerar conteúdo");
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  post: Post;
}

type Phase = "idle" | "generating-content" | "ready-to-render" | "rendering" | "done" | "error";

export default function ReelGeneratorDialog({ open, onOpenChange, post }: Props) {
  const { toast } = useToast();
  const [phase, setPhase] = useState<Phase>("idle");
  const [headline, setHeadline] = useState("");
  const [summary, setSummary] = useState<string[]>([]);
  const [caption, setCaption] = useState("");
  const [progress, setProgress] = useState<RenderProgress | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const supportsMp4 = typeof (globalThis as any).VideoEncoder !== "undefined";

  async function handleGenerateContent() {
    setPhase("generating-content");
    setErrorMsg(null);
    try {
      const { data, error } = await supabase.functions.invoke("generate-reel-content", {
        body: {
          title: post.title,
          subtitle: post.subtitle ?? "",
          content: post.content ?? "",
          category: post.categories?.name ?? "",
          image: post.cover_image_url ?? post.categories?.default_cover_image_url ?? "",
        },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.message || data?.error || "Falha ao gerar conteúdo");
      setHeadline(data.headline);
      setSummary(data.summary);
      setCaption(data.caption);
      setPhase("ready-to-render");
    } catch (e: any) {
      console.error(e);
      const msg = await getFunctionErrorMessage(e);
      if (msg.includes("402") || msg.toLowerCase().includes("payment_required")) {
        setErrorMsg("Créditos de IA esgotados. Adicione créditos para gerar conteúdo.");
      } else {
        setErrorMsg(msg);
      }
      setPhase("error");
    }
  }

  async function handleRender() {
    setPhase("rendering");
    setErrorMsg(null);
    setVideoUrl(null);
    try {
      const blob = await renderReelMp4(
        {
          headline,
          summary,
          category: post.categories?.name ?? null,
          isUrgent: !!post.is_urgent,
          imageUrl: post.cover_image_url ?? post.categories?.default_cover_image_url ?? null,
        },
        (p) => setProgress(p),
      );
      const url = URL.createObjectURL(blob);
      setVideoUrl(url);
      setPhase("done");
    } catch (e: any) {
      console.error(e);
      setErrorMsg(String(e?.message ?? e));
      setPhase("error");
    }
  }

  function handleCopyCaption() {
    if (!caption) return;
    navigator.clipboard.writeText(caption);
    toast({ title: "Legenda copiada!", description: "Cole no Instagram ao publicar o Reel." });
  }

  function handleDownload() {
    if (!videoUrl) return;
    const a = document.createElement("a");
    a.href = videoUrl;
    a.download = `reel-${slugify(post.title).slice(0, 60)}.mp4`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function handleClose(next: boolean) {
    if (!next && videoUrl) {
      URL.revokeObjectURL(videoUrl);
      setVideoUrl(null);
    }
    if (!next) {
      setPhase("idle");
      setHeadline("");
      setSummary([]);
      setCaption("");
      setProgress(null);
      setErrorMsg(null);
    }
    onOpenChange(next);
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Film className="h-5 w-5" /> Gerar Reel (1080×1920, 15s)
          </DialogTitle>
        </DialogHeader>

        {!supportsMp4 && (
          <div className="rounded-md bg-destructive/10 text-destructive p-3 text-sm flex gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>
              Seu navegador não suporta exportação MP4 (WebCodecs). Use Chrome, Edge ou Opera atualizado.
            </span>
          </div>
        )}

        {errorMsg && (
          <div className="rounded-md bg-destructive/10 text-destructive p-3 text-sm flex gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        {phase === "idle" && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Vamos transformar <strong>{post.title}</strong> em um Reel vertical pronto para Instagram.
            </p>
            <Button onClick={handleGenerateContent} disabled={!supportsMp4} className="w-full">
              <Sparkles className="h-4 w-4 mr-2" />
              Gerar conteúdo com IA
            </Button>
          </div>
        )}

        {phase === "generating-content" && (
          <div className="flex items-center gap-3 text-sm text-muted-foreground py-4">
            <Loader2 className="h-4 w-4 animate-spin" /> Gerando manchete, resumo e legenda…
          </div>
        )}

        {(phase === "ready-to-render" || phase === "rendering" || phase === "done") && (
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Manchete do Reel
              </label>
              <Textarea
                value={headline}
                onChange={(e) => setHeadline(e.target.value)}
                rows={2}
                maxLength={90}
                disabled={phase === "rendering"}
              />
              <p className="text-xs text-muted-foreground">{headline.length}/90</p>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Resumo (3 frases)
              </label>
              {summary.map((line, i) => (
                <Textarea
                  key={i}
                  value={line}
                  onChange={(e) => {
                    const next = [...summary];
                    next[i] = e.target.value;
                    setSummary(next);
                  }}
                  rows={2}
                  maxLength={120}
                  disabled={phase === "rendering"}
                />
              ))}
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Legenda para Instagram
              </label>
              <Textarea
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                rows={6}
                disabled={phase === "rendering"}
              />
              <Button variant="outline" size="sm" onClick={handleCopyCaption}>
                <Copy className="h-3 w-3 mr-2" /> Copiar legenda
              </Button>
            </div>

            {phase !== "done" && (
              <Button
                onClick={handleRender}
                disabled={phase === "rendering" || !headline || summary.length === 0}
                className="w-full"
              >
                {phase === "rendering" ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Renderizando {progress ? `${Math.round((progress.frame / progress.total) * 100)}%` : "…"}
                  </>
                ) : (
                  <>
                    <Film className="h-4 w-4 mr-2" /> Gerar vídeo MP4
                  </>
                )}
              </Button>
            )}

            {phase === "rendering" && progress && (
              <div className="h-2 w-full bg-muted rounded overflow-hidden">
                <div
                  className="h-full bg-primary transition-all"
                  style={{ width: `${(progress.frame / progress.total) * 100}%` }}
                />
              </div>
            )}

            {phase === "done" && videoUrl && (
              <div className="space-y-3">
                <div className="bg-black rounded-md overflow-hidden flex justify-center">
                  <video
                    src={videoUrl}
                    controls
                    autoPlay
                    loop
                    playsInline
                    className="max-h-[60vh] aspect-[9/16]"
                  />
                </div>
                <div className="flex gap-2">
                  <Button onClick={handleDownload} className="flex-1">
                    <Download className="h-4 w-4 mr-2" /> Baixar MP4
                  </Button>
                  <Button variant="outline" onClick={handleCopyCaption}>
                    <Copy className="h-4 w-4 mr-2" /> Copiar legenda
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function slugify(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
