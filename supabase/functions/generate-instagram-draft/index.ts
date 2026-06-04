import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

interface Body {
  post_id?: string;
  allow_draft?: boolean;
}

const EDITORIAS = [
  "URGENTE",
  "POLÍCIA",
  "POLÍTICA",
  "MUNICÍPIOS",
  "BRASIL",
  "MUNDO",
  "ENTRETENIMENTO",
  "DENÚNCIA",
] as const;

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
    if (authErr || !userData?.user) {
      return json({ error: "Sessão inválida" }, 401);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: isStaff } = await admin.rpc("is_staff", { _user_id: userData.user.id });
    if (!isStaff) {
      return json({ error: "Sem permissão" }, 403);
    }

    const body = (await req.json().catch(() => ({}))) as Body;
    const postId = typeof body.post_id === "string" ? body.post_id : null;
    const allowDraft = body.allow_draft === true;
    if (!postId) {
      return json({ error: "post_id é obrigatório" }, 400);
    }

    const { data: post, error: postErr } = await admin
      .from("posts")
      .select("id,title,subtitle,excerpt,content,cover_image_url,tags,status,is_urgent,is_denuncia,categories(name)")
      .eq("id", postId)
      .maybeSingle();

    if (postErr || !post) {
      return json({ error: "Notícia não encontrada", details: postErr?.message }, 404);
    }
    const acceptedStatuses = allowDraft
      ? ["publicada", "rascunho", "revisao", "em_revisao", "aprovada"]
      : ["publicada"];
    if (!acceptedStatuses.includes(post.status as string)) {
      return json({ error: "Status da notícia não permite gerar Instagram", status: post.status }, 400);
    }

    const { data: existing } = await admin
      .from("instagram_posts")
      .select("id")
      .eq("post_id", postId)
      .limit(1)
      .maybeSingle();
    if (existing?.id) {
      return json({ ok: true, skipped: true, instagram_post_id: existing.id });
    }

    const ai = await generateDraft({
      title: post.title,
      subtitle: post.subtitle ?? "",
      excerpt: post.excerpt ?? "",
      content: stripHtml(post.content ?? "").slice(0, 2500),
      category: (post as any).categories?.name ?? "",
      tags: Array.isArray(post.tags) ? post.tags : [],
      isUrgent: !!(post as any).is_urgent,
      isDenuncia: !!(post as any).is_denuncia,
    });

    const { data: inserted, error: insErr } = await admin
      .from("instagram_posts")
      .insert({
        post_id: postId,
        image_url: post.cover_image_url ?? null,
        caption: ai.caption,
        hashtags: ai.hashtags,
        editoria: ai.editoria,
        texto_arte: ai.texto_arte,
        status: "pendente",
        created_by: userData.user.id,
      })
      .select("id")
      .single();

    if (insErr) return json({ error: insErr.message }, 500);

    // Persist the short Instagram headline on the post (used by the art canvas).
    if (ai.texto_arte?.manchete) {
      await admin
        .from("posts")
        .update({ instagram_headline: ai.texto_arte.manchete })
        .eq("id", postId);
    }

    return json({ ok: true, instagram_post_id: inserted.id, instagram_headline: ai.texto_arte?.manchete ?? null });

  } catch (e) {
    console.error("generate-instagram-draft error", e);
    return json({ error: e instanceof Error ? e.message : "Erro inesperado" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function stripHtml(s: string) {
  return s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

interface DraftOutput {
  editoria: string;
  texto_arte: {
    editoria: string;
    manchete: string;
    subtitulo: string;
    bullets: string[];
  };
  caption: string;
  hashtags: string[];
}

async function generateDraft(input: {
  title: string;
  subtitle: string;
  excerpt: string;
  content: string;
  category: string;
  tags: string[];
  isUrgent: boolean;
  isDenuncia: boolean;
}): Promise<DraftOutput> {
  const hint = input.isUrgent
    ? "URGENTE"
    : input.isDenuncia
    ? "DENÚNCIA"
    : "";

  const systemPrompt = `Você é o editor social do TV Barretão (portal de notícias regional de Sergipe).
Sua missão: transformar notícias em posts de Instagram seguindo o padrão editorial fixo da marca.

TOM EDITORIAL:
- Firme, direto, jornalístico, envolvente.
- Sem sensacionalismo exagerado, sem clickbait, sem emojis em excesso.
- Português do Brasil, linguagem clara e impactante.

PADRÃO VISUAL DE REFERÊNCIA (para guiar o TEXTO da arte):
- Estilo jornalístico profissional, visual limpo, alto contraste.
- Tipografia forte sem serifa, manchetes impactantes.
- Evitar excesso de texto na arte: manchete curta + subtítulo + 2 a 3 bullets no máximo.

EDITORIAS PERMITIDAS (escolha exatamente UMA, em CAIXA ALTA):
URGENTE, POLÍCIA, POLÍTICA, MUNICÍPIOS, SERGIPE, BRASIL, MUNDO, ENTRETENIMENTO, DENÚNCIA.

Responda APENAS chamando a função set_instagram_draft com os campos corretos.`;

  const userPrompt = `NOTÍCIA:
Título: ${input.title}
Subtítulo: ${input.subtitle}
Resumo: ${input.excerpt}
Categoria do portal: ${input.category}
Tags: ${input.tags.join(", ")}
Conteúdo: ${input.content}

${hint ? `DICA DE EDITORIA (use se fizer sentido editorial): ${hint}` : ""}

Gere:
1) editoria — uma das permitidas, em CAIXA ALTA.
2) texto_arte — manchete (CURTA: ideal até 60 caracteres, MÁXIMO ABSOLUTO 80 caracteres, sem cortar palavras, impacto jornalístico forte e direto — esta manchete será impressa na arte do Instagram, então não pode ser longa), subtitulo (máx 14 palavras), bullets (0 a 3, curtos).
3) caption (legenda) seguindo a estrutura:
   - abertura forte (1 linha)
   - contextualização clara (1 a 2 linhas)
   - ponto principal da notícia (1 a 2 linhas)
   - fechamento com chamada para leitura
   - TERMINAR OBRIGATORIAMENTE com a linha exata: 📲 Acompanhe o TV Barretão para mais notícias
   - NÃO incluir hashtags na legenda.
   - No máximo 1 emoji adicional além do 📲 final.
4) hashtags — 6 a 10 hashtags SEM o caractere #, começando por: noticias, sergipe, tvbarretao, e depois temáticas/regionais relevantes.`;

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
            name: "set_instagram_draft",
            description: "Devolve o rascunho editorial estruturado para o Instagram do TV Barretão.",
            parameters: {
              type: "object",
              properties: {
                editoria: {
                  type: "string",
                  enum: [...EDITORIAS],
                },
                texto_arte: {
                  type: "object",
                  properties: {
                    manchete: { type: "string" },
                    subtitulo: { type: "string" },
                    bullets: {
                      type: "array",
                      items: { type: "string" },
                      maxItems: 3,
                    },
                  },
                  required: ["manchete", "subtitulo", "bullets"],
                  additionalProperties: false,
                },
                caption: { type: "string" },
                hashtags: {
                  type: "array",
                  items: { type: "string" },
                  minItems: 6,
                  maxItems: 10,
                },
              },
              required: ["editoria", "texto_arte", "caption", "hashtags"],
              additionalProperties: false,
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "set_instagram_draft" } },
    }),
  });

  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`Lovable AI ${resp.status}: ${txt}`);
  }
  const data = await resp.json();
  const toolCall = data?.choices?.[0]?.message?.tool_calls?.[0];
  let parsed: any = {};
  try {
    parsed = JSON.parse(toolCall?.function?.arguments ?? "{}");
  } catch {
    parsed = {};
  }

  const editoria = sanitizeEditoria(parsed.editoria, hint);
  const mancheteRaw = String(parsed?.texto_arte?.manchete ?? input.title ?? "").trim();
  const manchete = clampHeadline(mancheteRaw, 80);
  const subtitulo = String(parsed?.texto_arte?.subtitulo ?? input.subtitle ?? input.excerpt ?? "").trim();
  const bullets = Array.isArray(parsed?.texto_arte?.bullets)
    ? parsed.texto_arte.bullets.map((b: any) => String(b).trim()).filter(Boolean).slice(0, 3)
    : [];

  const closer = "📲 Acompanhe o TV Barretão para mais notícias";
  let caption = String(parsed.caption ?? input.excerpt ?? input.title ?? "").trim();
  if (!caption.includes(closer)) {
    caption = `${caption}\n\n${closer}`.trim();
  }

  const hashtags = Array.isArray(parsed.hashtags)
    ? parsed.hashtags
        .map((h: any) => String(h).replace(/^#/, "").trim())
        .filter(Boolean)
        .slice(0, 10)
    : ["noticias", "sergipe", "tvbarretao"];

  return {
    editoria,
    texto_arte: { editoria, manchete, subtitulo, bullets },
    caption,
    hashtags,
  };
}

function sanitizeEditoria(value: unknown, hint: string): string {
  const v = String(value ?? "").toUpperCase().trim();
  if ((EDITORIAS as readonly string[]).includes(v)) return v;
  if (hint) return hint;
  return "MUNICÍPIOS";
}

// Word-safe headline clamp: keeps whole words and adds an ellipsis if needed.
function clampHeadline(text: string, max: number): string {
  const t = (text || "").replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const budget = max - 1; // reserve for ellipsis
  const cut = t.slice(0, budget);
  const lastSpace = cut.lastIndexOf(" ");
  const safe = lastSpace > 20 ? cut.slice(0, lastSpace) : cut;
  return safe.replace(/[.,;:!?\-–—]+$/g, "").trim() + "…";
}
