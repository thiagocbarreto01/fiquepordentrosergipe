// Edge Function: cluster-post
// Modo padrão SEGURO: agrupa por similaridade local (trigram) via SQL.
// Embeddings só rodam quando explicitamente habilitados no servidor
// (CLUSTER_EMBEDDINGS_ENABLED=true) E LOVABLE_API_KEY estiver disponível.
// Cliente NUNCA pode habilitar embeddings via payload.
// Falhas de IA (402/403/429/etc) resultam em fallback silencioso, sem loop.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY") ?? "";
const EMBEDDINGS_ENABLED =
  (Deno.env.get("CLUSTER_EMBEDDINGS_ENABLED") ?? "").toLowerCase() === "true";

const SIMILARITY_THRESHOLD = 0.78;
const EMBED_MODEL = "google/gemini-embedding-001";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

type EmbedOutcome =
  | { ok: true; vector: number[] }
  | { ok: false; reason: "credit_limit" | "rate_limited" | "unauthorized" | "disabled" | "config_missing" | "error"; detail?: string };

async function generateEmbedding(input: string): Promise<EmbedOutcome> {
  if (!EMBEDDINGS_ENABLED) return { ok: false, reason: "disabled" };
  if (!LOVABLE_API_KEY) return { ok: false, reason: "config_missing" };

  let resp: Response;
  try {
    resp = await fetch("https://ai.gateway.lovable.dev/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
      },
      body: JSON.stringify({ model: EMBED_MODEL, input }),
    });
  } catch (err) {
    return { ok: false, reason: "error", detail: `network_error: ${String(err).slice(0, 120)}` };
  }

  if (resp.status === 402 || resp.status === 403) return { ok: false, reason: "credit_limit" };
  if (resp.status === 429) return { ok: false, reason: "rate_limited" };
  if (resp.status === 401) return { ok: false, reason: "unauthorized" };
  if (!resp.ok) return { ok: false, reason: "error", detail: `http_${resp.status}` };

  try {
    const data = await resp.json();
    const vec = data?.data?.[0]?.embedding;
    if (!Array.isArray(vec) || vec.length === 0) return { ok: false, reason: "error", detail: "empty_vector" };
    return { ok: true, vector: vec };
  } catch {
    return { ok: false, reason: "error", detail: "invalid_json" };
  }
}

function toVectorLiteral(vec: number[]): string {
  return "[" + vec.join(",") + "]";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const post_id: string | undefined = body?.post_id;
    const force: boolean = !!body?.force;
    // NOTE: parâmetros de habilitar embeddings vindos do cliente são IGNORADOS por segurança.
    if (!post_id) return json({ error: "post_id required" }, 400);
    if (!SERVICE_ROLE) return json({ error: "missing server secrets" }, 500);

    const sb = createClient(SUPABASE_URL, SERVICE_ROLE);

    const { data: post, error: pe } = await sb
      .from("posts")
      .select("id, title, excerpt, content, slug, tags, ai_entities, ai_summary, embedding, event_id, status")
      .eq("id", post_id)
      .maybeSingle();

    if (pe || !post) return json({ error: "post not found", details: pe?.message }, 404);
    if (post.status !== "publicada") return json({ ok: true, skipped: "not_published" });
    if (post.event_id && !force) return json({ ok: true, event_id: post.event_id, cached: true });

    const runTrigramFallback = async (
      reason: string,
      detail?: string,
    ) => {
      const { data: ev, error: fbErr } = await sb.rpc("cluster_post_into_event", { _post_id: post_id });
      await sb.from("sync_audit_log").insert({
        event_type: "cluster_post",
        post_id,
        status: reason === "disabled" ? "trigram" : "fallback_trgm",
        details: { mode: "trigram", reason, detail: detail ?? null, event_id: ev ?? null },
      } as never);
      if (fbErr) return json({ error: "fallback failed", details: fbErr.message }, 500);
      return json({ ok: true, event_id: ev, mode: "trigram", reason });
    };

    // Reaproveita embedding em cache no post apenas se embeddings estiverem habilitados
    let vectorLiteral: string | null = null;
    if (EMBEDDINGS_ENABLED && post.embedding && !force) {
      vectorLiteral = typeof post.embedding === "string"
        ? post.embedding
        : toVectorLiteral(post.embedding as unknown as number[]);
    } else if (EMBEDDINGS_ENABLED) {
      const inputText = [
        post.title || "",
        post.ai_summary || post.excerpt || "",
        ((post.content as string) || "").replace(/<[^>]+>/g, " ").slice(0, 1500),
        Array.isArray(post.tags) ? (post.tags as string[]).join(" ") : "",
        Array.isArray(post.ai_entities) ? (post.ai_entities as string[]).join(" ") : "",
      ].filter(Boolean).join("\n").slice(0, 6000);

      const outcome = await generateEmbedding(inputText);
      if (!outcome.ok) {
        // Fallback silencioso, sem repetir e sem vazar corpo do provedor
        return await runTrigramFallback(outcome.reason, outcome.detail);
      }
      vectorLiteral = toVectorLiteral(outcome.vector);
    } else {
      // Embeddings desabilitados no servidor — trigram direto (modo padrão)
      return await runTrigramFallback("disabled");
    }

    const { data: eventId, error: ae } = await sb.rpc("attach_post_to_event_with_embedding", {
      _post_id: post_id,
      _embedding: vectorLiteral,
      _threshold: SIMILARITY_THRESHOLD,
    } as never);

    if (ae) {
      return await runTrigramFallback("attach_error", ae.message?.slice(0, 200));
    }

    await sb.from("sync_audit_log").insert({
      event_type: "cluster_post",
      post_id,
      status: "ok",
      details: { event_id: eventId, mode: "embeddings", model: EMBED_MODEL },
    } as never);

    return json({ ok: true, event_id: eventId, mode: "embeddings" });
  } catch (err) {
    console.error("[cluster-post] fatal:", err);
    return json({ error: "internal_error" }, 500);
  }
});
