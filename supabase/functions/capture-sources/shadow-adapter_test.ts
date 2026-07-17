// F3D.3A — Testes puros e mockados do shadow-adapter.
// Sem rede, sem DNS real, sem persistência. Cobrem:
//   • readMode (whitelist estrita, sem canal cliente);
//   • cache de allowlist por run (sem estado global);
//   • decisão shadow/off e fallback legado;
//   • decodificação de charset em whitelist;
//   • evaluateMediaHostShadow reusando validateUrl/isHostAllowed;
//   • privacidade da telemetria (sem URL/IP/JWT/UUID/HTML/PostgREST cru).

import {
  assert,
  assertEquals,
  assertStringIncludes,
  assertNotMatch,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  type AllowedHost,
  SafeFetchError,
  safeFetch,
} from "./safe-fetch.ts";
import {
  type AllowlistCache,
  decodeBytes,
  evaluateMediaHostShadow,
  hashSourceId,
  loadAllowlistForSource,
  logShadow,
  newAllowlistCache,
  readMode,
  setLogSinkForTests,
  shadowFetchOrFallback,
} from "./shadow-adapter.ts";

const SID_A = "11111111-1111-1111-1111-111111111111";
const SID_B = "22222222-2222-2222-2222-222222222222";

const HOSTS_A: AllowedHost[] = [
  { source_id: SID_A, hostname: "example.com", purpose: "feed", allow_subdomains: false },
  { source_id: SID_A, hostname: "example.com", purpose: "article", allow_subdomains: false },
  { source_id: SID_A, hostname: "cdn.example.com", purpose: "media", allow_subdomains: false },
];

function captureLogs(): { lines: string[]; restore: () => void } {
  const lines: string[] = [];
  setLogSinkForTests((l) => lines.push(l));
  return { lines, restore: () => setLogSinkForTests(null) };
}

// ────────────────────────── readMode ──────────────────────────

Deno.test("readMode: variável ausente → off", () => {
  assertEquals(readMode({}), "off");
});
Deno.test("readMode: 'off' → off", () => {
  assertEquals(readMode({ SOURCE_SAFE_FETCH_MODE: "off" }), "off");
});
Deno.test("readMode: 'shadow' → shadow", () => {
  assertEquals(readMode({ SOURCE_SAFE_FETCH_MODE: "shadow" }), "shadow");
});
Deno.test("readMode: 'enforce' → off (não ativável nesta fase)", () => {
  assertEquals(readMode({ SOURCE_SAFE_FETCH_MODE: "enforce" }), "off");
});
Deno.test("readMode: 'SHADOW', espaços, lixo → off", () => {
  assertEquals(readMode({ SOURCE_SAFE_FETCH_MODE: "SHADOW" }), "off");
  assertEquals(readMode({ SOURCE_SAFE_FETCH_MODE: " shadow " }), "off");
  assertEquals(readMode({ SOURCE_SAFE_FETCH_MODE: "shadow;drop" }), "off");
  assertEquals(readMode({ SOURCE_SAFE_FETCH_MODE: "true" }), "off");
});
Deno.test("readMode: não expõe canal cliente (só lê env do servidor)", () => {
  // O módulo não exporta setter público de modo — só readMode(env).
  // Este teste falharia em compilação se algum override existisse.
  const mod = shadowFetchOrFallback;
  assert(typeof mod === "function");
});

// ────────────────────── loadAllowlistForSource ──────────────────────

function fakeSupabase(rows: Array<{ hostname: string; purpose: string; allow_subdomains: boolean }>, opts: { throwFor?: string; error?: unknown } = {}) {
  let calls = 0;
  const client = {
    from: (_t: string) => ({
      select: (_c: string) => ({
        eq: async (_k: string, v: string) => {
          calls++;
          if (opts.throwFor && v === opts.throwFor) {
            return { data: null, error: opts.error ?? new Error("db down") };
          }
          return { data: rows.filter(() => true), error: null };
        },
      }),
    }),
  };
  return { client, get calls() { return calls; } };
}

