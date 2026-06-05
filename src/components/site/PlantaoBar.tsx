import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Radio } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type PlantaoItem = { id: string; title: string; slug: string };

export default function PlantaoBar() {
  const [items, setItems] = useState<PlantaoItem[]>([]);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data } = await supabase
        .from("posts_public" as any)
        .select("id, title, slug, is_urgent, is_main_featured, is_denuncia, published_at")
        .or("is_urgent.eq.true,is_main_featured.eq.true,is_denuncia.eq.true")
        .order("published_at", { ascending: false })
        .limit(15);
      if (!active) return;
      const list = ((data ?? []) as any[]).map((p) => ({ id: p.id, title: p.title, slug: p.slug }));
      setItems(list);
    })();
    return () => {
      active = false;
    };
  }, []);

  if (!items.length) return null;

  // Duplica a lista para loop infinito sem corte
  const loop = [...items, ...items];

  return (
    <div className="bg-urgent text-white border-b border-white/10">
      <div className="container-news flex items-stretch h-8 md:h-9 overflow-hidden">
        <div className="flex items-center gap-2 pr-4 shrink-0 border-r border-white/25">
          <span className="relative flex items-center justify-center h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full rounded-full bg-white opacity-75 animate-ping" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-white" />
          </span>
          <span className="font-display text-[11px] md:text-xs font-black uppercase tracking-[0.18em] text-white flex items-center gap-1.5">
            <Radio className="h-3.5 w-3.5" /> Plantão
          </span>
        </div>
        <div className="flex-1 overflow-hidden fpd-marquee-pause pl-4 flex items-center">
          <div className="fpd-marquee">
            {loop.map((it, idx) => (
              <Link
                key={`${it.id}-${idx}`}
                to={`/noticia/${it.slug}`}
                className="inline-flex items-center gap-2 pr-8 text-[12px] md:text-[13px] font-semibold text-white/95 hover:text-alert transition-colors"
              >
                <span className="h-1 w-1 rounded-full bg-alert/80" />
                <span className="truncate max-w-[60vw] md:max-w-none">{it.title}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
