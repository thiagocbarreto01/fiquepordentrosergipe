// Camada compartilhada de segurança para captação HTTP.
// F3D.1 — NÃO integrada aos fluxos reais. Puro/testável, com fetch e DNS
// injetáveis. Responsável por:
//   • validar URL (protocolo, credenciais, porta, hostname);
//   • validar allowlist por (source_id, purpose) sem match ingênuo;
//   • bloquear SSRF (IP literal, faixas privadas/reservadas, sufixos internos);
//   • preflight DNS validando TODOS os A/AAAA resolvidos;
//   • redirect manual com revalidação em cada salto;
//   • limitar tempo (AbortController) e tamanho (Content-Length + stream);
//   • validar MIME por finalidade;
//   • retornar erros estruturados sem vazar URL/IP/headers/conteúdo.
//
// Limitação residual documentada: o preflight DNS não elimina 100% do risco
// de DNS rebinding entre a resolução e o fetch subsequente (janela de corrida).
// Mitigações adicionais (pinning por IP + Host header) são fora de escopo.

// ─────────────────────────────────────────────────────────────────────────────
// Tipos públicos
// ─────────────────────────────────────────────────────────────────────────────

export type Purpose = "feed" | "article" | "media";

export interface AllowedHost {
  source_id: string;
  hostname: string; // normalizado (lowercase, sem trailing dot, sem www.)
  purpose: Purpose;
  allow_subdomains: boolean;
}

export type SafeFetchErrorCode =
  | "invalid_url"
  | "unsupported_protocol"
  | "credentials_not_allowed"
  | "port_not_allowed"
  | "host_not_allowed"
  | "private_destination"
  | "dns_resolution_failed"
  | "redirect_blocked"
  | "redirect_loop"
  | "too_many_redirects"
  | "request_timeout"
  | "response_too_large"
  | "unsupported_content_type"
  | "remote_access_denied"
  | "remote_server_error"
  | "download_failed";

export class SafeFetchError extends Error {
  code: SafeFetchErrorCode;
  constructor(code: SafeFetchErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = "SafeFetchError";
  }
}

export interface DnsRecord {
  family: 4 | 6;
  address: string;
}

export type DnsResolver = (hostname: string) => Promise<DnsRecord[]>;

export interface SafeFetchOptions {
  sourceId: string;
  purpose: Purpose;
  allowedHosts: AllowedHost[];
  maxBytes?: number;
  timeoutMs?: number;
  maxRedirects?: number;
  allowedMimeTypes?: string[];
  fetchFn?: typeof fetch;
  resolveDns?: DnsResolver;
  userAgent?: string;
}

export interface SafeFetchResult {
  status: number;
  contentType: string | null;
  bytes: Uint8Array;
  finalHostname: string; // hostname do último salto validado
  redirectCount: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Defaults por finalidade (F3D.1 apenas propostos — NÃO conectados)
// ─────────────────────────────────────────────────────────────────────────────

export const DEFAULT_TIMEOUT_MS = 15_000;
export const DEFAULT_MAX_REDIRECTS = 5;

export const DEFAULT_MAX_BYTES: Record<Purpose, number> = {
  feed: 5 * 1024 * 1024, // 5 MB
  article: 2 * 1024 * 1024, // 2 MB
  media: 12 * 1024 * 1024, // 12 MB
};

// Formatos comprovadamente usados hoje. Não incluir application/octet-stream.
export const DEFAULT_ALLOWED_MIMES: Record<Purpose, string[]> = {
  feed: [
    "application/rss+xml",
    "application/atom+xml",
    "application/xml",
    "text/xml",
  ],
  article: ["text/html", "application/xhtml+xml"],
  media: ["image/jpeg", "image/png", "image/webp", "image/gif"],
};

// ─────────────────────────────────────────────────────────────────────────────
// Normalização de hostname
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Normaliza um hostname para comparação/armazenamento:
 *   • lowercase; trim; remove trailing dot;
 *   • remove prefixo `www.` (equivalente ao apex);
 *   • rejeita wildcard (`*`) e string vazia.
 */
export function normalizeHostname(input: string | null | undefined): string | null {
  if (!input) return null;
  let h = String(input).trim().toLowerCase();
  if (!h) return null;
  if (h.includes("*")) return null;
  if (h.endsWith(".")) h = h.slice(0, -1);
  if (h.startsWith("www.")) h = h.slice(4);
  if (!h) return null;
  return h;
}

// ─────────────────────────────────────────────────────────────────────────────
// Detecção de IP literal e faixas privadas/reservadas
// ─────────────────────────────────────────────────────────────────────────────

const IPV4_RE = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

export function parseIPv4(host: string): number[] | null {
  const m = IPV4_RE.exec(host);
  if (!m) return null;
  const parts = [m[1], m[2], m[3], m[4]].map((p) => Number(p));
  if (parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)) return null;
  return parts;
}

