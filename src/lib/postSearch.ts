/**
 * Utilitários de busca segura para /admin/posts.
 *
 * Dois níveis de sanitização:
 *
 * 1) `sanitizeSearch(raw)` — remove caracteres que quebram o parser do
 *    filtro composto `.or(...)` do PostgREST: vírgula, parênteses, aspas
 *    duplas e barra invertida. Retorna o termo "limpo" para uso como
 *    texto normal (ex: exibição em chip, busca em outras colunas).
 *
 * 2) `escapeIlike(term)` — escapa os curingas do ILIKE (`%`, `_` e a
 *    própria barra `\`) para que o termo seja tratado literalmente
 *    dentro do padrão `%...%`. Deve SEMPRE ser aplicado antes de
 *    montar um pattern ILIKE em qualquer coluna.
 */

const OR_UNSAFE = /[,()"\\]/g;

export function sanitizeSearch(raw: string): string {
  return raw.replace(OR_UNSAFE, " ").replace(/\s+/g, " ").trim();
}

export function escapeIlike(term: string): string {
  // Ordem importa: escapar a barra primeiro para não escapar as barras
  // introduzidas em seguida.
  return term.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

// --------------------------------------------------------------------------
// Fuso horário America/Maceio (UTC-3 fixo, sem horário de verão).
// Retorna início e fim (inclusivos) do dia solicitado como ISO em UTC.
// --------------------------------------------------------------------------
export function maceioDayBoundsIso(
  offsetDays = 0,
  reference: Date = new Date(),
): { startIso: string; endIso: string } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Maceio",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(reference);
  const y = Number(parts.find((p) => p.type === "year")!.value);
  const m = Number(parts.find((p) => p.type === "month")!.value);
  const d = Number(parts.find((p) => p.type === "day")!.value) + offsetDays;
  const startIso = new Date(Date.UTC(y, m - 1, d, 3, 0, 0, 0)).toISOString();
  const endIso = new Date(Date.UTC(y, m - 1, d + 1, 2, 59, 59, 999)).toISOString();
  return { startIso, endIso };
}
