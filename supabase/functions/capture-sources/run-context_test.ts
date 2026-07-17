// F3D.3A.2 — Testes do wrapper `run-context.ts`.
//
// Cobrem os requisitos das fases 9 e 12 do plano: comportamento efetivo
// em mode=off (fast path), roteamento correto em shadow, isolamento de
// cache entre requests/fontes e não-emissão de telemetria em off.
//
// Sem rede real, sem Supabase real, sem persistência. `fetch` e DNS não
// são chamados diretamente aqui: o legado é uma closure passada pelos
// próprios testes.

import { assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  createRunContext,
  evaluateMediaHost,
  fetchSourceText,
} from "./run-context.ts";
import { setLogSinkForTests } from "./shadow-adapter.ts";

interface FakeQuery {
  select(_c: string): {
    eq(_k: string, _v: string): Promise<{ data: unknown; error: unknown }>;
  };
}

function makeSupabase(opts: {
  hosts?: Array<{ hostname: string; purpose: string; allow_subdomains: boolean }>;
  fail?: boolean;
  onQuery?: () => void;
}) {
  return {
    from(_t: string): FakeQuery {
      return {
        select(_c: string) {
          return {
            eq(_k: string, _v: string) {
              opts.onQuery?.();
              if (opts.fail) return Promise.resolve({ data: null, error: new Error("db") });
              return Promise.resolve({ data: opts.hosts ?? [], error: null });
            },
          };
        },
      };
    },
  };
}

// ─── mode=off (comportamento efetivo em produção) ───────────────────────

Deno.test("off + RSS: legado 1x, zero query à allowlist", async () => {
  const logs: string[] = [];
  setLogSinkForTests((l) => logs.push(l));
  let queries = 0;
  const supabase = makeSupabase({ onQuery: () => queries++ });
  const ctx = createRunContext(supabase, "req-off-1", {});
  assertEquals(ctx.mode, "off");
  let legacyCalls = 0;
  const out = await fetchSourceText(ctx, "src-1", "https://example.com/feed", "feed", "feed", () => {
    legacyCalls++;
    return Promise.resolve("<xml/>");
  });
  assertEquals(out, "<xml/>");
  assertEquals(legacyCalls, 1);
  assertEquals(queries, 0);
  assertEquals(logs.length, 0);
  setLogSinkForTests(null);
});

Deno.test("off + SITE: legado 1x, zero allowlist, zero telemetria", async () => {
  const logs: string[] = [];
  setLogSinkForTests((l) => logs.push(l));
  let queries = 0;
  const ctx = createRunContext(makeSupabase({ onQuery: () => queries++ }), "req-off-2", {});
  let calls = 0;
  const out = await fetchSourceText(ctx, "src-1", "https://example.com/", "feed", "html", () => {
    calls++;
    return Promise.resolve("<html/>");
  });
  assertEquals(out, "<html/>");
  assertEquals(calls, 1);
  assertEquals(queries, 0);
  assertEquals(logs.length, 0);
  setLogSinkForTests(null);
});

Deno.test("off + artigo: legado 1x, zero allowlist", async () => {
  let queries = 0;
  const ctx = createRunContext(makeSupabase({ onQuery: () => queries++ }), "r", {});
  let calls = 0;
  const out = await fetchSourceText(ctx, "s", "https://example.com/a", "article", "html", () => {
    calls++;
    return Promise.resolve("<h1/>");
  });
  assertEquals(out, "<h1/>");
  assertEquals(calls, 1);
  assertEquals(queries, 0);
});

Deno.test("off + mídia: not_evaluated, sem consulta e sem telemetria", async () => {
  const logs: string[] = [];
  setLogSinkForTests((l) => logs.push(l));
  let queries = 0;
  const ctx = createRunContext(makeSupabase({ onQuery: () => queries++ }), "r", {});
  const r = await evaluateMediaHost(ctx, "s", "https://cdn.example.com/img.jpg");
  assertEquals(r, "not_evaluated");
  assertEquals(queries, 0);
  assertEquals(logs.length, 0);
  setLogSinkForTests(null);
});

Deno.test("off: erro do legado é propagado sem toque no adapter", async () => {
  const ctx = createRunContext(makeSupabase({}), "r", {});
  await assertRejects(
    () => fetchSourceText(ctx, "s", "https://example.com/", "feed", "feed", () => {
      throw new Error("HTTP 500");
    }),
    Error,
    "HTTP 500",
  );
});

// ─── shadow: allowlist, cache por run e telemetria ─────────────────────