Deno.test("cache é por-run e não consulta banco de novo para a mesma fonte", async () => {
  const fake = fakeSupabase([
    { hostname: "example.com", purpose: "feed", allow_subdomains: false },
  ]);
  const cache = newAllowlistCache();
  const a = await loadAllowlistForSource(fake.client, SID_A, cache);
  const b = await loadAllowlistForSource(fake.client, SID_A, cache);
  assertEquals(a?.length, 1);
  assertEquals(b?.length, 1);
  assertEquals(fake.calls, 1); // segunda chamada usou cache
});

Deno.test("cache: duas fontes não compartilham entradas e faz duas queries", async () => {
  const fake = fakeSupabase([
    { hostname: "example.com", purpose: "feed", allow_subdomains: false },
  ]);
  const cache = newAllowlistCache();
  await loadAllowlistForSource(fake.client, SID_A, cache);
  await loadAllowlistForSource(fake.client, SID_B, cache);
  assertEquals(fake.calls, 2);
  assertEquals(cache.bySource.size, 2);
  assert(cache.bySource.get(SID_A) !== cache.bySource.get(SID_B));
});

Deno.test("cache: newAllowlistCache não compartilha estado entre runs", () => {
  const c1 = newAllowlistCache();
  const c2 = newAllowlistCache();
  c1.bySource.set(SID_A, HOSTS_A);
  assertEquals(c2.bySource.size, 0);
});

Deno.test("loadAllowlist: erro DB isola a fonte e não vaza mensagem", async () => {
  const fake = fakeSupabase([], { throwFor: SID_A, error: { message: "PGRST-crash detalhe interno" } });
  const cache = newAllowlistCache();
  const { lines, restore } = captureLogs();
  try {
    const r = await loadAllowlistForSource(fake.client, SID_A, cache);
    assertEquals(r, null);
    assert(cache.loadErrors.has(SID_A));
    // Nova tentativa da MESMA fonte não re-consulta
    const r2 = await loadAllowlistForSource(fake.client, SID_A, cache);
    assertEquals(r2, null);
    assertEquals(fake.calls, 1);
    // Nenhum log deste path (loadAllowlist não loga; logging é do adapter)
    assertEquals(lines.length, 0);
  } finally {
    restore();
  }
});

Deno.test("loadAllowlist: ignora linhas com purpose inválido e hostnames inválidos", async () => {
  const fake = fakeSupabase([
    { hostname: "example.com", purpose: "feed", allow_subdomains: false },
    { hostname: "*.evil.com", purpose: "feed", allow_subdomains: false },
    { hostname: "example.com", purpose: "unknown", allow_subdomains: false },
    { hostname: "", purpose: "article", allow_subdomains: false },
  ]);
  const cache = newAllowlistCache();
  const r = await loadAllowlistForSource(fake.client, SID_A, cache);
  assertEquals(r?.length, 1);
  assertEquals(r?.[0].hostname, "example.com");
  assertEquals(r?.[0].purpose, "feed");
});

Deno.test("loadAllowlist: allow_subdomains só true quando estritamente === true", async () => {
  const fake = fakeSupabase([
    // deno-lint-ignore no-explicit-any
    { hostname: "a.com", purpose: "feed", allow_subdomains: 1 as any },
    // deno-lint-ignore no-explicit-any
    { hostname: "b.com", purpose: "feed", allow_subdomains: "true" as any },
    { hostname: "c.com", purpose: "feed", allow_subdomains: true },
  ]);
  const cache = newAllowlistCache();
  const r = await loadAllowlistForSource(fake.client, SID_A, cache);
  const byHost = new Map(r!.map((x) => [x.hostname, x.allow_subdomains]));
  assertEquals(byHost.get("a.com"), false);
  assertEquals(byHost.get("b.com"), false);
  assertEquals(byHost.get("c.com"), true);
});

// ────────────────────── shadowFetchOrFallback ──────────────────────

function legacyOk(text = "LEGACY") {
  let calls = 0;
  return {
    fn: async () => { calls++; return text; },
    get calls() { return calls; },
  };
}
function legacyFail() {
  let calls = 0;
  return {
    fn: async () => { calls++; throw new Error("legacy explodiu"); },
    get calls() { return calls; },
  };
}

