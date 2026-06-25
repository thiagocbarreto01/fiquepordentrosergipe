// Editorial AI Layer — gera título SEO, resumo, categoria sugerida, score de clickbait
// e entidades para um post recém-publicado. Usa Lovable AI Gateway.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const body = await req.json().catch(() => ({}));
    const postId = typeof body?.post_id === "string" ? body.post_id : null;
    if (!postId) return json({ error: "post_id obrigatório" }, 400);

    const { data: post, error } = await admin
      .from("posts")
      .select("id,title,subtitle,excerpt,content,tags,category_id,ai_seo_title")
      .eq("id", postId)
      .maybeSingle();
    if (error || !post) return json({ error: "post não encontrado" }, 404);

    // Idempotência: se já tem ai_seo_title, não regenera.
    if (post.ai_seo_title) return json({ ok: true, skipped: true });

    const { data: categories } = await admin
      .from("categories")
      .select("id,name,slug")
      .order("name");

    const catList = (categories ?? [])
      .map((c: any) => `- ${c.slug}: ${c.name}`)
      .join("\n");

    const tools = [
      {
        type: "function",
        function: {
          name: "editorial_review",
          description: "Análise editorial estruturada do post.",
          parameters: {
            type: "object",
            additionalProperties: false,
            properties: {
              seo_title: { type: "string", description: "Título reescrito para SEO em PT-BR, até 60 caracteres, sem clickbait." },
              summary: { type: "string", description: "Resumo jornalístico em 2-3 frases, lead invertido, PT-BR." },
              clickbait_score: { type: "number", description: "0=jornalístico, 1=clickbait extremo." },
              suggested_category_slug: { type: "string", description: "Slug da categoria mais adequada (use uma da lista)." },
              entities: { type: "array", items: { type: "string" }, description: "Pessoas, lugares e organizações citados." },
            },
            required: ["seo_title", "summary", "clickbait_score", "suggested_category_slug", "entities"],
          },
        },
      },
    ];

    const userPrompt = `Analise o post a seguir e retorne via tool call.

TÍTULO ORIGINAL: ${post.title}
SUBTÍTULO: ${post.subtitle ?? ""}
RESUMO: ${post.excerpt ?? ""}
TAGS: ${(post.tags ?? []).join(", ")}
CONTEÚDO (até 2000 chars):
${String(post.content ?? "").slice(0, 2000)}

CATEGORIAS DISPONÍVEIS:
${catList}`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "Você é um editor-chefe de portal de notícias brasileiro. Seja factual e direto." },
          { role: "user", content: userPrompt },
        ],
        tools,
        tool_choice: { type: "function", function: { name: "editorial_review" } },
      }),
    });

    if (!aiRes.ok) {
      const txt = await aiRes.text();
      console.warn("[editorial-ai] gateway err", aiRes.status, txt);
      return json({ ok: false, error: `gateway_${aiRes.status}` }, 200);
    }

    const aiJson = await aiRes.json();
    const call = aiJson?.choices?.[0]?.message?.tool_calls?.[0];
    if (!call?.function?.arguments) return json({ ok: false, error: "no_tool_call" }, 200);

    const parsed = JSON.parse(call.function.arguments);
    const seoTitle = String(parsed.seo_title ?? "").slice(0, 80);
    const summary = String(parsed.summary ?? "").slice(0, 400);
    const clickbait = Number(parsed.clickbait_score ?? 0);
    const entities: string[] = Array.isArray(parsed.entities) ? parsed.entities.map((e: any) => String(e)).slice(0, 20) : [];
    const suggestedSlug = String(parsed.suggested_category_slug ?? "");
    const suggestedCat = (categories ?? []).find((c: any) => c.slug === suggestedSlug)?.id ?? null;

    await admin
      .from("posts")
      .update({
        ai_seo_title: seoTitle || null,
        ai_summary: summary || null,
        ai_clickbait_score: Number.isFinite(clickbait) ? clickbait : null,
        ai_suggested_category: suggestedCat,
        ai_entities: entities,
      })
      .eq("id", postId);

    // Roda clustering e detect breaking depois da IA (entidades já populadas).
    await admin.rpc("cluster_post_into_event" as any, { _post_id: postId }).catch(() => null);
    await admin.rpc("detect_breaking_events" as any).catch(() => null);

    return json({ ok: true, seo_title: seoTitle, clickbait });
  } catch (err) {
    console.error("[editorial-ai] erro:", err);
    return json({ error: err instanceof Error ? err.message : "erro" }, 500);
  }
});
