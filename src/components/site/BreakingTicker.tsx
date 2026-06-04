import { useEffect, useState } from "react";
import { Post, getUrgentNoticias, subscribeToNoticiasFeed } from "@/lib/noticias";
import { getManualHomePosts } from "@/lib/homeSlots";
import { isEligibleForHome } from "@/lib/homeSlots";
import { Link } from "react-router-dom";

/**
 * CONFIGURAÇÃO DE VELOCIDADE
 * Menos segundos = Mais rápido
 */
const SPEED_DESKTOP = "45s";
const SPEED_MOBILE = "60s";

export default function BreakingTicker() {
  const [posts, setPosts] = useState<Post[]>([]);

  useEffect(() => {
    const load = async () => {
      const [list, manualSlots] = await Promise.all([getUrgentNoticias(8), getManualHomePosts()]);
      const merged = [manualSlots.plantao_ativo, ...list]
        .filter((p): p is Post => Boolean(p))
        .filter((p) => p.is_urgent && isEligibleForHome(p));
      const seen = new Set<string>();
      setPosts(merged.filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true))));
    };
    load();
    return subscribeToNoticiasFeed(load);
  }, []);

  if (posts.length === 0) {
    // Sem notícias publicadas — não renderiza a faixa
    return null;
  }

  // Garante conteúdo suficiente para loop suave mesmo com poucas notícias
  const loopItems = posts.length < 4 ? [...posts, ...posts, ...posts, ...posts] : [...posts, ...posts];

  return (
    <div className="bg-urgent text-urgent-foreground flex items-stretch overflow-hidden border-y-2 border-red-900/30">
      <div className="bg-navy-deep flex items-center gap-2 px-3 md:px-4 py-2 shrink-0 z-10 shadow-lg">
        <span className="h-2.5 w-2.5 bg-yellow-400 rounded-full pulse-dot shadow-[0_0_8px_rgba(250,204,21,0.8)]" />
        <span className="text-[11px] md:text-xs font-black uppercase tracking-widest">Plantão</span>
      </div>
      <div className="flex-1 overflow-hidden relative">
        <div
          className="marquee flex whitespace-nowrap py-2 will-change-transform"
          style={{
            "--marquee-speed-desktop": SPEED_DESKTOP,
            "--marquee-speed-mobile": SPEED_MOBILE,
          } as React.CSSProperties}
        >
          {loopItems.map((p, i) => (
            <Link
              key={`${p.id}-${i}`}
              to={p.slug ? `/noticia/${p.slug}` : "#"}
              className="px-6 md:px-8 text-sm font-bold hover:underline inline-flex items-center gap-2"
            >
              <span className="text-yellow-300">●</span> {p.title}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
