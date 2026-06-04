/**
 * Utilidades para detectar e renderizar URLs de vídeo.
 *
 * Política de suporte (estrita):
 *   - YouTube (youtube.com, youtu.be, youtube-nocookie.com)
 *   - Instagram (instagram.com — /p/, /reel/, /reels/, /tv/)
 *   - Arquivos .mp4 servidos via https
 *
 * Qualquer outro embed é tratado como inválido e deve ser IGNORADO pelo
 * frontend (não renderizar player quebrado).
 */

export type VideoProvider = "youtube" | "instagram" | "mp4";

export interface VideoInfo {
  provider: VideoProvider;
  /** URL pronta para usar como `src` de um <iframe> ou <video>. */
  embedUrl: string;
  /** URL original informada. */
  originalUrl: string;
  /** Tipo de elemento sugerido para renderização. */
  kind: "iframe" | "video";
}

const YOUTUBE_HOST_RE = /(?:^|\.)(youtube\.com|youtu\.be|youtube-nocookie\.com)$/i;
const INSTAGRAM_HOST_RE = /(?:^|\.)instagram\.com$/i;

function safeUrl(raw: string): URL | null {
  try {
    return new URL(raw.trim());
  } catch {
    return null;
  }
}

function youtubeIdFromUrl(u: URL): string | null {
  if (/youtu\.be$/i.test(u.hostname)) {
    const id = u.pathname.replace(/^\/+/, "").split("/")[0];
    return id || null;
  }
  const v = u.searchParams.get("v");
  if (v) return v;
  const m = u.pathname.match(/\/(embed|shorts|live|v)\/([A-Za-z0-9_-]{6,})/);
  if (m?.[2]) return m[2];
  return null;
}

export function parseVideoUrl(raw: string | null | undefined): VideoInfo | null {
  if (!raw || typeof raw !== "string") return null;
  const u = safeUrl(raw);
  if (!u) return null;

  // Apenas https é aceito (segurança + bloqueio de mixed content)
  if (u.protocol !== "https:") return null;

  // YouTube
  if (YOUTUBE_HOST_RE.test(u.hostname)) {
    const id = youtubeIdFromUrl(u);
    if (id && /^[A-Za-z0-9_-]{6,}$/.test(id)) {
      return {
        provider: "youtube",
        embedUrl: `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?rel=0`,
        originalUrl: raw,
        kind: "iframe",
      };
    }
    return null;
  }

  // Instagram (apenas posts/reels/tv válidos)
  if (INSTAGRAM_HOST_RE.test(u.hostname)) {
    const m = u.pathname.match(/\/(p|reel|reels|tv)\/([A-Za-z0-9_-]+)/);
    if (m?.[2]) {
      const kind = m[1] === "reels" ? "reel" : m[1];
      return {
        provider: "instagram",
        embedUrl: `https://www.instagram.com/${kind}/${m[2]}/embed`,
        originalUrl: raw,
        kind: "iframe",
      };
    }
    return null;
  }

  // Arquivo .mp4 direto
  if (/\.mp4(\?|$)/i.test(u.pathname)) {
    return {
      provider: "mp4",
      embedUrl: u.toString(),
      originalUrl: raw,
      kind: "video",
    };
  }

  // Qualquer outro embed/iframe genérico → IGNORADO
  return null;
}

export function isValidVideoUrl(raw: string | null | undefined): boolean {
  return parseVideoUrl(raw) !== null;
}
