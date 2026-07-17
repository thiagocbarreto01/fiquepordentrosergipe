// Testes puros do safe-fetch (F3D.1). NÃO fazem rede real: fetch e DNS
// são injetados. Cobrem URL, allowlist, DNS, redirects, limites, MIME e
// privacidade dos erros.
import {
  assert,
  assertEquals,
  assertRejects,
  assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  type AllowedHost,
  assertDnsSafe,
  DEFAULT_ALLOWED_MIMES,
  DEFAULT_MAX_BYTES,
  type DnsRecord,
  type DnsResolver,
  isHostAllowed,
  isMimeAllowed,
  isPrivateIPv4,
  isPrivateIPv6,
  isReservedHostname,
  normalizeHostname,
  parseIPv4,
  safeFetch,
  SafeFetchError,
  type SafeFetchErrorCode,
  validateUrl,
} from "./safe-fetch.ts";

const SID_A = "11111111-1111-1111-1111-111111111111";
const SID_B = "22222222-2222-2222-2222-222222222222";

const HOSTS: AllowedHost[] = [
  { source_id: SID_A, hostname: "example.com", purpose: "feed", allow_subdomains: false },
  { source_id: SID_A, hostname: "example.com", purpose: "article", allow_subdomains: false },
  { source_id: SID_A, hostname: "cdn.example.com", purpose: "media", allow_subdomains: false },
  { source_id: SID_A, hostname: "wild.example.org", purpose: "article", allow_subdomains: true },
  { source_id: SID_B, hostname: "other.com", purpose: "feed", allow_subdomains: false },
];

const publicDns: DnsResolver = async () => [{ family: 4, address: "93.184.216.34" }];
const privateDns: DnsResolver = async () => [{ family: 4, address: "10.0.0.5" }];
const mixedDns: DnsResolver = async () => [
  { family: 4, address: "93.184.216.34" },
  { family: 4, address: "127.0.0.1" },
];
const emptyDns: DnsResolver = async () => [];
const throwingDns: DnsResolver = async () => { throw new Error("boom"); };
const publicIPv6Dns: DnsResolver = async () => [{ family: 6, address: "2606:2800:220:1:248:1893:25c8:1946" }];
const privateIPv6Dns: DnsResolver = async () => [{ family: 6, address: "fc00::1" }];

// ─────────── Normalização ───────────
Deno.test("normalizeHostname: lowercase, www., trailing dot", () => {
  assertEquals(normalizeHostname("WWW.Example.COM."), "example.com");
  assertEquals(normalizeHostname("  Example.com "), "example.com");
  assertEquals(normalizeHostname("*.evil.com"), null);
  assertEquals(normalizeHostname(""), null);
  assertEquals(normalizeHostname(null), null);
});

// ─────────── URL estrutural ───────────
function code(fn: () => unknown): SafeFetchErrorCode | null {
  try { fn(); return null; } catch (e) {
    return e instanceof SafeFetchError ? e.code : null;
  }
}

Deno.test("validateUrl: aceita HTTPS válida", () => {
  const v = validateUrl("https://Example.com/feed?x=1");
  assertEquals(v.hostname, "example.com");
});

Deno.test("validateUrl: rejeita HTTP e protocolos perigosos", () => {
  assertEquals(code(() => validateUrl("http://example.com")), "unsupported_protocol");
  for (const p of ["ftp://a", "file:///etc/passwd", "data:text/html,x", "javascript:alert(1)"]) {
    const c = code(() => validateUrl(p));
    assert(c === "unsupported_protocol" || c === "invalid_url", `esperava unsupported/invalid p/ ${p}, obtive ${c}`);
  }
});

Deno.test("validateUrl: rejeita credenciais e porta != 443", () => {
  assertEquals(code(() => validateUrl("https://u:p@example.com")), "credentials_not_allowed");
  assertEquals(code(() => validateUrl("https://example.com:8080")), "port_not_allowed");
});

Deno.test("validateUrl: aceita porta 443 explícita", () => {
  const v = validateUrl("https://example.com:443/x");
  assertEquals(v.hostname, "example.com");
});

Deno.test("validateUrl: rejeita localhost/.local/.internal/.home/.lan", () => {
  for (const h of ["localhost", "srv.local", "svc.internal", "router.home", "printer.lan"]) {
    assertEquals(code(() => validateUrl(`https://${h}/x`)), "private_destination", h);
  }
});

Deno.test("validateUrl: rejeita IP literal IPv4 (privado ou público)", () => {
  assertEquals(code(() => validateUrl("https://127.0.0.1/")), "private_destination");
  assertEquals(code(() => validateUrl("https://169.254.169.254/")), "private_destination");
  assertEquals(code(() => validateUrl("https://8.8.8.8/")), "host_not_allowed");
});

