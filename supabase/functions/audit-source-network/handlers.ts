// Helpers isolados (testáveis) para CORS, envelope de erro, guardas de método
// e logs sanitizados. NÃO importa Deno.serve — pode ser carregado em testes.
import type { CaptureActor } from "./auth.ts";

export const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  // Só cabeçalhos realmente usados pelo cliente (Supabase JS + JWT).
  // x-api-key e x-cron-secret foram removidos junto com os ramos de auth.
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export function errorEnvelope(
  status: number,
  code: string,
  message: string,
  requestId: string,
): Response {
  return jsonResponse(status, {
    success: false,
    code,
    message,
    request_id: requestId,
  });
}

export function newRequestId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `req_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }
}

export function handleOptions(): Response {
  // Resposta CORS de preflight. Não requer autenticação e nunca ecoa
  // Authorization ou qualquer cabeçalho enviado pelo cliente.
  return new Response(null, { status: 204, headers: corsHeaders });
}

const ALLOWED_METHODS = new Set(["POST", "OPTIONS"]);

/**
 * Trata OPTIONS e rejeita métodos não suportados ANTES da autenticação.
 * Retorna null quando o método é aceito (POST) e o handler deve prosseguir.
 */
export function methodGuard(req: Request, requestId: string): Response | null {
  if (req.method === "OPTIONS") {
    return handleOptions();
  }
  if (!ALLOWED_METHODS.has(req.method)) {
    const res = errorEnvelope(
      405,
      "method_not_allowed",
      "Método não suportado.",
      requestId,
    );
    res.headers.set("Allow", "POST, OPTIONS");
    return res;
  }
  return null;
}

/**
 * Log de autorização bem-sucedida. NUNCA registra user_id/UUID, e-mail,
 * token, Authorization ou IP. Apenas request_id e o tipo do ator.
 */
export function logAuthorized(
  requestId: string,
  actor: CaptureActor,
): void {
  console.log(
    `[capture-sources] auth ok req=${requestId} actor_kind=${actor.kind}`,
  );
}

export function logAuthRejected(requestId: string, code: string): void {
  console.warn(
    `[capture-sources] auth rejeitada req=${requestId} code=${code}`,
  );
}
