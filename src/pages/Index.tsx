import { useEffect, useState } from "react";
import SiteLayout from "@/components/site/SiteLayout";
import AdSlot from "@/components/site/AdSlot";
import { G1Hero, HighlightsGrid, NewsThumbItem, MostReadItem, VideoCard, PortalHero } from "@/components/site/NewsCards";
import DenunciaBanner from "@/components/site/DenunciaBanner";
import {
  getMostReadNoticias, getNoticiasByCategory,
  getPublishedNoticias, getVideoNoticias, getDenunciasDestaqueNoticias, Post, subscribeToNoticiasFeed,
} from "@/lib/noticias";
import { Link } from "react-router-dom";
import { ChevronRight, Video, Flame, Eye, AlertTriangle } from "lucide-react";
import { SmartImage } from "@/components/site/SmartImage";
import { getPostImage, getPostImageIssue, handleImgError } from "@/lib/postImage";
import { PostBadges } from "@/components/site/NewsCards";
import { buildHomeLayout, filterEligibleHomePosts } from "@/lib/homeSlots";

export default function Index() {
  const [latest, setLatest] = useState<Post[]>([]);
  const [politica, setPolitica] = useState<Post[]>([]);
  const [policia, setPolicia] = useState<Post[]>([]);
  const [municipios, setMunicipios] = useState<Post[]>([]);
  const [esporte, setEsporte] = useState<Post[]>([]);
  const [aracaju, setAracaju] = useState<Post[]>([]);
  const [sergipe, setSergipe] = useState<Post[]>([]);
  const [mostRead, setMostRead] = useState<Post[]>([]);
  const [videos, setVideos] = useState<Post[]>([]);
  const [weekMostRead, setWeekMostRead] = useState<Post[]>([]);
  const [denunciasDestaque, setDenunciasDestaque] = useState<Post[]>([]);

  useEffect(() => {
    const load = async () => {
      const [l, pol, plc, mun, esp, arc, ser, mr, wmr, vd, dd] = await Promise.all([
        getPublishedNoticias(60),
        getNoticiasByCategory("politica", 3),
        getNoticiasByCategory("policia", 3),
        getNoticiasByCategory("municipios", 3),
        getNoticiasByCategory("esporte", 3),
        getNoticiasByCategory("aracaju", 3),
        getNoticiasByCategory("sergipe", 3),
        getMostReadNoticias(5),
        getMostReadNoticias(4, 24 * 7),
        getVideoNoticias(4),
        getDenunciasDestaqueNoticias(4),
      ]);
      setLatest(l);
      setPolitica(pol); setPolicia(plc); setMunicipios(mun);
      setEsporte(esp); setAracaju(arc); setSergipe(ser); setMostRead(mr); setVideos(vd);
      setWeekMostRead(wmr); setDenunciasDestaque(dd);
    };
    load();
    return subscribeToNoticiasFeed(load);
  }, []);

  // Layout único da Home: pontuação editorial + recência + imagem válida + sem repetição
  const layout = buildHomeLayout({ published: filterEligibleHomePosts(latest) });
  const heroMain = layout.manchetePrincipal.post;
  const heroSecondaries = [
    layout.destaqueLateral1.post,
    layout.destaqueLateral2.post,
    layout.destaqueLateral3.post,
  ].filter(Boolean) as Post[];
  const heroRecent = layout.maisRecentes.slice(0, 3);
  const highlightGrid = layout.maisRecentes
    .filter(p => !heroRecent.some(r => r.id === p.id))
    .slice(0, 4);
  const usedIds = new Set([
    heroMain?.id,
    ...heroSecondaries.map(p => p.id),
    ...heroRecent.map(p => p.id),
    ...highlightGrid.map(p => p.id),
  ].filter(Boolean) as string[]);
  // "Últimas Notícias": feed estritamente cronológico por published_at DESC,
  // independente de categoria, destaque, plantão ou inteligência da Home.
  const latestFeed = [...filterEligibleHomePosts(latest)].sort((a, b) => {
    const ta = new Date(a.published_at ?? a.created_at).getTime();
    const tb = new Date(b.published_at ?? b.created_at).getTime();
    return tb - ta;
  });


  useEffect(() => {
    document.title = "Fique Por Dentro Sergipe — Notícias, Política, Denúncias e Brasil";
  }, []);

  // Log da escolha da manchete (recalculada a cada atualização do feed)
  useEffect(() => {
    if (!heroMain) return;
    const imageIssues = latest.map(getPostImageIssue).filter(Boolean);
    console.info("[Home] Manchete selecionada", {
      id: heroMain.id,
      title: heroMain.title,
      imagem: getPostImage(heroMain),
      score: layout.manchetePrincipal.score,
      motivo: layout.manchetePrincipal.reasonLabel,
      fatores: layout.manchetePrincipal.reasons,
      escolhidaEm: new Date().toISOString(),
      publicadaEm: heroMain.published_at,
    });
    console.info("[Home] Relatório de imagens", {
      materias_sem_imagem_valida: imageIssues.length,
      falhas_registradas: typeof window !== "undefined" ? window.__fpdImageFailures ?? [] : [],
      exemplos: imageIssues.slice(0, 10),
    });
  }, [heroMain?.id, layout.manchetePrincipal.score]);

  const SectionHeader = ({ title, colorClass = "border-primary", link, icon: Icon }: { title: string; colorClass?: string; link?: string; icon?: any }) => (
    <div className={`flex items-center justify-between border-b-2 ${colorClass} mb-4 md:mb-5 pb-1.5`}>
      <h2 className="text-base md:text-xl font-black uppercase tracking-tight flex items-center gap-2">
        {Icon && <Icon className="h-4 w-4 md:h-5 md:w-5 text-primary" />}
        {title}
      </h2>
      {link && (
        <Link to={link} className="text-[10px] font-bold uppercase text-muted-foreground hover:text-primary flex items-center gap-0.5 transition-colors">
          Ver mais <ChevronRight className="h-3 w-3" />
        </Link>
      )}
    </div>
  );

  return (
    <SiteLayout>
      {/* HERO PORTAL — 70/30 estilo G1 / Poder360 / A8 Sergipe */}
      {heroMain && (
        <section className="container-news pt-2 md:pt-3">
          <PortalHero main={heroMain} secondaries={heroSecondaries} />
        </section>
      )}

      {/* MAIS LIDAS (esquerda) + ÚLTIMAS NOTÍCIAS (direita) */}
      <section className="container-news mt-3 md:mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-5">
        {mostRead.length > 0 && (
          <div>
            <SectionHeader title="Mais Lidas" colorClass="border-urgent" icon={Flame} link="/ultimas" />
            <div className="bg-white border border-border/60 rounded-md px-3 py-1">
              {mostRead.slice(0, 5).map((p, i) => (
                <MostReadItem key={p.id} post={p} index={i} />
              ))}
            </div>
          </div>
        )}
        {latestFeed.length > 0 && (
          <div>
            <SectionHeader title="Últimas Notícias" link="/ultimas" />
            <div className="bg-white rounded-md border border-border/60 px-3 md:px-4 divide-y divide-border">
              {latestFeed.slice(0, 5).map((p) => (
                <NewsThumbItem key={p.id} post={p} />
              ))}
            </div>
          </div>
        )}
      </section>

      {/* GRID DE DESTAQUES — 4 cards */}
      {highlightGrid.length > 0 && (
        <section className="container-news mt-6 md:mt-8">
          <SectionHeader title="Destaques" icon={Flame} link="/ultimas" />
          <HighlightsGrid posts={highlightGrid} />
        </section>
      )}

      {/* Banner topo */}
      <div className="container-news mt-4 md:mt-6">
        <AdSlot position="topo_home" />
      </div>

      {/* SEÇÕES LOCAIS + sidebar */}
      <section className="container-news mt-6 md:mt-8 grid lg:grid-cols-3 gap-6 lg:gap-8">
        <div className="lg:col-span-2">
          <div className="space-y-8">
            <div className="grid md:grid-cols-2 gap-6 md:gap-8">
              {sergipe.length > 0 && (
                <div>
                  <SectionHeader title="Sergipe" colorClass="border-blue-600" link="/categoria/sergipe" />
                  <div className="space-y-1 bg-white rounded-md border border-border/60 px-3">
                    {sergipe.slice(0, 3).map((p) => <NewsThumbItem key={p.id} post={p} />)}
                  </div>
                </div>
              )}
              {aracaju.length > 0 && (
                <div>
                  <SectionHeader title="Aracaju" colorClass="border-orange-600" link="/categoria/aracaju" />
                  <div className="space-y-1 bg-white rounded-md border border-border/60 px-3">
                    {aracaju.slice(0, 3).map((p) => <NewsThumbItem key={p.id} post={p} />)}
                  </div>
                </div>
              )}
            </div>

            <div className="grid md:grid-cols-2 gap-6 md:gap-8">
              {policia.length > 0 && (
                <div>
                  <SectionHeader title="Polícia" colorClass="border-red-700" link="/categoria/policia" />
                  <div className="space-y-1 bg-white rounded-md border border-border/60 px-3">
                    {policia.slice(0, 3).map((p) => <NewsThumbItem key={p.id} post={p} />)}
                  </div>
                </div>
              )}
              {esporte.length > 0 && (
                <div>
                  <SectionHeader title="Esporte" colorClass="border-green-600" link="/categoria/esporte" />
                  <div className="space-y-1 bg-white rounded-md border border-border/60 px-3">
                    {esporte.slice(0, 3).map((p) => <NewsThumbItem key={p.id} post={p} />)}
                  </div>
                </div>
              )}
            </div>

            {politica.length > 0 && municipios.length > 0 && (
              <div className="grid md:grid-cols-2 gap-6 md:gap-8">
                <div>
                  <SectionHeader title="Política" colorClass="border-indigo-600" link="/categoria/politica" />
                  <div className="space-y-1 bg-white rounded-md border border-border/60 px-3">
                    {politica.slice(0, 3).map((p) => <NewsThumbItem key={p.id} post={p} />)}
                  </div>
                </div>
                <div>
                  <SectionHeader title="Municípios" colorClass="border-amber-600" link="/categoria/municipios" />
                  <div className="space-y-1 bg-white rounded-md border border-border/60 px-3">
                    {municipios.slice(0, 3).map((p) => <NewsThumbItem key={p.id} post={p} />)}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* SIDEBAR */}
        <aside className="space-y-6 lg:space-y-8">
          <div className="lg:sticky lg:top-24">
            <AdSlot position="lateral" />
            <div className="mt-8">
              <DenunciaBanner />
            </div>
          </div>
        </aside>
      </section>


      {/* SEÇÃO 1 — MAIS LIDAS DA SEMANA */}
      {weekMostRead.length > 0 && (
        <section className="container-news mt-8 md:mt-10">
          <SectionHeader title="Mais Lidas da Semana" colorClass="border-urgent" icon={Flame} link="/ultimas" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-5">
            {weekMostRead.slice(0, 4).map((p, i) => {
              const views = p.views ?? 0;
              const viewsLabel =
                views >= 1000 ? `${(views / 1000).toFixed(views >= 10000 ? 0 : 1).replace(".", ",")}k` : views.toLocaleString("pt-BR");
              return (
                <Link
                  key={p.id}
                  to={`/noticia/${p.slug}`}
                  className="group flex flex-col bg-white rounded-md overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300 hover:-translate-y-0.5 border border-border/40"
                >
                  <div className="relative aspect-[16/10] overflow-hidden bg-muted">
                    <SmartImage src={getPostImage(p)} fallbackUrl={p.categories?.default_cover_image_url} alt={p.title} aspectRatio="unset" loading="lazy" hoverZoom className="h-full w-full" onError={(e) => handleImgError(e, p)} />
                    <span className="absolute top-2 left-2 z-10 text-[10px] font-black uppercase tracking-widest bg-urgent text-white px-2 py-0.5 rounded-sm shadow">
                      #{i + 1}
                    </span>
                  </div>
                  <div className="p-3 md:p-4 flex flex-col flex-1">
                    {p.categories?.name && (
                      <span className="text-primary text-[9px] md:text-[10px] font-black uppercase tracking-widest mb-1.5">
                        {p.categories.name}
                      </span>
                    )}
                    <h3 className="font-display text-sm md:text-base font-bold leading-snug text-foreground group-hover:text-primary transition-colors line-clamp-3 mb-2">
                      {p.title}
                    </h3>
                    <span className="mt-auto inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">
                      <Eye className="h-3 w-3" /> {viewsLabel} visualizações
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* SEÇÃO 2 — FIQUE POR DENTRO SERGIPE VÍDEOS */}
      {videos.length > 0 && (
        <section className="container-news mt-8 md:mt-10">
          <SectionHeader title="Fique Por Dentro Sergipe Vídeos" colorClass="border-urgent" link="/categoria/videos" icon={Video} />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-5">
            {videos.slice(0, 4).map((v) => <VideoCard key={v.id} post={v} />)}
          </div>
        </section>
      )}

      {/* SEÇÃO 3 — ÚLTIMAS NOTÍCIAS (compacto, 8) */}
      {latest.length > 0 && (
        <section className="container-news mt-8 md:mt-10">
          <SectionHeader title="Últimas Notícias" link="/ultimas" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1 bg-white rounded-md border border-border/60 px-3 md:px-4">
            {latest.slice(0, 8).map((p) => (
              <NewsThumbItem key={`recent-${p.id}`} post={p} />
            ))}
          </div>
        </section>
      )}

      {/* SEÇÃO 4 — DENÚNCIAS EM DESTAQUE */}
      {denunciasDestaque.length > 0 && (
        <section className="container-news mt-8 md:mt-10">
          <SectionHeader title="Denúncias em Destaque" colorClass="border-urgent" icon={AlertTriangle} link="/denuncias" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-5">
            {denunciasDestaque.slice(0, 4).map((p) => (
              <Link
                key={p.id}
                to={`/noticia/${p.slug}`}
                className="group flex flex-col bg-white rounded-md overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300 hover:-translate-y-0.5 border border-urgent/30"
              >
                <div className="relative aspect-[16/10] overflow-hidden bg-muted">
                  <SmartImage src={getPostImage(p)} fallbackUrl={p.categories?.default_cover_image_url} alt={p.title} aspectRatio="unset" loading="lazy" hoverZoom className="h-full w-full" onError={(e) => handleImgError(e, p)} />
                  <span className="absolute top-2 left-2 z-10 text-[10px] font-black uppercase tracking-widest bg-urgent text-white px-2 py-0.5 rounded-sm shadow flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" /> Denúncia
                  </span>
                  <div className="absolute top-2 right-2 z-10">
                    <PostBadges post={p} size="sm" />
                  </div>
                </div>
                <div className="p-3 md:p-4 flex flex-col flex-1">
                  {p.categories?.name && (
                    <span className="text-urgent text-[9px] md:text-[10px] font-black uppercase tracking-widest mb-1.5">
                      {p.categories.name}
                    </span>
                  )}
                  <h3 className="font-display text-sm md:text-base font-bold leading-snug text-foreground group-hover:text-urgent transition-colors line-clamp-3">
                    {p.title}
                  </h3>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      <div className="container-news py-10 md:py-14">
        <AdSlot position="entre_noticias" />
      </div>
    </SiteLayout>
  );
}
