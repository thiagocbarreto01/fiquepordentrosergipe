import { describe, it, expect } from "vitest";
import { buildSimpleHomeLayout } from "./simpleHomeLayout";
import type { Post } from "./news";

const NOW = new Date("2026-07-15T15:00:00Z").getTime();
const HOUR = 3_600_000;

function mkPost(over: Partial<Post> & { id: string; ageH: number }): Post {
  const publishedAt = new Date(NOW - over.ageH * HOUR).toISOString();
  return {
    id: over.id,
    title: over.title ?? `Post ${over.id}`,
    subtitle: null,
    excerpt: null,
    source_url: null,
    slug: over.slug ?? `post-${over.id}`,
    content: "",
    cover_image_url: over.cover_image_url ?? "https://cdn.example.com/img.jpg",
    manual_image_url: null,
    category_id: null,
    author_id: "a",
    tags: [],
    status: over.status ?? "publicada",
    is_featured: false,
    is_urgent: over.is_urgent ?? false,
    is_denuncia: false,
    meta_title: null,
    meta_description: null,
    views: 0,
    published_at: publishedAt,
    scheduled_at: null,
    created_at: publishedAt,
    updated_at: publishedAt,
    home_expires_at: over.home_expires_at ?? null,
    pinned_until: over.pinned_until ?? null,
    pinned_slot: over.pinned_slot ?? null,
    pinned_reason: over.pinned_reason ?? null,
    ...over,
  } as Post;
}

