import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import SiteLayout from "@/components/site/SiteLayout";
import AdSlot from "@/components/site/AdSlot";
import { getNoticiaBySlug, getMostReadNoticias, Post, subscribeToNoticiasFeed, timeAgo } from "@/lib/noticias";
import { getRelatedPostsByEvent } from "@/lib/events";
import { getPostImage, handleImgError } from "@/lib/postImage";
import { Share2, Send, MessageCircle, Facebook, Twitter, Film } from "lucide-react";
import { NewsListItem } from "@/components/site/NewsCards";
import { SmartImage } from "@/components/site/SmartImage";
import { VideoEmbed } from "@/components/site/VideoEmbed";
import { parseVideoUrl } from "@/lib/videoEmbed";
import { useAuth } from "@/hooks/useAuth";
import ReelGeneratorDialog from "@/components/admin/ReelGeneratorDialog";
import { Button } from "@/components/ui/button";

const SITE_URL = "https://fiquepordentrosergipe.lovable.app";

// Fonte/URL original NUNCA é exibida ao leitor (Fique Por Dentro Sergipe 2.0 — Etapa 1).


export default function NoticiaPage() {
  const { slug = "" } = useParams();
  const { isStaff } = useAuth();
  const [post, setPost] = useState<Post | null>(null);
  const [mostRead, setMostRead] = useState<Post[]>([]);
  const [related, setRelated] = useState<Array<{ id: string; title: string; slug: string; cover_image_url: string | null; published_at: string }>>([]);
  const [notFound, setNotFound] = useState(false);
  const [reelOpen, setReelOpen] = useState(false);

  useEffect(() => {
    setPost(null); setNotFound(false); setRelated([]);
    const load = () => getNoticiaBySlug(slug).then((p) => {
      if (!p) { setNotFound(true); return; }
      setPost(p);
      const seoTitle = (p as any).ai_seo_title || p.meta_title || p.title;
      const seoDesc = (p as any).ai_summary || p.meta_description || p.subtitle || p.title;
      document.title = `${seoTitle} — Fique Por Dentro Sergipe`;
      const meta = document.querySelector('meta[name="description"]');
      if (meta) meta.setAttribute("content", seoDesc);
      // Notícias relacionadas (mesmo evento)
      getRelatedPostsByEvent(p.id, 5).then(setRelated).catch(() => setRelated([]));
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
  const shareUrl = `https://faubrqvkzgyfryfjylnb.supabase.co/functions/v1/share-preview?slug=${encodeURIComponent(post.slug)}`;
  const shareText = encodeURIComponent(post.title);
  const shareUrlEnc = encodeURIComponent(shareUrl);

  const canonical = `${SITE_URL}/noticia/${post.slug}`;
  const aiTitle = (post as any).ai_seo_title || post.meta_title || post.title;
  const aiSummary = (post as any).ai_summary || post.meta_description || post.subtitle || post.excerpt || post.title;
  const metaTitle = `${aiTitle} — Fique Por Dentro Sergipe`;
  const metaDesc = aiSummary;
  const ogImage = getPostImage(post) || `${SITE_URL}/favicon.png`;
  const newsArticleLd = {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    headline: post.title,
    description: metaDesc,
    image: [ogImage],
    datePublished: post.published_at ?? post.created_at,
    dateModified: post.updated_at ?? post.published_at ?? post.created_at,
    articleSection: post.categories?.name ?? "Geral",
    keywords: (post.tags ?? []).join(", "),
    mainEntityOfPage: { "@type": "WebPage", "@id": canonical },
    author: { "@type": "Organization", name: post.profiles?.display_name || "Redação Fique Por Dentro Sergipe" },
    publisher: {
      "@type": "NewsMediaOrganization",
      name: "Fique Por Dentro Sergipe",
      logo: { "@type": "ImageObject", url: `${SITE_URL}/favicon.png` },
    },
  };

  return (
    <SiteLayout>
      <Helmet>
        <title>{metaTitle}</title>
        <meta name="description" content={metaDesc} />
        <link rel="canonical" href={canonical} />
        <meta property="og:type" content="article" />
        <meta property="og:title" content={post.meta_title || post.title} />
        <meta property="og:description" content={metaDesc} />
        <meta property="og:url" content={canonical} />
        <meta property="og:image" content={ogImage} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={post.meta_title || post.title} />
        <meta name="twitter:description" content={metaDesc} />
        <meta name="twitter:image" content={ogImage} />
        <script type="application/ld+json">{JSON.stringify(newsArticleLd)}</script>
      </Helmet>
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
            {isStaff && (
              <Button
                size="sm"
                variant="outline"
                className="ml-auto gap-2"
                onClick={() => setReelOpen(true)}
              >
                <Film className="h-4 w-4" /> Gerar Reel
              </Button>
            )}
          </div>
          {isStaff && (
            <ReelGeneratorDialog open={reelOpen} onOpenChange={setReelOpen} post={post} />
          )}
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

          

          {related.length > 0 && (
            <section className="mt-8 border-t border-border pt-6">
              <h2 className="font-display font-black text-xl mb-4 uppercase tracking-tight">
                Mais sobre este assunto
              </h2>
              <ul className="space-y-3">
                {related.map((r) => (
                  <li key={r.id}>
                    <Link
                      to={`/noticia/${r.slug}`}
                      className="group flex gap-3 items-start hover:bg-secondary/30 -mx-2 px-2 py-2 rounded-sm"
                    >
                      {r.cover_image_url && (
                        <img
                          src={r.cover_image_url}
                          alt=""
                          className="w-20 h-16 object-cover rounded-sm shrink-0"
                          loading="lazy"
                        />
                      )}
                      <div>
                        <h3 className="font-display font-bold text-sm leading-snug group-hover:text-primary">
                          {r.title}
                        </h3>
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                          {timeAgo(r.published_at)}
                        </span>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

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
