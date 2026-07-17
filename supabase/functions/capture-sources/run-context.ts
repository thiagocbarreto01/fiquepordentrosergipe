// F3D.3A.2 — Contexto por run + wrapper central de fetch das fontes.
//
// Este módulo é o ÚNICO ponto por onde os fetches externos das fontes
// devem passar. Ele delega ao shadow-adapter para decidir entre safeFetch
// e fetch legado. Em `mode = "off"` (padrão atual em produção), o wrapper
// executa somente o `legacyFetch` — não consulta allowlist, não chama
// safeFetch e não emite telemetria.
//
// Invariantes:
//   • cache de allowlist estritamente por run (nunca global);
//   • fetch legado preserva 100% do comportamento anterior — sem
//     alterações de headers, timeout, redirect, decodificação ou parser;
//   • wrapper devolve `string` (mesma superfície que o legado devolvia);
//   • Lovable AI Gateway NÃO passa por este módulo.
//
// Nada aqui persiste no banco, chama IA ou decide status editorial.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import {
  type AllowlistCache,
  evaluateMediaHostShadow,
  hashSourceId,
  loadAllowlistForSource,
  newAllowlistCache,
  readMode,
  type SafeMode,
  type SafeResult,
  shadowFetchOrFallback,
} from "./shadow-adapter.ts";
import type { Purpose, ResponseKind } from "./safe-fetch.ts";

export interface RunContext {
  requestId: string;
  mode: SafeMode;
  allowlistCache: AllowlistCache;
  // Tipagem larga deliberada — o adapter só consome .from().select().eq().
  // Evita acoplar este módulo ao schema gerado pelo Supabase.
  // deno-lint-ignore no-explicit-any
  supabase: any;
  /** Hash memoizado por source_id, evita recomputar SHA-256 por chamada. */
  sourceIdHashCache: Map<string, string>;
}

export function createRunContext(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  requestId: string,
  env: Record<string, string | undefined> = Deno.env.toObject(),
): RunContext {
  return {
    requestId,
    mode: readMode(env),
    allowlistCache: newAllowlistCache(),
    supabase,
    sourceIdHashCache: new Map(),
  };
}

async function ensureHash(ctx: RunContext, sourceId: string): Promise<string> {
  const cached = ctx.sourceIdHashCache.get(sourceId);
  if (cached) return cached;
  const h = await hashSourceId(sourceId);
  ctx.sourceIdHashCache.set(sourceId, h);
  return h;
}

/**
 * Wrapper central de fetch de conteúdo de fonte (RSS/SITE/artigo).
 *
 * - Em mode=off: chama `legacyFetch` exatamente uma vez, sem tocar em
 *   allowlist nem em safeFetch.
 * - Em mode=shadow: tenta safeFetch; sucesso → devolve texto seguro
 *   (nenhum 2º fetch). Falha estruturada → fallback para `legacyFetch`.
 *
 * A função devolve **string** — o parser a jusante permanece intacto.
 * Se ambos os caminhos falharem, o erro do `legacyFetch` é propagado
 * (mesma superfície operacional de antes da integração).
 */
export async function fetchSourceText(
  ctx: RunContext,
  sourceId: string,
  url: string,
  hostPurpose: Purpose,
  responseKind: ResponseKind,
  legacyFetch: () => Promise<string>,
): Promise<string> {
  // Fast path — comportamento efetivo idêntico ao anterior à integração.
  if (ctx.mode === "off") {
    return await legacyFetch();
  }

  const sourceIdHash = await ensureHash(ctx, sourceId);
  // deno-lint-ignore no-explicit-any
  const allowlist = await loadAllowlistForSource(
    ctx.supabase as any,
    sourceId,
    ctx.allowlistCache,
  );

  const result = await shadowFetchOrFallback({
    requestId: ctx.requestId,
    sourceId,
    sourceIdHash,
    url,
    hostPurpose,
    responseKind,
    mode: ctx.mode,
    allowlist,
    legacyFetch,
  });

  const text = result.text ?? result.legacyText;
  if (typeof text !== "string") {
    // Defesa em profundidade — não deveria acontecer.
    throw new Error("fetchSourceText: sem conteúdo (safe e legado ausentes)");
  }
  return text;
}

/**
 * Avaliação lexical de mídia (sem download). Em `off`, retorna
 * `"not_evaluated"` sem consultar allowlist. Nunca bloqueia; a URL da
 * capa segue sendo persistida pelo call site como antes.
 */
export async function evaluateMediaHost(
  ctx: RunContext,
  sourceId: string,
  imageUrl: string | null | undefined,
): Promise<SafeResult> {
  if (ctx.mode === "off" || !imageUrl) return "not_evaluated";

  const sourceIdHash = await ensureHash(ctx, sourceId);
  // deno-lint-ignore no-explicit-any
  const allowlist = await loadAllowlistForSource(
    ctx.supabase as any,
    sourceId,
    ctx.allowlistCache,
  );
  return evaluateMediaHostShadow({
    requestId: ctx.requestId,
    sourceIdHash,
    sourceId,
    imageUrl,
    allowlist,
    mode: ctx.mode,
  });
}
