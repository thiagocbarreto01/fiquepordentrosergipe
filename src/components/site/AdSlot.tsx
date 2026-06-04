import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import useEmblaCarousel from "embla-carousel-react";
import Autoplay from "embla-carousel-autoplay";
import { Database } from "@/integrations/supabase/types";

type Position = Database["public"]["Enums"]["banner_position"];

const SIZE: Record<Position, string> = {
  topo_home: "h-[150px] sm:h-[200px]",
  entre_noticias: "h-[150px] md:h-[250px]",
  lateral: "h-[600px] w-full",
  dentro_materia: "h-[150px] sm:h-[200px]",
  final_materia: "h-[120px] sm:h-[180px]",
  mobile_banner: "h-[100px] w-full max-w-[320px] mx-auto",
  footer: "h-[100px] sm:h-[150px]",
};

type Banner = {
  id: string;
  image_url: string | null;
  link_url: string | null;
  name: string | null;
};

export default function AdSlot({ position }: { position: Position }) {
  const [banners, setBanners] = useState<Banner[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [failedIds, setFailedIds] = useState<Set<string>>(new Set());

  const [emblaRef] = useEmblaCarousel({ loop: true }, [
    Autoplay({ delay: 3000, stopOnInteraction: false, stopOnMouseEnter: true }),
  ]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const { data, error } = await supabase
        .from("banners_public")
        .select("id, image_url, link_url, name")
        .eq("position", position)
        .limit(20);

      if (cancelled) return;
      if (error || !data || data.length === 0) {
        setBanners([]);
        setLoaded(true);
        return;
      }

      const valid = data.filter((b) => !!b.image_url?.trim());

      setBanners(valid as Banner[]);
      setLoaded(true);
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [position]);

  const handleImgError = useCallback((id: string) => {
    setFailedIds((prev) => new Set(prev).add(id));
  }, []);

  if (!loaded) return null;

  const activeBanners = banners.filter((b) => !failedIds.has(b.id));
  if (activeBanners.length === 0) return null;

  const isTopo = position === "topo_home";
  const isLateral = position === "lateral";
  const isMobileBanner = position === "mobile_banner";

  const bannerContent = (banner: Banner, index: number) => {
    const isFirst = index === 0;
    const img = (
      <img
        src={banner.image_url!}
        alt={banner.name ?? "Anúncio"}
        className={`block w-full object-contain bg-slate-50/50 rounded-sm border border-slate-100 ${SIZE[position]}`}
        loading={isTopo && isFirst ? "eager" : "lazy"}
        fetchPriority={isTopo && isFirst ? "high" : "low"}
        decoding={isTopo && isFirst ? "sync" : "async"}
        referrerPolicy="no-referrer"
        onError={() => handleImgError(banner.id)}
      />
    );

    return banner.link_url ? (
      <a href={banner.link_url} target="_blank" rel="noopener noreferrer sponsored" className="block">
        {img}
      </a>
    ) : (
      img
    );
  };

  return (
    <div className={`my-6 animate-in fade-in duration-500 ${isLateral ? 'hidden lg:block' : ''} ${isMobileBanner ? 'lg:hidden' : ''}`}>
      <div className="text-[10px] uppercase tracking-[0.2em] font-bold text-muted-foreground/60 text-center mb-2">
        PUBLICIDADE
      </div>
      
      <div className="overflow-hidden rounded-sm">
        {activeBanners.length === 1 ? (
          <div className="relative">
            {bannerContent(activeBanners[0], 0)}
          </div>
        ) : (
          <div className="relative overflow-hidden" ref={emblaRef}>
            <div className="flex">
              {activeBanners.map((banner, i) => (
                <div key={banner.id} className="flex-[0_0_100%] min-w-0 relative">
                  {bannerContent(banner, i)}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
