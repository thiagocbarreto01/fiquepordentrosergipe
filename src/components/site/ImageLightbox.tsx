import { useEffect, useState, useCallback } from "react";
import { X, ZoomIn, ZoomOut } from "lucide-react";
import { createPortal } from "react-dom";

interface ImageLightboxProps {
  src: string;
  alt: string;
  caption?: string | null;
  credit?: string | null;
  open: boolean;
  onClose: () => void;
}

export function ImageLightbox({ src, alt, caption, credit, open, onClose }: ImageLightboxProps) {
  const [zoomed, setZoomed] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!open) setZoomed(false);
  }, [open]);

  const toggleZoom = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setZoomed((z) => !z);
  }, []);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={alt}
      onClick={onClose}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <button
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        aria-label="Fechar"
        className="absolute top-4 right-4 z-10 h-10 w-10 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
      >
        <X className="h-5 w-5" />
      </button>
      <button
        onClick={toggleZoom}
        aria-label={zoomed ? "Reduzir" : "Ampliar"}
        className="absolute top-4 right-16 z-10 h-10 w-10 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
      >
        {zoomed ? <ZoomOut className="h-5 w-5" /> : <ZoomIn className="h-5 w-5" />}
      </button>
      <figure
        className="relative max-w-[95vw] max-h-[90vh] flex flex-col items-center gap-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className={`overflow-auto max-w-[95vw] max-h-[80vh] flex items-center justify-center transition-transform duration-300 ${
            zoomed ? "cursor-zoom-out" : "cursor-zoom-in"
          }`}
          onClick={toggleZoom}
        >
          <img
            src={src}
            alt={alt}
            className={`select-none transition-transform duration-300 ${
              zoomed ? "scale-150" : "max-w-[95vw] max-h-[80vh] object-contain"
            }`}
            draggable={false}
          />
        </div>
        {(caption || credit) && (
          <figcaption className="text-center text-white/90 text-sm max-w-2xl px-4">
            {caption && <div>{caption}</div>}
            {credit && <div className="text-white/60 text-xs mt-1">Crédito: {credit}</div>}
          </figcaption>
        )}
      </figure>
    </div>,
    document.body,
  );
}
