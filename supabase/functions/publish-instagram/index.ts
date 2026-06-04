import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const IG_ACCESS_TOKEN = Deno.env.get("INSTAGRAM_ACCESS_TOKEN");
const IG_USER_ID = Deno.env.get("INSTAGRAM_USER_ID");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Não autenticado" }, 401);

    // Valida usuário e papel staff
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: authErr } = await userClient.auth.getUser();
    if (authErr || !userData.user) return json({ error: "Sessão inválida" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: isStaffData } = await admin.rpc("is_staff", { _user_id: userData.user.id });
    if (!isStaffData) return json({ error: "Sem permissão" }, 403);

    const { instagram_post_id } = (await req.json().catch(() => ({}))) as { instagram_post_id?: string };
    if (!instagram_post_id) return json({ error: "instagram_post_id é obrigatório" }, 400);

    const { data: igPost, error: getErr } = await admin
      .from("instagram_posts")
      .select("id,image_url,caption,hashtags,status")
      .eq("id", instagram_post_id)
      .maybeSingle();
    if (getErr || !igPost) return json({ error: "Post do Instagram não encontrado" }, 404);
    if (igPost.status !== "aprovado") {
      return json({ error: "Apenas posts aprovados podem ser publicados", status: igPost.status }, 400);
    }
    if (!igPost.image_url) return json({ error: "Post sem imagem" }, 400);

    const fullCaption = buildCaption(igPost.caption ?? "", igPost.hashtags ?? []);

    const hasIntegration = !!(IG_ACCESS_TOKEN && IG_USER_ID);

    // Sem integração: marca como "pronto para postagem manual" e não bloqueia o fluxo
    if (!hasIntegration) {
      const { error: updErr } = await admin
        .from("instagram_posts")
        .update({
          status: "pronto_manual",
          error_message: null,
        })
        .eq("id", instagram_post_id);
      if (updErr) return json({ error: updErr.message }, 500);
      return json({
        ok: true,
        manual: true,
        message: "Instagram não conectado. Post marcado como pronto para postagem manual.",
        caption: fullCaption,
        image_url: igPost.image_url,
      });
    }

    // Tenta publicar via Instagram Graph API
    try {
      const created = await fetch(
        `https://graph.facebook.com/v21.0/${IG_USER_ID}/media?image_url=${encodeURIComponent(igPost.image_url)}&caption=${encodeURIComponent(fullCaption)}&access_token=${IG_ACCESS_TOKEN}`,
        { method: "POST" },
      );
      const createdJson = await created.json();
      if (!created.ok || !createdJson.id) {
        throw new Error(createdJson?.error?.message ?? "Falha ao criar mídia");
      }
      const publish = await fetch(
        `https://graph.facebook.com/v21.0/${IG_USER_ID}/media_publish?creation_id=${createdJson.id}&access_token=${IG_ACCESS_TOKEN}`,
        { method: "POST" },
      );
      const publishJson = await publish.json();
      if (!publish.ok) throw new Error(publishJson?.error?.message ?? "Falha ao publicar");
    } catch (e) {
      await admin
        .from("instagram_posts")
        .update({ status: "erro", error_message: e instanceof Error ? e.message : "Erro" })
        .eq("id", instagram_post_id);
      return json({ error: e instanceof Error ? e.message : "Erro ao publicar" }, 500);
    }

    // Marca como publicado de verdade
    const { error: updErr } = await admin
      .from("instagram_posts")
      .update({
        status: "publicado",
        published_at: new Date().toISOString(),
        error_message: null,
      })
      .eq("id", instagram_post_id);

    if (updErr) return json({ error: updErr.message }, 500);

    return json({ ok: true, manual: false });
  } catch (e) {
    console.error("publish-instagram error", e);
    return json({ error: e instanceof Error ? e.message : "Erro inesperado" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function buildCaption(caption: string, hashtags: string[]) {
  const tags = (hashtags ?? [])
    .map((h) => (h.startsWith("#") ? h : `#${h}`))
    .join(" ");
  return tags ? `${caption}\n\n${tags}` : caption;
}
