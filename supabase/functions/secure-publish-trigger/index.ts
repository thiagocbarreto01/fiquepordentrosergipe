import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      },
    });
  }

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    const serviceBearer = `Bearer ${SERVICE_ROLE}`;
    if (authHeader !== serviceBearer) {
      return new Response(JSON.stringify({ error: "Sem permissão" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const postId = typeof body?.post_id === "string" ? body.post_id : null;
    if (!postId) {
      return new Response(JSON.stringify({ error: "post_id é obrigatório" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { data: post, error } = await admin
      .from("posts")
      .select("id,author_id,status")
      .eq("id", postId)
      .maybeSingle();

    if (error || !post) {
      return new Response(JSON.stringify({ error: "Notícia não encontrada" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (post.status !== "publicada") {
      return new Response(JSON.stringify({ ok: true, skipped: true, reason: "status_not_publicada" }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    const { data: existing } = await admin
      .from("instagram_posts")
      .select("id")
      .eq("post_id", postId)
      .limit(1)
      .maybeSingle();

    if (existing?.id) {
      return new Response(JSON.stringify({ ok: true, skipped: true, instagram_post_id: existing.id }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    const { data: generated, error: invokeError } = await admin.functions.invoke("generate-instagram-draft", {
      body: { post_id: postId, allow_draft: false },
      headers: { Authorization: `Bearer ${SERVICE_ROLE}` },
    });

    if (invokeError) {
      return new Response(JSON.stringify({ error: invokeError.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }


    return new Response(JSON.stringify(generated ?? { ok: true }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Erro inesperado" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