/** true se `host` é um IPv4/IPv6 literal (independente de ser público ou não). */
export function isIpLiteral(host: string): boolean {
  if (parseIPv4(host) !== null) return true;
  // Colchetes de URL: [::1]
  const inner = host.startsWith("[") && host.endsWith("]") ? host.slice(1, -1) : host;
  if (inner.includes(":")) return true; // heurística: apenas IPv6 tem ':'
  return false;
}

/** Rejeita IPv4 privado/reservado/loopback/link-local/metadata/broadcast. */
export function isPrivateIPv4(parts: number[]): boolean {
  const [a, b, c, d] = parts;
  // metadata AWS/GCP/Azure
  if (a === 169 && b === 254 && c === 169 && d === 254) return true;
  if (a === 0) return true; // 0.0.0.0/8
  if (a === 10) return true; // 10/8
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64/10 (CGNAT)
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16/12
  if (a === 192 && b === 0 && c === 0) return true; // 192.0.0/24
  if (a === 192 && b === 0 && c === 2) return true; // TEST-NET-1
  if (a === 192 && b === 168) return true; // 192.168/16
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
  if (a === 198 && b === 51 && c === 100) return true; // TEST-NET-2
  if (a === 203 && b === 0 && c === 113) return true; // TEST-NET-3
  if (a >= 224 && a <= 239) return true; // multicast
  if (a >= 240) return true; // reservado / broadcast (255)
  return false;
}

/**
 * Rejeita IPv6 loopback/unspecified/link-local/ULA/multicast/documentação e
 * IPv4-mapped/compat com endereços privados.
 * Parser tolerante suficiente para as faixas conhecidas.
 */
export function isPrivateIPv6(addr: string): boolean {
  let a = addr.trim().toLowerCase();
  if (a.startsWith("[") && a.endsWith("]")) a = a.slice(1, -1);
  if (a === "::" || a === "::1") return true;

  // IPv4-mapped/compat: ::ffff:a.b.c.d ou ::a.b.c.d
  const v4mapped = /^(?:::ffff:|::)((?:\d{1,3}\.){3}\d{1,3})$/i.exec(a);
  if (v4mapped) {
    const p = parseIPv4(v4mapped[1]);
    if (!p) return true; // formato inválido → fail-closed
    return isPrivateIPv4(p);
  }

  // Expande "::" para 8 grupos hex
  const groups = expandIPv6(a);
  if (!groups) return true; // formato inválido → fail-closed
  const first = groups[0];
  const firstByte = (first >> 8) & 0xff;

  // fc00::/7 (ULA) — 0xfc or 0xfd
  if ((firstByte & 0xfe) === 0xfc) return true;
  // fe80::/10 (link-local)
  if (firstByte === 0xfe && (groups[0] & 0x00c0) === 0x0080) return true;
  // ff00::/8 (multicast)
  if (firstByte === 0xff) return true;
  // 2001:db8::/32 (documentação)
  if (groups[0] === 0x2001 && groups[1] === 0x0db8) return true;
  // 100::/64 (discard-only)
  if (groups[0] === 0x0100 && groups[1] === 0 && groups[2] === 0 && groups[3] === 0) return true;

  return false;
}

