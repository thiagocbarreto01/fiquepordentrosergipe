// Fase 8 — Recaptura assistida.
// Recebe { post_id }, valida permissão (staff), lê source_url, faz fetch da página
// e devolve preview do conteúdo extraído SEM gravar nada no banco.
// A gravação/aplicação é decisão do editor no painel.

import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

function extractArticleText(html: string): string {
  const clean = (s: string) =>
    s
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<(figure|aside|nav|header|footer|form)[\s\S]*?<\/\1>/gi, " ");

  const paragraphsFrom = (chunk: string): string => {
    const ps: string[] = [];
    const re = /<p[^>]*>([\s\S]*?)<\/p>/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(chunk)) !== null) {
      const t = m[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      if (t.length >= 40) ps.push(t);
    }
    return ps.join("\n\n");
  };

  const cleaned = clean(html);
  const candidates: string[] = [];
  const artMatches = cleaned.match(/<article[\s\S]*?<\/article>/gi) ?? [];
  for (const a of artMatches) candidates.push(paragraphsFrom(a));
  const mainMatch = cleaned.match(/<main[\s\S]*?<\/main>/i);
  if (mainMatch) candidates.push(paragraphsFrom(mainMatch[0]));
  const entryMatch = cleaned.match(
    /<div[^>]+class=['"][^'"]*(entry-content|post-content|article-content|content-body|td-post-content|single-content)[^'"]*['"][^>]*>[\s\S]*?<\/div>/i
  );
  if (entryMatch) candidates.push(paragraphsFrom(entryMatch[0]));
  candidates.push(paragraphsFrom(cleaned));

  let best = "";
  for (const c of candidates) if (c.length > best.length) best = c;
  return best.slice(0, 20_000);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userRes } = await userClient.auth.getUser();
    const user = userRes?.user;
    if (!user) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: isStaff } = await admin.rpc("is_staff", { _user_id: user.id });
    if (!isStaff) {
      return new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verifica feature flag
    const { data: settings } = await admin
      .from("site_settings")
      .select("recapture_assisted_enabled")
      .maybeSingle();
    if (!settings?.recapture_assisted_enabled) {
      return new Response(JSON.stringify({ error: "feature_disabled" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const postId = body?.post_id as string | undefined;
    if (!postId) {
      return new Response(JSON.stringify({ error: "missing post_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: post, error: postErr } = await admin
      .from("posts")
      .select("id, title, source_url, content")
      .eq("id", postId)
      .maybeSingle();
    if (postErr || !post) {
      return new Response(JSON.stringify({ error: "post não encontrado" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!post.source_url) {
      return new Response(JSON.stringify({ error: "post sem source_url — recaptura indisponível" }), {
        status: 422,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const r = await fetch(post.source_url, {
      headers: { "User-Agent": "FiquePorDentroSE-Recaptador/1.0" },
      signal: AbortSignal.timeout(12000),
    });
    if (!r.ok) {
      return new Response(
        JSON.stringify({ error: `fonte retornou ${r.status}` }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const html = (await r.text()).slice(0, 600_000);
    const extracted = extractArticleText(html);
    if (!extracted || extracted.length < 200) {
      return new Response(
        JSON.stringify({
          error: "não foi possível extrair conteúdo suficiente da página",
          extracted_chars: extracted.length,
        }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const currentChars = (post.content ?? "").replace(/<[^>]+>/g, "").length;
    const newChars = extracted.length;
    const currentParagraphs = (post.content ?? "").split(/\n{2,}|<\/p>/i).filter((p) => p.trim().length > 20).length;
    const newParagraphs = extracted.split(/\n{2,}/).filter((p) => p.trim().length > 20).length;

    return new Response(
      JSON.stringify({
        success: true,
        preview: extracted,
        stats: {
          current_chars: currentChars,
          new_chars: newChars,
          char_delta: newChars - currentChars,
          current_paragraphs: currentParagraphs,
          new_paragraphs: newParagraphs,
        },
        source_url: post.source_url,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "erro" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
