import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

const INSTAGRAM_URL_RE =
  /^https?:\/\/(www\.)?instagram\.com\/(p|reel|reels|tv)\/[A-Za-z0-9_-]+\/?/i;

// Mínimo de caracteres combinados (legenda + OCR) para considerar que há informação suficiente
const MIN_SOURCE_CHARS = 40;

interface Body {
  instagram_url?: string;
  caption_override?: string;
  image_url_override?: string;
  category_id?: string | null;
  also_generate_instagram?: boolean;
  preview_only?: boolean;
  extract_only?: boolean;
  publish_now?: boolean;
}

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
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return json({ error: "Não autenticado" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: isStaff } = await admin.rpc("is_staff", { _user_id: userData.user.id });
    if (!isStaff) return json({ error: "Sem permissão" }, 403);

    const body = (await req.json().catch(() => ({}))) as Body;
    const url = String(body.instagram_url ?? "").trim();
    const captionOverride = String(body.caption_override ?? "").trim();
    const imageOverride = String(body.image_url_override ?? "").trim();
    const requestedCategoryId =
      typeof body.category_id === "string" && body.category_id.length > 0
        ? body.category_id
        : null;
    const alsoGenerateInstagram = body.also_generate_instagram === true;
    const previewOnly = body.preview_only === true;
    const extractOnly = body.extract_only === true;
    const publishNow = body.publish_now === true;

    if (!url || !INSTAGRAM_URL_RE.test(url)) {
      return json({ error: "URL do Instagram inválida. Use https://www.instagram.com/p/..." }, 400);
    }
    if (captionOverride.length > 8000) {
      return json({ error: "Legenda muito longa (máx 8000 caracteres)" }, 400);
    }
    if (imageOverride && !/^https?:\/\//i.test(imageOverride)) {
      return json({ error: "URL da imagem inválida" }, 400);
    }

    // ---- 1) EXTRAÇÃO: legenda + imagem + vídeo + localização ----
    let scrapedCaption = "";
    let scrapedImage = "";
    let scrapedVideo = "";
    let scrapedLocation = "";
    let scrapeError: string | null = null;
    try {
      const html = await fetchInstagramHtml(url);
      const meta = parseInstagramMeta(html);
      scrapedCaption = meta.caption ?? "";
      scrapedImage = meta.image ?? "";
      scrapedVideo = meta.video ?? "";
      scrapedLocation = meta.location ?? "";
    } catch (e) {
      scrapeError = e instanceof Error ? e.message : String(e);
      console.warn("Instagram scrape fallback:", scrapeError);
    }

    const caption = (captionOverride || scrapedCaption || "").trim();
    const imageUrl = (imageOverride || scrapedImage || "").trim();
    const mainVideoUrl = (scrapedVideo || (isReelOrVideo(url) ? url : "")).trim();
    const isVideo = !!mainVideoUrl;

    const hashtags = Array.from(
      new Set(
        (caption.match(/#([\p{L}0-9_]+)/giu) ?? []).map((h) => h.slice(1).toLowerCase())
      )
    ).slice(0, 20);

    // ---- 2) OCR dedicado (se houver imagem) ----
    let imageDataUrl: string | null = null;
    if (imageUrl) {
      try {
        imageDataUrl = await fetchImageAsDataUrl(imageUrl);
      } catch (e) {
        console.warn("Image fetch failed:", e instanceof Error ? e.message : e);
      }
    }
    let ocrText = "";
    if (imageDataUrl) {
      try {
        ocrText = await runOcr(imageDataUrl);
      } catch (e) {
        console.warn("OCR failed:", e instanceof Error ? e.message : e);
      }
    }

    // Transcrição de vídeo: não disponível nesta versão
    const transcript = "";

    const sourceCombinedChars =
      caption.replace(/\s+/g, "").length + ocrText.replace(/\s+/g, "").length;
    const hasSufficientSource = sourceCombinedChars >= MIN_SOURCE_CHARS;

    const extracted = {
      caption: caption || "",
      caption_length: caption.length,
      ocr_text: ocrText || "",
      transcript: transcript || "",
      transcript_available: false,
      image_url: imageUrl || null,
      has_image: !!imageUrl,
      has_video: isVideo,
      video_url: mainVideoUrl || null,
      location: scrapedLocation || null,
      hashtags,
      sufficient: hasSufficientSource,
      sufficient_threshold: MIN_SOURCE_CHARS,
      scrape_error: scrapeError,
    };

    // ---- Modo: apenas mostrar o que foi extraído ----
    if (extractOnly) {
      return json({ ok: true, extracted });
    }

    // ---- Se conteúdo insuficiente: NÃO gerar ----
    if (!hasSufficientSource) {
      return json(
        {
          ok: false,
          error:
            "Não foi possível obter informações suficientes do post para gerar uma notícia confiável.",
          insufficient: true,
          extracted,
        },
        422
      );
    }

    // ---- 3) Categorias ----
    const { data: cats } = await admin
      .from("categories")
      .select("id,name,slug,description")
      .order("position", { ascending: true });

    // ---- 4) Geração SOMENTE a partir do extraído ----
    const ai = await generateNews({
      caption,
      ocrText,
      transcript,
      hashtags,
      location: scrapedLocation,
      isVideo,
      cats: cats ?? [],
    });

    // ---- 5) Validação: título precisa ter relação com a fonte ----
    const sourceForValidation = `${caption}\n${ocrText}\n${transcript}`;
    const validation = validateAgainstSource(ai.title, sourceForValidation);
    if (!validation.valid) {
      return json(
        {
          ok: false,
          error:
            "A IA gerou um título sem relação com o conteúdo extraído. Geração bloqueada para evitar invenção de fatos.",
          validation_failed: true,
          validation_reason: validation.reason,
          extracted,
          ai_title_blocked: ai.title,
        },
        422
      );
    }

    // Fontes utilizadas (para mostrar ao editor)
    const sourcesUsed: string[] = [];
    if (caption) sourcesUsed.push("Legenda do Instagram");
    if (ocrText) sourcesUsed.push("Texto extraído da imagem (OCR)");
    if (scrapedLocation) sourcesUsed.push("Localização do post");
    if (hashtags.length) sourcesUsed.push("Hashtags");

    let chosenCategoryId: string | null = requestedCategoryId;
    let chosenCategory: any = null;
    if (!chosenCategoryId && ai.category_slug) {
      const match = (cats ?? []).find((c: any) => c.slug === ai.category_slug);
      if (match) {
        chosenCategoryId = match.id;
        chosenCategory = match;
      }
    } else if (chosenCategoryId) {
      chosenCategory = (cats ?? []).find((c: any) => c.id === chosenCategoryId) ?? null;
    }

    let finalImageUrl: string | null = imageUrl || null;
    let imageSource: "manual" | "instagram" | "category" | "placeholder" = "instagram";
    if (imageOverride) imageSource = "manual";

    if (!finalImageUrl && chosenCategory?.default_cover_image_url) {
      finalImageUrl = chosenCategory.default_cover_image_url;
      imageSource = "category";
    }
    if (!finalImageUrl) {
      imageSource = "placeholder";
    }

    // ---- Sanitiza o HTML da matéria (remove tags fora da whitelist, decode entities, remove cercas markdown) ----
    const sanitizedContent = sanitizeArticleHtml(ai.content);
    const seoTitle = (ai.seo_title || ai.title).slice(0, 70);
    const seoDescription = (ai.seo_description || ai.excerpt || "").slice(0, 160);

    // ---- Validação de qualidade obrigatória ----
    const quality = validateArticleQuality({
      title: ai.title,
      subtitle: ai.subtitle,
      lead: ai.lead,
      excerpt: ai.excerpt,
      contentHtml: sanitizedContent,
      imageSource,
    });

    // ---- Preview ----
    if (previewOnly) {
      return json({
        ok: true,
        preview: true,
        title: ai.title,
        subtitle: ai.subtitle,
        lead: ai.lead,
        excerpt: ai.excerpt,
        content_preview: stripHtml(sanitizedContent).slice(0, 800),
        content_html: sanitizedContent,
        tags: ai.tags,
        seo_title: seoTitle,
        seo_description: seoDescription,
        confidence: ai.confidence,
        confidence_reason: ai.confidence_reason,
        sources_used: sourcesUsed,
        extracted,
        category_id: chosenCategoryId,
        category_name: chosenCategory?.name ?? null,
        category_slug: chosenCategory?.slug ?? ai.category_slug ?? null,
        ai_used_category: ai.category_slug,
        cover_image_url: finalImageUrl,
        image_source: imageSource,
        had_image: imageSource === "manual" || imageSource === "instagram",
        video_url_principal: mainVideoUrl || null,
        has_video: isVideo,
        quality_ok: quality.ok,
        quality_issues: quality.issues,
        paragraph_count: quality.paragraphCount,
      });
    }

    // ---- Publicação automática bloqueada em confiança baixa ----
    if (publishNow && ai.confidence === "baixa") {
      return json(
        {
          ok: false,
          error:
            "Confiança baixa da IA. Publicação automática bloqueada — salve como rascunho e revise manualmente.",
          confidence: ai.confidence,
          confidence_reason: ai.confidence_reason,
        },
        422
      );
    }

    // ---- Publicação bloqueada por falha de qualidade ----
    if (publishNow && !quality.ok) {
      return json(
        {
          ok: false,
          error:
            "Matéria não passou na validação de qualidade. Salve como rascunho, revise e publique manualmente.",
          quality_failed: true,
          quality_issues: quality.issues,
          paragraph_count: quality.paragraphCount,
        },
        422
      );
    }

    // ---- Duplicate check ----
    const { data: existingByUrl } = await admin
      .from("posts")
      .select("id,slug")
      .eq("source_url", url)
      .maybeSingle();
    if (existingByUrl) {
      return json({
        ok: true,
        duplicate: true,
        post_id: existingByUrl.id,
        slug: existingByUrl.slug,
        message: "Este post do Instagram já foi importado anteriormente.",
      });
    }

    const baseSlug = slugify(ai.title) || `instagram-${Date.now()}`;
    const slug = await ensureUniqueSlug(admin, baseSlug);

    const targetStatus = publishNow ? "publicada" : "rascunho";

    const { data: inserted, error: insErr } = await admin
      .from("posts")
      .insert({
        title: ai.title,
        subtitle: ai.subtitle ?? null,
        slug,
        content: sanitizedContent,
        excerpt: ai.excerpt ?? null,
        cover_image_url: finalImageUrl,
        category_id: chosenCategoryId,
        author_id: userData.user.id,
        tags: ai.tags ?? [],
        status: targetStatus,
        source_url: url,
        meta_title: seoTitle,
        meta_description: seoDescription,
        video_url_principal: mainVideoUrl || null,
        videos_relacionados: [],
      })
      .select("id,slug")
      .single();

    if (insErr) {
      console.error("insert post error", insErr);
      return json({ error: insErr.message }, 500);
    }

    let instagramPostId: string | null = null;
    let instagramError: string | null = null;
    if (alsoGenerateInstagram) {
      try {
        const igResp = await fetch(`${SUPABASE_URL}/functions/v1/generate-instagram-draft`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: authHeader,
          },
          body: JSON.stringify({ post_id: inserted.id, allow_draft: true }),
        });
        const igData = await igResp.json().catch(() => ({}));
        if (igResp.ok && igData?.ok) {
          instagramPostId = igData.instagram_post_id ?? null;
        } else {
          instagramError = igData?.error ?? `IG ${igResp.status}`;
        }
      } catch (e) {
        instagramError = e instanceof Error ? e.message : "Falha ao gerar Instagram";
      }
    }

    return json({
      ok: true,
      post_id: inserted.id,
      slug: inserted.slug,
      status: targetStatus,
      published: publishNow,
      ai_used_category: ai.category_slug,
      confidence: ai.confidence,
      sources_used: sourcesUsed,
      had_image: imageSource === "manual" || imageSource === "instagram",
      image_source: imageSource,
      has_video: isVideo,
      video_url_principal: mainVideoUrl || null,
      instagram_post_id: instagramPostId,
      instagram_error: instagramError,
      quality_ok: quality.ok,
      quality_issues: quality.issues,
    });
  } catch (e) {
    console.error("import-instagram-post error", e);
    return json({ error: e instanceof Error ? e.message : "Erro inesperado" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function fetchInstagramHtml(url: string): Promise<string> {
  const resp = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; TVBarretaoBot/1.0; +https://barretao-news-hub.lovable.app)",
      "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
    },
    redirect: "follow",
  });
  if (!resp.ok) throw new Error(`Instagram HTTP ${resp.status}`);
  return await resp.text();
}

