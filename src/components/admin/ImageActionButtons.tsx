import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Download, ExternalLink, ImageIcon, Loader2, Eye, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import logoFiquePorDentro from "@/assets/logo-fique-por-dentro.png";
import sponsorsStrip from "@/assets/sponsors-strip.jpg";
import { supabase } from "@/integrations/supabase/client";

const SUPABASE_PUBLIC_MEDIA_PREFIX = `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/storage/v1/object/public/media/`;

// =============================================================================
// Brand palette — TV Barretão / portal regional inspired
// =============================================================================
const COLORS = {
  navy: "#071B4D",
  navyDeep: "#040F2E",
  red: "#D9001B",
  yellow: "#FFD60A",
  white: "#FFFFFF",
  black: "#0A0A0A",
};

const HIGHLIGHT_WORDS = [
  "MORTE", "MORTO", "MORTA", "MORREU",
  "PRISÃO", "PRESO", "PRESA", "PRESOS",
  "ACIDENTE", "ACIDENTES",
  "POLÍCIA", "POLICIAL",
  "SERGIPE",
  "URGENTE", "PLANTÃO",
  "INVESTIGAÇÃO", "INVESTIGA",
  "ASSASSINATO", "ASSASSINADO",
  "TIROTEIO", "TIROS",
  "OPERAÇÃO",
];

// =============================================================================
// Image fetch helpers
// =============================================================================
async function ensureStorageUrl(imageUrl: string, slug: string): Promise<string> {
  if (!imageUrl) throw new Error("Sem imagem de capa");
  if (imageUrl.startsWith(SUPABASE_PUBLIC_MEDIA_PREFIX)) return imageUrl;

  const { data, error } = await supabase.functions.invoke("import-image-to-storage", {
    body: { url: imageUrl, slug },
  });
  if (error) {
    const ctx: any = (error as any).context;
    let detail = error.message;
    try {
      if (ctx && typeof ctx.json === "function") {
        const j = await ctx.json();
        if (j?.error) detail = j.error;
      }
    } catch { /* ignore */ }
    console.error("[InstagramArt] import-image-to-storage falhou:", detail, "URL:", imageUrl);
    throw new Error(`Falha ao importar imagem para storage: ${detail}`);
  }
  if (!data?.url) throw new Error(`Resposta inválida ao importar imagem (URL: ${imageUrl})`);
  return data.url as string;
}

function loadImageEl(src: string, crossOrigin: boolean): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (crossOrigin) img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(new Error(`Falha ao carregar imagem: ${src}`));
    img.src = src;
  });
}

async function loadImageForCanvas(src: string): Promise<HTMLImageElement> {
  try {
    const res = await fetch(src, { mode: "cors" });
    if (res.ok) {
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      try {
        const img = await loadImageEl(url, false);
        return img;
      } finally {
        setTimeout(() => URL.revokeObjectURL(url), 5000);
      }
    }
  } catch { /* ignore */ }
  try {
    return await loadImageEl(src, true);
  } catch { /* ignore */ }
  return loadImageEl(src, false);
}

// =============================================================================
// Text layout helpers
// =============================================================================
type TitleToken = { text: string; highlight: boolean };
type TitleLine = TitleToken[];

function tokenizeTitle(raw: string): TitleToken[] {
  const upper = (raw || "").toUpperCase().replace(/\s+/g, " ").trim();
  if (!upper) return [];
  return upper.split(" ").map((word) => {
    const bare = word.replace(/[^A-ZÀ-ÚÇÃÕÊÔÉÁÍÓÚÂ]/g, "");
    return { text: word, highlight: HIGHLIGHT_WORDS.includes(bare) };
  });
}

function measureToken(ctx: CanvasRenderingContext2D, t: string): number {
  return ctx.measureText(t).width;
}

function wrapTokens(
  ctx: CanvasRenderingContext2D,
  tokens: TitleToken[],
  maxWidth: number,
  spaceW: number,
): TitleLine[] {
  const lines: TitleLine[] = [];
  let current: TitleLine = [];
  let currentW = 0;
  for (const tok of tokens) {
    const w = measureToken(ctx, tok.text);
    const next = current.length === 0 ? w : currentW + spaceW + w;
    if (next > maxWidth && current.length > 0) {
      lines.push(current);
      current = [tok];
      currentW = w;
    } else {
      current.push(tok);
      currentW = next;
    }
  }
  if (current.length > 0) lines.push(current);
  return lines;
}

