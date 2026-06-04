// External CMS integration endpoint.
// Auth: header `x-api-key` must match CMS_API_KEY secret.
// Methods:
//   GET    /cms-api?slug=...        -> fetch single post by slug
//   GET    /cms-api?id=...          -> fetch single post by id
//   GET    /cms-api                 -> list recent posts (max 50)
//   POST   /cms-api                 -> create post
//   PUT    /cms-api?id=...          -> update post (partial)
//   DELETE /cms-api?id=...          -> delete post
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { z } from "https://esm.sh/zod@3.23.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function slugify(s: string) {
  return s
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9 -]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);
}

// Sem cover de demo/seed. Se a notícia chega sem imagem, persistimos NULL
// e o frontend escolhe (default da categoria → placeholder neutro do TV Barretão).
// Nunca herdamos imagem de outra notícia.
const DEFAULT_COVER_URL: string | null = null;

async function ensureUniqueSlug(
  supabase: ReturnType<typeof createClient>,
  base: string,
): Promise<string> {
  const root = base || "noticia";
  let candidate = root;
  for (let i = 2; i < 50; i++) {
    const { data } = await supabase.from("posts").select("id").eq("slug", candidate).maybeSingle();
    if (!data) return candidate;
    candidate = `${root}-${i}`.slice(0, 80);
  }
  return `${root}-${Date.now()}`.slice(0, 80);
}

const PostCreateSchema = z.object({
  title: z.string().trim().min(3).max(300),
  subtitle: z.string().trim().max(500).optional().nullable(),
  excerpt: z.string().trim().max(600).optional().nullable(),
  content: z.string().trim().min(10).max(50000),
  cover_image_url: z.string().url().max(2000).optional().nullable(),
  source_url: z.string().url().max(2000).optional().nullable(),
  category_id: z.string().uuid().optional().nullable(),
  category_slug: z.string().trim().max(120).optional().nullable(),
  author_id: z.string().uuid().optional().nullable(),
  author_name: z.string().trim().max(120).optional().nullable(),
  slug: z.string().trim().max(120).optional(),
  tags: z.array(z.string().trim().max(60)).max(20).optional(),
  status: z.enum(["captada", "em_revisao", "aprovada", "rejeitada", "publicada", "rascunho", "revisao", "publicado"]).optional(),
  is_featured: z.boolean().optional(),
  is_urgent: z.boolean().optional(),
  is_denuncia: z.boolean().optional(),
  meta_title: z.string().trim().max(200).optional().nullable(),
  meta_description: z.string().trim().max(500).optional().nullable(),
  published_at: z.string().datetime().optional().nullable(),
  scheduled_at: z.string().datetime().optional().nullable(),
});