function expandIPv6(a: string): number[] | null {
  if (a.includes(":::")) return null;
  const parts = a.split("::");
  if (parts.length > 2) return null;
  const head = parts[0] ? parts[0].split(":") : [];
  const tail = parts.length === 2 && parts[1] ? parts[1].split(":") : [];
  const missing = 8 - (head.length + tail.length);
  if (parts.length === 1 && head.length !== 8) return null;
  if (parts.length === 2 && missing < 0) return null;
  const fill = parts.length === 2 ? new Array(missing).fill("0") : [];
  const all = [...head, ...fill, ...tail];
  if (all.length !== 8) return null;
  const nums: number[] = [];
  for (const g of all) {
    if (!/^[0-9a-f]{1,4}$/.test(g)) return null;
    nums.push(parseInt(g, 16));
  }
  return nums;
}

/** true se o hostname (literal) resolve como IP privado/reservado. */
export function isPrivateIpLiteral(host: string): boolean {
  const inner = host.startsWith("[") && host.endsWith("]") ? host.slice(1, -1) : host;
  const v4 = parseIPv4(inner);
  if (v4) return isPrivateIPv4(v4);
  if (inner.includes(":")) return isPrivateIPv6(inner);
  return false;
}

const RESERVED_SUFFIXES = [".local", ".internal", ".home", ".lan", ".localhost"];

/** true para nomes internos/reservados que jamais devem ser buscados. */
export function isReservedHostname(host: string): boolean {
  const h = host.toLowerCase();
  if (h === "localhost") return true;
  return RESERVED_SUFFIXES.some((s) => h.endsWith(s));
}

// ─────────────────────────────────────────────────────────────────────────────
// Validação estrutural da URL
// ─────────────────────────────────────────────────────────────────────────────

export interface ValidatedUrl {
  url: URL;
  hostname: string; // normalizado (sem www.)
}

/**
 * Valida a estrutura da URL. Só aceita HTTPS na porta 443, sem credenciais,
 * sem hostname literal privado/reservado, sem sufixos internos.
 */
export function validateUrl(raw: string): ValidatedUrl {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new SafeFetchError("invalid_url", "URL malformada.");
  }
  const proto = u.protocol.toLowerCase();
  if (proto !== "https:") {
    if (proto === "http:") throw new SafeFetchError("unsupported_protocol", "Somente HTTPS é permitido.");
    throw new SafeFetchError("unsupported_protocol", "Protocolo não suportado.");
  }
  if (u.username || u.password) {
    throw new SafeFetchError("credentials_not_allowed", "URL com credenciais não é permitida.");
  }
  if (u.port && u.port !== "443") {
    throw new SafeFetchError("port_not_allowed", "Porta não permitida.");
  }
  const rawHost = u.hostname;
  if (!rawHost) throw new SafeFetchError("invalid_url", "Hostname ausente.");
  if (isIpLiteral(rawHost)) {
    // IP literal: bloqueia se privado; e também bloqueia públicos porque
    // a allowlist é por hostname, nunca por IP.
    if (isPrivateIpLiteral(rawHost)) {
      throw new SafeFetchError("private_destination", "IP literal privado/reservado.");
    }
    throw new SafeFetchError("host_not_allowed", "IP literal não é permitido.");
  }
  if (isReservedHostname(rawHost)) {
    throw new SafeFetchError("private_destination", "Hostname reservado.");
  }
  const norm = normalizeHostname(rawHost);
  if (!norm) throw new SafeFetchError("invalid_url", "Hostname inválido.");
  return { url: u, hostname: norm };
}

// ─────────────────────────────────────────────────────────────────────────────
// Match da allowlist (nunca endsWith ingênuo)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Retorna true se `hostname` (já normalizado) é permitido para o par
 * (sourceId, purpose) segundo a allowlist informada.
 * Regras: exato por padrão; `www.` já removido antes; subdomínios apenas
 * quando o registro tem allow_subdomains=true — e mesmo assim exigindo
 * separador `.` (nunca `evil-example.com` casando com `example.com`).
 */