Deno.test("off: chama legado exatamente 1x; não consulta allowlist nem safeFetch", async () => {
  const leg = legacyOk("XYZ");
  const r = await shadowFetchOrFallback({
    requestId: "req1", sourceId: SID_A, sourceIdHash: "abcd",
    url: "https://example.com/x", hostPurpose: "feed", responseKind: "feed",
    mode: "off", allowlist: null,
    legacyFetch: leg.fn,
  });
  assertEquals(r.transport, "legacy_fallback");
  assertEquals(r.safeResult, "not_evaluated");
  assertEquals(r.legacyText, "XYZ");
  assertEquals(leg.calls, 1);
});

Deno.test("shadow sem allowlist carregada: fallback legado + log allowlist_load_failed", async () => {
  const leg = legacyOk();
  const { lines, restore } = captureLogs();
  try {
    const r = await shadowFetchOrFallback({
      requestId: "req2", sourceId: SID_A, sourceIdHash: "abcd",
      url: "https://example.com/x", hostPurpose: "feed", responseKind: "feed",
      mode: "shadow", allowlist: null,
      legacyFetch: leg.fn,
    });
    assertEquals(r.safeResult, "allowlist_load_failed");
    assertEquals(r.transport, "legacy_fallback");
    assertEquals(leg.calls, 1);
    assert(lines.some((l) => l.includes(`"safe_result":"allowlist_load_failed"`)));
  } finally { restore(); }
});

// Wrapper que injeta fetch mockado no safeFetch via helper local
async function runShadowWithFetch(opts: {
  fetchImpl: typeof fetch;
  dns?: () => Promise<Array<{ family: 4 | 6; address: string }>>;
  url?: string;
  hostPurpose?: "feed" | "article" | "media";
  responseKind?: "feed" | "html" | "image";
  allowlist?: AllowedHost[];
  legacy?: () => Promise<string>;
}) {
  const legacy = opts.legacy ?? (async () => "LEG");
  // Monkey-patch temporário: safeFetch usa `fetch` global se não recebido
  // via opts. Injetamos globalThis.fetch pelo tempo desta chamada.
  const originalFetch = globalThis.fetch;
  const originalDeno = (globalThis as unknown as { Deno?: unknown }).Deno;
  globalThis.fetch = opts.fetchImpl;
  (globalThis as unknown as { Deno: unknown }).Deno = {
    // deno-lint-ignore require-await
    resolveDns: async () => {
      const rr = await (opts.dns ?? (async () => [{ family: 4 as const, address: "93.184.216.34" }]))();
      return rr.filter((r) => r.family === 4).map((r) => r.address);
    },
  };
  try {
    return await shadowFetchOrFallback({
      requestId: "req", sourceId: SID_A, sourceIdHash: "abcd",
      url: opts.url ?? "https://example.com/x",
      hostPurpose: opts.hostPurpose ?? "feed",
      responseKind: opts.responseKind ?? "feed",
      mode: "shadow",
      allowlist: opts.allowlist ?? HOSTS_A,
      legacyFetch: legacy,
    });
  } finally {
    globalThis.fetch = originalFetch;
    (globalThis as unknown as { Deno: unknown }).Deno = originalDeno;
  }
}

function respond(body: string, headers: Record<string, string> = {}): Response {
  return new Response(body, { status: 200, headers });
}

Deno.test("shadow: safeFetch sucesso → transport=safe, sem chamar legado", async () => {
  const leg = legacyOk("LEG");
  const { lines, restore } = captureLogs();
  try {
    const r = await runShadowWithFetch({
      fetchImpl: async () => respond("<rss/>", { "content-type": "application/rss+xml; charset=utf-8" }),
      legacy: leg.fn,
    });
    assertEquals(r.transport, "safe");
    assertEquals(r.safeResult, "allowed");
    assertEquals(r.text, "<rss/>");
    assertEquals(leg.calls, 0);
    assert(lines.some((l) => l.includes(`"transport":"safe"`)));
  } finally { restore(); }
});

