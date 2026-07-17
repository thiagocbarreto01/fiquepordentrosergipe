// F3D.3A — Modo sombra para integração progressiva do safeFetch.
//
// Regras invariantes:
//   • modo determinado no servidor via SOURCE_SAFE_FETCH_MODE
//     (valores válidos: "off" | "shadow"; qualquer outro cai em "off").
//   • enforce NÃO é ativável nesta fase; o parser aceita o token mas
//     readMode() nunca retorna "enforce".
//   • em shadow: tenta safeFetch primeiro; se erro estruturado → fallback
//     legado; se sucesso → usa bytes seguros sem 2º fetch.
//   • telemetria estruturada e SEM PII (sem URL, sem path, sem qs, sem IP,
//     sem headers, sem conteúdo, sem UUID cru da fonte).
//   • cache de allowlist é EXPLÍCITO por run/requisição — o caller cria com
//     newAllowlistCache() no início e descarta ao final. Não há Map global.
//
// Fora de escopo (F3D.3A): download real de mídia (o fluxo atual só
// armazena URLs); apenas validação lexical do hostname contra allowlist,
// reusando validateUrl/isHostAllowed de safe-fetch para evitar divergência.

import {
  type AllowedHost,
  type Purpose,
  type ResponseKind,
  DEFAULT_ALLOWED_MIMES_BY_KIND,
  isHostAllowed,
  normalizeHostname,
  safeFetch,
  SafeFetchError,
  type SafeFetchErrorCode,
  validateUrl,
} from "./safe-fetch.ts";

export type SafeMode = "off" | "shadow" | "enforce";

/**
 * Lê o modo do ambiente do servidor. Somente `off` (default) e `shadow`
 * são ativáveis nesta fase; qualquer outro valor (incluindo `enforce`,
 * `SHADOW`, espaços ou lixo) cai em `off` de forma fail-closed.
 *
 * Fonte é EXCLUSIVAMENTE o env do servidor. Nenhum caminho aceita modo
 * vindo de querystring, body ou header do cliente.
 */
export function readMode(env: Record<string, string | undefined>): SafeMode {
  const raw = env.SOURCE_SAFE_FETCH_MODE;
  if (typeof raw !== "string") return "off";
  // Sem tolerância a espaços ou variações de caixa: token exato "shadow".
  if (raw === "shadow") return "shadow";
  return "off";
}

export type Transport = "safe" | "legacy_fallback";
export type SafeResult =
  | "allowed"
  | "would_block"
  | "not_evaluated"
  | "allowlist_load_failed"
  | "invalid_url";

export interface ShadowEvent {
  request_id: string;
  source_id_hash: string;
  purpose: Purpose;
  response_kind: ResponseKind;
  mode: SafeMode;
  safe_result: SafeResult;
  transport: Transport;
  error_code?: SafeFetchErrorCode | "legacy_error";
  redirect_count?: number;
  bytes?: number;
  duration_ms?: number;
  /** Presente SOMENTE quando o hostname foi confirmado pela allowlist. */
  final_hostname?: string;
}

/** Hash não reversível curto (48 bits) do source_id — não é PII do usuário. */
export async function hashSourceId(sourceId: string): Promise<string> {
  try {
    const buf = new TextEncoder().encode(sourceId);
    const h = await crypto.subtle.digest("SHA-256", buf);
    const arr = Array.from(new Uint8Array(h)).slice(0, 6);
    return arr.map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    return "unknown";
  }
}

/** Sink de log injetável para testes; default = console.log estruturado. */
export type LogSink = (line: string) => void;
let currentSink: LogSink = (l) => console.log(l);
export function setLogSinkForTests(sink: LogSink | null): void {
  currentSink = sink ?? ((l) => console.log(l));
}

/**
 * Emite um evento de telemetria sanitizado. Somente as chaves declaradas
 * em `ShadowEvent` são serializadas — sem URL/IP/headers/conteúdo.
 * `final_hostname` só entra quando não-vazio (o caller já garante que só
 * é passado após autorização pela allowlist).
 */
