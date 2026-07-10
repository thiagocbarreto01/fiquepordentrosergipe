import { useCallback, useEffect, useMemo, useRef, useState, type SyntheticEvent } from "react";
import logo from "@/assets/logo-fique-por-dentro.png";
import { registerImageFailure, validateImageUrl } from "@/lib/postImage";

interface SmartImageProps {
  src: string;
  alt: string;
  aspectRatio?: string;
  className?: string;
  loading?: "eager" | "lazy";
  fetchPriority?: "high" | "low" | "auto";
  width?: number;
  height?: number;
  onError?: (e: SyntheticEvent<HTMLImageElement>) => void;
  reportContext?: string;
  hoverZoom?: boolean;
  /**
   * URL temática (ex: imagem padrão da categoria) usada se o `src` falhar ao carregar.
   * Permite degradação graciosa sem mostrar placeholder genérico.
   */
  fallbackUrl?: string | null;
}

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
  fallbackUrl,
}: SmartImageProps) {
  const initial = useMemo(() => validateImageUrl(src), [src]);
  const fallback = useMemo(() => (fallbackUrl ? validateImageUrl(fallbackUrl) : null), [fallbackUrl]);

  const [currentUrl, setCurrentUrl] = useState<string>(initial.valid ? initial.url : (fallback?.valid ? fallback.url : ""));
  const [silent, setSilent] = useState<boolean>(!initial.valid && !fallback?.valid);
  const [orientation, setOrientation] = useState<"landscape" | "portrait" | null>(null);
  const triedFallback = useRef<boolean>(!initial.valid);


  useEffect(() => {
    triedFallback.current = !initial.valid;
    if (initial.valid) {
      setCurrentUrl(initial.url);
      setSilent(false);
    } else if (fallback?.valid) {
      triedFallback.current = true;
      setCurrentUrl(fallback.url);
      setSilent(false);
      registerImageFailure(src, initial.reason, reportContext ?? alt);
    } else {
      setCurrentUrl("");
      setSilent(true);
      registerImageFailure(src, initial.reason, reportContext ?? alt);
    }
  }, [alt, fallback?.url, fallback?.valid, initial.reason, initial.url, initial.valid, reportContext, src]);

  const handleLoad = useCallback((e: SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    if (!img.naturalWidth || !img.naturalHeight) {
      if (!triedFallback.current && fallback?.valid) {
        triedFallback.current = true;
        setCurrentUrl(fallback.url);
      } else {
        setSilent(true);
      }
      return;
    }
    setOrientation(img.naturalWidth >= img.naturalHeight * 1.05 ? "landscape" : "portrait");
  }, [fallback?.url, fallback?.valid]);


  const handleError = useCallback((e: SyntheticEvent<HTMLImageElement>) => {
    registerImageFailure(currentUrl, "Erro ao carregar imagem no navegador", reportContext ?? alt);
    if (!triedFallback.current && fallback?.valid) {
      triedFallback.current = true;
      setCurrentUrl(fallback.url);
      return;
    }
    setSilent(true);
    onError?.(e);
  }, [alt, currentUrl, fallback?.url, fallback?.valid, onError, reportContext]);

  return (
    <div
      className={`relative w-full overflow-hidden ${className}`}
      style={{
        aspectRatio,
        background: "linear-gradient(135deg, hsl(var(--brand-navy)) 0%, hsl(var(--brand-navy-deep)) 100%)",
      }}
    >
      {silent || !currentUrl ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center">
          <img
            src={logo}
            alt=""
            aria-hidden="true"
            className="h-10 w-auto opacity-40 md:h-14"
          />
        </div>
      ) : (
        <img
          src={currentUrl}
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
