// F3D.3A — Modo sombra para integração progressiva do safeFetch.
//
// Regras invariantes:
//   • modo determinado no servidor via SOURCE_SAFE_FETCH_MODE
//     (valores válidos: "off" | "shadow"; qualquer outro cai em "off").
//   • enforce NÃO é ativável nesta fase; o parser aceita o token mas
//     mode() nunca retorna "enforce".
//   • em shadow: tenta safeFetch primeiro; se erro estruturado → fallback
//     legado; se sucesso → usa bytes seguros sem 2º fetch.
//   • telemetria estruturada e SEM PII (sem URL, sem path, sem qs, sem IP).
//
// Fora de escopo (F3D.3A): download real de mídia (o fluxo atual só
// armazena URLs); apenas validação lexical do hostname contra allowlist.

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
} from "./safe-fetch.ts";

export type SafeMode = "off" | "shadow" | "enforce";

export function readMode(env: Record<string, string | undefined>): SafeMode {
  const raw = (env.SOURCE_SAFE_FETCH_MODE ?? "").trim().toLowerCase();
  if (raw === "shadow") return "shadow";
  // enforce e valores inválidos caem para off nesta fase.
  return "off";
}

export type Transport = "safe" | "legacy_fallback";
export type SafeResult =
  | "allowed"
  | "would_block"
  | "not_evaluated"
  | "allowlist_load_failed";

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
  final_hostname?: string;
}

/** Hash não reversível curto do source_id — não é PII do usuário. */
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

/**
 * Emite um evento de telemetria sanitizado. Somente console estruturado
 * nesta fase — sem tabela de persistência.
 */
export function logShadow(ev: ShadowEvent): void {
  // JSON de linha única, prefixo para grep. Nada de URL/IP/conteúdo.
  console.log(`[shadow] ${JSON.stringify(ev)}`);
}

export interface AllowlistCache {
  bySource: Map<string, AllowedHost[]>;
  loadErrors: Set<string>;
}

export function newAllowlistCache(): AllowlistCache {
  return { bySource: new Map(), loadErrors: new Set() };
}

/**
 * Carrega a allowlist de uma fonte no cache (uma vez por run). Se falhar,
 * marca `loadErrors` — o caller decide (em shadow: fallback legado).
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
    if (error || !data) throw error ?? new Error("empty");
    const hosts: AllowedHost[] = [];
    for (const row of data) {
      const h = normalizeHostname(row.hostname);
      if (!h) continue;
      const p = row.purpose as Purpose;
      if (p !== "feed" && p !== "article" && p !== "media") continue;
      hosts.push({
        source_id: sourceId,
        hostname: h,
        purpose: p,
        allow_subdomains: !!row.allow_subdomains,
      });
    }
    cache.bySource.set(sourceId, hosts);
    return hosts;
  } catch {
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

function decodeBytes(bytes: Uint8Array, contentType: string | null): string {
  // Respeita charset declarado quando reconhecido; fallback UTF-8.
  let charset = "utf-8";
  if (contentType) {
    const m = /charset=([^;]+)/i.exec(contentType);
    if (m) charset = m[1].trim().toLowerCase();
  }
  try {
    return new TextDecoder(charset, { fatal: false }).decode(bytes);
  } catch {
    return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  }
}

/**
 * Ponto único de decisão. Em shadow: tenta safe primeiro, faz fallback
 * legado em erro estruturado. Em off: legado direto.
 */
export async function shadowFetchOrFallback(
  args: ShadowFetchArgs,
): Promise<AdapterResult> {
  const start = performance.now();

  if (args.mode === "off") {
    const legacyText = await args.legacyFetch();
    return { transport: "legacy_fallback", safeResult: "not_evaluated", legacyText };
  }

  // shadow (enforce não é ativável nesta fase — tratado como shadow apenas
  // para segurança; nunca chega aqui pois readMode não retorna "enforce").
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
 * Verificação lexical de mídia (sem download). Usada quando o fluxo real
 * apenas armazena a URL da imagem — não introduz nova requisição.
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
  if (!args.imageUrl) return "not_evaluated";
  let host: string | null = null;
  try {
    host = normalizeHostname(new URL(args.imageUrl).hostname);
  } catch {
    host = null;
  }
  const allowed = !!host &&
    isHostAllowed(host, args.sourceId, "media", args.allowlist);
  const result: SafeResult = allowed ? "allowed" : "would_block";
  logShadow({
    request_id: args.requestId,
    source_id_hash: args.sourceIdHash,
    purpose: "media",
    response_kind: "image",
    mode: args.mode,
    safe_result: result,
    transport: "legacy_fallback",
    final_hostname: allowed ? host! : undefined,
  });
  return result;
}
