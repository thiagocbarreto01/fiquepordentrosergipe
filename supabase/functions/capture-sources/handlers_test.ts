// Testes de guardas de método, CORS e logs sanitizados de `capture-sources`.
// Não executam captação nem tocam o banco.
import {
  assert,
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  corsHeaders,
  errorEnvelope,
  handleOptions,
  logAuthorized,
  logAuthRejected,
  methodGuard,
} from "./handlers.ts";

function req(method: string, headers: Record<string, string> = {}) {
  return new Request("http://localhost/functions/v1/capture-sources", {
    method,
    headers,
  });
}

// --- CORS ---
Deno.test("corsHeaders não expõe x-api-key nem x-cron-secret", () => {
  const allowed = corsHeaders["Access-Control-Allow-Headers"].toLowerCase();
  assert(!allowed.includes("x-api-key"), "não deve permitir x-api-key");
  assert(!allowed.includes("x-cron-secret"), "não deve permitir x-cron-secret");
  assertStringIncludes(allowed, "authorization");
  assertStringIncludes(allowed, "content-type");
});

Deno.test("Access-Control-Allow-Methods somente POST, OPTIONS", () => {
  const methods = corsHeaders["Access-Control-Allow-Methods"]
    .split(",")
    .map((m) => m.trim().toUpperCase())
    .sort();
  assertEquals(methods, ["OPTIONS", "POST"]);
});

// --- OPTIONS ---
Deno.test("OPTIONS responde 204 com CORS e sem exigir JWT", () => {
  // methodGuard chama handleOptions ANTES de qualquer autenticação.
  const res = methodGuard(req("OPTIONS"), "req-1");
  assert(res, "esperava resposta");
  assertEquals(res!.status, 204);
  assertEquals(res!.headers.get("Access-Control-Allow-Origin"), "*");
});

Deno.test("OPTIONS não ecoa o header Authorization enviado pelo cliente", () => {
  const res = handleOptions();
  // A resposta é fixa; nunca reflete o valor do cliente.
  assertEquals(res.headers.get("authorization"), null);
});

// --- POST aceito ---
Deno.test("POST passa pelo guarda (retorna null)", () => {
  assertEquals(methodGuard(req("POST"), "req-2"), null);
});

// --- 405 para métodos não permitidos ---
for (const m of ["GET", "PUT", "PATCH", "DELETE"]) {
  Deno.test(`${m} retorna 405 com envelope seguro e header Allow`, async () => {
    const res = methodGuard(req(m), "req-abc");
    assert(res, "esperava resposta");
    assertEquals(res!.status, 405);
    assertEquals(res!.headers.get("Allow"), "POST, OPTIONS");
    assertEquals(res!.headers.get("Access-Control-Allow-Origin"), "*");
    const body = await res!.json();
    assertEquals(body.success, false);
    assertEquals(body.code, "method_not_allowed");
    assertEquals(body.request_id, "req-abc");
    assert(typeof body.message === "string" && body.message.length > 0);
  });
}

// --- Envelope de erro ---
Deno.test("errorEnvelope inclui success, code, message, request_id", async () => {
  const res = errorEnvelope(503, "authorization_check_failed", "msg", "rq-9");
  assertEquals(res.status, 503);
  const body = await res.json();
  assertEquals(body, {
    success: false,
    code: "authorization_check_failed",
    message: "msg",
    request_id: "rq-9",
  });
});

// --- Privacidade dos logs: UUID nunca aparece ---
function captureConsole(fn: () => void): string {
  const chunks: string[] = [];
  const origLog = console.log;
  const origWarn = console.warn;
  const origError = console.error;
  const origInfo = console.info;
  const capture = (...args: unknown[]) =>
    chunks.push(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "));
  console.log = capture;
  console.warn = capture;
  console.error = capture;
  console.info = capture;
  try {
    fn();
  } finally {
    console.log = origLog;
    console.warn = origWarn;
    console.error = origError;
    console.info = origInfo;
  }
  return chunks.join("\n");
}

Deno.test("logAuthorized NÃO registra user_id/UUID", () => {
  const uuid = "11111111-2222-3333-4444-555555555555";
  const output = captureConsole(() => {
    logAuthorized("req-42", { kind: "staff_user", user_id: uuid });
  });
  assert(!output.includes(uuid), `UUID vazou nos logs: ${output}`);
  assertStringIncludes(output, "req=req-42");
  assertStringIncludes(output, "actor_kind=staff_user");
});

Deno.test("logAuthRejected registra apenas request_id e código", () => {
  const output = captureConsole(() => {
    logAuthRejected("req-77", "forbidden_not_staff");
  });
  assertStringIncludes(output, "req=req-77");
  assertStringIncludes(output, "code=forbidden_not_staff");
  // Não deve ter Authorization, Bearer, email, uuid
  assert(!/eyJ[A-Za-z0-9._-]+/.test(output));
  assert(!/@/.test(output));
  assert(!/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(output));
});
