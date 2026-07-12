// Fase 9 — Completar matéria com IA.
// Recebe { post_id | title+content }, valida staff, chama Lovable AI Gateway com
// prompt RESTRITIVO: não inventa fatos/números/datas/cargos/falas — apenas melhora
// redação, cria intro/fechamento, transições e SEO com base no texto existente.
// Retorna preview SEM gravar.

import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

const SYSTEM_PROMPT = `Você é editor da redação da Fique Por Dentro Sergipe.
Sua tarefa é COMPLETAR e MELHORAR uma matéria já existente, mantendo TOTAL fidelidade aos fatos.

REGRAS ABSOLUTAS (jamais quebre):
- NÃO invente fatos, números, datas, nomes, cargos, locais ou falas que não estejam no texto original.
- NÃO adicione citações diretas (entre aspas) que não estejam no texto original.
- Se faltar informação, escreva de forma genérica sem inventar (ex: "as autoridades investigam" em vez de nomear autoridades).
- Preserve TODA informação factual do texto original.
- Melhore APENAS a redação: clareza, coesão, transições, ordem lógica, título, lide (primeiro parágrafo), fechamento.
- Português do Brasil, linguagem jornalística clara, neutra e objetiva.
- Parágrafos curtos (2-4 frases), separados por linha em branco.
- NÃO mencione fonte original, "leia mais", "clique aqui", URLs ou meta-referências.
- Devolva HTML simples usando <p>, <strong>, <em>, <h2>, <ul>, <li>.

FORMATO DE SAÍDA: use a função salvar_materia_completa.`;

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

    const body = await req.json().catch(() => ({}));
    const postId = body?.post_id as string | undefined;
    let title = (body?.title as string | undefined) ?? "";
    let content = (body?.content as string | undefined) ?? "";

    if (postId && (!title || !content)) {
      const { data: post } = await admin
        .from("posts")
        .select("title, content")
        .eq("id", postId)
        .maybeSingle();
      if (post) {
        title = title || post.title || "";
        content = content || post.content || "";
      }
    }

    if (!title || !content || content.replace(/<[^>]+>/g, "").trim().length < 40) {
      return new Response(
        JSON.stringify({ error: "título e conteúdo são obrigatórios (mín. 40 chars)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: `TÍTULO ATUAL:\n${title}\n\nCONTEÚDO ATUAL (todos os fatos aqui são verificados — preserve-os):\n${content.slice(0, 12000)}`,
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "salvar_materia_completa",
              description: "Versão melhorada da matéria, preservando 100% dos fatos originais.",
              parameters: {
                type: "object",
                properties: {
                  titulo: { type: "string", description: "Título jornalístico até 100 chars." },
                  subtitulo: { type: "string", description: "Linha fina complementar (até 160 chars). Pode ser vazio." },
                  conteudo: { type: "string", description: "Corpo em HTML com <p>, <h2>, <strong>, <em>, <ul>, <li>." },
                  resumo: { type: "string", description: "Resumo de 1-2 frases (até 200 chars)." },
                },
                required: ["titulo", "conteudo", "resumo"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "salvar_materia_completa" } },
      }),
    });

    if (aiRes.status === 429) {
      return new Response(JSON.stringify({ error: "Limite de requisições da IA atingido. Aguarde." }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (aiRes.status === 402) {
      return new Response(JSON.stringify({ error: "Créditos da IA esgotados. Adicione fundos no workspace." }), {
        status: 402,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!aiRes.ok) {
      const txt = await aiRes.text();
      return new Response(JSON.stringify({ error: `AI Gateway ${aiRes.status}`, detail: txt.slice(0, 500) }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiJson = await aiRes.json();
    const call = aiJson?.choices?.[0]?.message?.tool_calls?.[0];
    if (!call?.function?.arguments) {
      return new Response(JSON.stringify({ error: "IA não retornou o formato esperado" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let parsed: { titulo?: string; subtitulo?: string; conteudo?: string; resumo?: string } = {};
    try { parsed = JSON.parse(call.function.arguments); }
    catch {
      return new Response(JSON.stringify({ error: "resposta da IA malformada" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        preview: {
          titulo: parsed.titulo ?? title,
          subtitulo: parsed.subtitulo ?? "",
          conteudo: parsed.conteudo ?? content,
          resumo: parsed.resumo ?? "",
        },
        stats: {
          original_chars: content.replace(/<[^>]+>/g, "").length,
          new_chars: (parsed.conteudo ?? "").replace(/<[^>]+>/g, "").length,
        },
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
