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

type Quality = "basica" | "jornalistica" | "premium";

interface RewriteRequest {
  post_id?: string;
  title?: string;
  content?: string;
  quality?: Quality;
  apply?: boolean;
}

interface RewriteResult {
  titulo_gerado: string;
  subtitle_gerado: string;
  resumo_gerado: string;
  conteudo_gerado: string;
  meta_keywords: string[];
  categoria_sugerida: string | null;
  tags_sugeridas: string[];
}

const CATEGORIAS_VALIDAS = [
  "denuncias","policia","politica","esporte","aracaju",
  "municipios","sergipe","brasil","mundo","entretenimento",
  "opiniao","videos",
];

// ============ Sanitizadores ============
// Remove HTML, links, créditos, "continuar lendo", "leia mais", "fonte", etc.
const BANNED_PATTERNS: RegExp[] = [
  /\bcontinuar?\s+lendo\b.*$/gim,
  /\bleia\s+(mais|também|tamb[eé]m)\b.*$/gim,
  /\bsaiba\s+mais\b.*$/gim,
  /\bveja\s+(mais|também|tamb[eé]m)\b.*$/gim,
  /\bclique\s+(aqui|para)\b.*$/gim,
  /\bassista\s+(também|tamb[eé]m|abaixo|ao\s+v[ií]deo)\b.*$/gim,
  /\bcompartilhe\b.*$/gim,
  /\bsiga[- ]?nos\b.*$/gim,
  /\binscreva[- ]?se\b.*$/gim,
  /\bfonte\s*:.*$/gim,
  /\bfonte\s+original\s*:.*$/gim,
  /\bcr[eé]ditos?\s*:.*$/gim,
  /\bfoto\s*:.*$/gim,
  /\bimagem\s*:.*$/gim,
  /\bv[ií]deo\s*:.*$/gim,
  /\bvia\s+@?\w+\b/gim,
  /\bthe\s+post\b.*\bappeared\s+first\s+on\b.*$/gim,
  /\[\s*\.\.\.\s*\]/g,
  /\(\s*com\s+informa[cç][oõ]es\s+(de|do|da)\b[^)]*\)/gim,
];

function deepClean(raw: string | null | undefined): string {
  if (!raw) return "";
  let t = String(raw);
  // remove tags HTML
  t = t.replace(/<[^>]+>/g, " ");
  // decode entities básicos
  t = t
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
  // remove URLs
  t = t.replace(/https?:\/\/\S+/gi, "");
  t = t.replace(/\bwww\.\S+/gi, "");
  // remove padrões banidos
  for (const re of BANNED_PATTERNS) t = t.replace(re, "");
  // remove [Fonte original: ...] que o captador anexa
  t = t.replace(/\[\s*Fonte\s+original\s*:[^\]]*\]/gi, "");
  // múltiplos espaços/quebras
  t = t.replace(/\.{3,}/g, ".");
  t = t.replace(/[ \t]+/g, " ");
  t = t.replace(/\n{3,}/g, "\n\n");
  return t.trim();
}

// Detecta se o texto reescrito ainda contém trechos proibidos
function violatesGuidelines(text: string): string | null {
  const bad = [
    /continuar\s+lendo/i,
    /\bleia\s+mais\b/i,
    /\bsaiba\s+mais\b/i,
    /\bclique\s+aqui\b/i,
    /\bfonte\s*:/i,
    /https?:\/\//i,
  ];
  for (const re of bad) if (re.test(text)) return re.source;
  return null;
}

// ============ Prompts por nível de qualidade ============
function systemPromptFor(quality: Quality): string {
  const base = `Você é editor da redação da Fique Por Dentro Sergipe, portal de notícias profissional brasileiro.
REGRAS ABSOLUTAS:
- Reescreva COMPLETAMENTE o conteúdo com suas próprias palavras (não copie frases literais).
- Mantenha apenas FATOS verificáveis (datas, nomes, números, locais, declarações).
- NÃO invente fatos, citações, números ou nomes que não estejam no original.
- NÃO mencione a fonte original, veículo de origem, "fonte:", "via", "créditos".
- NÃO inclua frases como "continuar lendo", "leia mais", "saiba mais", "clique aqui", "veja também", "assista".
- NÃO inclua URLs, links ou referências externas no texto.
- Português do Brasil, linguagem jornalística clara, neutra e objetiva.
- O texto deve parecer produzido pela própria redação da Fique Por Dentro Sergipe.
- Parágrafos curtos (2-4 frases), separados por linha em branco.`;

  if (quality === "basica") {
    return base + `\n\nNÍVEL: BÁSICO — reescrita rápida, mantendo estrutura simples. 2-4 parágrafos curtos.`;
  }
  if (quality === "premium") {
    return base + `\n\nNÍVEL: PREMIUM — reportagem aprofundada, com lide forte (quem, o quê, quando, onde, como, por quê), contexto, declarações reorganizadas e fechamento claro. Mínimo 5 parágrafos bem desenvolvidos. Título atrativo e SEO-friendly. Linha fina (subtítulo) que complementa o título sem repetir.`;
  }
  // jornalistica (default)
  return base + `\n\nNÍVEL: JORNALÍSTICO — texto profissional de redação. Lide claro no primeiro parágrafo (quem, o quê, quando, onde). 3-6 parágrafos. Título informativo até 100 caracteres. Linha fina (subtítulo) complementar.`;
}

