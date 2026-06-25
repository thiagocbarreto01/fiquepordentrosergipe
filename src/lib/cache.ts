/**
 * Cache em camadas para o portal:
 * - Memória (Map) com TTL configurável
 * - stale-while-error: se loader falhar e houver cache (mesmo expirado), devolve stale
 * - Snapshot em sessionStorage para sobreviver a F5 quando a API estiver fora
 */

export const TTL = {
  breaking: 10_000,
  trending: 30_000,
  home: 90_000,
  category: 120_000,
  events: 60_000,
} as const;

type Entry<T> = { data: T; ts: number };
const mem = new Map<string, Entry<any>>();
const SS_PREFIX = "fpd:cache:";

function readSnapshot<T>(key: string): Entry<T> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(SS_PREFIX + key);
    return raw ? (JSON.parse(raw) as Entry<T>) : null;
  } catch {
    return null;
  }
}

function writeSnapshot<T>(key: string, entry: Entry<T>) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(SS_PREFIX + key, JSON.stringify(entry));
  } catch {
    /* quota/JSON cycles: ignore */
  }
}

export async function withCache<T>(
  key: string,
  ttlMs: number,
  loader: () => Promise<T>,
): Promise<T> {
  const now = Date.now();
  const hot = mem.get(key) ?? readSnapshot<T>(key);
  if (hot) {
    if (hot !== mem.get(key)) mem.set(key, hot);
    if (now - hot.ts < ttlMs) return hot.data as T;
  }

  try {
    const data = await loader();
    const entry: Entry<T> = { data, ts: now };
    mem.set(key, entry);
    writeSnapshot(key, entry);
    return data;
  } catch (err) {
    if (hot) {
      console.warn(`[cache] loader falhou em "${key}", servindo stale.`, err);
      return hot.data as T;
    }
    throw err;
  }
}

export function invalidateCache(prefix?: string) {
  if (!prefix) {
    mem.clear();
    return;
  }
  for (const k of Array.from(mem.keys())) {
    if (k.startsWith(prefix)) mem.delete(k);
  }
}