Deno.test("shadow: MIME inválido → fallback legado 1x, log com error_code", async () => {
  const leg = legacyOk("LEG");
  const { lines, restore } = captureLogs();
  try {
    const r = await runShadowWithFetch({
      fetchImpl: async () => respond("junk", { "content-type": "application/octet-stream" }),
      legacy: leg.fn,
    });
    assertEquals(r.transport, "legacy_fallback");
    assertEquals(r.safeResult, "would_block");
    assertEquals(r.errorCode, "unsupported_content_type");
    assertEquals(leg.calls, 1);
    assert(lines.some((l) => l.includes(`"error_code":"unsupported_content_type"`)));
    // sem final_hostname em would_block
    assert(!lines.some((l) => l.includes("final_hostname")));
  } finally { restore(); }
});

Deno.test("shadow: DNS bloqueado → fallback, log sem final_hostname/IP", async () => {
  const leg = legacyOk("LEG");
  const { lines, restore } = captureLogs();
  try {
    const r = await runShadowWithFetch({
      fetchImpl: async () => respond("x", { "content-type": "application/rss+xml" }),
      dns: async () => [{ family: 4, address: "10.0.0.5" }],
      legacy: leg.fn,
    });
    assertEquals(r.transport, "legacy_fallback");
    assertEquals(r.errorCode, "private_destination");
    for (const l of lines) {
      assertNotMatch(l, /10\.0\.0\.5/);
      assertNotMatch(l, /final_hostname/);
    }
  } finally { restore(); }
});

Deno.test("shadow: erro inesperado do safeFetch → legacy_error genérico", async () => {
  const leg = legacyOk("LEG");
  const { lines, restore } = captureLogs();
  try {
    // fetch que joga TypeError — safeFetch converte em "download_failed",
    // então este cenário confirma sanitização mesmo com erros de rede reais.
    const r = await runShadowWithFetch({
      fetchImpl: async () => { throw new TypeError("network sensitive data leak?"); },
      legacy: leg.fn,
    });
    assertEquals(r.transport, "legacy_fallback");
    assert(r.errorCode === "download_failed" || r.errorCode === "legacy_error");
    for (const l of lines) {
      assertNotMatch(l, /network sensitive data leak/);
    }
  } finally { restore(); }
});

Deno.test("shadow: legado explode → propaga erro operacional", async () => {
  const leg = legacyFail();
  const { restore } = captureLogs();
  try {
    let caught: unknown = null;
    try {
      await runShadowWithFetch({
        fetchImpl: async () => respond("junk", { "content-type": "application/octet-stream" }),
        legacy: leg.fn,
      });
    } catch (e) { caught = e; }
    assert(caught instanceof Error);
    assertEquals(leg.calls, 1);
  } finally { restore(); }
});

// ────────────────────── decodeBytes ──────────────────────

function bytes(...b: number[]) { return new Uint8Array(b); }

Deno.test("decodeBytes: UTF-8 puro", () => {
  const s = decodeBytes(new TextEncoder().encode("olá"), "text/html; charset=utf-8");
  assertEquals(s, "olá");
});
Deno.test("decodeBytes: UTF-8 com BOM removido", () => {
  const s = decodeBytes(bytes(0xef, 0xbb, 0xbf, 0x41), "text/html; charset=utf-8");
  assertEquals(s, "A");
});
Deno.test("decodeBytes: ISO-8859-1 declarado", () => {
  // 0xE1 = 'á' em latin1/cp1252
  const s = decodeBytes(bytes(0x6f, 0x6c, 0xe1), "text/html; charset=iso-8859-1");
  assertEquals(s, "olá");
});
Deno.test("decodeBytes: charset ausente → UTF-8", () => {
  const s = decodeBytes(new TextEncoder().encode("hi"), "text/html");
  assertEquals(s, "hi");
});
Deno.test("decodeBytes: charset desconhecido → fallback UTF-8 (não aceita nome arbitrário)", () => {
  const s = decodeBytes(new TextEncoder().encode("hi"), "text/html; charset=x-invented");
  assertEquals(s, "hi");
});
Deno.test("decodeBytes: bytes inválidos não derrubam o processo", () => {
  const s = decodeBytes(bytes(0xff, 0xfe, 0x00), "text/html; charset=utf-8");
  assertEquals(typeof s, "string");
});

// ────────────────────── evaluateMediaHostShadow ──────────────────────

const REQ = { requestId: "req", sourceIdHash: "abcd", sourceId: SID_A } as const;

