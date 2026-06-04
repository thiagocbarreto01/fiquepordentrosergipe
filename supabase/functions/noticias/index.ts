// Alias público para integração CIN. Aceita POST de notícias externas e
// grava direto na tabela `posts` com status=publicado, garantindo que
// apareçam imediatamente na home, categoria e listagem de últimas.
//
// Auth: header `x-api-key` deve bater com CMS_API_KEY.
// Métodos: GET (lista 20 últimas), POST (cria publicada)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { z } from "https://esm.sh/zod@3.23.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-api-key",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// Sem cover de demo/seed. Frontend escolhe (default da categoria → placeholder Fique Por Dentro Sergipe).
const DEFAULT_COVER_URL: string | null = null;

async function fetchOgImage(url: string): Promise<string | null> {
  try {
    const r = await fetch(url, {
      headers: { "User-Agent": "FiquePorDentroSE-Captador/1.0" },
      signal: AbortSignal.timeout(5000),
    });
    if (!r.ok) return null;
    const html = (await r.text()).slice(0, 200_000);
    const og =
      html.match(/<meta[^>]+property=['"]og:image['"][^>]*content=['"]([^'"]+)['"]/i) ??
      html.match(/<meta[^>]+content=['"]([^'"]+)['"][^>]*property=['"]og:image['"]/i) ??
      html.match(/<meta[^>]+name=['"]twitter:image['"][^>]*content=['"]([^'"]+)['"]/i);
    
    if (og) {
      try { return new URL(og[1], url).toString(); }
      catch { return og[1]; }
    }

    // Fallback: primeira imagem do body
    const bodyOnly = html.split(/<\/head>/i)[1] || html;
    const imgMatch = bodyOnly.match(/<img[^>]+src=['"]([^'"]+\.(?:jpe?g|png|webp|gif)[^'"]*)['"]/i);
    if (imgMatch) {
      try { return new URL(imgMatch[1], url).toString(); }
      catch { return imgMatch[1]; }
    }
    return null;
  } catch {
    return null;
  }
}

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

async function ensureUniqueSlug(
  supabase: ReturnType<typeof createClient>,
  base: string,
): Promise<string> {
  const root = base || "noticia";
  let candidate = root;
  for (let i = 2; i < 50; i++) {
    const { data } = await supabase
      .from("posts")
      .select("id")
      .eq("slug", candidate)
      .maybeSingle();
    if (!data) return candidate;
    candidate = `${root}-${i}`.slice(0, 80);
  }
  return `${root}-${Date.now()}`.slice(0, 80);
}

// Schema flexível — aceita variações de nomes de campo comuns em CMSs externos
const NoticiaSchema = z.object({
  // título (obrigatório)
  title: z.string().trim().min(3).max(300).optional(),
  titulo: z.string().trim().min(3).max(300).optional(),
  // subtítulo
  subtitle: z.string().trim().max(500).optional().nullable(),
  subtitulo: z.string().trim().max(500).optional().nullable(),
  // resumo
  excerpt: z.string().trim().max(600).optional().nullable(),
  resumo: z.string().trim().max(600).optional().nullable(),
  // conteúdo
  content: z.string().trim().min(10).max(50000).optional(),
  conteudo: z.string().trim().min(10).max(50000).optional(),
  // imagem
  cover_image_url: z.string().url().max(2000).optional().nullable(),
  imagem: z.string().url().max(2000).optional().nullable(),
  image_url: z.string().url().max(2000).optional().nullable(),
  // categoria
  category_id: z.string().uuid().optional().nullable(),
  category_slug: z.string().trim().max(120).optional().nullable(),
  categoria: z.string().trim().max(120).optional().nullable(),
  // fonte
  source_url: z.string().url().max(2000).optional().nullable(),
  fonte: z.string().url().max(2000).optional().nullable(),
  // demais
  slug: z.string().trim().max(120).optional(),
  tags: z.array(z.string().trim().max(60)).max(20).optional(),
  status: z.enum(["rascunho", "revisao", "publicado"]).optional(),
  is_featured: z.boolean().optional(),
  is_urgent: z.boolean().optional(),
  published_at: z.string().datetime().optional().nullable(),
  author_name: z.string().trim().max(120).optional().nullable(),
  autor: z.string().trim().max(120).optional().nullable(),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });

  // Auth
  const expectedKey = Deno.env.get("CMS_API_KEY");
  if (!expectedKey)
    return json(500, { error: "Server misconfigured: CMS_API_KEY missing" });
  const providedKey = req.headers.get("x-api-key");
  if (!providedKey || providedKey !== expectedKey) {
    console.warn("[noticias] ❌ requisição sem x-api-key válida");
    return json(401, { error: "Unauthorized — provide x-api-key header" });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  try {
    if (req.method === "GET") {
      const { data, error } = await supabase
        .from("posts_public")
        .select("id, title, slug, status, published_at, cover_image_url")
        .order("published_at", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return json(200, { noticias: data ?? [] });
    }

    if (req.method === "POST") {
      const raw = await req.json().catch(() => null);
      const parsed = NoticiaSchema.safeParse(raw);
      if (!parsed.success) {
        console.warn("[noticias] payload inválido", parsed.error.flatten());
        return json(400, {
          error: "Validation failed",
          issues: parsed.error.flatten(),
        });
      }
      const p = parsed.data;

      // Normalização (suporta PT e EN)
      const title = p.title ?? p.titulo;
      const content = p.content ?? p.conteudo;
      if (!title || !content) {
        return json(400, {
          error: "Campos obrigatórios faltando: title/titulo e content/conteudo",
        });
      }

      const subtitle = p.subtitle ?? p.subtitulo ?? null;
      const excerpt = p.excerpt ?? p.resumo ?? null;
      const source_url = p.source_url ?? p.fonte ?? null;
      let cover_image_url = p.cover_image_url ?? p.imagem ?? p.image_url;
      let usedFallback = !cover_image_url;

      if (!cover_image_url && source_url) {
        cover_image_url = await fetchOgImage(source_url);
        usedFallback = !cover_image_url;
      }

      if (!cover_image_url) {
        cover_image_url = DEFAULT_COVER_URL;
      }

      // Resolver categoria por slug ou nome PT
      let category_id = p.category_id ?? null;
      const catSlug = p.category_slug ?? (p.categoria ? slugify(p.categoria) : null);
      if (!category_id && catSlug) {
        const { data: cat } = await supabase
          .from("categories")
          .select("id")
          .eq("slug", catSlug)
          .maybeSingle();
        category_id = cat?.id ?? null;
      }

      // Notícias vindas do CIN entram como "captada" no fluxo editorial
      // (precisam passar por revisão e aprovação antes de irem ao ar).
      // Para publicar direto, envie status: "publicada" explicitamente.
      const rawStatus = p.status ?? "captada";
      const statusMap: Record<string, string> = {
        rascunho: "captada",
        revisao: "em_revisao",
        publicado: "publicada",
      };
      let status = statusMap[rawStatus] ?? rawStatus;
      const baseSlug = p.slug ? slugify(p.slug) : slugify(title);

      // 🔍 Detecção de duplicatas (slug, source_url, título semelhante)
      const { data: dupes } = await supabase.rpc("find_duplicate_post", {
        _title: title,
        _slug: baseSlug,
        _source_url: source_url ?? null,
        _exclude_id: null,
      });

      let duplicate_of: string | null = null;
      let duplicate_reason: string | null = null;
      if (dupes && dupes.length > 0) {
        const top = dupes[0];
        duplicate_of = top.id;
        duplicate_reason = top.match_reason;
        // Força status "duplicada" — não publica automaticamente
        status = "duplicada";
        console.warn(
          `[noticias] ⚠️ POSSÍVEL DUPLICATA detectada (${top.match_reason}, similaridade=${top.similarity}) → original id=${top.id} slug=${top.slug}`,
        );
      }

      const finalSlug = duplicate_of
        ? await ensureUniqueSlug(supabase, baseSlug + "-dup")
        : await ensureUniqueSlug(supabase, baseSlug);

      const payload = {
        title,
        subtitle,
        excerpt,
        source_url,
        content,
        cover_image_url,
        category_id,
        slug: finalSlug,
        tags: p.tags ?? [],
        status,
        is_featured: duplicate_of ? false : (p.is_featured ?? false),
        is_urgent: duplicate_of ? false : (p.is_urgent ?? false),
        is_denuncia: false,
        duplicate_of,
        published_at:
          status === "publicada"
            ? (p.published_at ?? new Date().toISOString())
            : (p.published_at ?? null),
      };

      const { data, error } = await supabase
        .from("posts")
        .insert(payload)
        .select("*")
        .maybeSingle();
      if (error) {
        if (error.code === "23505") {
          console.warn("[noticias] conflito de unicidade (slug/source_url):", error.message);
          return json(409, {
            error: "Notícia duplicada (slug ou URL de fonte já existe)",
            detail: error.message,
          });
        }
        console.error("[noticias] erro ao inserir", error);
        throw error;
      }

      if (duplicate_of) {
        console.log(
          `[noticias] ⚠️ marcada como DUPLICADA | id=${data?.id} duplicate_of=${duplicate_of} motivo=${duplicate_reason}`,
        );
        return json(202, {
          ok: true,
          duplicated: true,
          message: "Possível duplicata detectada — enviada para revisão manual",
          reason: duplicate_reason,
          duplicate_of,
          post: data,
          review_url: `/admin/posts/${data?.id}`,
        });
      }

      // ✅ LOG de incorporação ao feed
      console.log(
        `[noticias] ✅ CIN → feed | id=${data?.id} slug=${data?.slug} status=${status} categoria=${category_id ?? "sem-categoria"} imagem=${usedFallback ? "FALLBACK" : "fornecida"} published_at=${data?.published_at}`,
      );

      return json(201, {
        ok: true,
        message: status === "publicada" ? "Notícia incorporada ao feed público" : "Notícia captada — aguardando fluxo editorial",
        post: data,
        public_url: status === "publicada" ? `/noticia/${data?.slug}` : null,
        review_url: `/admin/posts/${data?.id}`,
      });
    }

    return json(405, { error: "Method not allowed" });
  } catch (err) {
    console.error("[noticias] erro:", err);
    const msg = err instanceof Error ? err.message : "Unknown error";
    return json(500, { error: msg });
  }
});
