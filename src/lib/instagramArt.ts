/**
 * instagramArt.ts — Renderização de arte do Instagram para Fique Por Dentro Sergipe.
 * Canvas nativo, sem dependências externas.
 *
 * Formatos suportados (px):
 *   feed_4_5   1080 × 1350  (padrão)
 *   square     1080 × 1080
 *   story      1080 × 1920
 *   cover      1080 × 1920
 */

export type ArtFormat = "feed_4_5" | "square" | "story" | "cover";

export const FORMAT_LABEL: Record<ArtFormat, string> = {
  feed_4_5: "Feed 1080×1350 (4:5) — recomendado",
  square: "Quadrado 1080×1080",
  story: "Story 1080×1920",
  cover: "Capa vertical 1080×1920",
};

export const FORMAT_SIZE: Record<ArtFormat, { w: number; h: number }> = {
  feed_4_5: { w: 1080, h: 1350 },
  square:   { w: 1080, h: 1080 },
  story:    { w: 1080, h: 1920 },
  cover:    { w: 1080, h: 1920 },
};

// Brand — Fique Por Dentro Sergipe (navy + urgent).
const BRAND_NAVY = "#0a1f44";
const BRAND_URGENT = "#c8102e";
const WHITE = "#ffffff";

export interface RenderInput {
  format: ArtFormat;
  editoria: string;               // ex: "SERGIPE", "URGENTE"
  manchete: string;
  subtitulo?: string;
  domain?: string;                // rodapé
  logoDataUrl?: string | null;    // logo (data URL para evitar CORS)
  imageDataUrl?: string | null;   // foto de fundo (data URL)
  offsetX?: number;               // -1..1 reposicionamento horizontal
  offsetY?: number;               // -1..1 reposicionamento vertical
  showSafeArea?: boolean;         // guia visual (não vai no export)
}

