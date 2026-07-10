import { useCallback, useState, type SyntheticEvent } from "react";

interface AdaptiveCoverImageProps {
  src: string;
  alt: string;
  className?: string;
  /** Altura máxima em px para o contêiner (usado quando a imagem é retrato). */
  maxHeight?: number;
  loading?: "eager" | "lazy";
  fetchPriority?: "high" | "low" | "auto";
  onError?: (e: SyntheticEvent<HTMLImageElement>) => void;
}

/**
 * Imagem que se adapta à orientação:
 * - Paisagem: usa proporção 16/9 com object-cover (visual padrão portal).
 * - Retrato / quadrado: usa object-contain + top center, sem cortar rosto.
 * Fundo neutro preenche o espaço restante.
 */
export function AdaptiveCoverImage({
  src,
  alt,
  className = "",
  maxHeight = 520,
  loading = "lazy",
  fetchPriority,
  onError,
}: AdaptiveCoverImageProps) {
  const [orientation, setOrientation] = useState<"landscape" | "portrait" | null>(null);

  const handleLoad = useCallback((e: SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    if (img.naturalWidth && img.naturalHeight) {
      setOrientation(img.naturalWidth >= img.naturalHeight * 1.05 ? "landscape" : "portrait");
    }
  }, []);

  const isPortrait = orientation === "portrait";

  return (
    <div
      className={`relative w-full overflow-hidden bg-secondary/40 ${className}`}
      style={
        isPortrait
          ? { height: `min(${maxHeight}px, 80vh)` }
          : { aspectRatio: "16 / 9" }
      }
    >
      <img
        src={src}
        alt={alt}
        loading={loading}
        decoding="async"
        fetchPriority={fetchPriority}
        onLoad={handleLoad}
        onError={onError}
        className={`w-full h-full ${
          isPortrait ? "object-contain object-top" : "object-cover"
        }`}
      />
    </div>
  );
}