export function logShadow(ev: ShadowEvent): void {
  const safe: Record<string, unknown> = {
    request_id: ev.request_id,
    source_id_hash: ev.source_id_hash,
    purpose: ev.purpose,
    response_kind: ev.response_kind,
    mode: ev.mode,
    safe_result: ev.safe_result,
    transport: ev.transport,
  };
  if (ev.error_code) safe.error_code = ev.error_code;
  if (typeof ev.redirect_count === "number") safe.redirect_count = ev.redirect_count;
  if (typeof ev.bytes === "number") safe.bytes = ev.bytes;
  if (typeof ev.duration_ms === "number") safe.duration_ms = ev.duration_ms;
  if (ev.final_hostname) safe.final_hostname = ev.final_hostname;
  currentSink(`[shadow] ${JSON.stringify(safe)}`);
}

/**
 * Cache de allowlist ESTRITAMENTE por run/requisição. O caller cria com
 * `newAllowlistCache()`, injeta em cada chamada do adaptador e descarta
 * ao final do handler. Não existe Map global neste módulo.
 */
export interface AllowlistCache {
  bySource: Map<string, AllowedHost[]>;
  loadErrors: Set<string>;
}

export function newAllowlistCache(): AllowlistCache {
  return { bySource: new Map(), loadErrors: new Set() };
}

/**
 * Carrega a allowlist de uma fonte no cache da run. Se falhar, marca
 * `loadErrors` — o caller decide (em shadow: fallback legado). Erros
 * SQL/PostgREST são engolidos: nada do detalhe cru vaza para logs.
 *
 * O `supabase` recebido é o client interno da Edge Function (service role);
 * ele nunca é criado a partir de credenciais do cliente HTTP.
 */
export async function loadAllowlistForSource(
  supabase: {
    from: (t: string) => {
      select: (c: string) => {
        eq: (
          k: string,
          v: string,
        ) => Promise<
          { data: Array<{ hostname: string; purpose: string; allow_subdomains: boolean }> | null; error: unknown }
        >;
      };
    };
  },
  sourceId: string,
  cache: AllowlistCache,
): Promise<AllowedHost[] | null> {
  if (cache.bySource.has(sourceId)) return cache.bySource.get(sourceId)!;
  if (cache.loadErrors.has(sourceId)) return null;
  try {
    const { data, error } = await supabase
      .from("news_source_allowed_hosts")
      .select("hostname,purpose,allow_subdomains")
      .eq("source_id", sourceId);
    if (error || !data) throw new Error("load_failed");
    const hosts: AllowedHost[] = [];
    for (const row of data) {
      const h = normalizeHostname(row.hostname);
      if (!h) continue; // linha inválida ignorada, jamais amplia permissão
      const p = row.purpose as Purpose;
      if (p !== "feed" && p !== "article" && p !== "media") continue;
      hosts.push({
        source_id: sourceId,
        hostname: h,
        purpose: p,
        // preserva estritamente o valor booleano; nada de coerção larga.
        allow_subdomains: row.allow_subdomains === true,
      });
    }
    cache.bySource.set(sourceId, hosts);
    return hosts;
  } catch {
    // Marca a fonte como falha para não repetir a consulta na mesma run
    // e para permitir fallback legado imediato nas chamadas seguintes.
    cache.loadErrors.add(sourceId);
    return null;
  }
}

export interface AdapterResult {
  transport: Transport;
  safeResult: SafeResult;
  errorCode?: SafeFetchErrorCode | "legacy_error";
  // Presente somente quando transport==="safe".
  bytes?: Uint8Array;
  text?: string;
  contentType?: string | null;
  finalHostname?: string;
  redirectCount?: number;
  // Presente somente quando transport==="legacy_fallback" e o legado
  // completou com sucesso.
  legacyText?: string;
}