async function rewriteWithAI(title: string, content: string, quality: Quality): Promise<RewriteResult> {
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY não configurada");

  const cleanedInput = deepClean(content);
  const cleanedTitle = deepClean(title);

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: quality === "premium" ? "google/gemini-2.5-pro" : "google/gemini-3-flash-preview",
      messages: [
        { role: "system", content: systemPromptFor(quality) },
        {
          role: "user",
          content:
            `TÍTULO ORIGINAL:\n${cleanedTitle}\n\nCONTEÚDO ORIGINAL (apenas para extrair fatos — não copie literalmente):\n${cleanedInput.slice(0, 9000)}`,
        },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "salvar_materia",
            description: "Retorna a matéria reescrita pela redação da Fique Por Dentro Sergipe.",
            parameters: {
              type: "object",
              properties: {
                titulo_gerado: {
                  type: "string",
                  description: "Título otimizado, claro e atrativo (até 100 chars).",
                },
                subtitle_gerado: {
                  type: "string",
                  description: "Linha fina (subtítulo) que complementa o título, até 200 chars.",
                },
                resumo_gerado: {
                  type: "string",
                  description: "Lide jornalístico (2-3 frases, até 280 chars).",
                },
                conteudo_gerado: {
                  type: "string",
                  description:
                    "Corpo da matéria reescrito por completo, em parágrafos curtos separados por linha em branco. SEM links, SEM 'continuar lendo', SEM créditos de fonte.",
                },
                meta_keywords: {
                  type: "array",
                  items: { type: "string" },
                  description: "5 a 10 palavras-chave SEO em minúsculas, sem #.",
                },
                categoria_sugerida: {
                  type: "string",
                  enum: CATEGORIAS_VALIDAS,
                  description: "Slug da categoria mais adequada para esta notícia. Use 'aracaju' para fatos da capital, 'municipios' para interior de Sergipe, 'sergipe' para o estado todo, 'policia' para crime/segurança, 'politica' para governo/eleições, 'denuncias' para irregularidades, 'esporte' para futebol/jogos, 'brasil' para nacional, 'mundo' para internacional, 'entretenimento' para cultura/famosos/TV, 'opiniao' para artigos, 'videos' apenas se a matéria for sobre/de um vídeo.",
                },
                tags_sugeridas: {
                  type: "array",
                  items: { type: "string" },
                  description: "3 a 6 tags editoriais curtas (1-3 palavras cada), em minúsculas, sem #. Devem ser entidades concretas: pessoas, lugares, instituições ou temas mencionados. Ex.: 'prefeitura de aracaju', 'tribunal de justiça', 'copa do brasil'.",
                },
              },
              required: ["titulo_gerado", "subtitle_gerado", "resumo_gerado", "conteudo_gerado", "meta_keywords", "categoria_sugerida", "tags_sugeridas"],
              additionalProperties: false,
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "salvar_materia" } },
    }),
  });

  if (response.status === 429) throw new Error("RATE_LIMIT");
  if (response.status === 402) throw new Error("PAYMENT_REQUIRED");
  if (!response.ok) {
    const txt = await response.text();
    throw new Error(`AI gateway error ${response.status}: ${txt}`);
  }

  const data = await response.json();
  const toolCall = data?.choices?.[0]?.message?.tool_calls?.[0];
  if (!toolCall) throw new Error("Resposta da IA sem tool_call");

  const args = JSON.parse(toolCall.function.arguments);
  // Sanitiza tudo de novo após a IA, por garantia
  let conteudo = deepClean(String(args.conteudo_gerado || ""));
  let titulo = deepClean(String(args.titulo_gerado || "")).slice(0, 200);
  let subtitulo = deepClean(String(args.subtitle_gerado || "")).slice(0, 280);
  let resumo = deepClean(String(args.resumo_gerado || "")).slice(0, 500);
  const keywords = Array.isArray(args.meta_keywords)
    ? args.meta_keywords
        .map((k: unknown) => String(k || "").toLowerCase().replace(/^#+/, "").trim())
        .filter((k: string) => k.length >= 2 && k.length <= 40)
        .slice(0, 10)
    : [];
  const tags = Array.isArray(args.tags_sugeridas)
    ? args.tags_sugeridas
        .map((k: unknown) => String(k || "").toLowerCase().replace(/^#+/, "").trim())
        .filter((k: string) => k.length >= 2 && k.length <= 50)
        .slice(0, 6)
    : [];
  const catRaw = String(args.categoria_sugerida || "").toLowerCase().trim();
  const categoria = CATEGORIAS_VALIDAS.includes(catRaw) ? catRaw : null;

  // Validações pré-publicação (Etapa 1 Fique Por Dentro Sergipe 2.0)
  if (conteudo.length < 200) {
    throw new Error(`Conteúdo gerado muito curto (${conteudo.length} chars, mín. 200)`);
  }
  const paragraphCount = conteudo
    .split(/\n{2,}|\r\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 30).length;
  if (paragraphCount < 4) {
    throw new Error(`Conteúdo gerado tem apenas ${paragraphCount} parágrafos (mín. 4)`);
  }
  const violation =
    violatesGuidelines(conteudo) ||
    violatesGuidelines(titulo) ||
    violatesGuidelines(subtitulo) ||
    (/<\w+[^>]*>/i.test(conteudo) ? "html_no_corpo" : null);
  if (violation) {
    throw new Error(`Texto gerado contém padrão proibido: ${violation}`);
  }

  return {
    titulo_gerado: titulo,
    subtitle_gerado: subtitulo,
    resumo_gerado: resumo,
    conteudo_gerado: conteudo,
    meta_keywords: keywords,
    categoria_sugerida: categoria,
    tags_sugeridas: tags,
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

    const body = (await req.json()) as RewriteRequest;
    const quality: Quality =
      body.quality === "basica" || body.quality === "premium" ? body.quality : "jornalistica";
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    let title = body.title ?? "";
    let content = body.content ?? "";

    if (body.post_id) {
      const { data: post, error } = await admin
        .from("posts")
        .select("id, title, content, titulo_original, conteudo_original")
        .eq("id", body.post_id)
        .maybeSingle();
      if (error || !post) {
        return new Response(JSON.stringify({ error: "Post não encontrado" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      title = post.titulo_original || post.title;
      content = post.conteudo_original || post.content;
    }

    if (!title || title.length < 5 || !content || content.length < 20) {
      return new Response(
        JSON.stringify({ error: "Título e conteúdo são obrigatórios (mín. 5 e 20 chars)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const MAX_INPUT = 9000;
    if (content.length > MAX_INPUT) content = content.slice(0, MAX_INPUT);

    const result = await rewriteWithAI(title, content, quality);

    if (body.apply && body.post_id) {
      // Resolve categoria sugerida → category_id (apenas se o post ainda não tem categoria)
      let resolvedCategoryId: string | null = null;
      if (result.categoria_sugerida) {
        const { data: existing } = await admin
          .from("posts")
          .select("category_id")
          .eq("id", body.post_id)
          .maybeSingle();
        if (!existing?.category_id) {
          const { data: cat } = await admin
            .from("categories")
            .select("id")
            .eq("slug", result.categoria_sugerida)
            .maybeSingle();
          resolvedCategoryId = cat?.id ?? null;
        }
      }

      // Fluxo simplificado: a reescrita da IA NÃO altera o status do post.
      // A notícia permanece em "captada" até que o editor a abra manualmente
      // (o que dispara a transição para "em_revisao" no editor).

      const updatePayload: Record<string, unknown> = {
        titulo_original: title,
        conteudo_original: content,
        titulo_gerado: result.titulo_gerado,
        subtitle: result.subtitle_gerado,
        resumo_gerado: result.resumo_gerado,
        conteudo_gerado: result.conteudo_gerado,
        meta_keywords: result.meta_keywords,
        meta_description: result.resumo_gerado.slice(0, 160),
        tags: result.tags_sugeridas.length ? result.tags_sugeridas : result.meta_keywords,
        ai_rewrite_quality: quality,
        ai_review_status: "reescrito_ia",
        ai_rewritten_at: new Date().toISOString(),
        ai_version_used: "gerada",
      };
      if (resolvedCategoryId) updatePayload.category_id = resolvedCategoryId;

      const { error: updErr } = await admin
        .from("posts")
        .update(updatePayload)
        .eq("id", body.post_id);
      if (updErr) {
        console.error("update error", updErr);
        return new Response(JSON.stringify({ error: updErr.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Etapa 2: dispara análise de relevância (fire-and-forget, não bloqueia)
      try {
        const analyzeUrl = `${SUPABASE_URL}/functions/v1/analyze-relevance`;
        fetch(analyzeUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          },
          body: JSON.stringify({ post_id: body.post_id, apply: true }),
        }).catch((e) => console.error("analyze-relevance trigger error:", e));
      } catch (e) {
        console.error("analyze-relevance trigger exception:", e);
      }
    }

    return new Response(JSON.stringify({ success: true, quality, ...result }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("rewrite-post error:", msg);
    if (msg === "RATE_LIMIT") {
      return new Response(JSON.stringify({ error: "Limite de requisições da IA atingido. Tente novamente em alguns instantes." }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (msg === "PAYMENT_REQUIRED") {
      return new Response(JSON.stringify({ error: "Créditos da IA esgotados. Adicione fundos no workspace Lovable." }), {
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
