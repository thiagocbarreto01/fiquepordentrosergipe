// Renderizador de Reel vertical 1080x1920 em MP4 usando WebCodecs + mp4-muxer.
// Funcionalidade Fase 1: 15s, sem áudio, layout em 4 telas.

import { Muxer, ArrayBufferTarget } from "mp4-muxer";
import logoUrl from "@/assets/logo-fique-por-dentro.png";

export interface ReelInput {
  headline: string;       // manchete principal (curta)
  summary: string[];      // até 3 frases para a tela 3
  category?: string | null;
  isUrgent?: boolean;
  imageUrl?: string | null;
}

const W = 1080;
const H = 1920;
const FPS = 30;
const TOTAL_SECONDS = 15;
const TOTAL_FRAMES = FPS * TOTAL_SECONDS; // 450
// Distribuição de tempo (em frames):
const SCENE_FRAMES = {
  intro: 60,      // 2s
  hero: 180,      // 6s
  summary: 150,   // 5s
  outro: 60,      // 2s
};

const COLORS = {
  navy: "#041B4D",
  navyDeep: "#02102E",
  red: "#E30613",
  yellow: "#FFD60A",
  white: "#FFFFFF",
  whiteSoft: "rgba(255,255,255,0.85)",
};

export interface RenderProgress {
  frame: number;
  total: number;
  scene: "intro" | "hero" | "summary" | "outro";
}

export async function renderReelMp4(
  input: ReelInput,
  onProgress?: (p: RenderProgress) => void,
): Promise<Blob> {
  if (typeof (globalThis as any).VideoEncoder === "undefined") {
    throw new Error("Seu navegador não suporta exportação MP4 (WebCodecs). Use Chrome, Edge ou Opera atualizado.");
  }

  const canvas = new OffscreenCanvas(W, H);
  const ctx = canvas.getContext("2d")!;
  if (!ctx) throw new Error("Canvas 2D indisponível");

  // Pré-carrega assets
  const [logoBitmap, photoBitmap] = await Promise.all([
    loadBitmap(logoUrl).catch(() => null),
    input.imageUrl ? loadBitmap(input.imageUrl).catch(() => null) : Promise.resolve(null),
  ]);

  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: "avc", width: W, height: H, frameRate: FPS },
    fastStart: "in-memory",
  });

  const encoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => console.error("VideoEncoder error", e),
  });

  encoder.configure({
    codec: "avc1.640033", // H.264 high profile, suficiente para 1080x1920
    width: W,
    height: H,
    bitrate: 5_000_000,
    framerate: FPS,
    avc: { format: "avc" },
  });

  let inFlight = 0;
  for (let f = 0; f < TOTAL_FRAMES; f++) {
    const scene = sceneAt(f);
    drawFrame(ctx, f, scene, input, logoBitmap, photoBitmap);
    const bmp = canvas.transferToImageBitmap();
    const vf = new VideoFrame(bmp, {
      timestamp: Math.round((f / FPS) * 1_000_000),
      duration: Math.round(1_000_000 / FPS),
    });
    encoder.encode(vf, { keyFrame: f % FPS === 0 });
    vf.close();
    bmp.close();
    inFlight++;

    if (onProgress && f % 5 === 0) {
      onProgress({ frame: f, total: TOTAL_FRAMES, scene: scene.name });
    }

    // Throttle para não estourar memória
    if (inFlight > 30) {
      await encoder.flush();
      inFlight = 0;
    }
  }

  await encoder.flush();
  encoder.close();
  muxer.finalize();
  if (onProgress) onProgress({ frame: TOTAL_FRAMES, total: TOTAL_FRAMES, scene: "outro" });

  const { buffer } = muxer.target;
  return new Blob([buffer], { type: "video/mp4" });
}

type SceneInfo = { name: "intro" | "hero" | "summary" | "outro"; local: number; duration: number };

