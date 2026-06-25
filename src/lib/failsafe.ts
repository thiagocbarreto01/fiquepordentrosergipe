/**
 * Failsafe — Last Known Good State.
 *
 * Camadas:
 *  1. Tenta loader normal.
 *  2. Em erro/vazio → cache `sessionStorage`.
 *  3. Em erro/vazio → snapshot `localStorage` (persistente entre sessões).
 *  4. Em erro total → fallback estático passado pelo chamador.
 *
 * Toda render bem-sucedida com dados não-vazios grava o snapshot.
 */

const SS_PREFIX = "fpd:lkg:ss:";
const LS_PREFIX = "fpd:lkg:ls:";

type Snapshot<T> = { data: T; ts: number };

function read<T>(storage: Storage | undefined, prefix: string, key: string): Snapshot<T> | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(prefix + key);
    return raw ? (JSON.parse(raw) as Snapshot<T>) : null;
  } catch {
    return null;
  }
}

function write<T>(storage: Storage | undefined, prefix: string, key: string, data: T) {
  if (!storage) return;
  try {
    storage.setItem(prefix + key, JSON.stringify({ data, ts: Date.now() } satisfies Snapshot<T>));
  } catch {
    /* quota / ssr */
  }
}

const ss = () => (typeof window !== "undefined" ? window.sessionStorage : undefined);
const ls = () => (typeof window !== "undefined" ? window.localStorage : undefined);

function isEmpty(v: unknown): boolean {
  if (v == null) return true;
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === "object") return Object.keys(v as object).length === 0;
  return false;
}

export async function withFailsafe<T>(
  key: string,
  loader: () => Promise<T>,
  staticFallback: T,
): Promise<T> {
  try {
    const data = await loader();
    if (!isEmpty(data)) {
      write(ss(), SS_PREFIX, key, data);
      write(ls(), LS_PREFIX, key, data);
      return data;
    }
    // dado vazio: tenta snapshot
  } catch (err) {
    console.warn(`[failsafe] loader falhou em "${key}":`, err);
  }

  const sessSnap = read<T>(ss(), SS_PREFIX, key);
  if (sessSnap && !isEmpty(sessSnap.data)) return sessSnap.data;

  const persistSnap = read<T>(ls(), LS_PREFIX, key);
  if (persistSnap && !isEmpty(persistSnap.data)) return persistSnap.data;

  return staticFallback;
}

export function saveLkg<T>(key: string, data: T) {
  if (isEmpty(data)) return;
  write(ss(), SS_PREFIX, key, data);
  write(ls(), LS_PREFIX, key, data);
}