export function isHostAllowed(
  hostname: string,
  sourceId: string,
  purpose: Purpose,
  allowedHosts: AllowedHost[],
): boolean {
  const h = normalizeHostname(hostname);
  if (!h) return false;
  for (const entry of allowedHosts) {
    if (entry.source_id !== sourceId) continue;
    if (entry.purpose !== purpose) continue;
    const eh = entry.hostname;
    if (h === eh) return true;
    if (entry.allow_subdomains && h.endsWith("." + eh)) return true;
  }
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// Preflight DNS
// ─────────────────────────────────────────────────────────────────────────────

/** Resolver padrão baseado em `Deno.resolveDns`. Nunca loga o endereço. */
export const denoDnsResolver: DnsResolver = async (hostname) => {
  const out: DnsRecord[] = [];
  const tryQuery = async (family: 4 | 6, rrtype: "A" | "AAAA") => {
    try {
      // deno-lint-ignore no-explicit-any
      const anyDeno = (globalThis as any).Deno;
      if (!anyDeno?.resolveDns) return;
      const addrs = (await anyDeno.resolveDns(hostname, rrtype)) as string[];
      for (const a of addrs) out.push({ family, address: a });
    } catch {
      // Ignora falhas por família; o caller decide se resolução total falhou.
    }
  };
  await Promise.all([tryQuery(4, "A"), tryQuery(6, "AAAA")]);
  return out;
};

/**
 * Executa o preflight DNS e valida TODOS os endereços. Se qualquer um for
 * privado/reservado, falha. Se não houver resolução, falha fechado.
 */
export async function assertDnsSafe(hostname: string, resolver: DnsResolver): Promise<void> {
  let records: DnsRecord[];
  try {
    records = await resolver(hostname);
  } catch {
    throw new SafeFetchError("dns_resolution_failed", "Falha na resolução DNS.");
  }
  if (!records.length) {
    throw new SafeFetchError("dns_resolution_failed", "Sem endereços DNS válidos.");
  }
  for (const rec of records) {
    if (rec.family === 4) {
      const p = parseIPv4(rec.address);
      if (!p || isPrivateIPv4(p)) {
        throw new SafeFetchError("private_destination", "Destino resolve para faixa privada/reservada.");
      }
    } else {
      if (isPrivateIPv6(rec.address)) {
        throw new SafeFetchError("private_destination", "Destino resolve para faixa privada/reservada.");
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Content-Type
// ─────────────────────────────────────────────────────────────────────────────

export function parseContentType(header: string | null): string | null {
  if (!header) return null;
  const first = header.split(";")[0]?.trim().toLowerCase();
  return first || null;
}

export function isMimeAllowed(mime: string | null, allowed: string[]): boolean {
  if (!mime) return false;
  return allowed.includes(mime);
}

// ─────────────────────────────────────────────────────────────────────────────
// safeFetch
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Executa um fetch seguro respeitando allowlist, SSRF e limites. Todos os
 * caminhos de rejeição usam códigos estruturados e mensagens sem PII.
 */
export async function safeFetch(rawUrl: string, opts: SafeFetchOptions): Promise<SafeFetchResult> {
  const {
    sourceId,
    purpose,
    allowedHosts,
    maxBytes = DEFAULT_MAX_BYTES[purpose],
    timeoutMs = DEFAULT_TIMEOUT_MS,
    maxRedirects = DEFAULT_MAX_REDIRECTS,
    allowedMimeTypes = DEFAULT_ALLOWED_MIMES[purpose],
    fetchFn = fetch,
    resolveDns = denoDnsResolver,
    userAgent = "FiquePorDentroSE-SafeFetch/1.0",
  } = opts;

  let current = validateUrl(rawUrl);
  if (!isHostAllowed(current.hostname, sourceId, purpose, allowedHosts)) {
    throw new SafeFetchError("host_not_allowed", "Host não permitido para esta fonte/finalidade.");
  }

  const seen = new Set<string>();
  let redirects = 0;

  while (true) {
    const key = current.url.toString();
    if (seen.has(key)) throw new SafeFetchError("redirect_loop", "Loop de redirecionamento detectado.");
    seen.add(key);

    await assertDnsSafe(current.hostname, resolveDns);

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    let res: Response;
    try {
      res = await fetchFn(current.url.toString(), {
        method: "GET",
        redirect: "manual",
        signal: ctrl.signal,
        headers: {
          "User-Agent": userAgent,
          "Accept": allowedMimeTypes.join(", "),
        },
      });
    } catch (e) {
      clearTimeout(timer);
      if ((e as { name?: string })?.name === "AbortError") {
        throw new SafeFetchError("request_timeout", "Tempo de requisição excedido.");
      }
      throw new SafeFetchError("download_failed", "Falha ao contatar destino.");
    }

    // Redirect manual
    if (res.status >= 300 && res.status < 400) {
      // Consome o corpo para evitar leak.
      try { await res.body?.cancel(); } catch { /* noop */ }
      clearTimeout(timer);
      redirects++;
      if (redirects > maxRedirects) {
        throw new SafeFetchError("too_many_redirects", "Excesso de redirecionamentos.");
      }
      const loc = res.headers.get("location");
      if (!loc) throw new SafeFetchError("redirect_blocked", "Redirect sem Location.");
      let nextUrl: string;
      try {
        nextUrl = new URL(loc, current.url).toString();
      } catch {
        throw new SafeFetchError("redirect_blocked", "Location inválido.");
      }
      let next: ValidatedUrl;
      try {
        next = validateUrl(nextUrl);
      } catch (e) {
        if (e instanceof SafeFetchError) {
          // Redirect para destino inseguro: normaliza para redirect_blocked
          // (exceto private_destination, que é informativo).
          if (e.code === "private_destination") throw e;
          throw new SafeFetchError("redirect_blocked", "Redirect para destino não permitido.");
        }
        throw e;
      }
      if (!isHostAllowed(next.hostname, sourceId, purpose, allowedHosts)) {
        throw new SafeFetchError("redirect_blocked", "Redirect para host não permitido.");
      }
      current = next;
      continue;
    }

    // Status finais
    if (res.status === 401 || res.status === 403 || res.status === 429) {
      try { await res.body?.cancel(); } catch { /* noop */ }
      clearTimeout(timer);
      throw new SafeFetchError("remote_access_denied", "Acesso negado pelo destino.");
    }
    if (res.status >= 500) {
      try { await res.body?.cancel(); } catch { /* noop */ }
      clearTimeout(timer);
      throw new SafeFetchError("remote_server_error", "Erro do servidor de origem.");
    }
    if (!res.ok) {
      try { await res.body?.cancel(); } catch { /* noop */ }
      clearTimeout(timer);
      throw new SafeFetchError("download_failed", "Resposta inesperada.");
    }

    const ct = parseContentType(res.headers.get("content-type"));
    if (!isMimeAllowed(ct, allowedMimeTypes)) {
      try { await res.body?.cancel(); } catch { /* noop */ }
      clearTimeout(timer);
      throw new SafeFetchError("unsupported_content_type", "Content-Type não permitido.");
    }

    const cl = res.headers.get("content-length");
    if (cl) {
      const n = Number(cl);
      if (Number.isFinite(n) && n > maxBytes) {
        try { await res.body?.cancel(); } catch { /* noop */ }
        clearTimeout(timer);
        throw new SafeFetchError("response_too_large", "Resposta acima do limite.");
      }
    }

    // Stream com corte por tamanho
    const body = res.body;
    if (!body) {
      clearTimeout(timer);
      return { status: res.status, contentType: ct, bytes: new Uint8Array(), finalHostname: current.hostname, redirectCount: redirects };
    }
    const reader = body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (!value) continue;
        total += value.byteLength;
        if (total > maxBytes) {
          try { await reader.cancel(); } catch { /* noop */ }
          throw new SafeFetchError("response_too_large", "Resposta acima do limite.");
        }
        chunks.push(value);
      }
    } catch (e) {
      clearTimeout(timer);
      if (e instanceof SafeFetchError) throw e;
      if ((e as { name?: string })?.name === "AbortError") {
        throw new SafeFetchError("request_timeout", "Tempo de requisição excedido.");
      }
      throw new SafeFetchError("download_failed", "Falha ao ler resposta.");
    }
    clearTimeout(timer);

    const bytes = new Uint8Array(total);
    let off = 0;
    for (const c of chunks) { bytes.set(c, off); off += c.byteLength; }
    return { status: res.status, contentType: ct, bytes, finalHostname: current.hostname, redirectCount: redirects };
  }
}
