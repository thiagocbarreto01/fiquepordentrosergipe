import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Download, ExternalLink, ImageIcon, Loader2, Eye } from "lucide-react";
import { toast } from "sonner";
import logoFiquePorDentro from "@/assets/logo-fique-por-dentro.png";
import sponsorsStrip from "@/assets/sponsors-strip.jpg";
import { supabase } from "@/integrations/supabase/client";

const SUPABASE_PUBLIC_MEDIA_PREFIX = `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/storage/v1/object/public/media/`;

/**
 * If imageUrl is external (not already in our media bucket), call the
 * import-image-to-storage edge function to mirror it into Storage and return
 * a CORS-safe public URL. Throws with the real error if import fails.
 */
async function ensureStorageUrl(imageUrl: string, slug: string): Promise<string> {
  if (!imageUrl) throw new Error("Sem imagem de capa");
  if (imageUrl.startsWith(SUPABASE_PUBLIC_MEDIA_PREFIX)) return imageUrl;

  const { data, error } = await supabase.functions.invoke("import-image-to-storage", {
    body: { url: imageUrl, slug },
  });
  if (error) {
    // Try to surface the body error message from the edge function
    const ctx: any = (error as any).context;
    let detail = error.message;
    try {
      if (ctx && typeof ctx.json === "function") {
        const j = await ctx.json();
        if (j?.error) detail = j.error;
      }
    } catch {
      /* ignore */
    }
    throw new Error(`${detail} (URL: ${imageUrl})`);
  }
  if (!data?.url) throw new Error(`Resposta inválida ao importar imagem (URL: ${imageUrl})`);
  return data.url as string;
}


type InstagramAspect = "4:5" | "1:1";

interface Props {
  imageUrl: string;
  slug: string;
  title: string;
  categoryName: string;
  instagramHeadline?: string;
  showSponsors?: boolean;
  artMode?: "portal" | "photo-bg";
  aspect?: InstagramAspect;
}



async function downloadBlob(url: string, filename: string) {
  let blobUrl: string | null = null;
  try {
    const res = await fetch(url, { mode: "cors" });
    if (!res.ok) throw new Error(String(res.status));
    const blob = await res.blob();
    blobUrl = URL.createObjectURL(blob);
  } catch {
    blobUrl = url;
  }
  const a = document.createElement("a");
  a.href = blobUrl;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  if (blobUrl && blobUrl.startsWith("blob:")) {
    setTimeout(() => URL.revokeObjectURL(blobUrl!), 1000);
  }
}

function loadImageEl(src: string, crossOrigin: boolean): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (crossOrigin) img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
    img.src = src;
  });
}

/**
 * Robust loader for canvas use:
 * 1) Try fetch -> blob URL (gives us a tainted-free image if CORS allows)
 * 2) Fallback to <img crossOrigin="anonymous">
 * 3) Fallback to direct <img> (may taint canvas — last resort)
 */
