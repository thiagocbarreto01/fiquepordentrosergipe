// Public endpoint to submit "denuncias". POST only. Rate-limited, honeypot + timing guarded.
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Max-Age": "86400",
  "Vary": "Origin",
};

const MAX_BODY = 32 * 1024;
const MIN_FORM_MS = 3000;
const MAX_FORM_AGE_MS = 6 * 60 * 60 * 1000; // 6h

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

async function sha256Hex(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function clean(s: unknown, max: number): string | null {
  if (typeof s !== "string") return null;
  const t = s.trim();
  if (!t) return null;
  return t.length > max ? t.slice(0, max) : t;
}

function normalizeIp(ip: string): string {
  return ip.trim().toLowerCase();
}

Deno.serve(async (req) => {
  const requestId = crypto.randomUUID();

  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ success: false, code: "method_not_allowed", message: "Método não permitido", request_id: requestId }),
      { status: 405, headers: { ...CORS, "Content-Type": "application/json", Allow: "POST, OPTIONS" } },
    );
  }

  const ct = req.headers.get("content-type") || "";
  if (!ct.toLowerCase().includes("application/json")) {
    return json(415, { success: false, code: "unsupported_media_type", message: "Envie JSON.", request_id: requestId });
  }

  const cl = Number(req.headers.get("content-length") || "0");
  if (cl > MAX_BODY) {
    return json(413, { success: false, code: "payload_too_large", message: "Conteúdo excede 32 KB.", request_id: requestId });
  }

  let raw: string;
  try {
    raw = await req.text();
    if (raw.length > MAX_BODY) throw new Error("too_large");
  } catch {
    return json(413, { success: false, code: "payload_too_large", message: "Conteúdo excede 32 KB.", request_id: requestId });
  }

  let body: Record<string, unknown>;
  try { body = JSON.parse(raw); } catch {
    return json(400, { success: false, code: "invalid_json", message: "JSON inválido.", request_id: requestId });
  }

  // Honeypot: campo oculto deve estar vazio
  const hp = body.website_url_hp;
  if (typeof hp === "string" && hp.trim() !== "") {
    return json(400, { success: false, code: "invalid_submission", message: "Envio inválido.", request_id: requestId });
  }

  // Tempo mínimo de preenchimento
  const opened = Number(body.form_opened_at);
  if (!Number.isFinite(opened) || opened <= 0) {
    return json(400, { success: false, code: "invalid_submission", message: "Envio inválido.", request_id: requestId });
  }
  const age = Date.now() - opened;
  if (age < 0 || age > MAX_FORM_AGE_MS) {
    return json(400, { success: false, code: "invalid_submission", message: "Envio inválido.", request_id: requestId });
  }
  if (age < MIN_FORM_MS) {
    return json(400, { success: false, code: "too_fast", message: "Aguarde alguns segundos antes de enviar.", request_id: requestId });
  }

  const is_anonymous = body.is_anonymous !== false;
  const title = clean(body.title, 200);
  const description = clean(body.description, 5000);
  const city = clean(body.city, 100);
  const contact_name = is_anonymous ? null : clean(body.contact_name, 100);
  const contact_phone = is_anonymous ? null : clean(body.contact_phone, 30);
  const contact_email_raw = is_anonymous ? null : clean(body.contact_email, 255);

  if (!title || title.length < 5) return json(400, { success: false, code: "invalid_title", message: "Título muito curto.", request_id: requestId });
  if (!description || description.length < 10) return json(400, { success: false, code: "invalid_description", message: "Descrição muito curta.", request_id: requestId });

  let contact_email: string | null = null;
  if (contact_email_raw) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact_email_raw)) {
      return json(400, { success: false, code: "invalid_email", message: "E-mail inválido.", request_id: requestId });
    }
    contact_email = contact_email_raw.toLowerCase();
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const salt = Deno.env.get("DENUNCIA_RATE_LIMIT_SALT") || "fpds-denuncia-fallback-salt";
  const requesterHash = await sha256Hex(salt + ":" + normalizeIp(ip));

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  // Rate limit: máx 5/h, com advisory lock (server-side)
  const rl = await supabase.rpc("denuncia_rate_limit_hit", { _requester_hash: requesterHash });
  if (rl.error) {
    const msg = rl.error.message || "";
    if (msg.includes("hourly_limit")) {
      return json(429, { success: false, code: "hourly_limit", message: "Muitos envios. Tente novamente em uma hora.", request_id: requestId });
    }
    console.error("submit-denuncia rate limit error", requestId, msg);
    return json(500, { success: false, code: "rate_limit_failed", message: "Falha ao processar envio.", request_id: requestId });
  }

  // Nunca persistir identificador técnico no relato editorial
  const { data, error } = await supabase.from("denuncias").insert({
    title, description, city,
    contact_name, contact_phone, contact_email,
    is_anonymous,
    status: "nova",
    assigned_to: null,
    ip_hash: null,
    user_agent_hash: null,
  }).select("id").single();

  if (error) {
    console.error("submit-denuncia insert error", requestId, error.message);
    return json(500, { success: false, code: "insert_failed", message: "Não foi possível registrar a denúncia agora.", request_id: requestId });
  }

  return json(201, { success: true, code: "ok", message: "Denúncia recebida.", request_id: requestId, id: data.id });
});
