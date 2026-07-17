// Testes unitários da autenticação de `capture-sources`.
// Não fazem captação nem tocam no banco: usam um SupabaseClient falso.
import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { authenticateRequest, type AuthResult } from "./auth.ts";

type StubOptions = {
  getUser?: (token: string) => Promise<
    { data: { user: { id: string } | null }; error: unknown }
  > | { data: { user: { id: string } | null }; error: unknown };
  isStaff?: (userId: string) => Promise<{ data: unknown; error: unknown }>
    | { data: unknown; error: unknown };
};

function stubClient(opts: StubOptions): any {
  return {
    auth: {
      getUser: async (token: string) => {
        if (!opts.getUser) return { data: { user: null }, error: null };
        return await opts.getUser(token);
      },
    },
    rpc: async (name: string, args: { _user_id: string }) => {
      assertEquals(name, "is_staff");
      if (!opts.isStaff) return { data: false, error: null };
      return await opts.isStaff(args._user_id);
    },
  };
}

function reqWith(headers: Record<string, string> = {}, method = "POST") {
  return new Request("http://localhost/functions/v1/capture-sources", {
    method,
    headers,
  });
}

function assertFail(
  r: AuthResult,
  status: 401 | 403 | 500 | 503,
  code: string,
) {
  assert(!r.ok, "esperava falha");
  if (r.ok) return;
  assertEquals(r.status, status);
  assertEquals(r.code, code);
  assert(r.message.length > 0, "mensagem vazia");
  // Mensagem em português e segura (sem token, uuid, email)
  assert(!/eyJ[A-Za-z0-9._-]+/.test(r.message), "mensagem vazou token");
  assert(!/@/.test(r.message), "mensagem vazou email");
}

// --- Authorization ausente / malformado ---
Deno.test("401 quando Authorization ausente", async () => {
  const r = await authenticateRequest(reqWith({}), stubClient({}));
  assertFail(r, 401, "missing_authorization");
});

Deno.test("401 quando Authorization sem prefixo Bearer", async () => {
  const r = await authenticateRequest(
    reqWith({ authorization: "Basic abc" }),
    stubClient({}),
  );
  assertFail(r, 401, "missing_authorization");
});

Deno.test("401 quando Bearer sem token", async () => {
  const r = await authenticateRequest(
    reqWith({ authorization: "Bearer " }),
    stubClient({}),
  );
  assertFail(r, 401, "missing_authorization");
});

// --- Token inválido / expirado ---
Deno.test("401 invalid_token quando getUser retorna erro 401", async () => {
  const r = await authenticateRequest(
    reqWith({ authorization: "Bearer bad.jwt" }),
    stubClient({
      getUser: () => ({
        data: { user: null },
        error: { status: 401, message: "bad" },
      }),
    }),
  );
  assertFail(r, 401, "invalid_token");
});

Deno.test("401 invalid_token quando data.user é nulo sem erro", async () => {
  const r = await authenticateRequest(
    reqWith({ authorization: "Bearer whatever" }),
    stubClient({
      getUser: () => ({ data: { user: null }, error: null }),
    }),
  );
  assertFail(r, 401, "invalid_token");
});

// --- Falha técnica em getUser ---
Deno.test("503 authorization_check_failed quando getUser lança", async () => {
  const r = await authenticateRequest(
    reqWith({ authorization: "Bearer x" }),
    stubClient({
      getUser: () => {
        throw new Error("network down");
      },
    }),
  );
  assertFail(r, 503, "authorization_check_failed");
});

Deno.test("503 quando getUser retorna erro técnico (status 500)", async () => {
  const r = await authenticateRequest(
    reqWith({ authorization: "Bearer x" }),
    stubClient({
      getUser: () => ({
        data: { user: null },
        error: { status: 500, message: "boom" },
      }),
    }),
  );
  assertFail(r, 503, "authorization_check_failed");
});

// --- Usuário válido não-staff ---
Deno.test("403 forbidden_not_staff quando is_staff retorna false", async () => {
  const r = await authenticateRequest(
    reqWith({ authorization: "Bearer good" }),
    stubClient({
      getUser: () => ({ data: { user: { id: "u1" } }, error: null }),
      isStaff: () => ({ data: false, error: null }),
    }),
  );
  assertFail(r, 403, "forbidden_not_staff");
});

// --- Falha técnica em is_staff ---
Deno.test("503 quando is_staff RPC retorna erro", async () => {
  const r = await authenticateRequest(
    reqWith({ authorization: "Bearer good" }),
    stubClient({
      getUser: () => ({ data: { user: { id: "u1" } }, error: null }),
      isStaff: () => ({ data: null, error: { message: "db down" } }),
    }),
  );
  assertFail(r, 503, "authorization_check_failed");
});

Deno.test("503 quando is_staff lança", async () => {
  const r = await authenticateRequest(
    reqWith({ authorization: "Bearer good" }),
    stubClient({
      getUser: () => ({ data: { user: { id: "u1" } }, error: null }),
      isStaff: () => {
        throw new Error("timeout");
      },
    }),
  );
  assertFail(r, 503, "authorization_check_failed");
});

// --- Staff autorizado ---
Deno.test("OK quando usuário é staff", async () => {
  const r = await authenticateRequest(
    reqWith({ authorization: "Bearer good" }),
    stubClient({
      getUser: () => ({ data: { user: { id: "u-staff" } }, error: null }),
      isStaff: () => ({ data: true, error: null }),
    }),
  );
  assert(r.ok, "esperava sucesso");
  if (r.ok) {
    assertEquals(r.actor.kind, "staff_user");
    assertEquals(r.actor.user_id, "u-staff");
  }
});

// --- x-api-key e x-cron-secret NÃO autenticam ---
Deno.test("x-api-key sozinho não autentica (sem Authorization → 401)", async () => {
  const r = await authenticateRequest(
    reqWith({ "x-api-key": "qualquer-coisa" }),
    stubClient({}),
  );
  assertFail(r, 401, "missing_authorization");
});

Deno.test("x-cron-secret sozinho não autentica (sem Authorization → 401)", async () => {
  const r = await authenticateRequest(
    reqWith({ "x-cron-secret": "qualquer-coisa" }),
    stubClient({}),
  );
  assertFail(r, 401, "missing_authorization");
});

// --- service_role não é credencial válida do chamador ---
Deno.test("service_role no Authorization é tratada como JWT comum e rejeitada", async () => {
  // Com o novo fluxo, qualquer Bearer é validado por getUser. Se getUser
  // rejeita, retorna invalid_token — nenhuma comparação com service_role.
  const r = await authenticateRequest(
    reqWith({ authorization: "Bearer service-role-fake" }),
    stubClient({
      getUser: () => ({
        data: { user: null },
        error: { status: 401, message: "bad" },
      }),
    }),
  );
  assertFail(r, 401, "invalid_token");
});