function sceneAt(f: number): SceneInfo {
  let acc = 0;
  for (const [name, dur] of Object.entries(SCENE_FRAMES) as [SceneInfo["name"], number][]) {
    if (f < acc + dur) return { name, local: f - acc, duration: dur };
    acc += dur;
  }
  return { name: "outro", local: SCENE_FRAMES.outro - 1, duration: SCENE_FRAMES.outro };
}

function easeInOut(t: number) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

function drawFrame(
  ctx: OffscreenCanvasRenderingContext2D,
  globalFrame: number,
  scene: SceneInfo,
  input: ReelInput,
  logo: ImageBitmap | null,
  photo: ImageBitmap | null,
) {
  // Fundo base sempre
  drawBackground(ctx);

  switch (scene.name) {
    case "intro":
      drawIntroScene(ctx, scene, input, logo);
      break;
    case "hero":
      drawHeroScene(ctx, scene, input, photo);
      break;
    case "summary":
      drawSummaryScene(ctx, scene, input);
      break;
    case "outro":
      drawOutroScene(ctx, scene, logo);
      break;
  }

  // Marca d'água sutil
  drawFooterBrand(ctx, globalFrame);
}

function drawBackground(ctx: OffscreenCanvasRenderingContext2D) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, COLORS.navyDeep);
  g.addColorStop(1, COLORS.navy);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

function drawIntroScene(
  ctx: OffscreenCanvasRenderingContext2D,
  scene: SceneInfo,
  input: ReelInput,
  logo: ImageBitmap | null,
) {
  const t = scene.local / scene.duration;
  const fadeIn = Math.min(1, scene.local / 12);

  // Logo grande centralizado
  if (logo) {
    const targetW = 720;
    const ratio = logo.height / logo.width;
    const targetH = targetW * ratio;
    const x = (W - targetW) / 2;
    const y = H * 0.32 - targetH / 2;
    ctx.globalAlpha = fadeIn;
    ctx.drawImage(logo, x, y, targetW, targetH);
    ctx.globalAlpha = 1;
  }

  // Linha decorativa
  ctx.globalAlpha = fadeIn;
  ctx.fillStyle = COLORS.red;
  const lineW = 240 * easeInOut(Math.min(1, t * 1.5));
  ctx.fillRect((W - lineW) / 2, H * 0.5, lineW, 8);
  ctx.globalAlpha = 1;

  // Categoria
  if (input.category) {
    ctx.globalAlpha = Math.min(1, Math.max(0, (scene.local - 10) / 20));
    ctx.fillStyle = COLORS.white;
    ctx.font = "700 56px Inter, Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(input.category.toUpperCase(), W / 2, H * 0.6);
    ctx.globalAlpha = 1;
  }

  // Tarja URGENTE
  if (input.isUrgent) {
    const barAppear = Math.min(1, Math.max(0, (scene.local - 18) / 14));
    const barW = W * barAppear;
    ctx.fillStyle = COLORS.red;
    ctx.fillRect((W - barW) / 2, H * 0.7, barW, 110);
    if (barAppear > 0.6) {
      ctx.fillStyle = COLORS.white;
      ctx.font = "900 72px Inter, Arial, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("URGENTE", W / 2, H * 0.7 + 55);
    }
  }
}