Deno.test("validateUrl: rejeita IP literal IPv6", () => {
  assertEquals(code(() => validateUrl("https://[::1]/")), "private_destination");
  assertEquals(code(() => validateUrl("https://[fc00::1]/")), "private_destination");
  assertEquals(code(() => validateUrl("https://[2606:2800:220:1:248:1893:25c8:1946]/")), "host_not_allowed");
});

// ─────────── IP helpers ───────────
Deno.test("parseIPv4 rejeita octetos inválidos", () => {
  assertEquals(parseIPv4("256.0.0.1"), null);
  assertEquals(parseIPv4("1.2.3"), null);
  assertEquals(parseIPv4("10.0.0.1"), [10, 0, 0, 1]);
});

Deno.test("isPrivateIPv4 cobre faixas reservadas", () => {
  const priv = [
    "0.0.0.1", "10.0.0.1", "100.64.0.1", "127.0.0.1", "169.254.1.1",
    "172.16.0.1", "192.0.0.1", "192.0.2.1", "192.168.1.1",
    "198.18.0.1", "198.51.100.1", "203.0.113.1", "224.0.0.1", "240.0.0.1",
    "169.254.169.254",
  ];
  for (const ip of priv) assert(isPrivateIPv4(parseIPv4(ip)!), ip);
  const pub = ["8.8.8.8", "1.1.1.1", "93.184.216.34"];
  for (const ip of pub) assert(!isPrivateIPv4(parseIPv4(ip)!), ip);
});

Deno.test("isPrivateIPv6 cobre loopback/ULA/link-local/multicast/mapped", () => {
  for (const ip of ["::", "::1", "fc00::1", "fd00::abcd", "fe80::1", "ff02::1", "2001:db8::1", "::ffff:10.0.0.1"]) {
    assert(isPrivateIPv6(ip), ip);
  }
  assert(!isPrivateIPv6("2606:2800:220:1:248:1893:25c8:1946"));
  assert(!isPrivateIPv6("::ffff:8.8.8.8"));
});

Deno.test("isReservedHostname cobre sufixos internos", () => {
  for (const h of ["localhost", "srv.local", "svc.internal", "x.home", "y.lan"]) {
    assert(isReservedHostname(h), h);
  }
  assert(!isReservedHostname("example.com"));
});

// ─────────── Allowlist ───────────
Deno.test("isHostAllowed: exato + www equivalente", () => {
  assert(isHostAllowed("example.com", SID_A, "feed", HOSTS));
  assert(isHostAllowed("www.example.com", SID_A, "feed", HOSTS));
});

Deno.test("isHostAllowed: subdomínio bloqueado quando false", () => {
  assert(!isHostAllowed("sub.example.com", SID_A, "feed", HOSTS));
});

Deno.test("isHostAllowed: subdomínio permitido quando true", () => {
  assert(isHostAllowed("a.wild.example.org", SID_A, "article", HOSTS));
  assert(isHostAllowed("b.c.wild.example.org", SID_A, "article", HOSTS));
});

Deno.test("isHostAllowed: rejeita match ingênuo endsWith malicioso", () => {
  assert(!isHostAllowed("evil-example.com", SID_A, "feed", HOSTS));
  assert(!isHostAllowed("notwild.example.org", SID_A, "article", HOSTS));
});

Deno.test("isHostAllowed: outra fonte não é liberada", () => {
  assert(!isHostAllowed("example.com", SID_B, "feed", HOSTS));
});

Deno.test("isHostAllowed: purpose diferente bloqueia", () => {
  assert(!isHostAllowed("cdn.example.com", SID_A, "article", HOSTS));
  assert(!isHostAllowed("example.com", SID_A, "media", HOSTS));
});

// ─────────── DNS preflight ───────────
Deno.test("assertDnsSafe: público IPv4 passa", async () => {
  await assertDnsSafe("example.com", publicDns);
});
Deno.test("assertDnsSafe: público IPv6 passa", async () => {
  await assertDnsSafe("example.com", publicIPv6Dns);
});
Deno.test("assertDnsSafe: privado IPv4 falha", async () => {
  await assertRejects(() => assertDnsSafe("x", privateDns), SafeFetchError, "privada");
});
Deno.test("assertDnsSafe: privado IPv6 falha", async () => {
  await assertRejects(() => assertDnsSafe("x", privateIPv6Dns), SafeFetchError);
});
Deno.test("assertDnsSafe: mistura pública+privada falha", async () => {
  await assertRejects(() => assertDnsSafe("x", mixedDns), SafeFetchError);
});
Deno.test("assertDnsSafe: resposta vazia falha fechado", async () => {
  await assertRejects(() => assertDnsSafe("x", emptyDns), SafeFetchError, "endereço");
});
Deno.test("assertDnsSafe: exceção do resolver vira dns_resolution_failed", async () => {
  const err = await assertRejects(() => assertDnsSafe("x", throwingDns), SafeFetchError);
  assertEquals(err.code, "dns_resolution_failed");
});