function parseInstagramMeta(html: string): {
  caption?: string;
  image?: string;
  video?: string;
  location?: string;
} {
  const ogImage = matchMeta(html, "og:image") ?? matchMeta(html, "twitter:image");
  const ogVideo =
    matchMeta(html, "og:video:secure_url") ??
    matchMeta(html, "og:video:url") ??
    matchMeta(html, "og:video") ??
    matchMeta(html, "twitter:player:stream");
  const ogDesc = matchMeta(html, "og:description") ?? matchMeta(html, "description");
  let caption = ogDesc ?? "";
  const m = caption.match(/[“"]([\s\S]*?)[”"]/);
  if (m?.[1]) caption = m[1].trim();

  let location: string | undefined;
  const locMatch =
    html.match(/"addressLocality"\s*:\s*"([^"]+)"/i) ??
    html.match(/"location"\s*:\s*\{[^}]*"name"\s*:\s*"([^"]+)"/i);
  if (locMatch?.[1]) location = locMatch[1];

  return {
    caption: caption || undefined,
    image: ogImage || undefined,
    video: ogVideo || undefined,
    location,
  };
}

function isReelOrVideo(url: string): boolean {
  return /\/(reel|reels|tv)\//i.test(url);
}

function matchMeta(html: string, prop: string): string | undefined {
  const re1 = new RegExp(
    `<meta[^>]+(?:property|name)=["']${escapeRe(prop)}["'][^>]*content=["']([^"']+)["']`,
    "i"
  );
  const re2 = new RegExp(
    `<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']${escapeRe(prop)}["']`,
    "i"
  );
  return html.match(re1)?.[1] ?? html.match(re2)?.[1];
}
function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function fetchImageAsDataUrl(url: string): Promise<string | null> {
  const resp = await fetch(url, { redirect: "follow" });
  if (!resp.ok) return null;
  const contentType = resp.headers.get("content-type") ?? "image/jpeg";
  if (!contentType.startsWith("image/")) return null;
  const buf = new Uint8Array(await resp.arrayBuffer());
  if (buf.byteLength > 5_500_000) return null;
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < buf.length; i += chunk) {
    bin += String.fromCharCode(...buf.subarray(i, i + chunk));
  }
  const b64 = btoa(bin);
  return `data:${contentType};base64,${b64}`;
}

