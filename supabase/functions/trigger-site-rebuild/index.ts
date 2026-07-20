// Trigger Site Rebuild — segura, sem vazamento de segredo.
// Admin (JWT) OU cron interno (header x-seo-rebuild-token).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VERCEL_DEPLOY_HOOK_URL = Deno.env.get("VERCEL_DEPLOY_HOOK_URL") || "";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-seo-rebuild-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function validHookUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:") return false;
    if (u.hostname !== "api.vercel.com") return false;
    if (u.port !== "" && u.port !== "443") return false;
    if (u.username || u.password) return false;
    if (!/^\/v1\/integrations\/deploy\/[A-Za-z0-9_\-\/]+$/.test(u.pathname)) return false;
    return true;
  } catch { return false; }
}

async function callVercel(): Promise<{ ok: boolean; code: string; retryable: boolean }> {
  if (!VERCEL_DEPLOY_HOOK_URL) return { ok: false, code: "hook_missing", retryable: false };
  if (!validHookUrl(VERCEL_DEPLOY_HOOK_URL)) return { ok: false, code: "hook_invalid", retryable: false };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(VERCEL_DEPLOY_HOOK_URL, {
      method: "POST",
      body: "{}",
      headers: { "Content-Type": "application/json" },
      redirect: "manual",
      signal: controller.signal,
    });
    // drain body without inspecting content
    try { await res.arrayBuffer(); } catch { /* ignore */ }
    const s = res.status;
    if (s >= 200 && s < 300) return { ok: true, code: `http_${s}`, retryable: false };
    if (s >= 300 && s < 400) return { ok: false, code: `http_${s}`, retryable: false };
    if (s === 429) return { ok: false, code: "http_429", retryable: true };
    if (s >= 400 && s < 500) return { ok: false, code: `http_${s}`, retryable: false };
    if (s >= 500) return { ok: false, code: `http_${s}`, retryable: true };
    return { ok: false, code: `http_${s}`, retryable: false };
  } catch (err) {
    const name = (err as Error)?.name || "";
    if (name === "AbortError") return { ok: false, code: "timeout", retryable: true };
    return { ok: false, code: "network_error", retryable: true };
  } finally {
    clearTimeout(timer);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ success: false, code: "method_not_allowed" }), {
      status: 405,
      headers: { ...cors, "Content-Type": "application/json", "Allow": "POST, OPTIONS" },
    });
  }

  const request_id = crypto.randomUUID();

  // Body limit 1 KB, reject forbidden fields
  const raw = await req.text();
  if (raw.length > 1024) return json(413, { success: false, code: "body_too_large", request_id });
  let body: Record<string, unknown> = {};
  if (raw.length > 0) {
    try { body = JSON.parse(raw); } catch { return json(400, { success: false, code: "invalid_json", request_id }); }
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      return json(400, { success: false, code: "invalid_json", request_id });
    }
    const forbidden = ["hook_url","deploy_hook_url","url","endpoint","target","secret","token"];
    for (const k of forbidden) {
      if (k in body) return json(400, { success: false, code: "forbidden_field", request_id });
    }
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

  // Authenticate: cron token OR admin JWT
  const cronToken = req.headers.get("x-seo-rebuild-token");
  let authed: "cron" | "admin" | null = null;

  if (cronToken) {
    const { data: ok } = await admin.rpc("verify_site_rebuild_cron_token", { _token: cronToken });
    if (ok === true) authed = "cron";
    else return json(401, { success: false, code: "invalid_cron_token", request_id });
  } else {
    const auth = req.headers.get("Authorization") || "";
    if (!auth.startsWith("Bearer ")) return json(401, { success: false, code: "missing_auth", request_id });
    const jwt = auth.slice(7);
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY") || "", {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
      auth: { persistSession: false },
    });
    const { data: userRes } = await userClient.auth.getUser();
    const uid = userRes?.user?.id;
    if (!uid) return json(401, { success: false, code: "invalid_jwt", request_id });
    const { data: prof } = await admin.from("profiles").select("role, status").eq("user_id", uid).maybeSingle();
    if (!prof || prof.status !== "approved") return json(403, { success: false, code: "not_approved", request_id });
    if (!["admin","super_admin"].includes(prof.role as string)) return json(403, { success: false, code: "not_admin", request_id });
    authed = "admin";
  }

  // Claim next item
  const { data: claimed, error: claimErr } = await admin.rpc("claim_next_site_rebuild");
  if (claimErr) return json(500, { success: false, code: "claim_failed", request_id });
  const item = Array.isArray(claimed) && claimed.length > 0 ? claimed[0] : null;
  if (!item) {
    return json(200, { success: true, code: "no_pending_item", message: "nothing_to_dispatch", request_id });
  }

  const result = await callVercel();
  if (result.ok) {
    await admin.rpc("mark_site_rebuild_dispatched", { _queue_id: item.id });
    return json(200, { success: true, code: "dispatched", message: result.code, request_id });
  } else {
    await admin.rpc("mark_site_rebuild_failed", {
      _queue_id: item.id,
      _error_code: result.code,
      _retryable: result.retryable,
    });
    return json(200, { success: false, code: result.code, message: result.retryable ? "retry_scheduled" : "gave_up", request_id });
  }
});
