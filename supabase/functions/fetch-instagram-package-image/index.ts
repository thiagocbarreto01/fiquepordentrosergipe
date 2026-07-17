import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const MAX_BYTES = 12 * 1024 * 1024; // 12 MB
const ALLOWED_MIME = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const request_id = crypto.randomUUID();

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return err("not_authenticated", "Sessão não encontrada.", 401, request_id);

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await userClient.auth.getUser();
    if (!userData?.user) return err("invalid_session", "Sessão inválida.", 401, request_id);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: isStaff } = await admin.rpc("is_staff", { _user_id: userData.user.id });
    if (!isStaff) return err("forbidden", "Sem permissão.", 403, request_id);

    const body = await req.json().catch(() => ({}));
    const id = typeof body?.instagram_post_id === "string" ? body.instagram_post_id : null;
    if (!id) return err("invalid_payload", "instagram_post_id é obrigatório.", 400, request_id);

    const { data: pkg, error: readErr } = await admin
      .from("instagram_posts")
      .select("id,image_url")
      .eq("id", id)
      .maybeSingle();
    if (readErr) return err("db_read_error", readErr.message, 500, request_id);
    if (!pkg) return err("not_found", "Pacote não encontrado.", 404, request_id);
    if (!pkg.image_url) return err("no_image", "Pacote sem imagem.", 400, request_id);

    // Valida URL: só HTTPS, sem IP privado / localhost.
    let target: URL;
    try {
      target = new URL(pkg.image_url);
    } catch {
      return err("invalid_url", "URL de imagem inválida.", 400, request_id);
    }
    if (target.protocol !== "https:") return err("invalid_scheme", "Apenas HTTPS.", 400, request_id);
    const host = target.hostname.toLowerCase();
    if (
      host === "localhost" || host === "0.0.0.0" ||
      /^127\./.test(host) || /^10\./.test(host) ||
      /^192\.168\./.test(host) || /^169\.254\./.test(host) ||
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(host)
    ) {
      return err("blocked_host", "Host bloqueado.", 400, request_id);
    }

    // Fetch server-side (sem CORS no navegador).
    const upstream = await fetch(target.toString(), {
      redirect: "follow",
      headers: { "User-Agent": "FiquePorDentroSergipe/1.0 (+admin fetch)" },
    });
    if (!upstream.ok) return err("upstream_error", `HTTP ${upstream.status}`, 502, request_id);

    const mime = (upstream.headers.get("content-type") || "").toLowerCase().split(";")[0].trim();
    if (!ALLOWED_MIME.has(mime)) return err("bad_mime", `Tipo inválido: ${mime}`, 415, request_id);
    const len = Number(upstream.headers.get("content-length") || 0);
    if (len && len > MAX_BYTES) return err("too_large", "Imagem excede 12MB.", 413, request_id);

    const buf = new Uint8Array(await upstream.arrayBuffer());
    if (buf.byteLength > MAX_BYTES) return err("too_large", "Imagem excede 12MB.", 413, request_id);

    // Base64 chunked para evitar overflow do apply.
    let b64 = "";
    const chunk = 0x8000;
    for (let i = 0; i < buf.length; i += chunk) {
      b64 += String.fromCharCode(...buf.subarray(i, i + chunk));
    }
    const encoded = btoa(b64);

    return new Response(
      JSON.stringify({
        success: true,
        request_id,
        mime,
        bytes: buf.byteLength,
        data_url: `data:${mime};base64,${encoded}`,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return err("unexpected_error", e instanceof Error ? e.message : "Erro inesperado", 500, request_id);
  }
});

function err(code: string, message: string, status: number, request_id: string) {
  return new Response(
    JSON.stringify({ success: false, code, message, request_id }),
    { status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}