function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 80);
}

async function ensureUniqueSlug(admin: any, base: string): Promise<string> {
  let slug = base;
  for (let i = 0; i < 5; i++) {
    const { data } = await admin.from("posts").select("id").eq("slug", slug).maybeSingle();
    if (!data) return slug;
    slug = `${base}-${Math.random().toString(36).slice(2, 6)}`;
  }
  return `${base}-${Date.now()}`;
}

// ---- OCR isolado: extrai literalmente o texto visível na imagem ----
async function runOcr(imageDataUrl: string): Promise<string> {
  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        {
          role: "system",
          content:
            "Você é um motor de OCR. Sua única tarefa é transcrever LITERALMENTE todo texto visível na imagem (cartazes, faixas, placas, legendas embutidas, etc.). Não interprete, não resuma, não invente. Se não houver texto legível, retorne string vazia.",
        },
        {
          role: "user",
          content: [
            { type: "text", text: "Transcreva LITERALMENTE todo texto visível nesta imagem. Apenas o texto, nada mais." },
            { type: "image_url", image_url: { url: imageDataUrl } },
          ],
        },
      ],
    }),
  });
  if (!resp.ok) return "";
  const data = await resp.json();
  const text = String(data?.choices?.[0]?.message?.content ?? "").trim();
  // limpa respostas "vazias" comuns
  if (/^(nenhum|não há|sem texto|n\/a|none)/i.test(text)) return "";
  return text;
}

