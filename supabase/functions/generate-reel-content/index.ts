import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

type ReelBody = {
  title?: unknown;
  subtitle?: unknown;
  content?: unknown;
  category?: unknown;
  image?: unknown;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return json({ error: "Não autenticado" }, 401);
    }
    if (!LOVABLE_API_KEY) {
      console.error("generate-reel-content missing LOVABLE_API_KEY secret");
      return json({ error: "missing_ai_key", message: "Chave de IA não configurada no backend." }, 500);
    }
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: authErr } = await userClient.auth.getUser();
    if (authErr || !userData?.user) return json({ error: "Sessão inválida" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: isStaff } = await admin.rpc("is_staff", { _user_id: userData.user.id });
    if (!isStaff) return json({ error: "Sem permissão" }, 403);

    const body = (await req.json().catch(() => ({}))) as ReelBody;
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const subtitle = typeof body.subtitle === "string" ? body.subtitle.trim() : "";
    const content = typeof body.content === "string" ? body.content.trim().slice(0, 6000) : "";
    const category = typeof body.category === "string" ? body.category.trim() : "";
    const image = typeof body.image === "string" ? body.image.trim() : "";
    console.info("generate-reel-content request", {
      user_id: userData.user.id,
      has_title: Boolean(title),
      content_length: content.length,
      category,
      has_image: Boolean(image),
    });
    if (!title) return json({ error: "invalid_payload", message: "Título é obrigatório." }, 400);

    const systemPrompt = `Você é o editor social do portal "Fique Por Dentro Sergipe". Cria conteúdo curto e jornalístico para Reels do Instagram.

REGRAS:
- Português do Brasil, tom jornalístico direto, sem sensacionalismo.
- Headline (manchete do Reel): máximo 70 caracteres, sem ponto final, sem aspas.
- Resumo: EXATAMENTE 3 frases curtas, cada uma com no máximo 90 caracteres, separadas por |. Cada frase deve caber em uma tela do Reel.
- Legenda Instagram: 2 a 4 linhas, com 1 emoji discreto opcional no início, terminando com 5 a 8 hashtags relevantes (use #Sergipe #Aracaju #FiquePorDentroSE quando fizer sentido, e adicione hashtags específicas do tema).
- NUNCA invente fatos que não estão no texto original.

Responda APENAS chamando a função set_reel_content.`;

    const userPrompt = `TÍTULO: ${title}
${subtitle ? `SUBTÍTULO: ${subtitle}` : ""}
${category ? `EDITORIA: ${category}` : ""}

CORPO DA NOTÍCIA:
${content || "(sem corpo)"}

Gere o conteúdo do Reel.`;

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "set_reel_content",
              description: "Devolve o conteúdo gerado para o Reel.",
              parameters: {
                type: "object",
                properties: {
                  headline: { type: "string", minLength: 5, maxLength: 90 },
                  summary: { type: "string", minLength: 20, maxLength: 320, description: "3 frases separadas por |" },
                  caption: { type: "string", minLength: 30, maxLength: 1500 },
                },
                required: ["headline", "summary", "caption"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "set_reel_content" } },
      }),
    });

    if (!resp.ok) {
      const txt = await resp.text();
      console.error("generate-reel-content AI gateway error", { status: resp.status, body: txt.slice(0, 500) });
      if (resp.status === 402) {
        return json({ error: "payment_required", message: "Créditos de IA esgotados." }, 402);
      }
      if (resp.status === 429) {
        return json({ error: "rate_limited", message: "Limite de requisições atingido." }, 429);
      }
      return json({ error: "ai_gateway_error", message: `IA retornou HTTP ${resp.status}: ${txt}` }, 502);
    }
    const data = await resp.json();
    const args = data?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    let parsed: any = {};
    try { parsed = JSON.parse(args ?? "{}"); } catch { /* ignore */ }

    const headline = String(parsed.headline ?? "").trim();
    const summaryRaw = String(parsed.summary ?? "").trim();
    const caption = String(parsed.caption ?? "").trim();
    const summary = summaryRaw.split("|").map((s) => s.trim()).filter(Boolean).slice(0, 3);

    if (!headline || summary.length === 0 || !caption) {
      console.error("generate-reel-content invalid AI payload", { headline: Boolean(headline), summary_count: summary.length, caption: Boolean(caption) });
      return json({ error: "invalid_ai_payload", message: "IA não retornou conteúdo válido." }, 502);
    }

    return json({ ok: true, headline, summary, caption });
  } catch (e) {
    console.error("generate-reel-content error", e);
    return json({ error: e instanceof Error ? e.message : "Erro inesperado" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
