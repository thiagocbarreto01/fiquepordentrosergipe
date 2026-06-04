// Backfill: para cada post publicado, garante que cover_image_url tem valor real.
// Prioridade: cover_image_original (RSS salvo) -> categories.default_cover_image_url
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const GENERIC_PATTERNS = [
  "photo-1495020689067-958852a7765e",
  "placeholder.svg",
];

function isGeneric(url: string | null | undefined): boolean {
  if (!url || !url.trim()) return true;
  return GENERIC_PATTERNS.some((p) => url.includes(p));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

  // Auth: aceita JWT de staff
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const token = authHeader.replace("Bearer ", "");
  const { data: claims, error: claimsErr } =
    await userClient.auth.getClaims(token);
  if (claimsErr || !claims?.claims?.sub) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const userId = claims.claims.sub as string;
  const admin = createClient(supabaseUrl, serviceKey);

  const { data: isStaff } = await admin.rpc("is_staff", { _user_id: userId });
  if (!isStaff) {
    return new Response(JSON.stringify({ error: "Forbidden: staff only" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Busca todos publicados com seus dados de capa + categoria
  const { data: posts, error } = await admin
    .from("posts")
    .select(
      "id, slug, cover_image_url, cover_image_original, category_id, categories(default_cover_image_url)",
    )
    .eq("status", "publicada");

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let total = posts?.length ?? 0;
  let corrigidos_rss = 0;
  let corrigidos_categoria = 0;
  let sem_solucao = 0;
  let ja_ok = 0;
  const detalhes: Array<{ slug: string; from: string | null; to: string; source: string }> = [];

  for (const p of posts ?? []) {
    const current = p.cover_image_url as string | null;
    if (!isGeneric(current)) {
      ja_ok++;
      continue;
    }

    const rssImg = (p as any).cover_image_original as string | null;
    const catImg =
      (p as any).categories?.default_cover_image_url as string | null;

    let target: string | null = null;
    let source = "";
    if (rssImg && !isGeneric(rssImg)) {
      target = rssImg;
      source = "rss";
    } else if (catImg && catImg.trim()) {
      target = catImg;
      source = "categoria";
    }

    if (!target) {
      sem_solucao++;
      continue;
    }

    const { error: upErr } = await admin
      .from("posts")
      .update({ cover_image_url: target })
      .eq("id", p.id);

    if (upErr) {
      sem_solucao++;
      continue;
    }

    if (source === "rss") corrigidos_rss++;
    else corrigidos_categoria++;
    detalhes.push({ slug: p.slug, from: current, to: target, source });
  }

  return new Response(
    JSON.stringify({
      ok: true,
      total_verificados: total,
      ja_ok,
      corrigidos_rss,
      corrigidos_categoria,
      sem_solucao,
      detalhes,
    }),
    {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    },
  );
});
