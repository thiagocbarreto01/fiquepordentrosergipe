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
  navy: "#041B4D",
  navyDeep: "#02102E",
  red: "#E30613",
  yellow: "#FFD60A",
  white: "#FFFFFF",
  black: "#0A0A0A",
};

// Cor da faixa de categoria por editoria
function categoryColor(name: string): { bg: string; fg: string } {
  const n = (name || "").toLowerCase();
  if (/pol[ií]cia|policial|crime/.test(n)) return { bg: "#E30613", fg: "#FFFFFF" };
  if (/sergipe|aracaju/.test(n))           return { bg: "#0E8C3A", fg: "#FFFFFF" };
  if (/pol[ií]tica/.test(n))               return { bg: "#1457C7", fg: "#FFFFFF" };
  if (/brasil|nacional/.test(n))           return { bg: "#FFC700", fg: "#0A0A0A" };
  if (/esporte|futebol/.test(n))           return { bg: "#84CC16", fg: "#0A0A0A" };
  if (/economia|mercado|financ/.test(n))   return { bg: "#C99A2E", fg: "#0A0A0A" };
  if (/entreten|cultur|celebr/.test(n))    return { bg: "#7C3AED", fg: "#FFFFFF" };
  if (/mundo|internacional/.test(n))       return { bg: "#0F172A", fg: "#FFFFFF" };
  return { bg: "#E30613", fg: "#FFFFFF" };
}

