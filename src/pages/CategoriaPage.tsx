import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import SiteLayout from "@/components/site/SiteLayout";
import AdSlot from "@/components/site/AdSlot";
import { NewsCard } from "@/components/site/NewsCards";
import { Post, getNoticiasByCategory, subscribeToNoticiasFeed } from "@/lib/noticias";
import { supabase } from "@/integrations/supabase/client";

const SITE_ORIGIN = "https://www.fiquepordentrosergipe.com.br";

export default function CategoriaPage() {
  const { slug = "" } = useParams();
  const [posts, setPosts] = useState<Post[]>([]);
  const [name, setName] = useState("");

  useEffect(() => {
    const load = () => getNoticiasByCategory(slug, 30).then(setPosts);
    supabase.from("categories").select("name").eq("slug", slug).maybeSingle().then(({ data }) => {
      setName(data?.name ?? slug);
      document.title = `${data?.name ?? slug} — Fique Por Dentro Sergipe`;
    });
    load();
    return subscribeToNoticiasFeed(load);
  }, [slug]);

  return (
    <SiteLayout>
      <div className="container-news"><AdSlot position="topo_home" /></div>
      <div className="container-news mt-4">
        <div className="section-title">
          <h2>{name}</h2>
        </div>
        {posts.length === 0 ? (
          <p className="text-muted-foreground py-12 text-center">Nenhuma notícia publicada nesta editoria ainda.</p>
        ) : (
          <div className="grid md:grid-cols-3 gap-6">
            {posts.map((p) => <NewsCard key={p.id} post={p} />)}
          </div>
        )}
      </div>
    </SiteLayout>
  );
}
