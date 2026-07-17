import type { EditorialStatus } from "@/lib/statusFlow";
import { normalizeStatus } from "@/lib/statusFlow";
import {
  Edit, CheckCircle2, Globe, Eye, ArchiveRestore, AlertOctagon, PenLine,
  type LucideIcon,
} from "lucide-react";

export type PrimaryActionKind =
  | "continue_edit"
  | "approve"
  | "publish"
  | "open_portal"
  | "restore"
  | "review_duplicate"
  | "edit";

export interface PrimaryActionSpec {
  kind: PrimaryActionKind;
  label: string;
  icon: LucideIcon;
  /** Classe visual sugerida para o botão principal. */
  className?: string;
  /** URL externa (portal) quando aplicável. */
  href?: string;
}

/**
 * Regra única de "ação principal" por status. Usada tanto pela tabela desktop
 * quanto pelos cartões mobile para garantir consistência.
 *
 * IMPORTANTE (Passada 2): esta função NÃO executa a ação nem substitui os
 * confirm() legados. Apenas decide qual é o botão principal exibido; o
 * callback continua sendo responsabilidade do chamador.
 */
export function getPrimaryAction(post: {
  status?: string | null;
  slug?: string | null;
}): PrimaryActionSpec {
  const s = normalizeStatus(post.status);
  switch (s) {
    case "captada":
      // Rascunhos legados também caem aqui (normalizeStatus normaliza "rascunho" → "captada").
      return {
        kind: "approve",
        label: "Aprovar",
        icon: CheckCircle2,
        className: "bg-amber-600 hover:bg-amber-700 text-white",
      };
    case "pronta_para_revisao":
    case "em_revisao":
      return {
        kind: "approve",
        label: "Aprovar",
        icon: CheckCircle2,
        className: "bg-amber-600 hover:bg-amber-700 text-white",
      };
    case "aprovada":
      return {
        kind: "publish",
        label: "Publicar",
        icon: Globe,
        className: "bg-emerald-600 hover:bg-emerald-700 text-white",
      };
    case "publicada":
      return {
        kind: "open_portal",
        label: "Abrir no portal",
        icon: Eye,
        className: "bg-sky-700 hover:bg-sky-800 text-white",
        href: post.slug ? `/noticia/${post.slug}` : undefined,
      };
    case "arquivada":
      return {
        kind: "restore",
        label: "Restaurar",
        icon: ArchiveRestore,
        className: "bg-emerald-600 hover:bg-emerald-700 text-white",
      };
    case "duplicada":
      return {
        kind: "review_duplicate",
        label: "Revisar",
        icon: AlertOctagon,
        className: "bg-orange-600 hover:bg-orange-700 text-white",
      };
    case "rejeitada":
      return {
        kind: "edit",
        label: "Editar",
        icon: PenLine,
        className: "bg-slate-700 hover:bg-slate-800 text-white",
      };
    default:
      return { kind: "edit", label: "Editar", icon: Edit };
  }
}

/** Opções de ordenação persistíveis na URL. */
export type PostSortColumn = "published_at" | "captured_at" | "views" | "title";
export type PostSortDir = "asc" | "desc";

export const SORT_OPTIONS: { value: PostSortColumn; label: string }[] = [
  { value: "published_at", label: "Publicação" },
  { value: "captured_at", label: "Captura" },
  { value: "views", label: "Visualizações" },
  { value: "title", label: "Título" },
];

export const DEFAULT_SORT: PostSortColumn = "published_at";
export const DEFAULT_DIR: PostSortDir = "desc";
