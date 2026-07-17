// Função TEMPORÁRIA — F3D.2 auditoria de rede em modo sombra.
// NÃO persiste nada editorial. NÃO insere posts. NÃO altera fontes.
// Apenas exercita safeFetch contra as 13 fontes cadastradas para medir
// compatibilidade (MIME, tamanho, redirects, DNS, allowlist).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { authenticateRequest } from "./auth.ts";
import {
  corsHeaders,
  errorEnvelope,
  jsonResponse,
  methodGuard,
  newRequestId,
} from "./handlers.ts";
import {
  safeFetch,
  SafeFetchError,
  type AllowedHost,
  type Purpose,
} from "./safe-fetch.ts";

interface SourceReport {
  source_id: string;
  source_name: string;
  feed_result: string;
  feed_bytes?: number;
  feed_mime?: string | null;
  feed_redirects?: number;
  feed_elapsed_ms?: number;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  const requestId = newRequestId();
  const guard = methodGuard(req, ["POST"], requestId);
  if (guard) return guard;

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const auth = await authenticateRequest(req, admin);
  if (!auth.ok) {
    return errorEnvelope(auth.status, auth.code, auth.message, requestId);
  }

  const [{ data: sources, error: srcErr }, { data: hosts, error: hostErr }] = await Promise.all([
    admin.from("news_sources").select("id, name, url").order("name"),
    admin.from("news_source_allowed_hosts").select("source_id, hostname, purpose, allow_subdomains"),
  ]);

  if (srcErr || hostErr) {
    return errorEnvelope(500, "audit_read_failed", "Falha ao ler inventário.", requestId);
  }

  const allowedHosts = (hosts ?? []) as AllowedHost[];
  const reports: SourceReport[] = [];

  for (const s of sources ?? []) {
    const r: SourceReport = { source_id: s.id, source_name: s.name, feed_result: "skipped" };
    if (!s.url) { reports.push(r); continue; }
    const start = Date.now();
    try {
      const res = await safeFetch(s.url, {
        sourceId: s.id,
        hostPurpose: "feed" as Purpose,
        responseKind: "feed",
        allowedHosts,
        timeoutMs: 15_000,
      });
      r.feed_result = "ok";
      r.feed_bytes = res.bytes.byteLength;
      r.feed_mime = res.contentType;
      r.feed_redirects = res.redirectCount;
    } catch (e) {
      r.feed_result = e instanceof SafeFetchError ? e.code : "download_failed";
    }
    r.feed_elapsed_ms = Date.now() - start;
    reports.push(r);
  }

  const summary = {
    total_sources: reports.length,
    ok: reports.filter((r) => r.feed_result === "ok").length,
    failed: reports.filter((r) => r.feed_result !== "ok" && r.feed_result !== "skipped").length,
    by_code: reports.reduce<Record<string, number>>((acc, r) => {
      acc[r.feed_result] = (acc[r.feed_result] ?? 0) + 1;
      return acc;
    }, {}),
  };

  return jsonResponse(200, { success: true, request_id: requestId, summary, reports });
});