interface NewsAI {
  title: string;
  subtitle: string;
  lead: string;
  excerpt: string;
  content: string;
  tags: string[];
  category_slug: string | null;
  seo_title: string;
  seo_description: string;
  confidence: "alta" | "média" | "baixa";
  confidence_reason: string;
}

async function generateNews(args: {
  caption: string;
  ocrText: string;
  transcript: string;
  hashtags: string[];
  location: string;
  isVideo: boolean;
  cats: { name: string; slug: string; description: string | null }[];
}): Promise<NewsAI> {
  const { caption, ocrText, transcript, hashtags, location, isVideo, cats } = args;

  const catList = cats
    .map((c) => `- ${c.slug}: ${c.name}${c.description ? ` — ${c.description}` : ""}`)
    .join("\n");

  const systemPrompt = [
    "Você é um repórter profissional do TV Barretão, portal regional de notícias de Sergipe.",
    "",
    "REGRA NÚMERO 1 — INVIOLÁVEL:",
    "Você NUNCA pode inventar fatos, nomes, datas, números, locais, declarações, contexto ou desdobramentos que não estejam EXPLICITAMENTE no MATERIAL EXTRAÍDO abaixo (legenda + OCR + transcrição). Se o material for vago, faça uma matéria CURTA e neutra; é melhor uma matéria de 3 parágrafos verdadeira do que uma de 6 inventada.",
    "- PROIBIDO usar exemplos fictícios, textos de demonstração, conteúdo genérico ou inferências sem evidência.",
    "- PROIBIDO inventar nome de pessoa, idade, bairro, cidade, hospital, autoridade, número de vítimas, causa, valor, etc.",
    "- Se a legenda/OCR sugerem apenas o TEMA (ex.: cartaz 'DESAPARECIDO' com nome), a matéria deve falar SOMENTE sobre esse tema, sem narrar fatos extras.",
    "",
    "REGRAS DE REDAÇÃO:",
    "- Português brasileiro, terceira pessoa, formal, objetivo.",
    "- ZERO emojis, ZERO hashtags, ZERO @usuário, ZERO gírias ('arrasta', 'link na bio', 'confira').",
    "- Não citar Instagram, post, reel ou rede social no corpo.",
    "- Use formulações neutras quando faltar dado: 'segundo informações divulgadas', 'de acordo com o registro divulgado'.",
    "- Sem sensacionalismo, sem opinião.",
    "",
    "ESTRUTURA OBRIGATÓRIA (HTML — use APENAS as tags: <p>, <h2>, <strong>):",
    "1. Lide (<p>): 1 parágrafo respondendo o que é a notícia (quem/o quê/quando/onde) com base APENAS no material extraído.",
    "2. Desenvolvimento: 2 a 3 parágrafos <p> com os fatos disponíveis. Cada parágrafo de 2 a 4 frases curtas, neutras, jornalísticas. Nada de 'o post mostra', 'no vídeo aparece', 'a legenda diz'.",
    "3. <h2>Contexto</h2> seguido de 1 <p> com contexto geral do tema (sem inventar fatos novos — pode citar o tipo do caso, sem detalhes inventados). Se não houver contexto seguro, escreva uma frase neutra do tipo 'Casos semelhantes costumam ser tratados pelas autoridades locais.' sem nomes.",
    "4. <p><strong>Fonte:</strong> Publicação no Instagram.</p> (sempre essa linha final, exatamente assim).",
    "",
    "MÍNIMO: 3 parágrafos <p> de corpo (lide + 2 desenvolvimentos) ANTES do bloco Contexto/Fonte. Se o material extraído for muito curto, ainda assim escreva 3 parágrafos curtos e neutros — sem inventar fatos, repetindo de forma jornalística o pouco que existe.",
    "",
    "PROIBIDO no HTML: <script>, <style>, <iframe>, <div>, <span>, atributos onclick/style, marcações markdown (## **). Use SOMENTE <p>, <h2>, <strong>.",
    "",
    "CAMPOS:",
    "- title: manchete factual ESPECÍFICA ao conteúdo extraído, máx 110 caracteres. Use palavras que apareçam ou estejam diretamente implícitas no material extraído.",
    "- subtitle: linha fina complementar, 60–140 caracteres, sem repetir o título.",
    "- lead: TEXTO PURO (sem qualquer tag HTML, sem <p>, sem **) do 1º parágrafo, 1–3 frases.",
    "- excerpt: TEXTO PURO de 1–2 frases, máx 240 caracteres.",
    "- content: matéria em HTML seguindo a ESTRUTURA OBRIGATÓRIA acima.",
    "- tags: 3–6 termos minúsculos.",
    "- category_slug: UM slug da lista (priorize: Urgente/Tragédia > Polícia > Política > Municípios > Sergipe > Denúncia). A categoria DEVE refletir o tema (foguete→ciência/mundo, polícia→policia, política→politica, esporte→esporte).",
    "- seo_title: máx 70 caracteres.",
    "- seo_description: máx 160 caracteres.",
    "- confidence: alta se legenda + OCR forem ricos e factuais; média se só houver legenda razoável OU só OCR claro; baixa se o material for curto, ambíguo ou predominantemente visual.",
    "- confidence_reason: 1 frase justificando.",
    "",
    `Categorias disponíveis:
${catList || "- (nenhuma cadastrada)"}`,
  ].join("\n");
  const userText =
    `=== MATERIAL EXTRAÍDO (use APENAS isto como fonte) ===\n\n` +
    `LEGENDA DO POST:\n"""\n${caption || "(vazia)"}\n"""\n\n` +
    `TEXTO EXTRAÍDO DA IMAGEM (OCR):\n"""\n${ocrText || "(nenhum texto legível na imagem)"}\n"""\n\n` +
    `TRANSCRIÇÃO DO VÍDEO:\n"""\n${transcript || "(não disponível)"}\n"""\n\n` +
    `HASHTAGS: ${hashtags.length ? hashtags.map((h) => "#" + h).join(" ") : "(nenhuma)"}\n` +
    `LOCALIZAÇÃO: ${location || "(não informada)"}\n` +
    `TIPO: ${isVideo ? "vídeo/reel (sem transcrição automática de áudio)" : "post/imagem"}\n\n` +
    `Gere a matéria respeitando RIGOROSAMENTE a regra inviolável: nada além do que está acima.`;

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
        { role: "user", content: userText },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "set_news_draft",
            description: "Devolve a matéria jornalística completa estruturada.",
            parameters: {
              type: "object",
              properties: {
                title: { type: "string" },
                subtitle: { type: "string" },
                lead: { type: "string" },
                excerpt: { type: "string" },
                content: { type: "string" },
                tags: { type: "array", items: { type: "string" }, maxItems: 6 },
                category_slug: { type: "string" },
                seo_title: { type: "string" },
                seo_description: { type: "string" },
                confidence: { type: "string", enum: ["alta", "média", "baixa"] },
                confidence_reason: { type: "string" },
              },
              required: [
                "title",
                "subtitle",
                "lead",
                "excerpt",
                "content",
                "tags",
                "category_slug",
                "seo_title",
                "seo_description",
                "confidence",
                "confidence_reason",
              ],
              additionalProperties: false,
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "set_news_draft" } },
    }),
  });

  if (resp.status === 429) throw new Error("Limite de requisições da IA atingido. Tente novamente em instantes.");
  if (resp.status === 402) throw new Error("Sem créditos de IA. Adicione créditos no workspace.");
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`IA ${resp.status}: ${txt}`);
  }

  const data = await resp.json();
  const raw = data?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  let parsed: any = {};
  try {
    parsed = JSON.parse(raw ?? "{}");
  } catch {
    parsed = {};
  }

  const title = String(parsed.title ?? "").trim() || "Notícia importada do Instagram";
  const subtitle = String(parsed.subtitle ?? "").trim();
  const lead = String(parsed.lead ?? "").trim();
  const excerpt = String(parsed.excerpt ?? "").trim();
  const content =
    String(parsed.content ?? "").trim() ||
    `<p>${escapeHtml(caption).replace(/\n+/g, "</p><p>")}</p>`;
  const tags = Array.isArray(parsed.tags)
    ? parsed.tags.map((t: any) => String(t).trim().toLowerCase()).filter(Boolean).slice(0, 6)
    : [];
  const category_slug =
    typeof parsed.category_slug === "string" && parsed.category_slug.trim()
      ? parsed.category_slug.trim()
      : null;
  const seo_title = String(parsed.seo_title ?? title).trim().slice(0, 70);
  const seo_description = String(parsed.seo_description ?? excerpt ?? "").trim().slice(0, 160);
  const rawConf = String(parsed.confidence ?? "média").toLowerCase();
  const confidence: "alta" | "média" | "baixa" =
    rawConf === "alta" ? "alta" : rawConf === "baixa" ? "baixa" : "média";
  const confidence_reason = String(parsed.confidence_reason ?? "").trim();

  return {
    title,
    subtitle,
    lead,
    excerpt,
    content,
    tags,
    category_slug,
    seo_title,
    seo_description,
    confidence,
    confidence_reason,
  };
}

