// Sync Watchdog — verifica drift entre posts e posts_public e repara via resync_posts_public.
// Pode ser chamado por cron (pg_cron) ou manualmente.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    const { data: auditData } = await admin.rpc("audit_posts_public_drift" as any);
    const audit = Array.isArray(auditData) ? auditData[0] : auditData;
    const missing = Number(audit?.missing_in_public ?? 0);
    const stale = Number(audit?.stale_in_public ?? 0);

    let repaired = 0;
    if (missing + stale > 0) {
      // service_role atende ao bypass de RLS, mas resync_posts_public requer is_staff(auth.uid()).
      // Replicamos a lógica inline aqui usando service role.
      const { data: rows } = await admin
        .from("posts")
        .select("id")
        .eq("status", "publicada")
        .order("published_at", { ascending: false })
        .limit(500);
      if (rows?.length) {
        // Toca cada row para disparar o trigger sync_posts_public via UPDATE no-op.
        for (const r of rows) {
          await admin
            .from("posts")
            .update({ updated_at: new Date().toISOString() })
            .eq("id", r.id);
          repaired++;
        }
      }
      await admin.from("sync_audit_log").insert({
        event_type: "watchdog",
        status: "ok",
        details: { missing, stale, repaired },
      });
    }

    // Atualiza scoring + breaking flags
    await admin.rpc("detect_breaking_events" as any).catch(() => null);
    await admin.rpc("expire_breaking_events" as any).catch(() => null);

    return new Response(
      JSON.stringify({ ok: true, missing, stale, repaired }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "erro" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
