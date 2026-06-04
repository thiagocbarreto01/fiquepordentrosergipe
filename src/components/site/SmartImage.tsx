import { useState, useCallback, type SyntheticEvent } from "react";

interface SmartImageProps {
  src: string;
  alt: string;
  /**
   * Aspect ratio do container (formato CSS aspect-ratio). Ex: "16/9", "1/1".
   * Default: "16/9".
   */
  aspectRatio?: string;
  className?: string;
  loading?: "eager" | "lazy";
  fetchPriority?: "high" | "low" | "auto";
  width?: number;
  height?: number;
  onError?: (e: SyntheticEvent<HTMLImageElement>) => void;
  /**
   * Se true, anima zoom no hover (group-hover:scale-105).
   * Funciona apenas no modo "horizontal" (preserva enquadramento).
   */
  hoverZoom?: boolean;
}

/**
 * Renderiza uma imagem dentro de um container com aspect-ratio fixo:
 * - Imagens horizontais ou quadradas: usa object-cover (preenche o container).
 * - Imagens verticais (h > w): mostra a imagem inteira centralizada (object-contain),
 *   com a própria imagem desfocada como fundo para preencher as laterais.
 *
 * Assim evitamos cortes feios em fotos verticais (Instagram, retratos).
 */
export function SmartImage({
  src,
  alt,
  aspectRatio = "16/9",
  className = "",
  loading = "lazy",
  fetchPriority,
  width,
  height,
  onError,
  hoverZoom = false,
}: SmartImageProps) {
  const [orientation, setOrientation] = useState<"unknown" | "horizontal" | "vertical">("unknown");

  const handleLoad = useCallback((e: SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    if (img.naturalHeight > img.naturalWidth * 1.05) {
      setOrientation("vertical");
    } else {
      setOrientation("horizontal");
    }
  }, []);

  const isVertical = orientation === "vertical";

  return (
    <div
      className={`relative w-full overflow-hidden ${className}`}
      style={{
        aspectRatio,
        background: "linear-gradient(135deg, hsl(var(--brand-navy) / 0.95) 0%, hsl(var(--brand-navy-deep) / 0.95) 100%)",
      }}
    >
      {/* Imagem principal — sempre object-cover (sem fundo desfocado) */}
      <img
        src={src}
        alt={alt}
        loading={loading}
        fetchPriority={fetchPriority}
        width={width}
        height={height}
        onLoad={handleLoad}
        onError={onError}
        className={[
          "relative z-10 w-full h-full object-cover transition-transform duration-700",
          hoverZoom ? "group-hover:scale-105" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      />
    </div>
  );
}