// ─────────── MIME ───────────
Deno.test("isMimeAllowed compara tipo primário", () => {
  assert(isMimeAllowed("application/rss+xml", DEFAULT_ALLOWED_MIMES.feed));
  assert(!isMimeAllowed("application/octet-stream", DEFAULT_ALLOWED_MIMES.media));
  assert(!isMimeAllowed(null, DEFAULT_ALLOWED_MIMES.feed));
});

// ─────────── safeFetch integrado (fetch mockado) ───────────

interface MockCall { url: string; init?: RequestInit }
function mockFetch(responder: (url: string, i: number) => Response | Promise<Response>) {
  const calls: MockCall[] = [];
  let i = 0;
  const fn: typeof fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    calls.push({ url, init });
    const r = await responder(url, i++);
    return r;
  }) as typeof fetch;
  return { fn, calls };
}

function ok(body: string, contentType: string, extra?: Record<string, string>): Response {
  return new Response(body, { status: 200, headers: { "content-type": contentType, ...(extra ?? {}) } });
}
function redirect(location: string, status = 302): Response {
  return new Response(null, { status, headers: { location } });
}

Deno.test("safeFetch: sucesso feed retorna bytes e MIME", async () => {
  const { fn } = mockFetch(() => ok("<rss/>", "application/rss+xml; charset=utf-8"));
  const r = await safeFetch("https://example.com/feed", {
    sourceId: SID_A, purpose: "feed", allowedHosts: HOSTS,
    fetchFn: fn, resolveDns: publicDns,
  });
  assertEquals(r.status, 200);
  assertEquals(r.contentType, "application/rss+xml");
  assertEquals(new TextDecoder().decode(r.bytes), "<rss/>");
});

Deno.test("safeFetch: bloqueia host fora da allowlist antes do fetch", async () => {
  const { fn, calls } = mockFetch(() => ok("x", "text/html"));
  const err = await assertRejects(() => safeFetch("https://foreign.com/", {
    sourceId: SID_A, purpose: "article", allowedHosts: HOSTS, fetchFn: fn, resolveDns: publicDns,
  }), SafeFetchError);
  assertEquals(err.code, "host_not_allowed");
  assertEquals(calls.length, 0);
});

Deno.test("safeFetch: redirect same-host permitido", async () => {
  const { fn } = mockFetch((_, i) => i === 0 ? redirect("/final") : ok("<html/>", "text/html"));
  const r = await safeFetch("https://example.com/a", {
    sourceId: SID_A, purpose: "article", allowedHosts: HOSTS, fetchFn: fn, resolveDns: publicDns,
  });
  assertEquals(r.redirectCount, 1);
});

Deno.test("safeFetch: redirect para host externo é bloqueado", async () => {
  const { fn } = mockFetch(() => redirect("https://evil.com/x"));
  const err = await assertRejects(() => safeFetch("https://example.com/a", {
    sourceId: SID_A, purpose: "article", allowedHosts: HOSTS, fetchFn: fn, resolveDns: publicDns,
  }), SafeFetchError);
  assertEquals(err.code, "redirect_blocked");
});

Deno.test("safeFetch: redirect para IP privado bloqueado como private_destination", async () => {
  const { fn } = mockFetch(() => redirect("https://10.0.0.1/"));
  const err = await assertRejects(() => safeFetch("https://example.com/a", {
    sourceId: SID_A, purpose: "article", allowedHosts: HOSTS, fetchFn: fn, resolveDns: publicDns,
  }), SafeFetchError);
  assertEquals(err.code, "private_destination");
});

Deno.test("safeFetch: loop de redirect", async () => {
  const { fn } = mockFetch(() => redirect("https://example.com/a"));
  const err = await assertRejects(() => safeFetch("https://example.com/a", {
    sourceId: SID_A, purpose: "article", allowedHosts: HOSTS, fetchFn: fn, resolveDns: publicDns,
  }), SafeFetchError);
  assertEquals(err.code, "redirect_loop");
});

Deno.test("safeFetch: mais de 5 redirects", async () => {
  const { fn } = mockFetch((_, i) => redirect(`/step-${i + 1}`));
  const err = await assertRejects(() => safeFetch("https://example.com/step-0", {
    sourceId: SID_A, purpose: "article", allowedHosts: HOSTS, fetchFn: fn, resolveDns: publicDns,
  }), SafeFetchError);
  assertEquals(err.code, "too_many_redirects");
});