/** Carrega imagem a partir de data URL / URL. Data URLs evitam canvas tainted. */
export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/** Desenha a arte no canvas fornecido. Retorna true quando concluído. */
export async function renderArt(
  canvas: HTMLCanvasElement,
  input: RenderInput,
): Promise<void> {
  const { w, h } = FORMAT_SIZE[input.format];
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { alpha: false })!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  // Fundo navy sólido (base).
  ctx.fillStyle = BRAND_NAVY;
  ctx.fillRect(0, 0, w, h);

  // Foto de fundo (object-cover com reposicionamento).
  if (input.imageDataUrl) {
    try {
      const img = await loadImage(input.imageDataUrl);
      drawCover(ctx, img, 0, 0, w, h, input.offsetX ?? 0, input.offsetY ?? 0);
    } catch {
      // deixa fundo navy
    }
  }

  // Degradê (inferior mais forte, superior leve).
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, "rgba(10,31,68,0.55)");
  grad.addColorStop(0.45, "rgba(10,31,68,0.15)");
  grad.addColorStop(0.72, "rgba(10,31,68,0.75)");
  grad.addColorStop(1, "rgba(10,31,68,0.96)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // Margens seguras.
  const margin = Math.round(w * 0.06); // 6% ≈ 65px em 1080
  const contentW = w - margin * 2;

  // Barra de editoria (topo, superposta à imagem).
  const editoria = (input.editoria || "").toUpperCase().trim();
  if (editoria) {
    const isUrgent = editoria === "URGENTE" || editoria === "DENÚNCIA";
    ctx.fillStyle = isUrgent ? BRAND_URGENT : WHITE;
    const eBg = isUrgent ? BRAND_URGENT : WHITE;
    const eFg = isUrgent ? WHITE : BRAND_NAVY;
    ctx.font = `900 ${Math.round(w * 0.032)}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
    const padX = Math.round(w * 0.028);
    const padY = Math.round(w * 0.016);
    const eMetrics = ctx.measureText(editoria);
    const eH = Math.round(w * 0.032) + padY * 2;
    const eW = Math.round(eMetrics.width + padX * 2);
    ctx.fillStyle = eBg;
    ctx.fillRect(margin, margin, eW, eH);
    ctx.fillStyle = eFg;
    ctx.textBaseline = "middle";
    ctx.fillText(editoria, margin + padX, margin + eH / 2 + 2);
  }

  // Manchete auto-fit até 3 linhas (com fallback para 4 em formatos altos).
  const maxLines = input.format === "story" || input.format === "cover" ? 4 : 3;
  const footerH = Math.round(h * 0.11);
  const headlineTop = Math.round(h * 0.48);
  const headlineMaxH = h - headlineTop - footerH - margin;

  drawHeadline(ctx, input.manchete || "", {
    x: margin,
    y: headlineTop,
    maxW: contentW,
    maxH: headlineMaxH,
    maxLines,
    color: WHITE,
  });

  // Subtítulo (opcional).
  if (input.subtitulo && input.subtitulo.trim()) {
    ctx.fillStyle = "rgba(255,255,255,0.86)";
    ctx.font = `500 ${Math.round(w * 0.03)}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
    ctx.textBaseline = "top";
    wrapText(ctx, input.subtitulo.trim(), margin, h - footerH - Math.round(w * 0.09), contentW, Math.round(w * 0.038), 2);
  }

  // Rodapé: logo + domínio.
  const footerY = h - footerH;
  ctx.fillStyle = "rgba(10,31,68,0.92)";
  ctx.fillRect(0, footerY, w, footerH);

  if (input.logoDataUrl) {
    try {
      const logo = await loadImage(input.logoDataUrl);
      const logoH = Math.round(footerH * 0.62);
      const ratio = logo.width / logo.height;
      const logoW = Math.round(logoH * ratio);
      ctx.drawImage(logo, margin, footerY + (footerH - logoH) / 2, logoW, logoH);
    } catch { /* ignora */ }
  }

  const domain = input.domain || "fiquepordentrosergipe.com.br";
  ctx.fillStyle = WHITE;
  ctx.font = `700 ${Math.round(w * 0.026)}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
  ctx.textBaseline = "middle";
  const dMetrics = ctx.measureText(domain);
  ctx.fillText(domain, w - margin - dMetrics.width, footerY + footerH / 2);

  // Guia da área segura (não faz parte do export).
  if (input.showSafeArea) {
    ctx.strokeStyle = "rgba(255,255,255,0.65)";
    ctx.setLineDash([16, 12]);
    ctx.lineWidth = 3;
    ctx.strokeRect(margin, margin, contentW, h - margin * 2 - footerH);
    ctx.setLineDash([]);
  }
}

function drawCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number, y: number, w: number, h: number,
  offX: number, offY: number,
) {
  const iw = img.naturalWidth;
  const ih = img.naturalHeight;
  if (!iw || !ih) return;
  const scale = Math.max(w / iw, h / ih);
  const dw = iw * scale;
  const dh = ih * scale;
  const maxOffX = (dw - w) / 2;
  const maxOffY = (dh - h) / 2;
  const dx = x + (w - dw) / 2 + Math.max(-maxOffX, Math.min(maxOffX, offX * maxOffX));
  const dy = y + (h - dh) / 2 + Math.max(-maxOffY, Math.min(maxOffY, offY * maxOffY));
  ctx.drawImage(img, dx, dy, dw, dh);
}

function drawHeadline(
  ctx: CanvasRenderingContext2D,
  text: string,
  opts: { x: number; y: number; maxW: number; maxH: number; maxLines: number; color: string },
) {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return;

  // Auto-fit: começa em 8% da largura e diminui até caber.
  const canvasW = ctx.canvas.width;
  let size = Math.round(canvasW * 0.085);
  const minSize = Math.round(canvasW * 0.04);
  const lineHFactor = 1.08;

  let lines: string[] = [];
  while (size >= minSize) {
    ctx.font = `900 ${size}px "Times New Roman", Georgia, serif`;
    lines = wrapLines(ctx, clean, opts.maxW);
    const totalH = lines.length * size * lineHFactor;
    if (lines.length <= opts.maxLines && totalH <= opts.maxH) break;
    size -= 4;
  }
  // Se ainda estourar linhas, trunca com reticências.
  if (lines.length > opts.maxLines) {
    lines = lines.slice(0, opts.maxLines);
    let last = lines[lines.length - 1];
    while (ctx.measureText(last + "…").width > opts.maxW && last.length > 4) {
      last = last.slice(0, -1);
    }
    lines[lines.length - 1] = last.trimEnd() + "…";
  }

  ctx.fillStyle = opts.color;
  ctx.textBaseline = "top";
  // Sombra suave para legibilidade.
  ctx.shadowColor = "rgba(0,0,0,0.35)";
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 2;
  lines.forEach((ln, i) => {
    ctx.fillText(ln, opts.x, opts.y + i * size * lineHFactor);
  });
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
}

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const test = cur ? cur + " " + w : w;
    if (ctx.measureText(test).width <= maxW) {
      cur = test;
    } else {
      if (cur) lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number, y: number, maxW: number, lineH: number, maxLines: number,
) {
  const lines = wrapLines(ctx, text, maxW).slice(0, maxLines);
  lines.forEach((ln, i) => ctx.fillText(ln, x, y + i * lineH));
}

/** Exporta canvas para JPEG (qualidade 0.92). */
export function canvasToJpegBlob(canvas: HTMLCanvasElement, quality = 0.92): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Falha ao gerar JPEG"))),
      "image/jpeg",
      quality,
    );
  });
}

export function sanitizeFilename(base: string): string {
  return (base || "arte")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9-_]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "arte";
}