function wrapPlain(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const test = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && cur) {
      lines.push(cur);
      cur = w;
    } else cur = test;
  }
  if (cur) lines.push(cur);
  return lines;
}

// =============================================================================
// Art generator — TV Barretão / portal regional style, 1080x1350 (4:5) only
// =============================================================================
interface ArtOptions {
  imageUrl: string;
  title: string;
  categoryName?: string;
  isUrgent?: boolean;
  publishedAt?: string;
}

async function generateInstagramArt(opts: ArtOptions): Promise<Blob> {
  const W = 1080;
  const H = 1350; // 4:5 — fixed, never anything else

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  // Background base
  ctx.fillStyle = COLORS.navy;
  ctx.fillRect(0, 0, W, H);

  // Pre-load assets in parallel (resilient to individual failures)
  const [logo, cover] = await Promise.all([
    loadImageForCanvas(logoFiquePorDentro).catch(() => null),
    opts.imageUrl ? loadImageForCanvas(opts.imageUrl).catch(() => null) : Promise.resolve(null),
  ]);

  // ---------------------------------------------------------------------------
  // 1) TOP HEADER — navy band with logo + date + source
  // ---------------------------------------------------------------------------
  const HEADER_H = 170;
  ctx.fillStyle = COLORS.navy;
  ctx.fillRect(0, 0, W, HEADER_H);
  // bottom red accent
  ctx.fillStyle = COLORS.red;
  ctx.fillRect(0, HEADER_H - 6, W, 6);

  // Logo centered
  if (logo) {
    const maxLogoH = 90;
    const maxLogoW = 720;
    const ratio = logo.width / logo.height;
    let lh = maxLogoH;
    let lw = lh * ratio;
    if (lw > maxLogoW) { lw = maxLogoW; lh = lw / ratio; }
    ctx.drawImage(logo, (W - lw) / 2, 28, lw, lh);
  } else {
    ctx.fillStyle = COLORS.white;
    ctx.font = "900 54px system-ui, -apple-system, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("FIQUE POR DENTRO SERGIPE", W / 2, 70);
  }

  // Date line only — NEVER show source/portal name (brand-only policy)
  const dateStr = formatDate(opts.publishedAt);
  if (dateStr) {
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.font = "600 22px system-ui, -apple-system, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(dateStr.toUpperCase(), W / 2, HEADER_H - 38);
  }

  // ---------------------------------------------------------------------------
  // 2) URGENT / PLANTÃO tag
  // ---------------------------------------------------------------------------
  let yCursor = HEADER_H;
  if (opts.isUrgent) {
    const tagH = 64;
    ctx.fillStyle = COLORS.red;
    ctx.fillRect(0, yCursor, W, tagH);
    ctx.fillStyle = COLORS.white;
    ctx.font = "900 38px system-ui, -apple-system, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const label = "⚠  URGENTE — PLANTÃO";
    ctx.fillText(label, W / 2, yCursor + tagH / 2 + 2);
    yCursor += tagH;
  } else if (opts.categoryName) {
    const tagH = 52;
    ctx.fillStyle = COLORS.red;
    ctx.fillRect(0, yCursor, W, tagH);
    ctx.fillStyle = COLORS.white;
    ctx.font = "900 28px system-ui, -apple-system, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(opts.categoryName.toUpperCase(), W / 2, yCursor + tagH / 2 + 1);
    yCursor += tagH;
  }

  // ---------------------------------------------------------------------------
  // 5) FOOTER (compute first to know remaining space)
  // ---------------------------------------------------------------------------
  const FOOTER_H = 160;
  const footerY = H - FOOTER_H;

  // ---------------------------------------------------------------------------
  // 3) IMAGE — ~60% of canvas height, smart cover-fit (no stretch)
  // ---------------------------------------------------------------------------
  const IMG_H = Math.round(H * 0.55); // ~743px
  const imgY = yCursor;
  ctx.fillStyle = COLORS.black;
  ctx.fillRect(0, imgY, W, IMG_H);
  if (cover) {
    const scale = Math.max(W / cover.width, IMG_H / cover.height);
    const dw = cover.width * scale;
    const dh = cover.height * scale;
    const dx = (W - dw) / 2;
    // Bias upward so faces stay in frame
    const overflow = dh - IMG_H;
    const dy = imgY - overflow * 0.30;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, imgY, W, IMG_H);
    ctx.clip();
    ctx.drawImage(cover, dx, dy, dw, dh);
    ctx.restore();
  } else {
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.font = "700 24px system-ui";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("SEM IMAGEM DISPONÍVEL", W / 2, imgY + IMG_H / 2);
  }
  // bottom gradient on image — smooth blend into navy title area
  const grad = ctx.createLinearGradient(0, imgY + IMG_H - 120, 0, imgY + IMG_H);
  grad.addColorStop(0, "rgba(7,27,77,0)");
  grad.addColorStop(1, "rgba(7,27,77,1)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, imgY + IMG_H - 120, W, 120);

  yCursor = imgY + IMG_H;

  // ---------------------------------------------------------------------------
  // 4) TITLE area (navy bg) — fills space between image and footer
  // ---------------------------------------------------------------------------
  const textAreaY = yCursor;
  const textAreaH = footerY - textAreaY;
  ctx.fillStyle = COLORS.navy;
  ctx.fillRect(0, textAreaY, W, textAreaH);

  const PAD_X = 56;
  const maxWidth = W - PAD_X * 2;
  const tokens = tokenizeTitle(opts.title).slice(0, 12); // máx 12 palavras

  // Auto-fit title: 78 → 40, 3 to 5 lines
  let fontSize = 78;
  let lines: TitleLine[] = [];
  let lineHeight = 0;

  while (fontSize >= 40) {
    ctx.font = `900 ${fontSize}px system-ui, -apple-system, sans-serif`;
    const spaceW0 = ctx.measureText(" ").width;
    lines = wrapTokens(ctx, tokens, maxWidth, spaceW0);
    lineHeight = fontSize * 1.06;
    const titleH = lines.length * lineHeight;
    if (lines.length <= 5 && titleH + 48 <= textAreaH) break;
    fontSize -= 3;
  }
  if (lines.length > 5) lines = lines.slice(0, 5);

  // Draw title with yellow highlights
  ctx.font = `900 ${fontSize}px system-ui, -apple-system, sans-serif`;
  const spaceW = ctx.measureText(" ").width;
  const titleH = lines.length * lineHeight;
  const titleStartY = textAreaY + 36 + fontSize * 0.85;

  let ty = titleStartY;
  for (const line of lines) {
    // measure full line width
    let lineW = 0;
    line.forEach((tok, i) => {
      lineW += measureToken(ctx, tok.text);
      if (i < line.length - 1) lineW += spaceW;
    });
    let x = PAD_X; // left-align for jornalismo feel
    for (let i = 0; i < line.length; i++) {
      const tok = line[i];
      ctx.fillStyle = tok.highlight ? COLORS.yellow : COLORS.white;
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      ctx.fillText(tok.text, x, ty);
      x += measureToken(ctx, tok.text);
      if (i < line.length - 1) x += spaceW;
    }
    ty += lineHeight;
  }

  // (Sem subtítulo / sem corpo da matéria — apenas título)

  // ---------------------------------------------------------------------------
  // 6) FOOTER — deep navy band: marca FIQUE POR DENTRO SERGIPE
  // ---------------------------------------------------------------------------
  ctx.fillStyle = COLORS.navyDeep;
  ctx.fillRect(0, footerY, W, FOOTER_H);
  ctx.fillStyle = COLORS.yellow;
  ctx.fillRect(0, footerY, W, 4);

  // Logo + nome do portal (esquerda)
  let textLeftX = PAD_X;
  if (logo) {
    const logoH = 72;
    const ratio = logo.width / logo.height;
    const logoW = logoH * ratio;
    ctx.drawImage(logo, PAD_X, footerY + (FOOTER_H - logoH) / 2, logoW, logoH);
    textLeftX = PAD_X + logoW + 24;
  }

  ctx.fillStyle = COLORS.white;
  ctx.font = "900 22px system-ui, -apple-system, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillText("FIQUE POR DENTRO SERGIPE", textLeftX, footerY + FOOTER_H / 2 - 18);

  ctx.font = "700 22px system-ui, -apple-system, sans-serif";
  ctx.fillStyle = COLORS.yellow;
  ctx.fillText("@fiquepordentrosergipe", textLeftX, footerY + FOOTER_H / 2 + 12);

  ctx.font = "600 18px system-ui, -apple-system, sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.78)";
  ctx.fillText("fiquepordentrosergipe.com.br", textLeftX, footerY + FOOTER_H / 2 + 40);

  // Direita — CTA institucional
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  ctx.font = "900 22px system-ui, -apple-system, sans-serif";
  ctx.fillStyle = COLORS.yellow;
  ctx.fillText("DETALHES NA LEGENDA ↓", W - PAD_X, footerY + FOOTER_H / 2);


  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Falha ao converter canvas em imagem (toBlob)"))),
      "image/png",
    ),
  );
}