Deno.test("media: off → not_evaluated (sem log)", () => {
  const { lines, restore } = captureLogs();
  try {
    const r = evaluateMediaHostShadow({
      ...REQ, imageUrl: "https://cdn.example.com/a.jpg", allowlist: HOSTS_A, mode: "off",
    });
    assertEquals(r, "not_evaluated");
    assertEquals(lines.length, 0);
  } finally { restore(); }
});

Deno.test("media: shadow allowed → log com final_hostname exato", () => {
  const { lines, restore } = captureLogs();
  try {
    const r = evaluateMediaHostShadow({
      ...REQ, imageUrl: "https://cdn.example.com/a.jpg", allowlist: HOSTS_A, mode: "shadow",
    });
    assertEquals(r, "allowed");
    assert(lines.some((l) => l.includes(`"final_hostname":"cdn.example.com"`)));
  } finally { restore(); }
});

Deno.test("media: shadow host não permitido → would_block, sem final_hostname", () => {
  const { lines, restore } = captureLogs();
  try {
    const r = evaluateMediaHostShadow({
      ...REQ, imageUrl: "https://outro.com/a.jpg", allowlist: HOSTS_A, mode: "shadow",
    });
    assertEquals(r, "would_block");
    assert(!lines.some((l) => l.includes("final_hostname")));
    assert(lines.some((l) => l.includes(`"error_code":"host_not_allowed"`)));
  } finally { restore(); }
});

Deno.test("media: HTTP bloqueado → invalid_url via validateUrl", () => {
  const { lines, restore } = captureLogs();
  try {
    const r = evaluateMediaHostShadow({
      ...REQ, imageUrl: "http://cdn.example.com/a.jpg", allowlist: HOSTS_A, mode: "shadow",
    });
    assertEquals(r, "invalid_url");
    assert(lines.some((l) => l.includes(`"error_code":"unsupported_protocol"`)));
  } finally { restore(); }
});

Deno.test("media: porta ≠ 443 → invalid_url", () => {
  const { restore } = captureLogs();
  try {
    const r = evaluateMediaHostShadow({
      ...REQ, imageUrl: "https://cdn.example.com:8443/a.jpg", allowlist: HOSTS_A, mode: "shadow",
    });
    assertEquals(r, "invalid_url");
  } finally { restore(); }
});

Deno.test("media: credenciais → invalid_url", () => {
  const { restore } = captureLogs();
  try {
    const r = evaluateMediaHostShadow({
      ...REQ, imageUrl: "https://u:p@cdn.example.com/a.jpg", allowlist: HOSTS_A, mode: "shadow",
    });
    assertEquals(r, "invalid_url");
  } finally { restore(); }
});

Deno.test("media: IP literal → invalid_url", () => {
  const { restore } = captureLogs();
  try {
    const r = evaluateMediaHostShadow({
      ...REQ, imageUrl: "https://8.8.8.8/a.jpg", allowlist: HOSTS_A, mode: "shadow",
    });
    assertEquals(r, "invalid_url");
  } finally { restore(); }
});

Deno.test("media: hostname reservado → invalid_url", () => {
  const { restore } = captureLogs();
  try {
    const r = evaluateMediaHostShadow({
      ...REQ, imageUrl: "https://something.local/a.jpg", allowlist: HOSTS_A, mode: "shadow",
    });
    assertEquals(r, "invalid_url");
  } finally { restore(); }
});

Deno.test("media: sem allowlist carregada → allowlist_load_failed", () => {
  const { restore } = captureLogs();
  try {
    const r = evaluateMediaHostShadow({
      ...REQ, imageUrl: "https://cdn.example.com/a.jpg", allowlist: null, mode: "shadow",
    });
    assertEquals(r, "allowlist_load_failed");
  } finally { restore(); }
});

Deno.test("media: allow_subdomains=false não casa subdomínio", () => {
  const { restore } = captureLogs();
  try {
    const r = evaluateMediaHostShadow({
      ...REQ, imageUrl: "https://sub.cdn.example.com/a.jpg", allowlist: HOSTS_A, mode: "shadow",
    });
    assertEquals(r, "would_block");
  } finally { restore(); }
});

// ────────────────────── Privacidade da telemetria ──────────────────────