function drawHeroScene(
  ctx: OffscreenCanvasRenderingContext2D,
  scene: SceneInfo,
  input: ReelInput,
  photo: ImageBitmap | null,
) {
  const t = scene.local / scene.duration;
  const photoArea = { x: 0, y: 0, w: W, h: Math.floor(H * 0.62) };

  if (photo) {
    // Ken Burns: zoom de 1.0 -> 1.15, pan suave
    const zoom = 1 + 0.15 * t;
    const scale = Math.max(photoArea.w / photo.width, photoArea.h / photo.height) * zoom;
    const drawW = photo.width * scale;
    const drawH = photo.height * scale;
    const panX = (1 - t) * 20;
    const panY = (1 - t) * 30;
    const dx = (photoArea.w - drawW) / 2 + panX;
    const dy = (photoArea.h - drawH) / 2 + panY;
    ctx.save();
    ctx.beginPath();
    ctx.rect(photoArea.x, photoArea.y, photoArea.w, photoArea.h);
    ctx.clip();
    ctx.drawImage(photo, dx, dy, drawW, drawH);
    ctx.restore();
  } else {
    ctx.fillStyle = "#1a2540";
    ctx.fillRect(photoArea.x, photoArea.y, photoArea.w, photoArea.h);
  }

  // Gradiente de fusão para a área da manchete
  const grad = ctx.createLinearGradient(0, photoArea.h - 280, 0, photoArea.h);
  grad.addColorStop(0, "rgba(2,16,46,0)");
  grad.addColorStop(1, COLORS.navyDeep);
  ctx.fillStyle = grad;
  ctx.fillRect(0, photoArea.h - 280, W, 280);

  // Categoria + tarja URGENTE em pílulas
  let pillX = 64;
  const pillY = 64;
  if (input.category) {
    drawPill(ctx, pillX, pillY, input.category.toUpperCase(), COLORS.white, COLORS.navy);
    pillX += measurePillWidth(ctx, input.category.toUpperCase()) + 16;
  }
  if (input.isUrgent) {
    drawPill(ctx, pillX, pillY, "URGENTE", COLORS.red, COLORS.white);
  }

  // Manchete
  const headlineTop = photoArea.h + 30;
  drawWrappedText(ctx, input.headline.toUpperCase(), {
    x: 64,
    y: headlineTop,
    maxWidth: W - 128,
    maxHeight: H - headlineTop - 200,
    color: COLORS.white,
    font: "900",
    fontFamily: "Inter, Arial, sans-serif",
    minSize: 56,
    maxSize: 96,
    lineHeightFactor: 1.1,
    align: "left",
  });

  // Barra acento
  ctx.fillStyle = COLORS.red;
  ctx.fillRect(64, photoArea.h + 8, 120, 8);
}

function drawSummaryScene(
  ctx: OffscreenCanvasRenderingContext2D,
  scene: SceneInfo,
  input: ReelInput,
) {
  // Cabeçalho fino
  ctx.fillStyle = COLORS.red;
  ctx.fillRect(64, 120, 120, 8);
  ctx.fillStyle = COLORS.whiteSoft;
  ctx.font = "700 40px Inter, Arial, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillText("RESUMO", 64, 110);

  const lines = input.summary.slice(0, 3);
  const stepFrames = Math.floor(scene.duration / lines.length);
  const blockTop = H * 0.22;
  const blockHeight = H * 0.55;
  const slotH = blockHeight / lines.length;

  lines.forEach((line, i) => {
    const appearAt = i * stepFrames;
    const local = scene.local - appearAt;
    if (local < 0) return;
    const fade = Math.min(1, local / 18);
    const slideY = (1 - easeInOut(Math.min(1, local / 24))) * 40;
    ctx.globalAlpha = fade;
    const y = blockTop + i * slotH + 30;
    // Número
    ctx.fillStyle = COLORS.red;
    ctx.font = "900 64px Inter, Arial, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(`0${i + 1}`, 64, y + 60 + slideY);
    // Texto
    drawWrappedText(ctx, line, {
      x: 200,
      y: y + slideY,
      maxWidth: W - 264,
      maxHeight: slotH - 40,
      color: COLORS.white,
      font: "700",
      fontFamily: "Inter, Arial, sans-serif",
      minSize: 42,
      maxSize: 60,
      lineHeightFactor: 1.2,
      align: "left",
    });
    ctx.globalAlpha = 1;
  });
}

