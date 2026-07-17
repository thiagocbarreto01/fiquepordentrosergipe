// Helper único de ações do editor por papel + status.
// Consumido pelo painel de publicação (desktop) e pela barra mobile,
// garantindo uma única fonte de verdade para a ação principal.
//
// IMPORTANTE: a UI nunca é a autoridade final. O banco (RLS/RPCs)
// continua sendo a fronteira real. Este helper apenas decide o que
// mostrar/desabilitar para não confundir o usuário.

import type { EditorialStatus } from "@/lib/statusFlow";

export type EditorRole = "redator" | "editor" | "admin";

export type EditorPrimaryActionKind =
  | "save"              // Salvar alterações no status atual
  | "submit_review"     // Redator: enviar rascunho para revisão
  | "publish"           // Editor/admin: abrir PublishDialog e publicar
  | "open_public";      // Publicada: abrir a matéria no portal

export type EditorPrimaryAction = {
  kind: EditorPrimaryActionKind;
  label: string;
  helper?: string;
};

export type EditorSecondaryActionKind =
  | "save_draft"
  | "preview"
  | "submit_review"
  | "send_to_review"
  | "approve"
  | "publish"
  | "unpublish";

export type EditorSecondaryAction = {
  kind: EditorSecondaryActionKind;
  label: string;
  destructive?: boolean;
};

export function deriveEditorRole(opts: { isAdmin: boolean; isEditor?: boolean }): EditorRole {
  if (opts.isAdmin) return "admin";
  if (opts.isEditor) return "editor";
  return "redator";
}

export function canPublishFor(role: EditorRole): boolean {
  return role === "admin" || role === "editor";
}

/**
 * Retorna a ação PRINCIPAL contextual dado (papel × status).
 * Nunca inclui ações reservadas ao editor/admin quando o papel é redator.
 */
export function getPrimaryAction(
  role: EditorRole,
  status: EditorialStatus,
): EditorPrimaryAction {
  const canPublish = canPublishFor(role);

  if (status === "publicada") {
    return canPublish
      ? { kind: "open_public", label: "Abrir no portal" }
      : { kind: "open_public", label: "Abrir no portal" };
  }

  if (!canPublish) {
    // Redator
    if (status === "rascunho") {
      return { kind: "submit_review", label: "Enviar para revisão" };
    }
    // em_revisao / captada / aprovada / etc. → apenas salva alterações
    return { kind: "save", label: "Salvar alterações" };
  }

  // Editor/admin: publica a partir de qualquer estado editável
  return { kind: "publish", label: "Publicar agora" };
}

/**
 * Ações secundárias exibidas em menu/lista. Já filtradas por papel/status.
 * Ordem = ordem de exibição.
 */
export function getSecondaryActions(
  role: EditorRole,
  status: EditorialStatus,
): EditorSecondaryAction[] {
  const canPublish = canPublishFor(role);
  // "Salvar rascunho" só faz sentido literal quando o status é rascunho.
  // Em qualquer outro status, salvar NUNCA rebaixa para rascunho — passa a ser
  // "Salvar alterações" e preserva o status atual (garantido no save()).
  const saveLabel = status === "rascunho" ? "Salvar rascunho" : "Salvar alterações";
  const list: EditorSecondaryAction[] = [
    { kind: "save_draft", label: saveLabel },
    { kind: "preview", label: "Visualizar prévia" },
  ];

  if (canPublish) {
    if (status !== "em_revisao" && status !== "publicada") {
      list.push({ kind: "send_to_review", label: "Enviar para revisão" });
    }
    if (status !== "aprovada" && status !== "publicada") {
      list.push({ kind: "approve", label: "Aprovar" });
    }
    if (status !== "publicada") {
      list.push({ kind: "publish", label: "Publicar agora" });
    } else {
      list.push({ kind: "unpublish", label: "Despublicar", destructive: true });
    }
  } else {
    if (status === "rascunho") {
      // ação principal já cobre; nada extra aqui
    } else if (status !== "publicada") {
      list.push({ kind: "submit_review", label: "Enviar para revisão" });
    }
  }

  return list;
}
