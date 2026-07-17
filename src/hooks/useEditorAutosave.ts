/**
 * useEditorAutosave — autosave LOCAL do rascunho do editor.
 *
 * - Chave: `draft:${user_id}:${post_id || 'new'}`
 * - Nunca grava no banco. Nunca altera status.
 * - Salva com debounce após mudanças reais.
 * - Retorna helpers para hidratar, descartar e checar existência.
 */

import { useCallback, useEffect, useRef, useState } from "react";

type StoredDraft = {
  savedAt: string;
  data: Record<string, unknown>;
};

export function draftKey(userId: string | undefined | null, postId: string | undefined | null) {
  return `fpds:draft:${userId ?? "anon"}:${postId ?? "new"}`;
}

export function useEditorAutosave(opts: {
  userId: string | undefined | null;
  postId: string | undefined | null;
  data: Record<string, unknown>;
  enabled: boolean;
  dirty: boolean;
  debounceMs?: number;
}) {
  const { userId, postId, data, enabled, dirty, debounceMs = 1200 } = opts;
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const timer = useRef<number | null>(null);
  const key = draftKey(userId, postId);

  useEffect(() => {
    if (!enabled || !dirty) return;
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      try {
        const payload: StoredDraft = { savedAt: new Date().toISOString(), data };
        localStorage.setItem(key, JSON.stringify(payload));
        setSavedAt(new Date(payload.savedAt));
      } catch {
        /* quota / disabled — silencioso */
      }
    }, debounceMs);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [key, data, enabled, dirty, debounceMs]);

  const readDraft = useCallback((): StoredDraft | null => {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      return JSON.parse(raw) as StoredDraft;
    } catch {
      return null;
    }
  }, [key]);

  const clearDraft = useCallback(() => {
    try {
      localStorage.removeItem(key);
      setSavedAt(null);
    } catch {
      /* ignore */
    }
  }, [key]);

  return { savedAt, readDraft, clearDraft, key };
}