Deno.test("shadow: allowlist é consultada SOMENTE 1x por (source, run)", async () => {
  setLogSinkForTests(() => {});
  let queries = 0;
  const supabase = makeSupabase({
    hosts: [{ hostname: "example.com", purpose: "feed", allow_subdomains: false }],
    onQuery: () => queries++,
  });
  const ctx = createRunContext(supabase, "req-shadow-1", { SOURCE_SAFE_FETCH_MODE: "shadow" });
  assertEquals(ctx.mode, "shadow");
  const legacy = () => Promise.resolve("<xml/>");
  // Duas chamadas para a mesma source no mesmo run.
  await fetchSourceText(ctx, "src-1", "https://blocked.example.net/", "feed", "feed", legacy);
  await fetchSourceText(ctx, "src-1", "https://blocked.example.net/", "feed", "feed", legacy);
  assertEquals(queries, 1);
  setLogSinkForTests(null);
});

Deno.test("shadow: duas fontes no mesmo run mantêm allowlists isoladas", async () => {
  setLogSinkForTests(() => {});
  const seen: string[] = [];
  const supabase = {
    from(_t: string) {
      return {
        select(_c: string) {
          return {
            eq(_k: string, v: string) {
              seen.push(v);
              return Promise.resolve({ data: [], error: null });
            },
          };
        },
      };
    },
  };
  const ctx = createRunContext(supabase, "req-shadow-2", { SOURCE_SAFE_FETCH_MODE: "shadow" });
  const legacy = () => Promise.resolve("<x/>");
  await fetchSourceText(ctx, "src-A", "https://a.example/", "feed", "feed", legacy);
  await fetchSourceText(ctx, "src-B", "https://b.example/", "feed", "feed", legacy);
  assertEquals(seen.sort(), ["src-A", "src-B"]);
});

Deno.test("shadow: contexto de duas requisições NÃO compartilha cache", async () => {
  setLogSinkForTests(() => {});
  let queries = 0;
  const supabase = makeSupabase({ onQuery: () => queries++ });
  const legacy = () => Promise.resolve("<x/>");
  const ctxA = createRunContext(supabase, "req-A", { SOURCE_SAFE_FETCH_MODE: "shadow" });
  const ctxB = createRunContext(supabase, "req-B", { SOURCE_SAFE_FETCH_MODE: "shadow" });
  await fetchSourceText(ctxA, "src-1", "https://x.example/", "feed", "feed", legacy);
  await fetchSourceText(ctxB, "src-1", "https://x.example/", "feed", "feed", legacy);
  // Cada run consultou 1x.
  assertEquals(queries, 2);
});

Deno.test("shadow: falha no load da allowlist → fallback legado, string preservada", async () => {
  const logs: string[] = [];
  setLogSinkForTests((l) => logs.push(l));
  const ctx = createRunContext(
    makeSupabase({ fail: true }),
    "req-shadow-3",
    { SOURCE_SAFE_FETCH_MODE: "shadow" },
  );
  let calls = 0;
  const out = await fetchSourceText(ctx, "src-x", "https://example.com/", "feed", "feed", () => {
    calls++;
    return Promise.resolve("LEGACY-OK");
  });
  assertEquals(out, "LEGACY-OK");
  assertEquals(calls, 1);
  // Deve ter logado allowlist_load_failed.
  const line = logs.find((l) => l.includes("allowlist_load_failed"));
  if (!line) throw new Error("esperava telemetria allowlist_load_failed");
  setLogSinkForTests(null);
});

Deno.test("shadow: host não permitido → would_block + fallback legado (1x)", async () => {
  const logs: string[] = [];
  setLogSinkForTests((l) => logs.push(l));
  const ctx = createRunContext(
    makeSupabase({
      hosts: [{ hostname: "outra.example", purpose: "feed", allow_subdomains: false }],
    }),
    "req-shadow-4",
    { SOURCE_SAFE_FETCH_MODE: "shadow" },
  );
  let calls = 0;
  const out = await fetchSourceText(ctx, "s", "https://blocked.example/", "feed", "feed", () => {
    calls++;
    return Promise.resolve("legacy");
  });
  assertEquals(out, "legacy");
  assertEquals(calls, 1);
  // Não deve logar final_hostname quando bloqueado.
  const line = logs.find((l) => l.includes('"safe_result":"would_block"'));
  if (!line) throw new Error("esperava telemetria would_block");
  if (line.includes("final_hostname")) throw new Error("final_hostname vazou em host bloqueado");
  setLogSinkForTests(null);
});

Deno.test("shadow + mídia: bloqueada → URL continua íntegra no caller", async () => {
  setLogSinkForTests(() => {});
  const ctx = createRunContext(
    makeSupabase({ hosts: [] }),
    "req-mid",
    { SOURCE_SAFE_FETCH_MODE: "shadow" },
  );
  const url = "https://cdn.example.com/x.jpg";
  const r = await evaluateMediaHost(ctx, "s", url);
  assertEquals(r, "would_block");
  // O contrato do wrapper é NÃO tocar na URL — o caller a preserva.
  assertEquals(url, "https://cdn.example.com/x.jpg");
});