const PostUpdateSchema = PostCreateSchema.partial();

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // ---- Auth: API key ----
  const expectedKey = Deno.env.get("CMS_API_KEY");
  if (!expectedKey) return json(500, { error: "Server misconfigured: CMS_API_KEY missing" });
  const providedKey = req.headers.get("x-api-key");
  if (!providedKey || providedKey !== expectedKey) {
    return json(401, { error: "Unauthorized — provide x-api-key header" });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } }
  );

  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  const slug = url.searchParams.get("slug");

  try {
    // ---- GET ----
    if (req.method === "GET") {
      if (id) {
        const { data, error } = await supabase.from("posts").select("*").eq("id", id).maybeSingle();
        if (error) throw error;
        if (!data) return json(404, { error: "Post not found" });
        return json(200, { post: data });
      }
      if (slug) {
        const { data, error } = await supabase.from("posts").select("*").eq("slug", slug).maybeSingle();
        if (error) throw error;
        if (!data) return json(404, { error: "Post not found" });
        return json(200, { post: data });
      }
      const { data, error } = await supabase
        .from("posts")
        .select("id, title, slug, status, category_id, published_at, created_at, is_featured, is_urgent, views")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return json(200, { posts: data ?? [] });
    }

    // ---- POST (create) ----
    if (req.method === "POST") {
      const body = await req.json().catch(() => null);
      const parsed = PostCreateSchema.safeParse(body);
      if (!parsed.success) {
        return json(400, { error: "Validation failed", issues: parsed.error.flatten() });
      }
      const p = parsed.data;

      // Resolve category by slug if needed
      let category_id = p.category_id ?? null;
      if (!category_id && p.category_slug) {
        const { data: cat } = await supabase
          .from("categories")
          .select("id")
          .eq("slug", p.category_slug)
          .maybeSingle();
        category_id = cat?.id ?? null;
      }

      const status = p.status ?? "publicado";
      const baseSlug = p.slug ? slugify(p.slug) : slugify(p.title);
      const finalSlug = await ensureUniqueSlug(supabase, baseSlug);

      const payload = {
        title: p.title,
        subtitle: p.subtitle ?? null,
        excerpt: p.excerpt ?? null,
        source_url: p.source_url ?? null,
        content: p.content,
        cover_image_url: p.cover_image_url ?? DEFAULT_COVER_URL,
        category_id,
        author_id: p.author_id ?? null,
        slug: finalSlug,
        tags: p.tags ?? [],
        status,
        is_featured: p.is_featured ?? false,
        is_urgent: p.is_urgent ?? false,
        is_denuncia: p.is_denuncia ?? false,
        meta_title: p.meta_title ?? null,
        meta_description: p.meta_description ?? null,
        published_at:
          status === "publicado" ? (p.published_at ?? new Date().toISOString()) : (p.published_at ?? null),
        scheduled_at: p.scheduled_at ?? null,
      };

      const { data, error } = await supabase.from("posts").insert(payload).select("*").maybeSingle();
      if (error) {
        if (error.code === "23505") return json(409, { error: "Slug already exists" });
        throw error;
      }
      // ✅ Log de incorporação ao feed público
      console.log(
        `[cms-api] ✅ Notícia externa incorporada ao feed público | id=${data?.id} slug=${data?.slug} status=${data?.status} categoria=${category_id ?? "—"} cover=${p.cover_image_url ? "fornecida" : "fallback"}`
      );
      return json(201, { post: data, public_url: `/noticia/${data?.slug}` });
    }

    // ---- PUT (update) ----
    if (req.method === "PUT") {
      if (!id) return json(400, { error: "Missing ?id=" });
      const body = await req.json().catch(() => null);
      const parsed = PostUpdateSchema.safeParse(body);
      if (!parsed.success) {
        return json(400, { error: "Validation failed", issues: parsed.error.flatten() });
      }
      const p = parsed.data;

      let category_id = p.category_id;
      if (category_id === undefined && p.category_slug) {
        const { data: cat } = await supabase
          .from("categories")
          .select("id")
          .eq("slug", p.category_slug)
          .maybeSingle();
        category_id = cat?.id ?? null;
      }

      const update: Record<string, unknown> = {};
      if (p.title !== undefined) update.title = p.title;
      if (p.subtitle !== undefined) update.subtitle = p.subtitle;
      if (p.excerpt !== undefined) update.excerpt = p.excerpt;
      if (p.source_url !== undefined) update.source_url = p.source_url;
      if (p.content !== undefined) update.content = p.content;
      if (p.cover_image_url !== undefined) update.cover_image_url = p.cover_image_url;
      if (category_id !== undefined) update.category_id = category_id;
      if (p.author_id !== undefined) update.author_id = p.author_id;
      if (p.slug !== undefined) update.slug = slugify(p.slug);
      if (p.tags !== undefined) update.tags = p.tags;
      if (p.status !== undefined) {
        update.status = p.status;
        if (p.status === "publicado" && p.published_at === undefined) {
          update.published_at = new Date().toISOString();
        }
      }
      if (p.is_featured !== undefined) update.is_featured = p.is_featured;
      if (p.is_urgent !== undefined) update.is_urgent = p.is_urgent;
      if (p.is_denuncia !== undefined) update.is_denuncia = p.is_denuncia;
      if (p.meta_title !== undefined) update.meta_title = p.meta_title;
      if (p.meta_description !== undefined) update.meta_description = p.meta_description;
      if (p.published_at !== undefined) update.published_at = p.published_at;
      if (p.scheduled_at !== undefined) update.scheduled_at = p.scheduled_at;

      const { data, error } = await supabase
        .from("posts")
        .update(update)
        .eq("id", id)
        .select("*")
        .maybeSingle();
      if (error) {
        if (error.code === "23505") return json(409, { error: "Slug already exists" });
        throw error;
      }
      if (!data) return json(404, { error: "Post not found" });
      return json(200, { post: data });
    }

    // ---- DELETE ----
    if (req.method === "DELETE") {
      if (!id) return json(400, { error: "Missing ?id=" });
      const { error } = await supabase.from("posts").delete().eq("id", id);
      if (error) throw error;
      return json(200, { ok: true });
    }

    return json(405, { error: "Method not allowed" });
  } catch (err) {
    console.error("cms-api error:", err);
    const msg = err instanceof Error ? err.message : "Unknown error";
    return json(500, { error: msg });
  }
});