const HIGHLIGHT_WORDS = [
  "MORTE", "MORTO", "MORTA", "MORREU", "MORTOS", "MORTAS",
  "PRISÃO", "PRESO", "PRESA", "PRESOS",
  "ACIDENTE", "ACIDENTES", "FATAL", "FATAIS",
  "POLÍCIA", "POLICIAL",
  "SERGIPE", "ARACAJU",
  "URGENTE", "PLANTÃO",
  "INVESTIGAÇÃO", "INVESTIGA",
  "ASSASSINATO", "ASSASSINADO",
  "TIROTEIO", "TIROS",
  "OPERAÇÃO",
  "MILHÕES", "MILHÃO", "BILHÕES", "BILHÃO",
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
  // ZONAS FIXAS — total 1350px
  //   HEADER  15%  →   0 .. 203   (logo + data + categoria)
  //   PHOTO   50%  → 203 .. 878   (altura fixa, nunca invade outra área)
  //   TITLE   20%  → 878 .. 1148  (fundo navy, máx 3 linhas, centralizado)
  //   FOOTER  15%  → 1148 .. 1350 (marca / @ / CTA — nunca se move)
  // ---------------------------------------------------------------------------
  const HEADER_H = Math.round(H * 0.15);   // 203
  const PHOTO_H  = Math.round(H * 0.50);   // 675
  const TITLE_H  = Math.round(H * 0.20);   // 270
  const FOOTER_H = H - HEADER_H - PHOTO_H - TITLE_H; // 202

  const headerY = 0;
  const photoY  = HEADER_H;
  const titleY  = HEADER_H + PHOTO_H;
  const footerY = titleY + TITLE_H;
  const PAD_X = 56;

  // ---------------------------------------------------------------------------
  // 1) HEADER — logo + data + categoria
  // ---------------------------------------------------------------------------
  ctx.fillStyle = COLORS.navy;
  ctx.fillRect(0, headerY, W, HEADER_H);

  const CAT_H = 44;
  const headerInnerH = HEADER_H - CAT_H; // espaço para logo+data acima da faixa

  // Logo — protagonista do topo
  if (logo) {
    const maxLogoH = 110;
    const maxLogoW = 760;
    const ratio = logo.width / logo.height;
    let lh = maxLogoH;
    let lw = lh * ratio;
    if (lw > maxLogoW) { lw = maxLogoW; lh = lw / ratio; }
    const logoX = (W - lw) / 2;
    const logoY = 14;
    ctx.drawImage(logo, logoX, logoY, lw, lh);
  } else {
    ctx.fillStyle = COLORS.white;
    ctx.font = "900 44px system-ui, -apple-system, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("FIQUE POR DENTRO SERGIPE", W / 2, 14 + 110 / 2);
  }

  // Data curta (05 JUN 2026) — discreta e elegante
  const dateStr = formatShortDate(opts.publishedAt);
  if (dateStr) {
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.font = "700 20px system-ui, -apple-system, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(dateStr.split("").join("\u2009"), W / 2, headerInnerH - 16);
  }

  // Faixa de categoria — colorida por editoria, ocupa a base do header
  const catY = HEADER_H - CAT_H;
  if (opts.isUrgent) {
    ctx.fillStyle = COLORS.red;
    ctx.fillRect(0, catY, W, CAT_H);
    ctx.fillStyle = COLORS.white;
    ctx.font = "900 26px system-ui, -apple-system, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("⚠  URGENTE — PLANTÃO", W / 2, catY + CAT_H / 2 + 1);
  } else if (opts.categoryName) {
    const { bg, fg } = categoryColor(opts.categoryName);
    ctx.fillStyle = bg;
    ctx.fillRect(0, catY, W, CAT_H);
    ctx.fillStyle = fg;
    ctx.font = "900 24px system-ui, -apple-system, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const label = opts.categoryName.toUpperCase().split("").join("\u2009");
    ctx.fillText(label, W / 2, catY + CAT_H / 2 + 1);
  } else {
    ctx.fillStyle = COLORS.red;
    ctx.fillRect(0, catY, W, CAT_H);
  }

  // ---------------------------------------------------------------------------
  // 2) PHOTO — altura fixa, cover-fit, nunca invade outras áreas
  // ---------------------------------------------------------------------------
  ctx.fillStyle = COLORS.black;
  ctx.fillRect(0, photoY, W, PHOTO_H);
  if (cover) {
    const scale = Math.max(W / cover.width, PHOTO_H / cover.height);
    const dw = cover.width * scale;
    const dh = cover.height * scale;
    const dx = (W - dw) / 2;
    const overflow = dh - PHOTO_H;
    const dy = photoY - overflow * 0.30; // bias upward — mantém rostos no enquadramento
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, photoY, W, PHOTO_H);
    ctx.clip();
    ctx.drawImage(cover, dx, dy, dw, dh);
    ctx.restore();
  } else {
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.font = "700 24px system-ui";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("SEM IMAGEM DISPONÍVEL", W / 2, photoY + PHOTO_H / 2);
  }
  // Degradê escuro na base da foto — melhora leitura na transição
  const grad = ctx.createLinearGradient(0, photoY + PHOTO_H - 120, 0, photoY + PHOTO_H);
  grad.addColorStop(0, "rgba(4,27,77,0)");
  grad.addColorStop(1, "rgba(4,27,77,1)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, photoY + PHOTO_H - 120, W, 120);

  // ---------------------------------------------------------------------------
  // 3) TITLE BLOCK — fundo navy, altura fixa, até 3 linhas, centralizado
  // ---------------------------------------------------------------------------
  ctx.fillStyle = COLORS.navy;
  ctx.fillRect(0, titleY, W, TITLE_H);

  // Clip rígido — manchete NUNCA invade foto nem rodapé
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, titleY, W, TITLE_H);
  ctx.clip();

  const maxTitleWidth = W - PAD_X * 2;
  const tokens = tokenizeTitle(opts.title);
  const MAX_LINES = 3;
  const INNER_PAD = 28;
  const usableH = TITLE_H - INNER_PAD * 2;

  // Auto-fit: tenta 72 → 40, sempre respeitando 3 linhas E altura útil
  let fontSize = 72;
  let lines: TitleLine[] = [];
  let lineHeight = 0;
  while (fontSize >= 38) {
    ctx.font = `900 ${fontSize}px system-ui, -apple-system, sans-serif`;
    const spaceW0 = ctx.measureText(" ").width;
    lines = wrapTokens(ctx, tokens, maxTitleWidth, spaceW0);
    lineHeight = Math.round(fontSize * 1.08);
    if (lines.length <= MAX_LINES && lines.length * lineHeight <= usableH) break;
    fontSize -= 2;
  }
  if (lines.length > MAX_LINES) lines = lines.slice(0, MAX_LINES);

  ctx.font = `900 ${fontSize}px system-ui, -apple-system, sans-serif`;
  const spaceW = ctx.measureText(" ").width;
  const blockH = lines.length * lineHeight;
  // Centralização vertical real dentro do bloco
  const firstBaseline = titleY + (TITLE_H - blockH) / 2 + fontSize * 0.82;

  let ty = firstBaseline;
  for (const line of lines) {
    let x = PAD_X;
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
  ctx.restore();

  // ---------------------------------------------------------------------------
  // 4) FOOTER — marca FIQUE POR DENTRO SERGIPE (NUNCA se move)
  // ---------------------------------------------------------------------------
  ctx.fillStyle = COLORS.navyDeep;
  ctx.fillRect(0, footerY, W, FOOTER_H);
  ctx.fillStyle = COLORS.yellow;
  ctx.fillRect(0, footerY, W, 4);

  // Conteúdo centralizado no rodapé
  const footerCx = W / 2;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  ctx.fillStyle = COLORS.white;
  ctx.font = "900 32px system-ui, -apple-system, sans-serif";
  ctx.fillText("FIQUE POR DENTRO SERGIPE", footerCx, footerY + FOOTER_H * 0.30);

  ctx.fillStyle = COLORS.yellow;
  ctx.font = "800 26px system-ui, -apple-system, sans-serif";
  ctx.fillText("@FIQUEPORDENTROSERGIPE", footerCx, footerY + FOOTER_H * 0.58);

  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.font = "700 22px system-ui, -apple-system, sans-serif";
  ctx.fillText("DETALHES NA LEGENDA  ↓", footerCx, footerY + FOOTER_H * 0.85);



  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Falha ao converter canvas em imagem (toBlob)"))),
      "image/png",
    ),
  );
}
function formatShortDate(iso?: string): string {
  const d = iso ? new Date(iso) : new Date();
  if (Number.isNaN(d.getTime())) return "";
  const MONTHS = ["JAN","FEV","MAR","ABR","MAI","JUN","JUL","AGO","SET","OUT","NOV","DEZ"];
  const dd = String(d.getDate()).padStart(2, "0");
  return `${dd} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
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

  const MAX_HEADLINE_CHARS = 70;

  const [headline, setHeadline] = useState((instagramHeadline || title || "").trim());
  const [sub, setSub] = useState((subtitle || "").trim());
  const [urgent, setUrgent] = useState(!!isUrgent);
  const [showSponsors, setShowSponsors] = useState(true);
  const [summarizing, setSummarizing] = useState(false);

  const hasImage = !!imageUrl;
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const summarizedFor = useRef<string>("");

  useEffect(() => {
    setHeadline((instagramHeadline || title || "").trim());
  }, [instagramHeadline, title]);
  useEffect(() => { setSub((subtitle || "").trim()); }, [subtitle]);
  useEffect(() => { setUrgent(!!isUrgent); }, [isUrgent]);

  // Auto-resumir via IA se manchete > 70 caracteres
  useEffect(() => {
    if (!open) return;
    const current = headline.trim();
    if (current.length <= MAX_HEADLINE_CHARS) return;
    if (summarizedFor.current === current) return;
    summarizedFor.current = current;
    (async () => {
      setSummarizing(true);
      try {
        const { data, error } = await supabase.functions.invoke("generate-instagram-headline", {
          body: { title: current, subtitle: sub },
        });
        if (error) throw error;
        const short = (data?.headline || "").trim();
        if (short && short.length <= 80) {
          setHeadline(short);
          toast.success("Manchete resumida automaticamente pela IA");
        }
      } catch (e) {
        console.warn("[InstagramArt] auto-resumo falhou, usando truncamento local:", e);
        // Fallback: corte local respeitando palavra
        const cut = current.slice(0, MAX_HEADLINE_CHARS);
        const ls = cut.lastIndexOf(" ");
        setHeadline((ls > 30 ? cut.slice(0, ls) : cut).trim());
      } finally {
        setSummarizing(false);
      }
    })();
  }, [open, headline, sub]);



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
