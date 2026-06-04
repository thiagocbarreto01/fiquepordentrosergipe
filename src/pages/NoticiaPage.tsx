import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import SiteLayout from "@/components/site/SiteLayout";
import AdSlot from "@/components/site/AdSlot";
import { getNoticiaBySlug, getMostReadNoticias, Post, subscribeToNoticiasFeed, timeAgo } from "@/lib/noticias";
import { getPostImage, handleImgError } from "@/lib/postImage";
import { supabase } from "@/integrations/supabase/client";
import { Share2, Send, MessageCircle, Facebook, Twitter } from "lucide-react";
import { NewsListItem } from "@/components/site/NewsCards";
import { SmartImage } from "@/components/site/SmartImage";
import { VideoEmbed } from "@/components/site/VideoEmbed";
import { parseVideoUrl } from "@/lib/videoEmbed";

// Fonte/URL original NUNCA é exibida ao leitor (Fique Por Dentro Sergipe 2.0 — Etapa 1).


export default function NoticiaPage() {
  const { slug = "" } = useParams();
  const [post, setPost] = useState<Post | null>(null);
  const [mostRead, setMostRead] = useState<Post[]>([]);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    setPost(null); setNotFound(false);
    const load = () => getNoticiaBySlug(slug).then((p) => {
      if (!p) { setNotFound(true); return; }
      setPost(p);
      document.title = `${p.meta_title || p.title} — Fique Por Dentro Sergipe`;
      const meta = document.querySelector('meta[name="description"]');
      if (meta) meta.setAttribute("content", p.meta_description || p.subtitle || p.title);
      void supabase.auth.getSession().then(({ data: { session } }) => {
        if (!session) {
          void supabase.rpc("increment_post_views", { _post_id: p.id });
        }
      });
    });
    load();
    getMostReadNoticias(5).then(setMostRead);
    return subscribeToNoticiasFeed(load);
  }, [slug]);

  if (notFound) {
    return (
      <SiteLayout>
        <div className="container-news py-20 text-center">
          <h1 className="font-display text-3xl font-black">Notícia não encontrada</h1>
          <Link to="/" className="text-primary underline mt-4 inline-block">Voltar à home</Link>
        </div>
      </SiteLayout>
    );
  }

  if (!post) {
    return <SiteLayout><div className="container-news py-20 text-center text-muted-foreground">Carregando…</div></SiteLayout>;
  }

  const url = typeof window !== "undefined" ? window.location.href : "";
  const shareText = encodeURIComponent(post.title);
  const shareUrl = encodeURIComponent(url);

  return (
    <SiteLayout>
      <div className="container-news"><AdSlot position="topo_home" /></div>
      <article className="container-news mt-4 grid lg:grid-cols-3 gap-10">
        <div className="lg:col-span-2">
          <div className="flex items-center gap-2 mb-3">
            {post.is_urgent && <span className="urgent-badge">URGENTE</span>}
            {post.categories?.name && (
              <Link to={`/categoria/${post.categories.slug}`} className="category-tag hover:underline">
                {post.categories.name}
              </Link>
            )}
          </div>
          <h1 className="font-display text-3xl md:text-5xl font-black leading-[1.1] text-balance text-headline" style={{ color: "hsl(var(--headline))" }}>
            {post.title}
          </h1>
          {post.subtitle && (
            <p className="mt-4 text-lg md:text-xl text-muted-foreground font-serif-news">{post.subtitle}</p>
          )}
          <div className="flex flex-wrap items-center gap-3 mt-6 pb-4 border-b border-border text-sm text-muted-foreground">
            <span>Por <strong className="text-foreground">{post.profiles?.display_name || "Redação Fique Por Dentro Sergipe"}</strong></span>
            <span>·</span>
            <span>{post.published_at ? new Date(post.published_at).toLocaleString("pt-BR") : timeAgo(post.created_at)}</span>
            <div className="ml-auto flex items-center gap-2">
              <a aria-label="Compartilhar no WhatsApp" target="_blank" rel="noreferrer" href={`https://wa.me/?text=${shareText}%20${shareUrl}`} className="p-2 hover:bg-secondary rounded-sm"><MessageCircle className="h-4 w-4" /></a>
              <a aria-label="Compartilhar no Facebook" target="_blank" rel="noreferrer" href={`https://www.facebook.com/sharer/sharer.php?u=${shareUrl}`} className="p-2 hover:bg-secondary rounded-sm"><Facebook className="h-4 w-4" /></a>
              <a aria-label="Compartilhar no Twitter" target="_blank" rel="noreferrer" href={`https://twitter.com/intent/tweet?url=${shareUrl}&text=${shareText}`} className="p-2 hover:bg-secondary rounded-sm"><Twitter className="h-4 w-4" /></a>
              <button aria-label="Copiar link" onClick={() => navigator.clipboard.writeText(url)} className="p-2 hover:bg-secondary rounded-sm"><Share2 className="h-4 w-4" /></button>
            </div>
          </div>

          {(() => {
            const mainVideo = parseVideoUrl(post.video_url_principal);
            const relatedVideos = (post.videos_relacionados ?? [])
              .map((u) => ({ url: u, info: parseVideoUrl(u) }))
              .filter((v) => v.info);
            const hasImage = !!(post.cover_image_url || post.categories?.default_cover_image_url);
            const providerLabel =
              mainVideo?.provider === "youtube" ? "YouTube" :
              mainVideo?.provider === "instagram" ? "Instagram" :
              mainVideo?.provider === "mp4" ? "vídeo" : "";
            // Fique Por Dentro Sergipe 2.0 — Etapa 1: a fonte original NUNCA é exibida ao leitor.
            // Se o vídeo não puder ser embedado, simplesmente omitimos.
            const showSourceVideoCta = false;
            return (
              <>
                {/* Vídeo principal tem prioridade sobre a imagem.
                    Se a URL não for suportada (provider desconhecido), o player
                    é silenciosamente omitido e usamos a imagem como fallback. */}
                {mainVideo ? (
                  <figure className="mt-6">
                    <VideoEmbed url={post.video_url_principal!} title={post.title} />
                    <figcaption className="text-xs text-muted-foreground mt-2">
                      Vídeo: {providerLabel}
                    </figcaption>
                  </figure>
                ) : hasImage ? (
                  <figure className="mt-6">
                    <SmartImage
                      src={getPostImage(post)}
                      alt={post.title}
                      aspectRatio="16/9"
                      loading="eager"
                      fetchPriority="high"
                      onError={(e) => handleImgError(e, post)}
                    />
                  </figure>
                ) : null}

                {showSourceVideoCta && null}

                <div className="prose prose-lg max-w-none mt-6 font-serif-news leading-relaxed text-foreground/90 whitespace-pre-wrap">
                  {(() => {
                    const paragraphs = post.content.split("\n").filter(p => p.trim().length > 0);
                    if (paragraphs.length <= 2) return post.content;
                    
                    const firstPart = paragraphs.slice(0, 2).join("\n\n");
                    const rest = paragraphs.slice(2).join("\n\n");
                    
                    return (
                      <>
                        <div className="mb-6">{firstPart}</div>
                        <AdSlot position="dentro_materia" />
                        <div className="mt-6">{rest}</div>
                      </>
                    );
                  })()}
                </div>

                {relatedVideos.length > 0 && (
                  <section className="mt-8 border-t border-border pt-6">
                    <h2 className="font-display font-black text-xl mb-4 uppercase tracking-tight">
                      {relatedVideos.length === 1 ? "Vídeo relacionado" : "Vídeos relacionados"}
                    </h2>
                    <div className="grid sm:grid-cols-2 gap-4">
                      {relatedVideos.map((v, i) => (
                        <VideoEmbed key={`${v.url}-${i}`} url={v.url} title={`Vídeo ${i + 1}`} />
                      ))}
                    </div>
                  </section>
                )}
              </>
            );
          })()}

          

          {post.tags && post.tags.length > 0 && (
            <div className="mt-6 flex flex-wrap gap-2">
              {post.tags.map((t) => (
                <span key={t} className="px-2 py-1 bg-secondary text-xs uppercase tracking-wider font-bold">#{t}</span>
              ))}
            </div>
          )}

          <div className="mt-8 p-5 bg-navy-deep text-white flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <Send className="h-8 w-8 text-alert shrink-0" />
            <div className="flex-1">
              <p className="font-display font-bold text-lg">Tem uma denúncia?</p>
              <p className="text-sm text-white/80">Envie com sigilo para nossa redação.</p>
            </div>
            <Link to="/denuncias/enviar" className="bg-urgent hover:bg-urgent/90 px-4 py-2 font-bold uppercase tracking-wider text-xs rounded-sm">
              Enviar denúncia
            </Link>
          </div>

          <div className="mt-6"><AdSlot position="final_materia" /></div>
        </div>

        <aside className="space-y-6">
          <div>
            <div className="section-title"><h2>Mais Lidas</h2></div>
            <div className="bg-card border border-border p-4">
              {mostRead.map((p, i) => <NewsListItem key={p.id} post={p} index={i} />)}
            </div>
          </div>
          <AdSlot position="lateral" />
        </aside>
      </article>
    </SiteLayout>
  );
}