async function loadImageForCanvas(src: string): Promise<HTMLImageElement> {
  // 1) fetch as blob
  try {
    const res = await fetch(src, { mode: "cors" });
    if (res.ok) {
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      try {
        const img = await loadImageEl(url, false);
        return img;
      } finally {
        // keep URL alive until image drawn; revoke later
        setTimeout(() => URL.revokeObjectURL(url), 5000);
      }
    }
  } catch {
    /* ignore */
  }
  // 2) crossOrigin anonymous
  try {
    return await loadImageEl(src, true);
  } catch {
    /* ignore */
  }
  // 3) plain (may taint canvas — will fail toBlob later)
  return loadImageEl(src, false);
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const w of words) {
    const test = current ? `${current} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && current) {
      lines.push(current);
      current = w;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines;
}

async function generateInstagramArt(opts: Props): Promise<Blob> {
  const aspect: InstagramAspect = opts.aspect ?? "4:5";
  const W = 1080;
  const H = aspect === "1:1" ? 1080 : 1350;
  const SIZE = W; // width-based scaling base (paddings, font sizes)
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  const mode = opts.artMode ?? "portal";

  // Instagram safe area — only applied to the 4:5 (1080x1350) format,
  // which the in-app editor crops vertically. Push header down and sponsors up
  // so logo/sponsors never touch the canvas edges.
  const SAFE_TOP = aspect === "4:5" ? 100 : 0;
  const SAFE_BOTTOM = aspect === "4:5" ? 200 : 0;

  // Base background
  ctx.fillStyle = "#0a0a0a";
  ctx.fillRect(0, 0, W, H);

  // Sponsors strip — load up-front to reserve footer space.
  let sponsors: HTMLImageElement | null = null;
  let sponsorsBarH = 0; // full-width black institutional bar
  let sponsorsH = 0;    // logos image height inside the bar
  let sponsorsW = 0;    // logos image width inside the bar
  let sponsorsX = 0;
  let sponsorsY = 0;    // logos image Y (centered vertically in the bar)
  let sponsorsBarY = 0; // bar Y (offset from bottom by SAFE_BOTTOM)
  if (opts.showSponsors !== false) {
    try {
      sponsors = await loadImageForCanvas(sponsorsStrip);
      // Institutional TV bar: logos span edge-to-edge with no internal max-width.
      const ratio = sponsors.width / sponsors.height;
      const vPad = Math.round(SIZE * 0.010);
      // Full width — no side padding, no centered inner block.
      sponsorsW = SIZE;
      sponsorsH = sponsorsW / ratio;
      // Allow bar to grow taller so logos appear ~30% larger than before.
      const maxBarH = Math.round(H * (aspect === "1:1" ? 0.155 : 0.14));
      if (sponsorsH + vPad * 2 > maxBarH) {
        sponsorsH = maxBarH - vPad * 2;
        // Keep width at 100% even if it means slight vertical compression.
        sponsorsW = SIZE;
      }
      sponsorsBarH = Math.round(sponsorsH + vPad * 2);
      sponsorsBarY = H - sponsorsBarH - SAFE_BOTTOM;
      sponsorsX = 0;
      sponsorsY = sponsorsBarY + (sponsorsBarH - sponsorsH) / 2;
    } catch {
      sponsors = null;
    }
  }

  // News cover photo
  let cover: HTMLImageElement | null = null;
  if (opts.imageUrl) {
    try {
      cover = await loadImageForCanvas(opts.imageUrl);
    } catch {
      cover = null;
    }
  }

  // Logo
  let logo: HTMLImageElement | null = null;
  try {
    logo = await loadImageForCanvas(logoFiquePorDentro);
  } catch {
    logo = null;
  }

  const titleText = ((opts.instagramHeadline || opts.title || "")).trim();

  if (mode === "portal") {
    // =========================================================
    // PORTAL LAYOUT — stacked: header (logo) | headline | photo | sponsors
    // =========================================================

    // 1) BLUE TOP BAR — Fique Por Dentro Sergipe brand identity (offset by SAFE_TOP)
    const blueBarH = 32;
    ctx.fillStyle = "#0f2a5c"; // brand navy (hsl 220 70% 18%)
    ctx.fillRect(0, SAFE_TOP, SIZE, blueBarH);

    // 2) HEADER — black brand bar with centered logo
    const headerTop = SAFE_TOP + blueBarH;
    const headerH = 120; // reduced ~20% (was 150)
    ctx.fillStyle = "#0a0a0a";
    ctx.fillRect(0, headerTop, SIZE, headerH);
    // thin red accent under header
    ctx.fillStyle = "#dc2626";
    ctx.fillRect(0, headerTop + headerH - 4, SIZE, 4);


    if (logo) {
      // Mirror sponsors bar: fit logo inside header with side/vertical padding,
      // centered horizontally and vertically, never cropped.
      const innerH = headerH - 4; // exclude red accent line
      const sidePad = Math.round(SIZE * 0.04);
      const vPad = Math.round(innerH * 0.08); // logo ~8% maior
      const maxLogoW = SIZE - sidePad * 2;
      const maxLogoH = innerH - vPad * 2;
      const ratio = logo.width / logo.height;
      let logoH = maxLogoH;
      let logoW = logoH * ratio;
      if (logoW > maxLogoW) {
        logoW = maxLogoW;
        logoH = logoW / ratio;
      }
      const lx = (SIZE - logoW) / 2;
      const ly = headerTop + (innerH - logoH) / 2;
      ctx.drawImage(logo, lx, ly, logoW, logoH);
    } else {
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 56px system-ui, -apple-system, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("FIQUE POR DENTRO SERGIPE", SIZE / 2, headerTop + (headerH - 4) / 2);
    }

    const headerBottom = headerTop + headerH;

    // 3) CATEGORY ROW — small, elegant strip above the headline
    const hasCategory = !!opts.categoryName;
    const categoryH = hasCategory ? 40 : 0;

    // 4) HEADLINE band — white background, dark text, auto-fit
    // 5) PHOTO area takes the remaining space between headline and sponsors
    const photoGap = 6; // foto sobe, menos vazio entre manchete e imagem
    const sponsorsGap = sponsors ? 12 : 0;
    const reservedTop = headerBottom + 8 + categoryH; // menos respiro acima da manchete
    const footerH = (sponsors ? sponsorsBarH + sponsorsGap : 0) + SAFE_BOTTOM;
    const availableBelow = H - reservedTop - footerH - photoGap;


    // Dynamic headline sizing — measure FIRST, then reserve exact height needed.
    // Priority (REGRA 5): headline > photo. Photo may shrink so headline never crops.
    const maxWidth = SIZE - 112;
    const headlinePadY = 18; // faixa branca ~10% mais baixa
    const minPhotoH = Math.round(H * (aspect === "1:1" ? 0.60 : 0.58)); // photo dominates
    const maxHeadlineH = Math.max(140, availableBelow - minPhotoH);

    const len = titleText.length;
    // Tiered start font por char count — manchete ~12% maior.
    let startFont: number;
    let minFont: number;
    if (len <= 60) { startFont = 97; minFont = 53; }
    else if (len <= 90) { startFont = 77; minFont = 46; }
    else if (len <= 120) { startFont = 60; minFont = 38; }
    else { startFont = 54; minFont = 34; }


    let fontSize = startFont;
    let lines: string[] = [];
    let lineHeight = 0;
    let textBlockH = 0;
    // Shrink until the wrapped block fits inside maxHeadlineH (REGRA 1 + 3: never crop)
    while (true) {
      ctx.font = `bold ${fontSize}px system-ui, -apple-system, sans-serif`;
      lines = titleText ? wrapText(ctx, titleText, maxWidth) : [];
      lineHeight = fontSize * 1.15;
      textBlockH = lines.length * lineHeight;
      if (textBlockH + headlinePadY * 2 <= maxHeadlineH) break;
      if (fontSize <= minFont) break;
      fontSize -= 2;
    }

    let headlineH = Math.max(180, Math.min(maxHeadlineH, Math.round(textBlockH + headlinePadY * 2)));
    const categoryY = headerBottom + 16;
    const headlineY = reservedTop;
    const photoY = reservedTop + headlineH + photoGap;
    const photoH = availableBelow - headlineH;

    // Category strip — small, elegant red label on white above the headline
    if (hasCategory) {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, categoryY, SIZE, categoryH);
      ctx.fillStyle = "#dc2626";
      ctx.fillRect(0, categoryY, 6, categoryH);
      ctx.font = "800 18px system-ui, -apple-system, sans-serif";
      ctx.fillStyle = "#dc2626";
      ctx.textBaseline = "middle";
      ctx.textAlign = "left";
      // letter-spacing approximation via uppercase + measured kerning
      ctx.fillText(opts.categoryName.toUpperCase(), 28, categoryY + categoryH / 2 + 1);
    }

    // Headline background — white
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, headlineY, SIZE, headlineH);
    // Left red accent bar
    ctx.fillStyle = "#dc2626";
    ctx.fillRect(0, headlineY, 12, headlineH);

    if (titleText && lines.length > 0) {
      ctx.font = `bold ${fontSize}px system-ui, -apple-system, sans-serif`;
      const startY = headlineY + (headlineH - textBlockH) / 2 + fontSize * 0.85;
      ctx.fillStyle = "#0a0a0a";
      ctx.textBaseline = "alphabetic";
      ctx.textAlign = "left";
      let y = startY;
      for (const line of lines) {
        ctx.fillText(line, 56, y);
        y += lineHeight;
      }
    }

    // 4) PHOTO — fills the photo area, cover-fit (no text overlay)
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, photoY, SIZE, photoH);
    if (cover) {
      const scale = Math.max(SIZE / cover.width, photoH / cover.height);
      const w = cover.width * scale;
      const h = cover.height * scale;
      const dx = (SIZE - w) / 2;
      const dy = photoY + (photoH - h) / 2;
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, photoY, SIZE, photoH);
      ctx.clip();
      ctx.drawImage(cover, dx, dy, w, h);
      ctx.restore();
    }

    // 5) SPONSORS — black footer band with centered logos
    if (sponsors) {
      ctx.fillStyle = "#0a0a0a";
      ctx.fillRect(0, sponsorsBarY, SIZE, sponsorsBarH);
      ctx.drawImage(sponsors, sponsorsX, sponsorsY, sponsorsW, sponsorsH);
    }
  } else {
    // =========================================================
    // PHOTO-BG LAYOUT (legacy) — photo fills canvas, overlays on top
    // =========================================================
    if (cover) {
      const scale = Math.max(W / cover.width, H / cover.height);
      const w = cover.width * scale;
      const h = cover.height * scale;
      const dx = (W - w) / 2;
      const dy = (H - h) / 2;
      ctx.drawImage(cover, dx, dy, w, h);

      const topShade = ctx.createLinearGradient(0, 0, 0, 260);
      topShade.addColorStop(0, "rgba(0,0,0,0.55)");
      topShade.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = topShade;
      ctx.fillRect(0, 0, W, 260);

      const bottomShade = ctx.createLinearGradient(0, H * 0.45, 0, H);
      bottomShade.addColorStop(0, "rgba(0,0,0,0)");
      bottomShade.addColorStop(0.55, "rgba(0,0,0,0.55)");
      bottomShade.addColorStop(1, "rgba(0,0,0,0.92)");
      ctx.fillStyle = bottomShade;
      ctx.fillRect(0, H * 0.45, W, H * 0.55);
    } else {
      const bg = ctx.createLinearGradient(0, 0, W, H);
      bg.addColorStop(0, "#1a1a1a");
      bg.addColorStop(1, "#0a0a0a");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "#dc2626";
      ctx.fillRect(0, 0, 12, H);
    }

    if (logo) {
      const logoH = 110;
      const logoW = (logo.width / logo.height) * logoH;
      ctx.shadowColor = "rgba(0,0,0,0.65)";
      ctx.shadowBlur = 16;
      ctx.shadowOffsetY = 3;
      ctx.drawImage(logo, 56, 56, logoW, logoH);
      ctx.shadowColor = "transparent";
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;
    }

    if (opts.categoryName) {
      const label = opts.categoryName.toUpperCase();
      ctx.font = "bold 32px system-ui, -apple-system, sans-serif";
      const padX = 28;
      const padY = 14;
      const tw = ctx.measureText(label).width;
      const bw = tw + padX * 2;
      const bh = 32 + padY * 2;
      const bx = SIZE - 56 - bw;
      const by = 56;
      ctx.shadowColor = "rgba(0,0,0,0.55)";
      ctx.shadowBlur = 12;
      ctx.shadowOffsetY = 2;
      ctx.fillStyle = "#dc2626";
      ctx.fillRect(bx, by, bw, bh);
      ctx.shadowColor = "transparent";
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;
      ctx.fillStyle = "#ffffff";
      ctx.textBaseline = "middle";
      ctx.textAlign = "left";
      ctx.fillText(label, bx + padX, by + bh / 2 + 1);
    }

    if (titleText) {
      const maxWidth = SIZE - 112;
      const MAX_LINES = 4;
      let fontSize = 84;
      let lines: string[] = [];
      let fits = false;
      while (fontSize >= 40) {
        ctx.font = `bold ${fontSize}px system-ui, -apple-system, sans-serif`;
        lines = wrapText(ctx, titleText, maxWidth);
        if (lines.length <= MAX_LINES) {
          fits = true;
          break;
        }
        fontSize -= 3;
      }
      if (!fits && lines.length > MAX_LINES) {
        ctx.font = `bold ${fontSize}px system-ui, -apple-system, sans-serif`;
        const kept = lines.slice(0, MAX_LINES);
        let last = kept[MAX_LINES - 1];
        const ellipsis = "…";
        while (last.length > 0 && ctx.measureText(last + ellipsis).width > maxWidth) {
          const sp = last.lastIndexOf(" ");
          last = sp <= 0 ? last.slice(0, Math.max(0, last.length - 1)) : last.slice(0, sp);
        }
        kept[MAX_LINES - 1] = (last.replace(/[.,;:!?\-–—]+$/g, "").trim() || "") + ellipsis;
        lines = kept;
      }

      const lineHeight = fontSize * 1.12;
      const totalH = lines.length * lineHeight;
      const footerReserve = 60 + (sponsors ? sponsorsBarH + 24 : 70);
      const bottomPad = footerReserve + 24;
      const startY = H - bottomPad - totalH + fontSize;

      ctx.shadowColor = "rgba(0,0,0,0.85)";
      ctx.shadowBlur = 12;
      ctx.shadowOffsetY = 2;
      ctx.fillStyle = "#ffffff";
      ctx.textBaseline = "alphabetic";
      ctx.textAlign = "left";
      let y = startY;
      for (const line of lines) {
        ctx.fillText(line, 56, y);
        y += lineHeight;
      }
      ctx.shadowColor = "transparent";
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;
    }

    const brandBaselineY = sponsors ? sponsorsBarY - 22 : H - 40;
    ctx.fillStyle = "#dc2626";
    ctx.fillRect(56, brandBaselineY - 18, 80, 4);
    ctx.font = "500 24px system-ui, -apple-system, sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.textBaseline = "middle";
    ctx.textAlign = "right";
    ctx.fillText("fiquepordentrose.com.br", SIZE - 56, brandBaselineY);

    if (sponsors) {
      ctx.fillStyle = "#0a0a0a";
      ctx.fillRect(0, sponsorsBarY, SIZE, sponsorsBarH);
      ctx.drawImage(sponsors, sponsorsX, sponsorsY, sponsorsW, sponsorsH);
    }
  }

  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/png"),
  );
}


export function ImageActionButtons({ imageUrl, slug, title, categoryName, instagramHeadline }: Props) {
  const [genArt, setGenArt] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null);
  const [headline, setHeadline] = useState<string>((instagramHeadline || "").trim());
  const [showSponsors, setShowSponsors] = useState<boolean>(true);
  const [artMode, setArtMode] = useState<"portal" | "photo-bg">("portal");
  const [aspect, setAspect] = useState<InstagramAspect>("4:5");
  const hasImage = !!imageUrl;


  // Sync editable headline when the prop changes (post loaded / AI generated).
  useEffect(() => {
    setHeadline((instagramHeadline || "").trim());
  }, [instagramHeadline]);



  const effectiveHeadline = (headline || instagramHeadline || title || "").trim();

  const handleDownload = async () => {
    if (!hasImage) return;
    setDownloading(true);
    try {
      await downloadBlob(imageUrl, `fiquepordentrose-${slug || "noticia"}.jpg`);
    } catch {
      toast.error("Falha ao baixar imagem");
    } finally {
      setDownloading(false);
    }
  };

  /**
   * For titles longer than 80 chars, auto-generate a short Instagram headline
   * via the edge function. Returns the (possibly shortened) headline.
   */
  const ensureShortHeadline = async (raw: string): Promise<string> => {
    const t = (raw || "").trim();
    if (t.length <= 80) return t;
    try {
      const { data, error } = await supabase.functions.invoke("generate-instagram-headline", {
        body: { title: t },
      });
      if (error) throw error;
      const h = (data?.headline || "").trim();
      if (h) {
        toast.success("Manchete resumida automaticamente para o Instagram");
        return h;
      }
    } catch (e) {
      toast.error(`Falha ao resumir manchete: ${(e as Error).message}`);
    }
    return t;
  };

  const buildArt = async (headlineText: string) => {
    let safeUrl = "";
    if (imageUrl) {
      safeUrl = await ensureStorageUrl(imageUrl, slug);
    }
    return generateInstagramArt({
      imageUrl: safeUrl,
      slug,
      title: headlineText,
      categoryName,
      showSponsors,
      artMode,
      aspect,
    });

  };

  const handlePreviewArt = async () => {
    setGenArt(true);
    try {
      const initial = (instagramHeadline || title || "").trim();
      const base = (headline || initial).trim();
      const finalHeadline = await ensureShortHeadline(base);
      if (finalHeadline !== headline) setHeadline(finalHeadline);
      const blob = await buildArt(finalHeadline);
      const url = URL.createObjectURL(blob);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewBlob(blob);
      setPreviewUrl(url);
    } catch (e) {
      toast.error(`Falha ao gerar arte: ${(e as Error).message}`, { duration: 8000 });
    } finally {
      setGenArt(false);
    }
  };


  const handleRegenerate = async () => {
    setGenArt(true);
    try {
      const finalHeadline = await ensureShortHeadline(effectiveHeadline);
      if (finalHeadline !== headline) setHeadline(finalHeadline);
      const blob = await buildArt(finalHeadline);
      const url = URL.createObjectURL(blob);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewBlob(blob);
      setPreviewUrl(url);
    } catch (e) {
      toast.error(`Falha ao regenerar arte: ${(e as Error).message}`, { duration: 8000 });
    } finally {
      setGenArt(false);
    }
  };


  const handleDownloadArt = () => {
    if (!previewBlob) return;
    const url = URL.createObjectURL(previewBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `fiquepordentrose-${slug || "noticia"}-instagram.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast.success(`Arte ${aspect === "1:1" ? "1080x1080" : "1080x1350"} baixada`);
  };

  const closePreview = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setPreviewBlob(null);
  };

  return (
    <>
      <div className="flex flex-wrap gap-2 mb-4">
        <Button type="button" variant="outline" size="sm" onClick={handleDownload} disabled={!hasImage || downloading}>
          {downloading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
          Baixar Imagem
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => imageUrl && window.open(imageUrl, "_blank", "noopener,noreferrer")}
          disabled={!hasImage}
        >
          <ExternalLink className="h-4 w-4 mr-2" />
          Abrir Imagem Original
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={handlePreviewArt} disabled={genArt}>
          {genArt ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Eye className="h-4 w-4 mr-2" />}
          Visualizar Arte
        </Button>
        <Button type="button" size="sm" onClick={handlePreviewArt} disabled={genArt}>
          {genArt ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ImageIcon className="h-4 w-4 mr-2" />}
          Gerar Arte Instagram
        </Button>
      </div>

      <Dialog open={!!previewUrl} onOpenChange={(o) => !o && closePreview()}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Pré-visualização — Arte Instagram ({aspect === "1:1" ? "1080×1080" : "1080×1350"})</DialogTitle>
          </DialogHeader>

          <div className="space-y-2">
            <Label className="flex items-center justify-between">
              <span>Manchete usada na arte</span>
              <span
                className={`text-[10px] font-mono ${
                  effectiveHeadline.length > 80
                    ? "text-destructive"
                    : effectiveHeadline.length > 60
                      ? "text-amber-500"
                      : "text-muted-foreground"
                }`}
              >
                {effectiveHeadline.length}/80 (ideal ≤60)
              </span>
            </Label>
            <Input
              value={headline}
              maxLength={80}
              placeholder={title || "Manchete curta para o Instagram"}
              onChange={(e) => setHeadline(e.target.value)}
            />
            <p className="text-[10px] text-muted-foreground">
              Edite e clique em <strong>Regenerar</strong> para atualizar a arte. Salve a notícia para
              persistir esta manchete.
            </p>
          </div>

          <div className="rounded-md border p-3 space-y-2">
            <Label className="text-sm">Formato da Arte Instagram</Label>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant={aspect === "4:5" ? "default" : "outline"}
                size="sm"
                onClick={() => setAspect("4:5")}
              >
                Feed 4:5 (1080×1350) — Padrão
              </Button>
              <Button
                type="button"
                variant={aspect === "1:1" ? "default" : "outline"}
                size="sm"
                onClick={() => setAspect("1:1")}
              >
                Quadrado 1:1 (1080×1080)
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground">
              O formato vertical 4:5 ocupa mais espaço no feed do Instagram. Clique em <strong>Regenerar</strong> após alterar.
            </p>
          </div>

          <div className="rounded-md border p-3 space-y-2">
            <Label className="text-sm">Modo da Arte Instagram</Label>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant={artMode === "portal" ? "default" : "outline"}
                size="sm"
                onClick={() => setArtMode("portal")}
              >
                Layout Portal Fique Por Dentro Sergipe
              </Button>
              <Button
                type="button"
                variant={artMode === "photo-bg" ? "default" : "outline"}
                size="sm"
                onClick={() => setArtMode("photo-bg")}
              >
                Foto como fundo
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground">
              Padrão: <strong>Layout Portal</strong> — logo no topo, manchete em faixa branca,
              foto limpa abaixo e patrocinadores no rodapé. Clique em <strong>Regenerar</strong> após alterar.
            </p>
          </div>

          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <Label htmlFor="show-sponsors" className="text-sm">Mostrar patrocinadores na arte</Label>
              <p className="text-[10px] text-muted-foreground">
                Faixa de patrocinadores fica no rodapé da arte (≤12,5% da altura).
              </p>
            </div>
            <Switch id="show-sponsors" checked={showSponsors} onCheckedChange={setShowSponsors} />
          </div>


          {previewUrl && (
            <div className="flex flex-col items-center bg-muted rounded-md p-2 gap-2">
              <div className="relative inline-block" style={{ maxHeight: "50vh" }}>
                <img
                  src={previewUrl}
                  alt="Pré-visualização da arte Instagram"
                  className="block max-w-full h-auto rounded"
                  style={{ maxHeight: "50vh" }}
                />
                {aspect === "4:5" && (
                  <div
                    className="pointer-events-none absolute inset-0 rounded"
                    style={{
                      // Safe area: top 120px / bottom 140px / sides 40px on a 1080x1350 canvas.
                      boxShadow: "inset 0 0 0 1px hsl(var(--destructive) / 0.9)",
                      clipPath:
                        "polygon(3.7% 8.89%, 96.3% 8.89%, 96.3% 89.63%, 3.7% 89.63%)",
                    }}
                  />
                )}
              </div>
              {aspect === "4:5" && (
                <p className="text-[10px] text-muted-foreground text-center">
                  Moldura vermelha = área segura do Instagram (topo 120px • base 140px • laterais 40px).
                </p>
              )}
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={handleRegenerate} disabled={genArt}>
              {genArt ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Regenerar
            </Button>
            <Button onClick={handleDownloadArt} disabled={!previewBlob}>
              <Download className="h-4 w-4 mr-2" />
              Baixar PNG
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

