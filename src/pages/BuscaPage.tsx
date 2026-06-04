import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import SiteLayout from "@/components/site/SiteLayout";
import { NewsCard } from "@/components/site/NewsCards";
import { Post, searchNoticias, subscribeToNoticiasFeed } from "@/lib/noticias";

export default function BuscaPage() {
  const [params] = useSearchParams();
  const q = params.get("q") ?? "";
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    document.title = `Busca: ${q} — TV Barretão`;
    if (!q) { setPosts([]); return; }
    const load = () => {
      setLoading(true);
      searchNoticias(q).then((r) => { setPosts(r); setLoading(false); });
    };
    load();
    return subscribeToNoticiasFeed(load);
  }, [q]);

  return (
    <SiteLayout>
      <div className="container-news mt-6">
        <div className="section-title"><h2>Busca · "{q}"</h2></div>
        {loading ? <p className="text-muted-foreground">Buscando…</p> :
          posts.length === 0 ? <p className="text-muted-foreground py-8">Nenhum resultado encontrado.</p> :
          <div className="grid md:grid-cols-3 gap-6">{posts.map((p) => <NewsCard key={p.id} post={p} />)}</div>
        }
      </div>
    </SiteLayout>
  );
}
