import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import type { Post } from "@/lib/news";
import { SmartImage } from "@/components/site/SmartImage";
import { getPostImage, handleImgError } from "@/lib/postImage";
import { NewsThumbItem } from "@/components/site/NewsCards";
import { timeAgo } from "@/lib/news";

type Props = {
  title: string;
  slug: string;
  color?: string; // hex from categories
  posts: Post[];
};

/**
 * Seção editorial padrão: 1 destaque grande + thumbs.
 * Resiliente: se `posts` vier vazio, mostra mensagem de fallback.
 */
export default function EditorialSection({ title, slug, color, posts }: Props) {
  const headline = posts[0];
  const rest = posts.slice(1, 4);

  const accent = color ?? "hsl(var(--primary))";

  if (!headline) {
    return (
      <section>
        <Header title={title} slug={slug} accent={accent} />
        <div className="rounded-md border border-dashed border-border/60 bg-white/60 p-4 text-sm text-muted-foreground">
          Sem notícias no momento.
        </div>
      </section>
    );
  }

  return (
    <section>
      <Header title={title} slug={slug} accent={accent} />
      <div className="grid grid-cols-1 sm:grid-cols-5 gap-4 bg-white border border-border/60 rounded-md p-3">
        <Link
          to={`/noticia/${headline.slug}`}
          className="sm:col-span-3 group flex flex-col"
        >
          <div className="relative aspect-[16/10] overflow-hidden bg-muted rounded-md">
            <SmartImage
              src={getPostImage(headline)}
              fallbackUrl={headline.categories?.default_cover_image_url}
              alt={headline.title}
              aspectRatio="unset"
              loading="lazy"
              hoverZoom
              className="h-full w-full"
              onError={(e) => handleImgError(e, headline)}
            />
          </div>
          <h3 className="font-display text-base md:text-lg font-bold leading-snug text-foreground group-hover:text-primary transition-colors line-clamp-3 mt-2">
            {headline.title}
          </h3>
          {headline.subtitle && (
            <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
              {headline.subtitle}
            </p>
          )}
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70 mt-1">
            {timeAgo(headline.published_at ?? headline.created_at)}
          </span>
        </Link>
        <div className="sm:col-span-2 flex flex-col divide-y divide-border">
          {rest.length > 0 ? (
            rest.map((p) => <NewsThumbItem key={p.id} post={p} />)
          ) : (
            <span className="text-xs text-muted-foreground py-2">
              Sem outras matérias hoje.
            </span>
          )}
        </div>
      </div>
    </section>
  );
}

function Header({ title, slug, accent }: { title: string; slug: string; accent: string }) {
  return (
    <div
      className="flex items-center justify-between border-b-[3px] mb-3 pb-1.5"
      style={{ borderColor: accent }}
    >
      <h2 className="text-base md:text-lg font-black uppercase tracking-tight">
        <Link to={`/categoria/${slug}`} className="hover:opacity-80">
          {title}
        </Link>
      </h2>
      <Link
        to={`/categoria/${slug}`}
        className="text-[10px] font-bold uppercase text-muted-foreground hover:text-primary flex items-center gap-0.5"
      >
        Ver mais <ChevronRight className="h-3 w-3" />
      </Link>
    </div>
  );
}