describe("buildSimpleHomeLayout", () => {
  it("plantão válido assume manchete", () => {
    const posts = [
      mkPost({ id: "fresh", ageH: 0.5 }),
      mkPost({
        id: "plantao",
        ageH: 3,
        is_urgent: true,
        home_expires_at: new Date(NOW + HOUR).toISOString(),
      }),
    ];
    const r = buildSimpleHomeLayout(posts, {}, NOW);
    expect(r.manchete.post?.id).toBe("plantao");
    expect(r.manchete.reason).toBe("plantao_ativo");
  });

  it("plantão vencido é ignorado", () => {
    const posts = [
      mkPost({ id: "recent", ageH: 3 }),
      mkPost({
        id: "expired",
        ageH: 5,
        is_urgent: true,
        home_expires_at: new Date(NOW - HOUR).toISOString(),
      }),
    ];
    const r = buildSimpleHomeLayout(posts, {}, NOW);
    expect(r.manchete.post?.id).toBe("recent");
    expect(r.plantao.post).toBeNull();
  });

  it("fixação válida assume", () => {
    const posts = [
      mkPost({ id: "fresh", ageH: 0.5 }),
      mkPost({
        id: "pinned",
        ageH: 10,
        pinned_slot: "manchete",
        pinned_until: new Date(NOW + 2 * HOUR).toISOString(),
        pinned_reason: "Cobertura especial",
      }),
    ];
    const r = buildSimpleHomeLayout(posts, {}, NOW);
    // Sem plantão, fixação sobrepõe a "menos de 2h"
    expect(r.manchete.post?.id).toBe("pinned");
    expect(r.manchete.reason).toBe("fixada_manual");
  });

  it("fixação vencida é ignorada", () => {
    const posts = [
      mkPost({ id: "recent", ageH: 3 }),
      mkPost({
        id: "pinnedOld",
        ageH: 10,
        pinned_slot: "manchete",
        pinned_until: new Date(NOW - HOUR).toISOString(),
        pinned_reason: "antigo",
      }),
    ];
    const r = buildSimpleHomeLayout(posts, {}, NOW);
    expect(r.manchete.post?.id).toBe("recent");
  });

  it("notícia com menos de 2h assume mesmo sem views", () => {
    const posts = [
      mkPost({ id: "old", ageH: 10 }),
      mkPost({ id: "fresh", ageH: 1 }),
    ];
    const r = buildSimpleHomeLayout(posts, { old: 999 }, NOW);
    expect(r.manchete.post?.id).toBe("fresh");
    expect(r.manchete.reason).toBe("publicada_menos_2h");
  });

  it("depois de 2h, mais vista com >=2 views assume", () => {
    const posts = [
      mkPost({ id: "a", ageH: 4 }),
      mkPost({ id: "b", ageH: 6 }),
      mkPost({ id: "c", ageH: 8 }),
    ];
    const r = buildSimpleHomeLayout(posts, { a: 5, b: 20, c: 1 }, NOW);
    expect(r.manchete.post?.id).toBe("b");
    expect(r.manchete.reason).toBe("mais_vista_24h");
  });

  it("empate de views favorece a mais recente", () => {
    const posts = [
      mkPost({ id: "old", ageH: 8 }),
      mkPost({ id: "new", ageH: 4 }),
    ];
    const r = buildSimpleHomeLayout(posts, { old: 10, new: 10 }, NOW);
    expect(r.manchete.post?.id).toBe("new");
  });

  it("sem histórico usa a mais recente", () => {
    const posts = [
      mkPost({ id: "a", ageH: 5 }),
      mkPost({ id: "b", ageH: 3 }),
    ];
    const r = buildSimpleHomeLayout(posts, {}, NOW);
    expect(r.manchete.post?.id).toBe("b");
    expect(r.manchete.reason).toBe("mais_recente");
  });

  it("notícia sem imagem não ocupa slot", () => {
    const posts = [
      mkPost({ id: "noimg", ageH: 1, cover_image_url: null }),
      mkPost({ id: "ok", ageH: 3 }),
    ];
    const r = buildSimpleHomeLayout(posts, {}, NOW);
    expect(r.manchete.post?.id).toBe("ok");
  });

  it("notícia não publicada não ocupa slot", () => {
    const posts = [
      mkPost({ id: "draft", ageH: 0.5, status: "em_revisao" as any, published_at: null as any }),
      mkPost({ id: "ok", ageH: 3 }),
    ];
    // fixa published_at null explicitamente
    (posts[0] as any).published_at = null;
    const r = buildSimpleHomeLayout(posts, {}, NOW);
    expect(r.manchete.post?.id).toBe("ok");
  });

  it("slots não repetem notícia", () => {
    const posts = [
      mkPost({ id: "a", ageH: 1 }),
      mkPost({ id: "b", ageH: 2 }),
      mkPost({ id: "c", ageH: 3 }),
      mkPost({ id: "d", ageH: 4 }),
      mkPost({ id: "e", ageH: 5 }),
    ];
    const r = buildSimpleHomeLayout(posts, {}, NOW);
    const ids = [r.manchete, r.lateral1, r.lateral2, r.lateral3, r.emDestaque]
      .map((s) => s.post?.id)
      .filter(Boolean);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("fallback até 48h quando não há candidata em 24h", () => {
    const posts = [
      mkPost({ id: "old", ageH: 30 }),
      mkPost({ id: "older", ageH: 40 }),
    ];
    const r = buildSimpleHomeLayout(posts, {}, NOW);
    expect(r.manchete.post?.id).toBe("old");
    expect(r.manchete.usedFallback48h).toBe(true);
    expect(r.manchete.reason).toBe("fallback_48h");
  });

  it("notícia acima de 48h nunca vira manchete automática", () => {
    const posts = [mkPost({ id: "veryold", ageH: 72 })];
    const r = buildSimpleHomeLayout(posts, {}, NOW);
    expect(r.manchete.post).toBeNull();
  });

  it("posts.views histórico nunca influencia (sem recentViews)", () => {
    const posts = [
      mkPost({ id: "highhistorical", ageH: 5, views: 99999 } as any),
      mkPost({ id: "fresher", ageH: 3 }),
    ];
    const r = buildSimpleHomeLayout(posts, {}, NOW);
    expect(r.manchete.post?.id).toBe("fresher");
  });

  it("fixação exige motivo (>=3 chars) para ser considerada", () => {
    const posts = [
      mkPost({ id: "recent", ageH: 3 }),
      mkPost({
        id: "badpin",
        ageH: 10,
        pinned_slot: "manchete",
        pinned_until: new Date(NOW + 2 * HOUR).toISOString(),
        pinned_reason: "",
      }),
    ];
    const r = buildSimpleHomeLayout(posts, {}, NOW);
    expect(r.manchete.post?.id).toBe("recent");
  });
});