// Stopwords PT — palavras irrelevantes para validação semântica
const STOPWORDS = new Set([
  "para","como","mais","menos","sobre","entre","pelo","pela","pelos","pelas",
  "isso","essa","esse","esta","este","estas","estes","aquela","aquele","aquilo",
  "está","estão","estamos","ser","sao","são","tem","têm","temos","ter","foi",
  "ainda","tambem","também","apenas","quase","muito","muita","muitos","muitas",
  "que","qual","quais","onde","quando","quem","porque","porém","mas","então",
  "uma","umas","uns","com","sem","dos","das","nos","nas","por","após","antes",
  "novo","nova","novos","novas","grande","pequeno","barretao","barretão",
  "tvbarretao","instagram","reel","post","video","vídeo",
]);

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !STOPWORDS.has(w));
}

function validateAgainstSource(
  title: string,
  source: string
): { valid: boolean; reason?: string } {
  const titleTokens = Array.from(new Set(tokenize(title)));
  if (titleTokens.length === 0) {
    // título sem palavras significativas — aceitamos (será raro)
    return { valid: true };
  }
  const sourceNorm = source
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  const matched = titleTokens.filter((t) => sourceNorm.includes(t));
  const ratio = matched.length / titleTokens.length;
  // exigimos ao menos 1 palavra significativa em comum E pelo menos 25% de sobreposição
  if (matched.length < 1 || ratio < 0.25) {
    return {
      valid: false,
      reason: `Nenhuma palavra-chave do título (${titleTokens.slice(0, 6).join(", ")}) foi encontrada no material extraído.`,
    };
  }
  return { valid: true };
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ---- Sanitização do HTML da matéria ----
// Decode entities, remove cercas markdown, mantém somente whitelist <p>, <h2>, <h3>, <strong>, <em>, <ul>, <ol>, <li>, <br>.
function sanitizeArticleHtml(raw: string): string {
  if (!raw) return "";
  let t = String(raw);
  // remove cercas markdown
  t = t.replace(/```(?:html|HTML)?/g, "").replace(/```/g, "");
  // decode entidades comuns que a IA às vezes escapa
  t = t
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
  // remove blocos perigosos
  t = t.replace(/<script[\s\S]*?<\/script>/gi, "");
  t = t.replace(/<style[\s\S]*?<\/style>/gi, "");
  t = t.replace(/<iframe[\s\S]*?<\/iframe>/gi, "");
  // remove atributos onclick/style/class de qualquer tag remanescente
  t = t.replace(/\s+(on\w+|style|class|id)="[^"]*"/gi, "");
  t = t.replace(/\s+(on\w+|style|class|id)='[^']*'/gi, "");
  // strip tags fora da whitelist (mantém o conteúdo interno)
  const allowed = new Set(["p", "h2", "h3", "strong", "em", "ul", "ol", "li", "br"]);
  t = t.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g, (m, tag) => {
    return allowed.has(String(tag).toLowerCase()) ? m : "";
  });
  // normaliza espaços
  t = t.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  // garante que haja parágrafos: se vier texto solto sem <p>, envolve
  if (!/<p[\s>]/i.test(t)) {
    t = t
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => `<p>${p}</p>`)
      .join("\n");
  }
  return t;
}

