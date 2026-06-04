import { Link } from "react-router-dom";
import { Post, timeAgo } from "@/lib/news";
import { getPostImage, handleImgError } from "@/lib/postImage";
import { SmartImage } from "@/components/site/SmartImage";
import { Play, Clock, ArrowRight, Eye } from "lucide-react";

function stripHtml(s?: string | null) {
  if (!s) return "";
  return s.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function heroSummary(post: Post): string {
  const sub = stripHtml(post.subtitle);
  if (sub) return sub;
  const exc = stripHtml(post.excerpt);
  if (exc) return exc;
  const body = stripHtml((post as any).content);
  if (!body) return "";
  return body.length > 140 ? body.slice(0, 137).trimEnd() + "…" : body;
}


/* ============================================================
   SELOS / BADGES
   ============================================================ */
function tagsLower(post: Post): string[] {
  return (post.tags ?? []).map((t) => String(t).toLowerCase());
}

function hasTag(post: Post, ...needles: string[]) {
  const ts = tagsLower(post);
  return needles.some((n) => ts.some((t) => t.includes(n)));
}

export function PostBadges({ post, size = "md" }: { post: Post; size?: "sm" | "md" | "lg" }) {
  const base =
    size === "lg"
      ? "text-[11px] px-2.5 py-1"
      : size === "sm"
      ? "text-[9px] px-1.5 py-0.5"
      : "text-[10px] px-2 py-0.5";

  const isLive = hasTag(post, "ao-vivo", "ao vivo", "live");
  const isExclusive = hasTag(post, "exclusivo", "exclusive");
  const isTvBarretao = hasTag(post, "tv-barretao", "barretao") || post.is_denuncia;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {post.is_urgent && (
        <span className={`${base} font-black uppercase tracking-widest bg-urgent text-white rounded-sm flex items-center gap-1 shadow-md`}>
          <span className="h-1.5 w-1.5 bg-white rounded-full animate-pulse" />
          PLANTÃO
        </span>
      )}
      {isLive && (
        <span className={`${base} font-black uppercase tracking-widest bg-red-600 text-white rounded-sm flex items-center gap-1`}>
          <span className="h-1.5 w-1.5 bg-white rounded-full animate-ping" />
          AO VIVO
        </span>
      )}
      {isExclusive && (
        <span className={`${base} font-black uppercase tracking-widest bg-amber-400 text-black rounded-sm`}>
          EXCLUSIVO
        </span>
      )}
      {isTvBarretao && !post.is_urgent && (
        <span className={`${base} font-black uppercase tracking-widest bg-navy-deep text-white rounded-sm`}>
          TV Barretão
        </span>
      )}
    </div>
  );
}

function readingMinutes(post: Post) {
  const text = `${post.subtitle ?? ""} ${post.excerpt ?? ""} ${post.title}`;
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  // Mínimo de 2 min para parecer profissional, máximo 12
  return Math.max(2, Math.min(12, Math.ceil(words / 60)));
}

function formatLongDate(d?: string | null) {
  if (!d) return "";
  try {
    return new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
  } catch {
    return "";
  }
}

/* ============================================================
   HERO PREMIUM — imagem grande com gradiente e título sobreposto
   + lista vertical de 3 manchetes ao lado
   ============================================================ */
