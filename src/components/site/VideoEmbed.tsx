import { useMemo, useState } from "react";
import { parseVideoUrl, type VideoInfo } from "@/lib/videoEmbed";

interface VideoEmbedProps {
  url: string;
  title?: string;
  className?: string;
  /** Callback chamado quando a URL não é suportada/inválida — útil para fallback. */
  onInvalid?: () => void;
}

/**
 * Renderiza um vídeo embedável apenas se a URL for de um provider suportado
 * (YouTube, Instagram ou arquivo .mp4). Embeds desconhecidos são ignorados
 * silenciosamente para evitar players quebrados.
 */
export function VideoEmbed({ url, title = "Vídeo", className = "", onInvalid }: VideoEmbedProps) {
  const info: VideoInfo | null = useMemo(() => parseVideoUrl(url), [url]);
  const [errored, setErrored] = useState(false);

  if (!info) {
    // Notifica fallback (uma única vez por render) e não renderiza nada
    onInvalid?.();
    return null;
  }
  if (errored) {
    onInvalid?.();
    return null;
  }

  const aspect = info.provider === "instagram" ? "9/14" : "16/9";

  if (info.kind === "video") {
    return (
      <div
        className={`relative w-full overflow-hidden bg-black ${className}`}
        style={{ aspectRatio: aspect }}
      >
        <video
          src={info.embedUrl}
          title={title}
          controls
          playsInline
          preload="metadata"
          onError={() => setErrored(true)}
          className="absolute inset-0 w-full h-full"
        />
      </div>
    );
  }

  return (
    <div
      className={`relative w-full overflow-hidden bg-black ${className}`}
      style={{ aspectRatio: aspect }}
    >
      <iframe
        src={info.embedUrl}
        title={title}
        loading="lazy"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
        sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
        onError={() => setErrored(true)}
        className="absolute inset-0 w-full h-full border-0"
      />
    </div>
  );
}
