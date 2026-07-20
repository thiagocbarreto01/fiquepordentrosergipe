import { useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import SiteLayout from "@/components/site/SiteLayout";
import AdSlot from "@/components/site/AdSlot";
import { PortalHero } from "@/components/site/NewsCards";
import { SectionBoundary } from "@/components/site/SectionBoundary";
import EditorialSection from "@/components/site/EditorialSection";
import HomeSidebar from "@/components/site/HomeSidebar";
import {
  getNoticiasByCategory,
  getPublishedNoticias,
  invalidateNoticiasCache,
  Post,
  subscribeToNoticiasFeed,
} from "@/lib/noticias";
import { getTrending } from "@/lib/trending";
import { pickLatest } from "@/lib/editorialEngine";
import { buildSimpleHomeLayout } from "@/lib/simpleHomeLayout";
import { withFailsafe } from "@/lib/failsafe";

type CategoryDef = { slug: string; title: string; color: string };

// Editorias fixas estilo G1, com cor da editoria (alinhada à tabela categories)
const SECTIONS: CategoryDef[] = [
  { slug: "sergipe", title: "Sergipe", color: "#0f766e" },
  { slug: "aracaju", title: "Aracaju", color: "#0369a1" },
  { slug: "policia", title: "Polícia", color: "#b91c1c" },
  { slug: "politica", title: "Política", color: "#1e3a8a" },
  { slug: "brasil", title: "Brasil", color: "#16a34a" },
  { slug: "mundo", title: "Mundo", color: "#475569" },
  { slug: "economia", title: "Economia", color: "#ca8a04" },
  { slug: "esportes", title: "Esportes", color: "#ea580c" },
  { slug: "entretenimento", title: "Entretenimento", color: "#db2777" },
];

const safe = async <T,>(p: Promise<T>, fallback: T): Promise<T> => {
  try {
    return await p;
  } catch (err) {
    console.error("[Home] fetch error:", err);
    return fallback;
  }
};

export default function Index() {
  const [latest, setLatest] = useState<Post[]>([]);
  const [trending, setTrending] = useState<Post[]>([]);
  const [sections, setSections] = useState<Record<string, Post[]>>({});
  const [hero, setHero] = useState<{ manchete: Post | null; secundarias: Post[] }>({
    manchete: null,
    secundarias: [],
  });
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const load = async () => {
      const [l, tr, ...sectionResults] = await Promise.all([
        withFailsafe<Post[]>("home:latest", () => getPublishedNoticias(80), []),
        withFailsafe<Post[]>("home:trending", () => getTrending(5), []),
        ...SECTIONS.map((s) =>
          withFailsafe<Post[]>(`home:cat:${s.slug}`, () => getNoticiasByCategory(s.slug, 4), []),
        ),
      ]);
      setLatest(l);
      setTrending(tr);
      const map: Record<string, Post[]> = {};
      SECTIONS.forEach((s, i) => (map[s.slug] = sectionResults[i]));
      setSections(map);

      // Regra simples e definitiva (estilo TV Barretão).
      // Sem histórico temporal de views → passa mapa vazio, cai em recência.
      const layout = buildSimpleHomeLayout(l, {}, Date.now());
      const secundarias = [layout.lateral1.post, layout.lateral2.post, layout.lateral3.post].filter(
        (p): p is Post => !!p,
      );
      setHero({ manchete: layout.manchete.post, secundarias });
      setLoaded(true);
    };
    load();
    return subscribeToNoticiasFeed(() => {
      invalidateNoticiasCache();
      load();
    });
  }, []);

  useEffect(() => {
    document.title =
      "Fique Por Dentro Sergipe — Notícias, Política, Polícia, Brasil e Mundo";
  }, []);

  const latestList = pickLatest(latest, 8);

  useEffect(() => {
    if (!hero.manchete) return;
    console.info("[Home] Manchete", { title: hero.manchete.title, id: hero.manchete.id });
  }, [hero.manchete?.id]);

  const manchete = hero.manchete;
  const secundarias = hero.secundarias;

  return (
    <SiteLayout>
      <Helmet>
        <title>Fique Por Dentro Sergipe — Notícias de Sergipe, Aracaju, Brasil e Mundo</title>
        <meta name="description" content="Portal Fique Por Dentro Sergipe: cobertura em tempo real de Sergipe, Aracaju, política, polícia, denúncias, esportes, Brasil e mundo." />
        <link rel="canonical" href="https://www.fiquepordentrosergipe.com.br/" />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://www.fiquepordentrosergipe.com.br/" />
        <meta property="og:title" content="Fique Por Dentro Sergipe — Notícias de Sergipe, Aracaju, Brasil e Mundo" />
        <meta property="og:description" content="Portal Fique Por Dentro Sergipe: cobertura em tempo real de Sergipe, Aracaju, política, polícia, denúncias, esportes, Brasil e mundo." />
        <meta property="og:image" content="https://www.fiquepordentrosergipe.com.br/og-default.jpg" />
        <meta name="twitter:image" content="https://www.fiquepordentrosergipe.com.br/og-default.jpg" />
      </Helmet>
      {/* HERO */}
      <section className="container-news pt-2 md:pt-3">
        <SectionBoundary title="Manchete" loading={!loaded && !manchete}>
          {manchete ? <PortalHero main={manchete} secondaries={secundarias} /> : null}
        </SectionBoundary>
      </section>

      {/* Conteúdo + sidebar */}
      <section className="container-news mt-6 md:mt-8 grid lg:grid-cols-3 gap-6 lg:gap-8">
        <div className="lg:col-span-2 space-y-8">
          {/* Banner topo */}
          <AdSlot position="topo_home" />

          {/* Editorias fixas em duas colunas */}
          <div className="grid md:grid-cols-2 gap-6 lg:gap-8 items-stretch">
            {SECTIONS.slice(0, 8).map((s) => (
              <SectionBoundary key={s.slug} title={s.title} loading={!loaded}>
                <EditorialSection
                  title={s.title}
                  slug={s.slug}
                  color={s.color}
                  posts={sections[s.slug] ?? []}
                />
              </SectionBoundary>
            ))}
          </div>

          {/* Entretenimento (full-width) */}
          {SECTIONS[8] && (
            <SectionBoundary title={SECTIONS[8].title} loading={!loaded}>
              <EditorialSection
                title={SECTIONS[8].title}
                slug={SECTIONS[8].slug}
                color={SECTIONS[8].color}
                posts={sections[SECTIONS[8].slug] ?? []}
              />
            </SectionBoundary>
          )}

          <AdSlot position="entre_noticias" />
        </div>

        {/* SIDEBAR */}
        <HomeSidebar mostRead={trending} latest={latestList} />
      </section>
    </SiteLayout>
  );
}
