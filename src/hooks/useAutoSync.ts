import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/sonner";

/**
 * Hook de Auto Sync: a cada `intervalMs`, audita drift entre `posts` e `posts_public`.
 * Se houver desincronizado, chama `auto_repair_posts_public()`.
 */
export function useAutoSync(intervalMs = 60_000) {
  useEffect(() => {
    let cancelled = false;

    async function tick() {
      try {
        const { data, error } = await supabase.rpc("audit_posts_public_drift" as any);
        if (cancelled || error) return;
        const row = Array.isArray(data) ? data[0] : data;
        const missing = Number(row?.missing_in_public ?? 0);
        const stale = Number(row?.stale_in_public ?? 0);
        if (missing + stale === 0) return;

        const { data: repaired, error: repairErr } = await supabase.rpc(
          "auto_repair_posts_public" as any,
        );
        if (cancelled) return;
        if (repairErr) {
          console.warn("[autosync] repair error:", repairErr.message);
          return;
        }
        toast(`Auto Sync: ${repaired} matéria(s) ressincronizada(s).`);
      } catch (err) {
        console.warn("[autosync] error:", err);
      }
    }

    tick();
    const id = window.setInterval(tick, intervalMs);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [intervalMs]);
}
