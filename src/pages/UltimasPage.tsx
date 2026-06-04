import { useEffect, useState } from "react";
import SiteLayout from "@/components/site/SiteLayout";
import { NewsCard } from "@/components/site/NewsCards";
import { Post, getPublishedNoticias, subscribeToNoticiasFeed } from "@/lib/noticias";

export default function UltimasPage() {
  const [posts, setPosts] = useState<Post[]>([]);
  useEffect(() => {
    document.title = "Últimas notícias — Fique Por Dentro Sergipe";
    const load = () => getPublishedNoticias(50).then(setPosts);
    load();
    return subscribeToNoticiasFeed(load);
  }, []);

  return (
    <SiteLayout>
      <div className="container-news mt-6">
        <div className="section-title"><h2>Últimas Notícias</h2></div>
        {posts.length === 0 ? (
          <p className="text-muted-foreground py-12 text-center">Sem publicações ainda.</p>
        ) : (
          <div className="grid md:grid-cols-3 gap-6">{posts.map((p) => <NewsCard key={p.id} post={p} />)}</div>
        )}
      </div>
    </SiteLayout>
  );
}
