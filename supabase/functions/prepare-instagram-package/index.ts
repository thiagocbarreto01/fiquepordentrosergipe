import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const EDITORIA_MAP: Record<string, string> = {
  "urgente": "URGENTE",
  "polícia": "POLÍCIA",
  "policia": "POLÍCIA",
  "política": "POLÍTICA",
  "politica": "POLÍTICA",
  "municípios": "MUNICÍPIOS",
  "municipios": "MUNICÍPIOS",
  "brasil": "BRASIL",
  "mundo": "MUNDO",
  "entretenimento": "ENTRETENIMENTO",
  "denúncia": "DENÚNCIA",
  "denuncia": "DENÚNCIA",
  "sergipe": "SERGIPE",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const request_id = crypto.randomUUID();

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return err("not_authenticated", "Sessão não encontrada.", 401, request_id);
    }
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: authErr } = await userClient.auth.getUser();
    if (authErr || !userData?.user) return err("invalid_session", "Sessão inválida.", 401, request_id);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: isStaff } = await admin.rpc("is_staff", { _user_id: userData.user.id });
    if (!isStaff) return err("forbidden", "Sem permissão.", 403, request_id);

    const body = await req.json().catch(() => ({}));
    const post_id = typeof body?.post_id === "string" ? body.post_id : null;
    const mode = body?.mode === "ai" ? "ai" : "template";
    if (!post_id) return err("invalid_payload", "post_id é obrigatório.", 400, request_id);
    if (mode === "ai") {
      return err("ai_disabled", "Modo IA não está habilitado nesta operação.", 400, request_id);
    }

    // Dedup por post_id
    const { data: existing, error: exErr } = await admin
      .from("instagram_posts")
      .select("id")
      .eq("post_id", post_id)
      .limit(1)
      .maybeSingle();
    if (exErr) return err("db_read_error", exErr.message, 500, request_id);
    if (existing?.id) {
      return ok({ duplicate: true, instagram_post_id: existing.id }, request_id);
    }

    const { data: post, error: postErr } = await admin
      .from("posts")
      .select("id,title,subtitle,excerpt,tags,status,is_urgent,is_denuncia,cover_image_url,slug,categories(name)")
      .eq("id", post_id)
      .maybeSingle();
    if (postErr) return err("db_read_error", postErr.message, 500, request_id);
    if (!post) return err("post_not_found", "Notícia não encontrada.", 404, request_id);
    if (post.status !== "publicada") {
      return err("post_not_published", "Somente notícias publicadas podem ser preparadas.", 400, request_id);
    }

    const catName: string = (post as any).categories?.name ?? "";
    const editoria = pickEditoria(catName, !!(post as any).is_urgent, !!(post as any).is_denuncia);
    const manchete = clampHeadline(String(post.title ?? "").trim(), 80);
    const subtitulo = String(post.subtitle ?? post.excerpt ?? "").trim().slice(0, 140);
    const closer = "📲 Acompanhe o Fique Por Dentro Sergipe para mais notícias";
    const capBody = String(post.excerpt ?? post.subtitle ?? post.title ?? "").trim();
    const caption = `${post.title}\n\n${capBody}\n\n${closer}`.trim();
    const tags = Array.isArray(post.tags) ? (post.tags as string[]) : [];
    const base = ["noticias", "sergipe", "fiquepordentrose"];
    const extra = tags
      .map((t) => String(t).toLowerCase().replace(/[^a-z0-9]/g, ""))
      .filter((t) => t && !base.includes(t));
    const hashtags = Array.from(new Set([...base, ...extra])).slice(0, 10);

    const { data: inserted, error: insErr } = await admin
      .from("instagram_posts")
      .insert({
        post_id,
        image_url: post.cover_image_url ?? null,
        caption,
        hashtags,
        editoria,
        texto_arte: { editoria, manchete, subtitulo, bullets: [] },
        status: "pendente",
        created_by: userData.user.id,
      })
      .select("id")
      .single();

    if (insErr) {
      if ((insErr as any).code === "23505") {
        const { data: again } = await admin
          .from("instagram_posts").select("id").eq("post_id", post_id).maybeSingle();
        return ok({ duplicate: true, instagram_post_id: again?.id ?? null }, request_id);
      }
      return err("db_insert_error", insErr.message, 500, request_id);
    }

    return ok({
      duplicate: false,
      instagram_post_id: inserted.id,
      mode: "template",
      package: {
        editoria, manchete, subtitulo, caption, hashtags,
        image_url: post.cover_image_url ?? null,
        article_url: `/noticia/${post.slug}`,
      },
    }, request_id);
  } catch (e) {
    console.error("prepare-instagram-package error", request_id, e);
    return err("unexpected_error", e instanceof Error ? e.message : "Erro inesperado", 500, request_id);
  }
});

function pickEditoria(catName: string, urgent: boolean, denuncia: boolean): string {
  if (urgent) return "URGENTE";
  if (denuncia) return "DENÚNCIA";
  const k = catName.toLowerCase().trim();
  return EDITORIA_MAP[k] ?? "SERGIPE";
}

function clampHeadline(text: string, max: number): string {
  const t = (text || "").replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");
  const safe = lastSpace > 20 ? cut.slice(0, lastSpace) : cut;
  return safe.replace(/[.,;:!?\-–—]+$/g, "").trim() + "…";
}

function ok(payload: Record<string, unknown>, request_id: string, status = 200) {
  return new Response(JSON.stringify({ success: true, request_id, ...payload }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
function err(code: string, message: string, status: number, request_id: string) {
  return new Response(JSON.stringify({ success: false, code, message, request_id }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
