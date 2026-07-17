/**
 * Parser seguro para o campo last_run_message de news_sources.
 * Formato conhecido: "N captadas, N duplicatas, N já existiam"
 * Retorna null quando não conseguir parsear com segurança.
 */
export interface ParsedRunSummary {
  captured: number;
  duplicates: number;
  skipped: number;
}

const PATTERN = /(\d+)\s+captadas?,\s*(\d+)\s+duplicatas?,\s*(\d+)\s+j[áa]\s+existiam/i;

export function parseRunMessage(message: string | null | undefined): ParsedRunSummary | null {
  if (!message) return null;
  const m = message.match(PATTERN);
  if (!m) return null;
  return {
    captured: Number(m[1]),
    duplicates: Number(m[2]),
    skipped: Number(m[3]),
  };
}

export type RunResultKind = "ok" | "error" | "never";

export function classifyRunStatus(
  last_run_at: string | null,
  last_run_status: string | null,
): RunResultKind {
  if (!last_run_at) return "never";
  if (last_run_status && last_run_status.toLowerCase() !== "ok") return "error";
  return "ok";
}
