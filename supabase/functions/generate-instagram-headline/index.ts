import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return json({ error: "Não autenticado" }, 401);
    }
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: authErr } = await userClient.auth.getUser();
    if (authErr || !userData?.user) return json({ error: "Sessão inválida" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: isStaff } = await admin.rpc("is_staff", { _user_id: userData.user.id });
    if (!isStaff) return json({ error: "Sem permissão" }, 403);

    const body = await req.json().catch(() => ({}));
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const subtitle = typeof body.subtitle === "string" ? body.subtitle.trim() : "";
    const excerpt = typeof body.excerpt === "string" ? body.excerpt.trim() : "";
    if (!title) return json({ error: "title é obrigatório" }, 400);

    const systemPrompt = `Você é o editor social do TV Barretão. Sua tarefa: criar uma MANCHETE CURTA para a arte de Instagram a partir do título completo de uma notícia.

REGRAS RÍGIDAS:
- IDEAL: até 60 caracteres.
- MÁXIMO ABSOLUTO: 80 caracteres (conte os caracteres antes de responder).
- NUNCA cortar palavras.
- Linguagem de manchete: direta, forte, visual, jornalística.
- Preservar o sentido e o fato central da notícia.
- Português do Brasil. Sem emojis. Sem hashtags. Sem aspas. Sem ponto final.

EXEMPLO:
Original: "Pré-candidatos às Eleições 2026 devem se afastar de programas de rádio e TV a partir de junho"
Manchete Instagram: "Pré-candidatos deixam rádio e TV em junho"

Responda APENAS chamando a função set_instagram_headline.`;

    const userPrompt = `TÍTULO ORIGINAL: ${title}
${subtitle ? `SUBTÍTULO: ${subtitle}` : ""}
${excerpt ? `RESUMO: ${excerpt}` : ""}

Gere a manchete Instagram (≤80 caracteres, ideal ≤60).`;

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
              name: "set_instagram_headline",
              description: "Devolve a manchete curta para a arte do Instagram.",
              parameters: {
                type: "object",
                properties: {
                  headline: { type: "string", minLength: 5, maxLength: 80 },
                },
                required: ["headline"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "set_instagram_headline" } },
      }),
    });

    if (!resp.ok) {
      const txt = await resp.text();
      return json({ error: `Lovable AI ${resp.status}: ${txt}` }, 502);
    }
    const data = await resp.json();
    const args = data?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    let parsed: any = {};
    try { parsed = JSON.parse(args ?? "{}"); } catch { /* ignore */ }
    const headline = clampHeadline(String(parsed.headline ?? "").trim(), 80);
    if (!headline) return json({ error: "IA não retornou manchete" }, 502);

    return json({ ok: true, headline });
  } catch (e) {
    console.error("generate-instagram-headline error", e);
    return json({ error: e instanceof Error ? e.message : "Erro inesperado" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function clampHeadline(text: string, max: number): string {
  const t = (text || "").replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const budget = max - 1;
  const cut = t.slice(0, budget);
  const lastSpace = cut.lastIndexOf(" ");
  const safe = lastSpace > 20 ? cut.slice(0, lastSpace) : cut;
  return safe.replace(/[.,;:!?\-–—]+$/g, "").trim() + "…";
}
