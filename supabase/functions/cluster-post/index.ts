// Edge Function: cluster-post
// Gera embedding via Lovable AI Gateway (google/gemini-embedding-001) e
// anexa o post a um evento existente (cosine >= 0.78) ou cria novo evento.
// Em caso de falha de embedding, recorre ao cluster por trigram (SQL).

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

const SIMILARITY_THRESHOLD = 0.78;
const EMBED_MODEL = "google/gemini-embedding-001";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function generateEmbedding(input: string): Promise<number[]> {
  const resp = await fetch("https://ai.gateway.lovable.dev/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${LOVABLE_API_KEY}`,
    },
    body: JSON.stringify({ model: EMBED_MODEL, input }),
  });
  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`embeddings ${resp.status}: ${t.slice(0, 300)}`);
  }
  const data = await resp.json();
  const vec = data?.data?.[0]?.embedding;
  if (!Array.isArray(vec) || vec.length === 0) throw new Error("embedding vazio");
  return vec;
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
    if (!post_id) return json({ error: "post_id required" }, 400);

    if (!LOVABLE_API_KEY || !SERVICE_ROLE) {
      return json({ error: "missing server secrets" }, 500);
    }

    const sb = createClient(SUPABASE_URL, SERVICE_ROLE);

    const { data: post, error: pe } = await sb
      .from("posts")
      .select("id, title, excerpt, content, slug, tags, ai_entities, ai_summary, embedding, event_id, status")
      .eq("id", post_id)
      .maybeSingle();

    if (pe || !post) return json({ error: "post not found", details: pe?.message }, 404);
    if (post.status !== "publicada") return json({ ok: true, skipped: "not_published" });
    if (post.event_id && !force) return json({ ok: true, event_id: post.event_id, cached: true });

    // Cache: reaproveita embedding já salvo no post quando disponível
    let vectorLiteral: string | null = null;
    if (post.embedding && !force) {
      vectorLiteral = typeof post.embedding === "string"
        ? post.embedding
        : toVectorLiteral(post.embedding as unknown as number[]);
    } else {
      const inputText = [
        post.title || "",
        post.ai_summary || post.excerpt || "",
        ((post.content as string) || "").replace(/<[^>]+>/g, " ").slice(0, 1500),
        Array.isArray(post.tags) ? (post.tags as string[]).join(" ") : "",
        Array.isArray(post.ai_entities) ? (post.ai_entities as string[]).join(" ") : "",
      ].filter(Boolean).join("\n").slice(0, 6000);

      try {
        const vec = await generateEmbedding(inputText);
        vectorLiteral = toVectorLiteral(vec);
      } catch (err) {
        console.error("[cluster-post] embedding failed → trgm fallback:", err);
        const { data: ev, error: fbErr } = await sb.rpc("cluster_post_into_event", { _post_id: post_id });
        await sb.from("sync_audit_log").insert({
          event_type: "cluster_post",
          post_id,
          status: "fallback_trgm",
          error: String(err),
        } as never);
        if (fbErr) return json({ error: "fallback failed", details: fbErr.message }, 500);
        return json({ ok: true, event_id: ev, fallback: "trgm" });
      }
    }

    const { data: eventId, error: ae } = await sb.rpc("attach_post_to_event_with_embedding", {
      _post_id: post_id,
      _embedding: vectorLiteral,
      _threshold: SIMILARITY_THRESHOLD,
    } as never);

    if (ae) {
      console.error("[cluster-post] attach RPC failed → trgm fallback:", ae);
      const { data: ev } = await sb.rpc("cluster_post_into_event", { _post_id: post_id });
      await sb.from("sync_audit_log").insert({
        event_type: "cluster_post",
        post_id,
        status: "fallback_trgm",
        error: ae.message,
      } as never);
      return json({ ok: true, event_id: ev, fallback: "trgm", error: ae.message });
    }

    await sb.from("sync_audit_log").insert({
      event_type: "cluster_post",
      post_id,
      status: "ok",
      details: { event_id: eventId, model: EMBED_MODEL },
    } as never);

    return json({ ok: true, event_id: eventId });
  } catch (err) {
    console.error("[cluster-post] fatal:", err);
    return json({ error: String(err) }, 500);
  }
});