function drawOutroScene(
  ctx: OffscreenCanvasRenderingContext2D,
  scene: SceneInfo,
  logo: ImageBitmap | null,
) {
  const t = scene.local / scene.duration;
  const fade = Math.min(1, scene.local / 14);

  if (logo) {
    const targetW = 640;
    const ratio = logo.height / logo.width;
    const targetH = targetW * ratio;
    const scale = 0.95 + 0.1 * easeInOut(t);
    const w = targetW * scale;
    const h = targetH * scale;
    ctx.globalAlpha = fade;
    ctx.drawImage(logo, (W - w) / 2, H * 0.32 - h / 2, w, h);
    ctx.globalAlpha = 1;
  }

  ctx.globalAlpha = fade;
  ctx.fillStyle = COLORS.red;
  ctx.fillRect((W - 240) / 2, H * 0.5, 240, 8);

  ctx.fillStyle = COLORS.white;
  ctx.font = "900 64px Inter, Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillText("@fiquepordentrosergipe", W / 2, H * 0.6);

  ctx.fillStyle = COLORS.whiteSoft;
  ctx.font = "600 44px Inter, Arial, sans-serif";
  ctx.fillText("Mais notícias em nosso portal", W / 2, H * 0.68);
  ctx.globalAlpha = 1;
}

function drawFooterBrand(ctx: OffscreenCanvasRenderingContext2D, _frame: number) {
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.font = "600 28px Inter, Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillText("FIQUE POR DENTRO SERGIPE", W / 2, H - 60);
}

function drawPill(
  ctx: OffscreenCanvasRenderingContext2D,
  x: number,
  y: number,
  text: string,
  bg: string,
  fg: string,
) {
  ctx.font = "800 36px Inter, Arial, sans-serif";
  const padX = 28;
  const padY = 18;
  const m = ctx.measureText(text);
  const w = m.width + padX * 2;
  const h = 36 + padY * 2;
  roundRect(ctx, x, y, w, h, 12);
  ctx.fillStyle = bg;
  ctx.fill();
  ctx.fillStyle = fg;
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.fillText(text, x + padX, y + h / 2 + 2);
}

function measurePillWidth(ctx: OffscreenCanvasRenderingContext2D, text: string) {
  ctx.font = "800 36px Inter, Arial, sans-serif";
  return ctx.measureText(text).width + 56;
}

function roundRect(
  ctx: OffscreenCanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

interface WrapOpts {
  x: number;
  y: number;
  maxWidth: number;
  maxHeight: number;
  color: string;
  font: string;
  fontFamily: string;
  minSize: number;
  maxSize: number;
  lineHeightFactor: number;
  align: "left" | "center";
}

function drawWrappedText(
  ctx: OffscreenCanvasRenderingContext2D,
  text: string,
  opts: WrapOpts,
) {
  ctx.fillStyle = opts.color;
  ctx.textBaseline = "top";
  ctx.textAlign = opts.align;
  let size = opts.maxSize;
  let lines: string[] = [];
  while (size >= opts.minSize) {
    ctx.font = `${opts.font} ${size}px ${opts.fontFamily}`;
    lines = wrap(ctx, text, opts.maxWidth);
    const totalH = lines.length * size * opts.lineHeightFactor;
    if (totalH <= opts.maxHeight) break;
    size -= 4;
  }
  const xAnchor = opts.align === "center" ? opts.x + opts.maxWidth / 2 : opts.x;
  lines.forEach((ln, i) => {
    ctx.fillText(ln, xAnchor, opts.y + i * size * opts.lineHeightFactor);
  });
}

function wrap(ctx: OffscreenCanvasRenderingContext2D, text: string, maxW: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const test = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(test).width <= maxW) cur = test;
    else { if (cur) lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  return lines;
}

async function loadBitmap(url: string): Promise<ImageBitmap> {
  // Tenta com cache; CORS pode quebrar imagens externas.
  const res = await fetch(url, { mode: "cors" });
  if (!res.ok) throw new Error(`Falha ao carregar imagem (${res.status})`);
  const blob = await res.blob();
  return await createImageBitmap(blob);
}
