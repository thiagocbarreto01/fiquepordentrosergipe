import { useEffect, useState } from "react";
import SiteLayout from "@/components/site/SiteLayout";
import AdSlot from "@/components/site/AdSlot";
import { PortalHero } from "@/components/site/NewsCards";
import { SectionBoundary } from "@/components/site/SectionBoundary";
import EditorialSection from "@/components/site/EditorialSection";
import HomeSidebar from "@/components/site/HomeSidebar";
import {
  getMostReadNoticias,
  getNoticiasByCategory,
  getPublishedNoticias,
  Post,
  subscribeToNoticiasFeed,
} from "@/lib/noticias";
import {
  pickManchete,
  pickSecundarias,
  pickTrending,
  pickLatest,
  editorialScore,
} from "@/lib/editorialEngine";

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
  const [mostRead, setMostRead] = useState<Post[]>([]);
  const [sections, setSections] = useState<Record<string, Post[]>>({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const load = async () => {
      const [l, mr, ...sectionResults] = await Promise.all([
        safe(getPublishedNoticias(80), [] as Post[]),
        safe(getMostReadNoticias(5), [] as Post[]),
        ...SECTIONS.map((s) =>
          safe(getNoticiasByCategory(s.slug, 4), [] as Post[]),
        ),
      ]);
      setLatest(l);
      setMostRead(mr);
      const map: Record<string, Post[]> = {};
      SECTIONS.forEach((s, i) => (map[s.slug] = sectionResults[i]));
      setSections(map);
      setLoaded(true);
    };
    load();
    return subscribeToNoticiasFeed(load);
  }, []);

  useEffect(() => {
    document.title =
      "Fique Por Dentro Sergipe — Notícias, Política, Polícia, Brasil e Mundo";
  }, []);

  // Motor editorial
  const manchete = pickManchete(latest);
  const secundarias = pickSecundarias(latest, manchete, 3);
  const trending = pickTrending(latest, 5);
  const latestList = pickLatest(latest, 8);

  useEffect(() => {
    if (!manchete) return;
    const scored = editorialScore(manchete);
    console.info("[Home] Manchete", {
      title: manchete.title,
      score: scored.score,
      editorialWeight: scored.editorialWeight,
      reasons: scored.reasons,
    });
  }, [manchete?.id]);

  return (
    <SiteLayout>
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
          <div className="grid md:grid-cols-2 gap-6 lg:gap-8">
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
        <HomeSidebar mostRead={trending.length > 0 ? trending : mostRead} latest={latestList} />
      </section>
    </SiteLayout>
  );
}