function formatDate(iso?: string): string {
  const d = iso ? new Date(iso) : new Date();
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
}

// =============================================================================
// React component
// =============================================================================
interface Props {
  imageUrl: string;
  slug: string;
  title: string;
  categoryName: string;
  instagramHeadline?: string;
  subtitle?: string;
  isUrgent?: boolean;
  sourceName?: string;
  publishedAt?: string;
}

export function ImageActionButtons({
  imageUrl,
  slug,
  title,
  categoryName,
  instagramHeadline,
  subtitle,
  isUrgent,
  sourceName,
  publishedAt,
}: Props) {
  const [open, setOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null);
  const [generating, setGenerating] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [headline, setHeadline] = useState((instagramHeadline || title || "").trim());
  const [sub, setSub] = useState((subtitle || "").trim());
  const [urgent, setUrgent] = useState(!!isUrgent);
  const [showSponsors, setShowSponsors] = useState(true);

  const hasImage = !!imageUrl;
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setHeadline((instagramHeadline || title || "").trim());
  }, [instagramHeadline, title]);
  useEffect(() => { setSub((subtitle || "").trim()); }, [subtitle]);
  useEffect(() => { setUrgent(!!isUrgent); }, [isUrgent]);

  const buildArt = async (): Promise<Blob> => {
    let safeUrl = "";
    if (imageUrl) {
      try {
        safeUrl = await ensureStorageUrl(imageUrl, slug);
      } catch (e) {
        console.error("[InstagramArt] storage url failed:", e);
        // fall back to original; canvas will try direct load
        safeUrl = imageUrl;
      }
    }
    return generateInstagramArt({
      imageUrl: safeUrl,
      title: headline,
      categoryName,
      isUrgent: urgent,
      publishedAt,
    });
  };

  const regenerate = async () => {
    setGenerating(true);
    setErrorMsg(null);
    const startedAt = Date.now();
    try {
      const blob = await buildArt();
      const url = URL.createObjectURL(blob);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewBlob(blob);
      setPreviewUrl(url);
      console.log(`[InstagramArt] gerada em ${Date.now() - startedAt}ms — 1080x1350 (4:5)`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[InstagramArt] geração falhou:", e);
      setErrorMsg(msg);
      toast.error(`Falha ao gerar arte: ${msg}`, { duration: 9000 });
    } finally {
      setGenerating(false);
    }
  };

  // Live preview: debounce on input changes while dialog is open
  useEffect(() => {
    if (!open) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { regenerate(); }, 350);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, headline, urgent]);

  const openPreview = () => {
    setOpen(true);
    // first generate will fire from the effect
  };

  const closePreview = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setPreviewBlob(null);
    setOpen(false);
    setErrorMsg(null);
  };

  const handleDownload = async () => {
    if (!hasImage) return;
    setDownloading(true);
    try {
      const res = await fetch(imageUrl, { mode: "cors" });
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `fiquepordentrose-${slug}.jpg`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      toast.error("Falha ao baixar imagem");
    } finally { setDownloading(false); }
  };

  const handleDownloadArt = () => {
    if (!previewBlob) return;
    const url = URL.createObjectURL(previewBlob);
    const a = document.createElement("a");
    a.href = url; a.download = `fiquepordentrose-${slug || "noticia"}-instagram-1080x1350.png`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast.success("Arte 1080×1350 (4:5) baixada");
  };

  return (
    <>
      <div className="flex flex-wrap gap-2 mb-4">
        <Button type="button" variant="outline" size="sm" onClick={handleDownload} disabled={!hasImage || downloading}>
          {downloading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
          Baixar Imagem
        </Button>
        <Button
          type="button" variant="outline" size="sm"
          onClick={() => imageUrl && window.open(imageUrl, "_blank", "noopener,noreferrer")}
          disabled={!hasImage}
        >
          <ExternalLink className="h-4 w-4 mr-2" /> Abrir Original
        </Button>
        <Button type="button" size="sm" onClick={openPreview}>
          <ImageIcon className="h-4 w-4 mr-2" /> Gerar Arte Instagram (4:5)
        </Button>
      </div>

      <Dialog open={open} onOpenChange={(o) => !o && closePreview()}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Arte Instagram — 1080×1350 (4:5) — Preview ao vivo</DialogTitle>
          </DialogHeader>

          <div className="grid md:grid-cols-2 gap-4">
            {/* LIVE PREVIEW */}
            <div className="bg-muted rounded-md p-2 flex items-center justify-center min-h-[400px] relative">
              {generating && (
                <div className="absolute inset-0 bg-black/30 flex items-center justify-center z-10 rounded-md">
                  <Loader2 className="h-8 w-8 animate-spin text-white" />
                </div>
              )}
              {previewUrl ? (
                <img
                  src={previewUrl}
                  alt="Preview arte Instagram 1080x1350"
                  className="block h-auto rounded shadow-lg"
                  style={{ width: "auto", maxHeight: "70vh", aspectRatio: "4 / 5" }}
                />
              ) : (
                <div className="text-xs text-muted-foreground">Gerando primeira prévia…</div>
              )}
            </div>

            {/* CONTROLS */}
            <div className="space-y-3">
              {errorMsg && (
                <div className="border border-destructive/50 bg-destructive/10 text-destructive rounded-md p-2 text-xs flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                  <div>
                    <strong>Erro:</strong> {errorMsg}
                    <div className="text-[10px] opacity-70 mt-1">Detalhes no console do navegador.</div>
                  </div>
                </div>
              )}

              <div>
                <Label className="text-xs flex justify-between">
                  <span>Manchete (CAIXA ALTA na arte)</span>
                  <span className={headline.length > 90 ? "text-destructive" : "text-muted-foreground"}>
                    {headline.length}/100
                  </span>
                </Label>
                <Textarea
                  value={headline}
                  maxLength={120}
                  onChange={(e) => setHeadline(e.target.value)}
                  rows={3}
                  placeholder="Manchete impactante"
                />
                <p className="text-[10px] text-muted-foreground mt-1">
                  Palavras destacadas em amarelo: MORTE, PRISÃO, ACIDENTE, POLÍCIA, SERGIPE, URGENTE, INVESTIGAÇÃO, etc.
                </p>
              </div>

              <div className="flex items-center justify-between rounded-md border p-2">
                <Label htmlFor="ig-urg" className="text-sm flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-destructive" />
                  Tarja URGENTE / PLANTÃO
                </Label>
                <Switch id="ig-urg" checked={urgent} onCheckedChange={setUrgent} />
              </div>

              <div className="text-[11px] text-muted-foreground rounded-md bg-secondary/50 p-2 space-y-0.5">
                <div><strong>Formato:</strong> 1080×1350 (4:5) — fixo</div>
                <div><strong>Categoria:</strong> {categoryName || "—"}</div>
                <div className="text-[10px] opacity-70 mt-1">
                  A arte exibe apenas marca FIQUE POR DENTRO SERGIPE — sem fonte/portal externo.
                </div>
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={regenerate} disabled={generating}>
              {generating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Regenerar
            </Button>
            <Button onClick={handleDownloadArt} disabled={!previewBlob || generating}>
              <Download className="h-4 w-4 mr-2" /> Baixar PNG 1080×1350
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