export interface ShadowFetchArgs {
  requestId: string;
  sourceId: string;
  sourceIdHash: string;
  url: string;
  hostPurpose: Purpose;
  responseKind: ResponseKind;
  mode: SafeMode;
  allowlist: AllowedHost[] | null; // null quando carregamento falhou
  legacyFetch: () => Promise<string>; // fetch legado que devolve texto
  timeoutMs?: number;
  maxBytes?: number;
}

// ─── Decodificação de texto: charset em whitelist estrita ────────────────

const SAFE_DECODERS: Record<string, string> = {
  "utf-8": "utf-8",
  "utf8": "utf-8",
  "us-ascii": "utf-8", // superset seguro
  "ascii": "utf-8",
  "iso-8859-1": "windows-1252", // browsers tratam como cp1252
  "latin1": "windows-1252",
  "latin-1": "windows-1252",
  "windows-1252": "windows-1252",
  "cp1252": "windows-1252",
};

function pickDecoder(contentType: string | null): string {
  if (!contentType) return "utf-8";
  const m = /charset=([^;]+)/i.exec(contentType);
  if (!m) return "utf-8";
  const cs = m[1].trim().toLowerCase().replace(/^["']|["']$/g, "");
  const mapped = SAFE_DECODERS[cs];
  // charset desconhecido → fallback seguro (nunca aceita nome arbitrário
  // como executável de TextDecoder sem validação).
  return mapped ?? "utf-8";
}

function stripBom(s: string): string {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

/** Decodifica bytes usando um decoder da whitelist; fail-open em UTF-8. */
export function decodeBytes(bytes: Uint8Array, contentType: string | null): string {
  const label = pickDecoder(contentType);
  try {
    return stripBom(new TextDecoder(label, { fatal: false }).decode(bytes));
  } catch {
    return stripBom(new TextDecoder("utf-8", { fatal: false }).decode(bytes));
  }
}

/**
 * Ponto único de decisão. Em shadow: tenta safe primeiro, faz fallback
 * legado em erro estruturado. Em off: legado direto (sem consulta a
 * allowlist e sem chamar safeFetch).
 */
export async function shadowFetchOrFallback(
  args: ShadowFetchArgs,
): Promise<AdapterResult> {
  const start = performance.now();

  if (args.mode === "off") {
    const legacyText = await args.legacyFetch();
    return { transport: "legacy_fallback", safeResult: "not_evaluated", legacyText };
  }

  // shadow. enforce nunca chega aqui: readMode() jamais retorna "enforce"
  // nesta fase; a checagem abaixo é defesa em profundidade.
  if (args.mode !== "shadow") {
    const legacyText = await args.legacyFetch();
    return { transport: "legacy_fallback", safeResult: "not_evaluated", legacyText };
  }

  if (!args.allowlist) {
    logShadow({
      request_id: args.requestId,
      source_id_hash: args.sourceIdHash,
      purpose: args.hostPurpose,
      response_kind: args.responseKind,
      mode: args.mode,
      safe_result: "allowlist_load_failed",
      transport: "legacy_fallback",
      duration_ms: Math.round(performance.now() - start),
    });
    const legacyText = await args.legacyFetch();
    return {
      transport: "legacy_fallback",
      safeResult: "allowlist_load_failed",
      legacyText,
    };
  }

  try {
    const r = await safeFetch(args.url, {
      sourceId: args.sourceId,
      hostPurpose: args.hostPurpose,
      responseKind: args.responseKind,
      allowedHosts: args.allowlist,
      allowedMimeTypes: DEFAULT_ALLOWED_MIMES_BY_KIND[args.responseKind],
      timeoutMs: args.timeoutMs,
      maxBytes: args.maxBytes,
    });
    const text = decodeBytes(r.bytes, r.contentType);
    logShadow({
      request_id: args.requestId,
      source_id_hash: args.sourceIdHash,
      purpose: args.hostPurpose,
      response_kind: args.responseKind,
      mode: args.mode,
      safe_result: "allowed",
      transport: "safe",
      redirect_count: r.redirectCount,
      bytes: r.bytes.byteLength,
      duration_ms: Math.round(performance.now() - start),
      final_hostname: r.finalHostname,
    });
    return {
      transport: "safe",
      safeResult: "allowed",
      bytes: r.bytes,
      text,
      contentType: r.contentType,
      finalHostname: r.finalHostname,
      redirectCount: r.redirectCount,
    };
  } catch (e) {
    // Erro inesperado (não-SafeFetchError) é normalizado como "legacy_error"
    // e a mensagem crua NUNCA é logada.
    const code: SafeFetchErrorCode | "legacy_error" =
      e instanceof SafeFetchError ? e.code : "legacy_error";
    logShadow({
      request_id: args.requestId,
      source_id_hash: args.sourceIdHash,
      purpose: args.hostPurpose,
      response_kind: args.responseKind,
      mode: args.mode,
      safe_result: "would_block",
      transport: "legacy_fallback",
      error_code: code,
      duration_ms: Math.round(performance.now() - start),
      // deliberadamente SEM final_hostname aqui (host não autorizado ou
      // DNS bloqueado — não confirmar hostname no log).
    });
    // Fallback legado (único fetch adicional).
    const legacyText = await args.legacyFetch();
    return {
      transport: "legacy_fallback",
      safeResult: "would_block",
      errorCode: code,
      legacyText,
    };
  }
}

/**
 * Verificação lexical de mídia (sem download). Reutiliza validateUrl +
 * isHostAllowed para garantir a mesma superfície de segurança do safeFetch:
 * HTTPS, porta 443, sem credenciais, hostname normalizado, IP literal
 * bloqueado, hostname reservado bloqueado, allow_subdomains exato.
 */
export function evaluateMediaHostShadow(args: {
  requestId: string;
  sourceIdHash: string;
  sourceId: string;
  imageUrl: string | null | undefined;
  allowlist: AllowedHost[] | null;
  mode: SafeMode;
}): SafeResult {
  if (args.mode === "off") return "not_evaluated";
  if (!args.imageUrl) return "not_evaluated";

  if (!args.allowlist) {
    logShadow({
      request_id: args.requestId,
      source_id_hash: args.sourceIdHash,
      purpose: "media",
      response_kind: "image",
      mode: args.mode,
      safe_result: "allowlist_load_failed",
      transport: "legacy_fallback",
    });
    return "allowlist_load_failed";
  }

  let hostname: string | null = null;
  let errorCode: SafeFetchErrorCode | null = null;
  try {
    const v = validateUrl(args.imageUrl);
    hostname = v.hostname;
  } catch (e) {
    errorCode = e instanceof SafeFetchError ? e.code : "invalid_url";
  }

  if (!hostname) {
    logShadow({
      request_id: args.requestId,
      source_id_hash: args.sourceIdHash,
      purpose: "media",
      response_kind: "image",
      mode: args.mode,
      safe_result: "invalid_url",
      transport: "legacy_fallback",
      error_code: errorCode ?? "invalid_url",
      // sem final_hostname: URL inválida / destino inseguro.
    });
    return "invalid_url";
  }

  const allowed = isHostAllowed(hostname, args.sourceId, "media", args.allowlist);
  if (allowed) {
    logShadow({
      request_id: args.requestId,
      source_id_hash: args.sourceIdHash,
      purpose: "media",
      response_kind: "image",
      mode: args.mode,
      safe_result: "allowed",
      transport: "legacy_fallback",
      final_hostname: hostname,
    });
    return "allowed";
  }
  logShadow({
    request_id: args.requestId,
    source_id_hash: args.sourceIdHash,
    purpose: "media",
    response_kind: "image",
    mode: args.mode,
    safe_result: "would_block",
    transport: "legacy_fallback",
    error_code: "host_not_allowed",
    // sem final_hostname: host não autorizado.
  });
  return "would_block";
}