function countParagraphs(html: string): number {
  return (html.match(/<p[\s>]/gi) || []).length;
}

function hasVisibleHtmlTokens(text: string): boolean {
  if (!text) return false;
  // detecta tags HTML literais (ex.: "<p>", "</p>") ou entidades escapadas (&lt;p&gt;)
  return /<\/?\w+[^>]*>/.test(text) || /&lt;\/?\w+/i.test(text);
}

function validateArticleQuality(args: {
  title: string;
  subtitle: string;
  lead: string;
  excerpt: string;
  contentHtml: string;
  imageSource: "manual" | "instagram" | "category" | "placeholder";
}): { ok: boolean; issues: string[]; paragraphCount: number } {
  const issues: string[] = [];

  // 1) Imagem deve vir do Instagram ou ser manual (nunca placeholder ou imagem genérica de categoria)
  if (args.imageSource === "placeholder") {
    issues.push("Sem imagem do post. Cole uma URL de imagem ou use um post com foto.");
  } else if (args.imageSource === "category") {
    issues.push("Imagem genérica da categoria não pode ser usada — use a imagem real do post do Instagram.");
  }

  // 2) Sem HTML visível nos campos de texto puro
  if (hasVisibleHtmlTokens(args.title)) issues.push("Título contém marcação HTML visível.");
  if (hasVisibleHtmlTokens(args.subtitle)) issues.push("Subtítulo contém marcação HTML visível.");
  if (hasVisibleHtmlTokens(args.lead)) issues.push("Lide contém marcação HTML visível.");
  if (hasVisibleHtmlTokens(args.excerpt)) issues.push("Resumo contém marcação HTML visível.");

  // 3) Corpo precisa ter no mínimo 3 parágrafos <p>
  const pCount = countParagraphs(args.contentHtml);
  if (pCount < 3) {
    issues.push(`Corpo da matéria tem apenas ${pCount} parágrafo(s). Mínimo: 3.`);
  }

  // 4) Não pode haver marcação literal escapada no corpo
  if (/&lt;\/?\w+/i.test(args.contentHtml)) {
    issues.push("Corpo da matéria contém HTML escapado visível.");
  }

  return { ok: issues.length === 0, issues, paragraphCount: pCount };
}