export function G1Hero({ main, secondaries, recent = [] }: { main: Post; secondaries: Post[]; recent?: Post[] }) {
  const minutes = readingMinutes(main);
  const summary = heroSummary(main);

  const hasSecondaries = secondaries.length > 0;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 md:gap-6">
      {/* Manchete principal */}
      <article className={`${hasSecondaries ? "lg:col-span-8" : "lg:col-span-12"} group`}>
        {/* Imagem principal */}
        <Link to={`/noticia/${main.slug}`} className="block relative overflow-hidden rounded-md md:rounded-lg bg-navy-deep aspect-[16/9] sm:aspect-[16/9] shadow-md ring-1 ring-black/5">
          <SmartImage
            src={getPostImage(main)}
            alt={main.title}
            aspectRatio="unset"
            loading="eager"
            fetchPriority="high"
            hoverZoom
            className="h-full w-full"
            onError={(e) => handleImgError(e, main)}
          />
          <div className="absolute top-3 left-3 md:top-4 md:left-4 z-10">
            <PostBadges post={main} size="lg" />
          </div>
        </Link>

        {/* Bloco editorial abaixo da foto */}
        <div className="mt-2.5 md:mt-3.5">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mb-1.5 md:mb-2 text-[11px] md:text-xs font-black uppercase tracking-widest">
            {main.categories?.name && (
              <Link
                to={`/categoria/${main.categories.slug ?? ""}`}
                className="text-primary hover:underline"
              >
                {main.categories.name}
              </Link>
            )}
            <span className="text-muted-foreground/60">•</span>
            <span className="text-muted-foreground">{timeAgo(main.published_at)}</span>
            <span className="hidden md:inline text-muted-foreground/60">•</span>
            <span className="hidden md:inline-flex items-center gap-1 text-muted-foreground">
              <Clock className="h-3 w-3" /> {minutes} min de leitura
            </span>
          </div>
          <Link to={`/noticia/${main.slug}`} className="block group/title">
            <h1 className="font-display text-xl sm:text-2xl md:text-[28px] lg:text-[34px] font-black leading-[1.1] text-balance text-foreground group-hover/title:text-primary transition-colors">
              {main.title}
            </h1>
          </Link>
          {summary && (
            <p className="mt-2 md:mt-2.5 text-sm md:text-base text-muted-foreground leading-relaxed line-clamp-3 max-w-3xl">
              {summary}
            </p>
          )}
          <Link
            to={`/noticia/${main.slug}`}
            className="mt-2.5 md:mt-3 inline-flex items-center gap-2 text-[11px] md:text-xs font-black uppercase tracking-widest text-urgent hover:gap-3 transition-all"
          >
            Ler matéria <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        {/* Mais Recentes — preenche o vazio ao lado da sidebar (desktop) */}
        {recent.length > 0 && (
          <div className="hidden lg:block mt-6 pt-5 border-t border-border">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[11px] font-black uppercase tracking-widest text-foreground flex items-center gap-2">
                <span className="h-2 w-2 bg-primary rounded-full" />
                Mais Recentes
              </h3>
              <Link to="/ultimas" className="text-[10px] font-bold uppercase text-muted-foreground hover:text-primary transition-colors">
                Ver todas →
              </Link>
            </div>
            <div className="grid grid-cols-3 gap-4">
              {recent.slice(0, 3).map((p) => (
                <Link key={p.id} to={`/noticia/${p.slug}`} className="group flex flex-col gap-2">
                  <div className="relative aspect-[16/10] overflow-hidden rounded-sm bg-muted">
                    <SmartImage
                      src={getPostImage(p)}
                      alt={p.title}
                      aspectRatio="unset"
                      loading="lazy"
                      hoverZoom
                      className="h-full w-full"
                      onError={(e) => handleImgError(e, p)}
                    />
                    {p.is_urgent && (
                      <span className="absolute top-1.5 left-1.5 text-[8px] font-black uppercase tracking-widest bg-urgent text-white px-1.5 py-0.5 rounded-sm">
                        Plantão
                      </span>
                    )}
                  </div>
                  {p.categories?.name && (
                    <span className="text-primary text-[9px] font-black uppercase tracking-widest">
                      {p.categories.name}
                    </span>
                  )}
                  <h4 className="font-display text-[13px] font-bold leading-snug text-foreground group-hover:text-primary transition-colors line-clamp-3">
                    {p.title}
                  </h4>
                  <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground/60">
                    {timeAgo(p.published_at)}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        )}
      </article>




      {/* Cards secundários verticais — laterais no desktop, abaixo no mobile */}
      {hasSecondaries && (
      <div className="lg:col-span-4 flex flex-col gap-3 md:gap-4 lg:border-l lg:border-border lg:pl-6">
        <div className="hidden lg:flex items-center gap-2 border-b-2 border-primary pb-1.5 mb-1">
          <h2 className="text-xs font-black uppercase tracking-widest">Em destaque agora</h2>
        </div>
        {secondaries.slice(0, 3).map((post) => (
          <Link
            key={post.id}
            to={`/noticia/${post.slug}`}
            className="group flex gap-3 lg:flex-col lg:gap-2 pb-3 lg:pb-4 border-b border-border last:border-0 last:pb-0"
          >
            <div className="relative shrink-0 w-28 h-20 sm:w-32 sm:h-24 lg:w-full lg:h-auto lg:aspect-[16/10] overflow-hidden rounded-sm bg-muted">
              <SmartImage
                src={getPostImage(post)}
                alt={post.title}
                aspectRatio="unset"
                className="h-full w-full"
                onError={(e) => handleImgError(e, post)}
              />
              {post.is_urgent && (
                <span className="absolute top-1 left-1 text-[8px] font-black uppercase tracking-widest bg-urgent text-white px-1.5 py-0.5 rounded-sm">
                  Plantão
                </span>
              )}
            </div>
            <div className="flex-1 min-w-0 flex flex-col">
              {post.categories?.name && (
                <span className="text-primary text-[9px] md:text-[10px] font-black uppercase tracking-widest mb-1">
                  {post.categories.name}
                </span>
              )}
              <h3 className="font-display text-sm md:text-[15px] lg:text-base font-bold leading-snug text-foreground group-hover:text-primary transition-colors line-clamp-3">
                {post.title}
              </h3>
              <span className="mt-auto pt-1 text-[9px] font-bold uppercase tracking-wider text-muted-foreground/60">
                {timeAgo(post.published_at)}
              </span>
            </div>
          </Link>
        ))}
      </div>
      )}
    </div>
  );
}

/* ============================================================
   GRID DE DESTAQUES — 4 cards modernos
   ============================================================ */
export function HighlightsGrid({ posts }: { posts: Post[] }) {
  if (!posts.length) return null;
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-5">
      {posts.slice(0, 4).map((post) => (
        <Link
          key={post.id}
          to={`/noticia/${post.slug}`}
          className="group flex flex-col bg-white rounded-md overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300 hover:-translate-y-0.5 border border-border/40"
        >
          <div className="relative aspect-[16/10] overflow-hidden bg-muted">
            <SmartImage
              src={getPostImage(post)}
              alt={post.title}
              aspectRatio="unset"
              loading="lazy"
              hoverZoom
              className="h-full w-full"
              onError={(e) => handleImgError(e, post)}
            />
            <div className="absolute top-2 left-2 z-10">
              <PostBadges post={post} size="sm" />
            </div>
          </div>
          <div className="p-3 md:p-4 flex flex-col flex-1">
            {post.categories?.name && (
              <span
                className="text-[9px] md:text-[10px] font-black uppercase tracking-widest mb-1.5"
                style={{ color: post.categories.color ?? undefined }}
              >
                {post.categories.name}
              </span>
            )}
            <h3 className="font-display text-sm md:text-base font-bold leading-snug text-foreground group-hover:text-primary transition-colors line-clamp-3 mb-2">
              {post.title}
            </h3>
            <span className="mt-auto text-[9px] md:text-[10px] uppercase tracking-wider font-bold text-muted-foreground/60">
              {timeAgo(post.published_at)}
            </span>
          </div>
        </Link>
      ))}
    </div>
  );
}

/* ============================================================
   ÚLTIMAS NOTÍCIAS — lista compacta com thumb
   ============================================================ */
export function NewsThumbItem({ post }: { post: Post }) {
  return (
    <Link
      to={`/noticia/${post.slug}`}
      className="group flex gap-3 md:gap-4 py-3 md:py-4 border-b border-border last:border-0 hover:bg-secondary/20 transition-colors -mx-2 px-2 rounded-sm"
    >
      <div className="relative shrink-0 w-24 h-20 md:w-28 md:h-24 overflow-hidden rounded-sm bg-muted">
        <SmartImage
          src={getPostImage(post)}
          alt={post.title}
          aspectRatio="unset"
          loading="lazy"
          className="h-full w-full"
          onError={(e) => handleImgError(e, post)}
        />
        {post.is_urgent && (
          <span className="absolute top-1 left-1 h-1.5 w-1.5 bg-urgent rounded-full animate-pulse shadow" />
        )}
      </div>
      <div className="flex-1 min-w-0 flex flex-col">
        <div className="flex items-center gap-2 mb-1">
          {post.categories?.name && (
            <span className="text-primary text-[9px] md:text-[10px] font-black uppercase tracking-widest">
              {post.categories.name}
            </span>
          )}
        </div>
        <h4 className="font-display text-sm md:text-[15px] font-bold leading-snug text-foreground group-hover:text-primary transition-colors line-clamp-3">
          {post.title}
        </h4>
        <span className="mt-auto pt-1 text-[9px] md:text-[10px] uppercase tracking-wider font-bold text-muted-foreground/60">
          {timeAgo(post.published_at)}
        </span>
      </div>
    </Link>
  );
}

/* ============================================================
   MAIS LIDAS — ranking numerado
   ============================================================ */
export function MostReadItem({ post, index }: { post: Post; index: number }) {
  const views = post.views ?? 0;
  const viewsLabel =
    views >= 1000 ? `${(views / 1000).toFixed(views >= 10000 ? 0 : 1).replace(".", ",")}k` : views.toLocaleString("pt-BR");
  const isTop = index === 0;
  return (
    <Link
      to={`/noticia/${post.slug}`}
      className="group flex gap-3 md:gap-4 py-3 border-b border-border last:border-0 items-start hover:bg-secondary/20 -mx-2 px-2 rounded-sm transition-colors"
    >
      <span className={`font-display text-3xl md:text-4xl font-black leading-none w-9 shrink-0 transition-colors ${
        isTop ? "text-urgent" : "text-primary/30 group-hover:text-primary"
      }`}>
        {index + 1}
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          {post.categories?.name && (
            <span className="text-primary text-[9px] font-black uppercase tracking-widest">
              {post.categories.name}
            </span>
          )}
          <span className="inline-flex items-center gap-0.5 text-[9px] font-black uppercase tracking-widest text-muted-foreground ml-auto bg-secondary/60 px-1.5 py-0.5 rounded-sm">
            <Eye className="h-2.5 w-2.5" />{viewsLabel}
          </span>
        </div>
        <h4 className="font-display font-bold leading-snug text-foreground text-sm md:text-[14px] group-hover:text-primary transition-colors line-clamp-3">
          {post.title}
        </h4>
      </div>
    </Link>
  );
}


/* ============================================================
   CARD DE VÍDEO
   ============================================================ */
export function VideoCard({ post, featured = false }: { post: Post; featured?: boolean }) {
  return (
    <Link
      to={`/noticia/${post.slug}`}
      className={`group flex flex-col rounded-md overflow-hidden bg-navy-deep text-white shadow-md hover:shadow-2xl transition-all duration-300 ${
        featured ? "col-span-2 row-span-2" : ""
      }`}
    >
      <div className={`relative w-full overflow-hidden bg-black ${featured ? "aspect-[16/9]" : "aspect-[16/10]"}`}>
        <SmartImage
          src={getPostImage(post)}
          alt={post.title}
          aspectRatio="unset"
          loading="lazy"
          hoverZoom
          className="h-full w-full opacity-90 group-hover:opacity-100 transition"
          onError={(e) => handleImgError(e, post)}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="h-12 w-12 md:h-16 md:w-16 rounded-full bg-urgent/90 ring-4 ring-white/20 flex items-center justify-center group-hover:scale-110 transition-transform shadow-2xl">
            <Play className="h-5 w-5 md:h-7 md:w-7 text-white fill-white ml-0.5" />
          </span>
        </div>
        <span className="absolute top-2 left-2 text-[9px] font-black uppercase tracking-widest bg-urgent text-white px-2 py-0.5 rounded-sm">
          Vídeo
        </span>
      </div>
      <div className="p-3 md:p-4">
        {post.categories?.name && (
          <span className="text-alert text-[9px] md:text-[10px] font-black uppercase tracking-widest mb-1 block">
            {post.categories.name}
          </span>
        )}
        <h3 className={`font-display font-bold leading-snug line-clamp-3 ${featured ? "text-base md:text-xl" : "text-sm md:text-[15px]"}`}>
          {post.title}
        </h3>
      </div>
    </Link>
  );
}

/* ============================================================
   COMPATIBILIDADE COM USO EXISTENTE
   ============================================================ */
export function HeroCard({ post }: { post: Post }) {
  return <G1Hero main={post} secondaries={[]} />;
}

export function NewsCard({ post, size = "md" }: { post: Post; size?: "sm" | "md" | "lg" }) {
  const titleClass =
    size === "lg" ? "text-xl md:text-2xl" :
    size === "sm" ? "text-sm md:text-base" : "text-base md:text-lg";

  const imageHeight =
    size === "sm" ? "h-[140px]" : "h-[180px] md:h-[210px]";

  return (
    <Link to={`/noticia/${post.slug}`} className="group flex flex-col h-full bg-white transition-all duration-300">
      <div className={`relative ${imageHeight} w-full overflow-hidden rounded-sm mb-3 bg-muted`}>
        <SmartImage
          src={getPostImage(post)}
          alt={post.title}
          aspectRatio="unset"
          loading="lazy"
          hoverZoom
          className="h-full w-full"
          onError={(e) => handleImgError(e, post)}
        />
        <div className="absolute top-2 left-2 z-10">
          <PostBadges post={post} size="sm" />
        </div>
      </div>
      <div className="flex-1 flex flex-col">
        {post.categories?.name && (
          <span className="text-primary text-[10px] font-black uppercase tracking-wider mb-1.5 block">
            {post.categories.name}
          </span>
        )}
        <h3 className={`font-display font-bold leading-tight text-foreground group-hover:text-primary transition-colors line-clamp-3 mb-2 ${titleClass}`}>
          {post.title}
        </h3>
        {size !== "sm" && post.subtitle && (
          <p className="text-xs md:text-sm text-muted-foreground/80 line-clamp-2 leading-relaxed mb-3">
            {post.subtitle}
          </p>
        )}
        <div className="mt-auto flex items-center gap-2 text-[9px] text-muted-foreground/50 font-bold uppercase tracking-widest">
          {timeAgo(post.published_at)}
        </div>
      </div>
    </Link>
  );
}

export function NewsListItem({ post, index }: { post: Post; index?: number }) {
  if (typeof index === "number") {
    return <MostReadItem post={post} index={index} />;
  }
  return <NewsThumbItem post={post} />;
}

export function EmptyHero() {
  return (
    <div className="h-[320px] md:h-[420px] bg-secondary/5 border border-dashed border-border flex items-center justify-center rounded-md">
      <div className="text-center px-6">
        <h1 className="font-display text-2xl font-black text-muted-foreground">Portal TV Barretão</h1>
        <p className="mt-2 text-muted-foreground/60 max-w-sm mx-auto text-sm">
          Aguardando a publicação das primeiras notícias para preencher este espaço.
        </p>
      </div>
    </div>
  );
}
