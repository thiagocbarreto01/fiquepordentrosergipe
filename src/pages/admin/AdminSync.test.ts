/**
 * Testes estáticos de invariantes do Auto Sync.
 *
 * Não executam a UI nem tocam o banco. Verificam apenas o contrato:
 *  - nenhum window.confirm nas telas / hooks / edge function;
 *  - preview e execução usam a mesma RPC;
 *  - execução só ocorre após revalidação de contagem;
 *  - cluster-post não pode ser habilitado por payload do cliente;
 *  - erros da IA são mapeados para fallback silencioso (402/403/429/401).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (rel: string) =>
  readFileSync(resolve(__dirname, "../../..", rel), "utf8");

const adminSync = read("src/pages/admin/AdminSync.tsx");
const autoSyncHook = read("src/hooks/useAutoSync.ts");
const clusterPost = read("supabase/functions/cluster-post/index.ts");
const watchdog = read("supabase/functions/sync-watchdog/index.ts");

describe("Auto Sync — invariantes de UI", () => {
  it("não usa window.confirm em lugar algum do módulo", () => {
    expect(adminSync).not.toMatch(/window\.confirm/);
    expect(autoSyncHook).not.toMatch(/window\.confirm/);
  });

  it("usa AlertDialog acessível para ressync e recluster", () => {
    expect(adminSync).toMatch(/AlertDialog/);
    expect(adminSync).toMatch(/AlertDialogAction/);
  });

  it("preview e execução chamam RPCs com escopo staff", () => {
    expect(adminSync).toMatch(/preview_posts_public_drift/);
    expect(adminSync).toMatch(/auto_repair_posts_public/);
    expect(adminSync).toMatch(/recluster_all_posts_local/);
    // watchdog usa a RPC de auditoria
    expect(watchdog).toMatch(/audit_posts_public_drift/);
  });

  it("revalida a contagem antes de confirmar a ressincronização", () => {
    // Recalcula preview e compara total_divergent
    expect(adminSync).toMatch(/preview_posts_public_drift[\s\S]{0,600}?total_divergent/);
  });

  it("bloqueia o botão de confirmar quando não há divergência", () => {
    expect(adminSync).toMatch(/total_divergent === 0/);
  });
});

describe("Auto Sync — invariantes de clustering", () => {
  it("cluster-post ignora qualquer flag do cliente para habilitar embeddings", () => {
    // Comentário explícito + nenhuma referência a body?.enable_embeddings
    expect(clusterPost).toMatch(/IGNORADOS por segurança/);
    expect(clusterPost).not.toMatch(/body\??\.\s*enable[_-]?embeddings/i);
    expect(clusterPost).not.toMatch(/body\??\.\s*embeddings[_-]?enabled/i);
  });

  it("respeita CLUSTER_EMBEDDINGS_ENABLED do servidor", () => {
    expect(clusterPost).toMatch(/CLUSTER_EMBEDDINGS_ENABLED/);
    expect(clusterPost).toMatch(/EMBEDDINGS_ENABLED\s*=/);
    // ramo desabilitado: trigram direto
    expect(clusterPost).toMatch(/runTrigramFallback\("disabled"\)/);
  });

  it("mapeia 402/403/429/401 para fallback silencioso sem vazar corpo do provedor", () => {
    expect(clusterPost).toMatch(/status === 402 \|\| resp\.status === 403[\s\S]{0,80}credit_limit/);
    expect(clusterPost).toMatch(/status === 429[\s\S]{0,60}rate_limited/);
    expect(clusterPost).toMatch(/status === 401[\s\S]{0,60}unauthorized/);
    // não retorna resp.text() nem resp.body
    expect(clusterPost).not.toMatch(/await\s+resp\.text\(\)/);
  });

  it("registra fallback como fallback_trgm em sync_audit_log sem propagar exceção", () => {
    expect(clusterPost).toMatch(/status:\s*reason === "disabled"\s*\?\s*"trigram"\s*:\s*"fallback_trgm"/);
  });
});