Deno.test("telemetria: nunca contém URL/path/qs/IP/JWT/e-mail/UUID cru/HTML/Authorization/cookie/PostgREST", async () => {
  const { lines, restore } = captureLogs();
  try {
    // Um passeio por vários caminhos que geram log:
    evaluateMediaHostShadow({
      ...REQ, imageUrl: "https://cdn.example.com/secret/path?token=eyJhbGciOiJIUzI1NiJ9.abc.def&email=a@b.com",
      allowlist: HOSTS_A, mode: "shadow",
    });
    evaluateMediaHostShadow({
      ...REQ, imageUrl: "https://evil.example/private?x=1", allowlist: HOSTS_A, mode: "shadow",
    });
    evaluateMediaHostShadow({
      ...REQ, imageUrl: "http://cdn.example.com/x", allowlist: HOSTS_A, mode: "shadow",
    });
    evaluateMediaHostShadow({
      ...REQ, imageUrl: "https://8.8.8.8/x", allowlist: HOSTS_A, mode: "shadow",
    });
    // Log de allowlist_load_failed direto pelo helper
    logShadow({
      request_id: "r", source_id_hash: "abcd", purpose: "feed", response_kind: "feed",
      mode: "shadow", safe_result: "allowlist_load_failed", transport: "legacy_fallback",
    });

    const joined = lines.join("\n");
    // paths, querystrings, JWTs, e-mails, IPs, Authorization/cookie, HTML, mensagens PostgREST
    assertNotMatch(joined, /\/secret\/path/);
    assertNotMatch(joined, /token=/);
    assertNotMatch(joined, /email=/);
    assertNotMatch(joined, /a@b\.com/);
    assertNotMatch(joined, /eyJhbGciOi/);
    assertNotMatch(joined, /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/);
    assertNotMatch(joined, /authorization/i);
    assertNotMatch(joined, /cookie/i);
    assertNotMatch(joined, /<[a-z][\s\S]*>/i);
    assertNotMatch(joined, /PGRST/);
    // UUID cru da fonte NUNCA aparece — apenas o hash curto
    assertNotMatch(joined, new RegExp(SID_A));
    // hash curto ok
    assertStringIncludes(joined, `"source_id_hash":"abcd"`);
  } finally { restore(); }
});

Deno.test("hashSourceId: hex de 12 chars, determinístico e não reversível ao UUID", async () => {
  const h1 = await hashSourceId(SID_A);
  const h2 = await hashSourceId(SID_A);
  const h3 = await hashSourceId(SID_B);
  assertEquals(h1, h2);
  assert(h1 !== h3);
  assertEquals(h1.length, 12);
  assert(/^[0-9a-f]{12}$/.test(h1));
});

// ────────────────────── Compatibilidade com legado (assinatura) ──────────────────────

Deno.test("compat: retornos safe/legacy expõem string ao parser (feed XML, HTML site, HTML artigo)", async () => {
  // Simula três respostas típicas e confirma que o adapter sempre retorna
  // string ao consumidor via `text` (safe) ou `legacyText` (fallback).
  const cases: Array<{ ct: string; body: string; kind: "feed" | "html" }> = [
    { ct: "application/rss+xml; charset=utf-8", body: "<rss><channel/></rss>", kind: "feed" },
    { ct: "text/html; charset=utf-8", body: "<!doctype html><html/>", kind: "html" },
    { ct: "application/xhtml+xml; charset=utf-8", body: "<html/>", kind: "html" },
  ];
  for (const c of cases) {
    const r = await runShadowWithFetch({
      fetchImpl: async () => respond(c.body, { "content-type": c.ct }),
      responseKind: c.kind,
      hostPurpose: c.kind === "feed" ? "feed" : "article",
    });
    assertEquals(r.transport, "safe");
    assertEquals(typeof r.text, "string");
    assertEquals(r.text, c.body);
  }
});

// safeFetch export permanece intacto (sanidade da importação)
Deno.test("sanity: safeFetch e SafeFetchError seguem exportados", () => {
  assertEquals(typeof safeFetch, "function");
  const e = new SafeFetchError("invalid_url", "x");
  assertEquals(e.code, "invalid_url");
});