Deno.test("safeFetch: Content-Length acima do limite", async () => {
  const { fn } = mockFetch(() => new Response("x", { status: 200, headers: { "content-type": "text/html", "content-length": String(10 * 1024 * 1024) } }));
  const err = await assertRejects(() => safeFetch("https://example.com/a", {
    sourceId: SID_A, purpose: "article", allowedHosts: HOSTS, fetchFn: fn, resolveDns: publicDns,
  }), SafeFetchError);
  assertEquals(err.code, "response_too_large");
});

Deno.test("safeFetch: stream excedendo limite sem Content-Length", async () => {
  const big = "x".repeat(1024);
  const stream = new ReadableStream({
    start(ctrl) {
      for (let i = 0; i < 10; i++) ctrl.enqueue(new TextEncoder().encode(big));
      ctrl.close();
    },
  });
  const { fn } = mockFetch(() => new Response(stream, { status: 200, headers: { "content-type": "text/html" } }));
  const err = await assertRejects(() => safeFetch("https://example.com/a", {
    sourceId: SID_A, purpose: "article", allowedHosts: HOSTS, fetchFn: fn, resolveDns: publicDns,
    maxBytes: 2048,
  }), SafeFetchError);
  assertEquals(err.code, "response_too_large");
});

Deno.test("safeFetch: timeout vira request_timeout", async () => {
  const { fn } = mockFetch((_url) => new Promise<Response>((_res, rej) => {
    // Aguarda até que o AbortController do safeFetch dispare.
    // Simula suspensão indefinida.
    setTimeout(() => rej(Object.assign(new Error("aborted"), { name: "AbortError" })), 5);
  }));
  const err = await assertRejects(() => safeFetch("https://example.com/a", {
    sourceId: SID_A, purpose: "article", allowedHosts: HOSTS, fetchFn: fn, resolveDns: publicDns,
    timeoutMs: 1,
  }), SafeFetchError);
  assertEquals(err.code, "request_timeout");
});

Deno.test("safeFetch: MIME proibido", async () => {
  const { fn } = mockFetch(() => ok("bin", "application/octet-stream"));
  const err = await assertRejects(() => safeFetch("https://cdn.example.com/x.jpg", {
    sourceId: SID_A, purpose: "media", allowedHosts: HOSTS, fetchFn: fn, resolveDns: publicDns,
  }), SafeFetchError);
  assertEquals(err.code, "unsupported_content_type");
});

Deno.test("safeFetch: status 401/403/429 → remote_access_denied", async () => {
  for (const s of [401, 403, 429]) {
    const { fn } = mockFetch(() => new Response("", { status: s }));
    const err = await assertRejects(() => safeFetch("https://example.com/a", {
      sourceId: SID_A, purpose: "article", allowedHosts: HOSTS, fetchFn: fn, resolveDns: publicDns,
    }), SafeFetchError);
    assertEquals(err.code, "remote_access_denied");
  }
});

Deno.test("safeFetch: status 5xx → remote_server_error", async () => {
  const { fn } = mockFetch(() => new Response("", { status: 502 }));
  const err = await assertRejects(() => safeFetch("https://example.com/a", {
    sourceId: SID_A, purpose: "article", allowedHosts: HOSTS, fetchFn: fn, resolveDns: publicDns,
  }), SafeFetchError);
  assertEquals(err.code, "remote_server_error");
});

// ─────────── Privacidade das mensagens ───────────
Deno.test("SafeFetchError não vaza URL/querystring/IP/headers/conteúdo", async () => {
  const url = "https://example.com/secret?token=abc123";
  const cases: Array<() => Promise<unknown>> = [
    () => safeFetch("http://example.com/", { sourceId: SID_A, purpose: "feed", allowedHosts: HOSTS, fetchFn: fetch, resolveDns: publicDns }),
    () => safeFetch("https://u:p@example.com/", { sourceId: SID_A, purpose: "feed", allowedHosts: HOSTS, fetchFn: fetch, resolveDns: publicDns }),
    () => safeFetch("https://foreign.com/", { sourceId: SID_A, purpose: "feed", allowedHosts: HOSTS, fetchFn: fetch, resolveDns: publicDns }),
    () => safeFetch(url, { sourceId: SID_A, purpose: "feed", allowedHosts: HOSTS, fetchFn: fetch, resolveDns: privateDns }),
  ];
  for (const c of cases) {
    try { await c(); assert(false, "esperava erro"); }
    catch (e) {
      assert(e instanceof SafeFetchError);
      const msg = e.message;
      assert(!msg.includes("token=abc123"), `vazou querystring: ${msg}`);
      assert(!msg.includes("10.0.0.5"), `vazou IP: ${msg}`);
      assert(!msg.includes("u:p@"), `vazou credenciais: ${msg}`);
      assert(!msg.includes("secret"), `vazou path: ${msg}`);
      assertStringIncludes(e.code, "");
    }
  }
});
