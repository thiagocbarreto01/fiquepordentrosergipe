import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Não autenticado" }, 401);

    // Valida staff
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await userClient.auth.getUser();
    if (!userData.user) return json({ error: "Sessão inválida" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: isStaffData } = await admin.rpc("is_staff", { _user_id: userData.user.id });
    if (!isStaffData) return json({ error: "Sem permissão" }, 403);

    const { limit = 20 } = (await req.json().catch(() => ({}))) as { limit?: number };
    const cap = Math.min(Math.max(1, Number(limit) || 20), 100);

    // Notícias publicadas sem rascunho de Instagram
    const { data: posts, error: qErr } = await admin
      .from("posts")
      .select("id")
      .eq("status", "publicada")
      .order("published_at", { ascending: false })
      .limit(cap * 3);

    if (qErr) return json({ error: qErr.message }, 500);

    const { data: existing } = await admin
      .from("instagram_posts")
      .select("post_id")
      .not("post_id", "is", null);
    const existingSet = new Set((existing ?? []).map((r) => r.post_id));
    const toProcess = (posts ?? []).filter((p) => !existingSet.has(p.id)).slice(0, cap);

    const results: any[] = [];
    for (const p of toProcess) {
      const { data, error } = await admin.functions.invoke("generate-instagram-draft", {
        body: { post_id: p.id },
      });
      results.push({ post_id: p.id, ok: !error, error: error?.message, data });
    }

    return json({
      ok: true,
      processed: results.length,
      success: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
      results,
    });
  } catch (e) {
    console.error("backfill-instagram-drafts error", e);
    return json({ error: e instanceof Error ? e.message : "Erro inesperado" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
