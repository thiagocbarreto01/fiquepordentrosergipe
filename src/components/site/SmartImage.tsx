import { useCallback, useEffect, useMemo, useState, type SyntheticEvent } from "react";
import logo from "@/assets/logo-fique-por-dentro.png";
import { registerImageFailure, validateImageUrl } from "@/lib/postImage";

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
  reportContext?: string;
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
  reportContext,
}: SmartImageProps) {
  const [failedReason, setFailedReason] = useState<string | null>(null);
  const validation = useMemo(() => validateImageUrl(src), [src]);

  const handleLoad = useCallback((e: SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    if (!img.naturalWidth || !img.naturalHeight) setFailedReason("Imagem carregada sem dimensões válidas");
  }, []);

  useEffect(() => {
    setFailedReason(null);
    if (!validation.valid) registerImageFailure(src, validation.reason, reportContext ?? alt);
  }, [alt, reportContext, src, validation.reason, validation.valid]);

  const unavailableReason = failedReason ?? (!validation.valid ? validation.reason : null);

  const handleError = useCallback((e: SyntheticEvent<HTMLImageElement>) => {
    const reason = "URL retornou erro ou bloqueou o carregamento";
    setFailedReason(reason);
    registerImageFailure(src, reason, reportContext ?? alt);
    onError?.(e);
  }, [alt, onError, reportContext, src]);

  return (
    <div
      className={`relative w-full overflow-hidden ${className}`}
      style={{
        aspectRatio,
        background: "linear-gradient(135deg, hsl(var(--brand-navy) / 0.95) 0%, hsl(var(--brand-navy-deep) / 0.95) 100%)",
      }}
    >
      {unavailableReason ? (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-gradient-navy px-6 text-center">
          <img src={logo} alt="Fique Por Dentro Sergipe" className="h-10 w-auto rounded-sm bg-white/95 px-2 py-1 shadow-card md:h-12" />
          <div>
            <p className="font-display text-sm font-black uppercase tracking-widest text-primary-foreground md:text-base">
              Imagem indisponível
            </p>
            <p className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-primary-foreground/70">
              Fique Por Dentro Sergipe
            </p>
          </div>
        </div>
      ) : (
        <img
          src={validation.url}
          alt={alt}
          loading={loading}
          fetchPriority={fetchPriority}
          width={width}
          height={height}
          onLoad={handleLoad}
          onError={handleError}
          className={[
            "relative z-10 w-full h-full object-cover transition-transform duration-700",
            hoverZoom ? "group-hover:scale-105" : "",
          ]
            .filter(Boolean)
            .join(" ")}
        />
      )}
    </div>
  );
}
