import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version, x-api-key",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
const CMS_API_KEY = Deno.env.get("CMS_API_KEY");

type Placement =
  | "ultimas_noticias"
  | "destaque_secundario"
  | "destaque_principal"
  | "plantao"
  | "manchete_principal";

const PLACEMENTS: Placement[] = [
  "ultimas_noticias",
  "destaque_secundario",
  "destaque_principal",
  "plantao",
  "manchete_principal",
];

function levelFromScore(score: number): "baixa" | "media" | "alta" | "urgente" {
  if (score >= 90) return "urgente";
  if (score >= 70) return "alta";
  if (score >= 40) return "media";
  return "baixa";
}

interface RelevanceResult {
  score: number;
  level: "baixa" | "media" | "alta" | "urgente";
  reason: string;
  factors: Record<string, number>;
  placement: Placement;
}

async function analyzeWithAI(title: string, content: string, subtitle: string): Promise<RelevanceResult> {
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY não configurada");

  const systemPrompt = `Você é a IA Editora-Chefe da TV Barretão, portal de notícias de Sergipe (foco em Aracaju e municípios sergipanos).
Avalie a relevância editorial da matéria e sugira onde ela deve aparecer no portal.

CRITÉRIOS DE PONTUAÇÃO (0-100):
- Impacto público (quantas pessoas afetadas)
- Urgência (acontecendo agora, em desenvolvimento, plantão)
- Interesse local (Aracaju, Sergipe)
- Envolvimento de autoridades (governador, prefeito, secretários, judiciário)
- Segurança pública (crimes graves, operações policiais)
- Trânsito (acidentes graves, interdições)
- Política (eleições, decisões, escândalos)
- Saúde (epidemias, hospitais)
- Educação (greves, vestibulares, ENEM)
- Evento cultural (grandes eventos, festas tradicionais sergipanas)
- Potencial de audiência

ESCALA DE PONTUAÇÃO:
- 90-100: URGENTE — plantão, tragédias, decisões críticas
- 70-89: ALTA — manchete principal candidata, grande interesse
- 40-69: MÉDIA — destaque secundário, interesse moderado
- 0-39: BAIXA — últimas notícias, interesse menor

POSICIONAMENTO SUGERIDO:
- "manchete_principal": fatos de altíssima relevância (score >= 85)
- "plantao": tragédias, acidentes graves, atos urgentes em desenvolvimento
- "destaque_principal": notícias importantes do dia (score 70-89)
- "destaque_secundario": relevantes mas não principais (score 40-69)
- "ultimas_noticias": demais (score < 40)

Seja rigoroso. Não infle pontuações.`;

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `TÍTULO: ${title}\n\nSUBTÍTULO: ${subtitle}\n\nCONTEÚDO:\n${String(content).slice(0, 6000)}`,
        },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "avaliar_relevancia",
            description: "Retorna análise de relevância editorial e sugestão de posicionamento.",
            parameters: {
              type: "object",
              properties: {
                score: {
                  type: "integer",
                  minimum: 0,
                  maximum: 100,
                  description: "Pontuação geral de relevância editorial (0-100).",
                },
                reason: {
                  type: "string",
                  description: "Justificativa curta (1-2 frases) explicando a pontuação. Ex.: 'Envolve grande público, evento estadual e interesse local.'",
                },
                factors: {
                  type: "object",
                  properties: {
                    impacto_publico: { type: "integer", minimum: 0, maximum: 100 },
                    urgencia: { type: "integer", minimum: 0, maximum: 100 },
                    interesse_local: { type: "integer", minimum: 0, maximum: 100 },
                    relevancia_sergipe: { type: "integer", minimum: 0, maximum: 100 },
                    relevancia_aracaju: { type: "integer", minimum: 0, maximum: 100 },
                    envolvimento_autoridades: { type: "integer", minimum: 0, maximum: 100 },
                    seguranca_publica: { type: "integer", minimum: 0, maximum: 100 },
                    transito: { type: "integer", minimum: 0, maximum: 100 },
                    politica: { type: "integer", minimum: 0, maximum: 100 },
                    saude: { type: "integer", minimum: 0, maximum: 100 },
                    educacao: { type: "integer", minimum: 0, maximum: 100 },
                    evento_cultural: { type: "integer", minimum: 0, maximum: 100 },
                    potencial_audiencia: { type: "integer", minimum: 0, maximum: 100 },
                  },
                  required: [
                    "impacto_publico","urgencia","interesse_local","relevancia_sergipe","relevancia_aracaju",
                    "envolvimento_autoridades","seguranca_publica","transito","politica","saude","educacao",
                    "evento_cultural","potencial_audiencia",
                  ],
                  additionalProperties: false,
                },
                placement: {
                  type: "string",
                  enum: PLACEMENTS,
                  description: "Onde a notícia deve aparecer no portal.",
                },
              },
              required: ["score", "reason", "factors", "placement"],
              additionalProperties: false,
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "avaliar_relevancia" } },
    }),
  });

  if (response.status === 429) throw new Error("RATE_LIMIT");
  if (response.status === 402) throw new Error("PAYMENT_REQUIRED");
  if (!response.ok) {
    const t = await response.text();
    throw new Error(`AI gateway error ${response.status}: ${t}`);
  }

  const data = await response.json();
  const toolCall = data?.choices?.[0]?.message?.tool_calls?.[0];
  if (!toolCall) throw new Error("Resposta da IA sem tool_call");
  const args = JSON.parse(toolCall.function.arguments);

  const score = Math.max(0, Math.min(100, Number(args.score) || 0));
  const level = levelFromScore(score);
  const placement: Placement = PLACEMENTS.includes(args.placement) ? args.placement : "ultimas_noticias";

  return {
    score,
    level,
    reason: String(args.reason || "").slice(0, 400),
    factors: args.factors || {},
    placement,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const apiKey = req.headers.get("x-api-key") ?? "";

    let isAuthorized = false;
    let userId: string | null = null;

    if (CMS_API_KEY && apiKey === CMS_API_KEY) {
      isAuthorized = true;
    } else if (authHeader.startsWith("Bearer ")) {
      const token = authHeader.replace("Bearer ", "");
      if (token === SUPABASE_SERVICE_ROLE_KEY) {
        isAuthorized = true;
      } else {
        const supa = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
          global: { headers: { Authorization: authHeader } },
        });
        const { data: claims } = await supa.auth.getClaims(token);
        if (claims?.claims?.sub) {
          userId = claims.claims.sub as string;
          const { data: isStaff } = await supa.rpc("is_staff", { _user_id: userId });
          if (isStaff) isAuthorized = true;
        }
      }
    }

    if (!isAuthorized) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const post_id = body?.post_id as string | undefined;
    const apply = body?.apply !== false; // default true
    if (!post_id) {
      return new Response(JSON.stringify({ error: "post_id é obrigatório" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: post, error } = await admin
      .from("posts")
      .select("id, title, subtitle, content, titulo_gerado, conteudo_gerado, resumo_gerado")
      .eq("id", post_id)
      .maybeSingle();
    if (error || !post) {
      return new Response(JSON.stringify({ error: "Post não encontrado" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const title = (post as any).titulo_gerado || post.title;
    const content = (post as any).conteudo_gerado || post.content;
    const subtitle = (post as any).subtitle || (post as any).resumo_gerado || "";

    if (!title || !content || String(content).length < 50) {
      return new Response(JSON.stringify({ error: "Conteúdo insuficiente para análise" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = await analyzeWithAI(String(title), String(content), String(subtitle));

    if (apply) {
      const { error: updErr } = await admin
        .from("posts")
        .update({
          relevance_score: result.score,
          relevance_level: result.level,
          relevance_reason: result.reason,
          relevance_factors: result.factors,
          ai_suggested_placement: result.placement,
          ai_suggestion_status: "pendente",
          relevance_analyzed_at: new Date().toISOString(),
        } as any)
        .eq("id", post_id);
      if (updErr) {
        console.error("update error", updErr);
        return new Response(JSON.stringify({ error: updErr.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Auditoria
      await admin.from("home_audit" as any).insert({
        post_id,
        action: "ai_relevance_analyzed",
        position: result.placement,
        reason: `IA · ${result.level} (${result.score}%) — ${result.reason}`,
        changed_by: userId,
      });
    }

    return new Response(JSON.stringify({ success: true, ...result }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("analyze-relevance error:", msg);
    if (msg === "RATE_LIMIT") {
      return new Response(JSON.stringify({ error: "Limite de requisições da IA atingido." }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (msg === "PAYMENT_REQUIRED") {
      return new Response(JSON.stringify({ error: "Créditos da IA esgotados." }), {
        status: 402,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
