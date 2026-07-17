// Fluxo editorial centralizado
export type EditorialStatus =
  | "rascunho"
  | "captada"
  | "pronta_para_revisao"
  | "em_revisao"
  | "aprovada"
  | "rejeitada"
  | "publicada"
  | "duplicada"
  | "arquivada";

// Fluxo simplificado: "pronta_para_revisao" foi removida da UI padrão.
// O status ainda existe no enum para compatibilidade com posts antigos.
// "rascunho" é o status inicial das notícias criadas manualmente pela rota
// /admin/posts/novo. Captadas automaticamente continuam entrando como "captada".
export const STATUS_ORDER: EditorialStatus[] = [
  "rascunho",
  "captada",
  "em_revisao",
  "aprovada",
  "publicada",
  "duplicada",
  "rejeitada",
  "arquivada",
];

const ALL_STATUSES: EditorialStatus[] = [
  "rascunho",
  "captada",
  "pronta_para_revisao",
  "em_revisao",
  "aprovada",
  "publicada",
  "duplicada",
  "rejeitada",
  "arquivada",
];

export const STATUS_LABEL: Record<EditorialStatus, string> = {
  rascunho: "Rascunho",
  captada: "Captada",
  pronta_para_revisao: "Pronta para revisão",
  em_revisao: "Em revisão",
  aprovada: "Aprovada",
  rejeitada: "Rejeitada",
  publicada: "Publicada",
  duplicada: "Duplicada",
  arquivada: "Arquivada",
};

export const STATUS_COLOR: Record<EditorialStatus, string> = {
  rascunho: "bg-blue-50 text-blue-800 border-blue-200",
  captada: "bg-slate-100 text-slate-800 border-slate-300",
  pronta_para_revisao: "bg-violet-100 text-violet-800 border-violet-300",
  em_revisao: "bg-amber-100 text-amber-800 border-amber-300",
  aprovada: "bg-sky-100 text-sky-800 border-sky-300",
  rejeitada: "bg-red-100 text-red-800 border-red-300",
  publicada: "bg-emerald-100 text-emerald-800 border-emerald-300",
  duplicada: "bg-orange-100 text-orange-800 border-orange-300",
  arquivada: "bg-zinc-200 text-zinc-700 border-zinc-300",
};

export const ARCHIVE_REASON_LABEL: Record<string, string> = {
  manual: "Arquivada manualmente",
  "auto:captada_30d": "Auto: captada > 30 dias",
  "auto:duplicada_15d": "Auto: duplicada > 15 dias",
  "auto:rejeitada_15d": "Auto: rejeitada > 15 dias",
  "auto:em_revisao_60d": "Auto: em revisão > 60 dias",
};

// Normaliza valores antigos do enum.
// IMPORTANTE: "rascunho" agora é um status próprio (usado por notícias
// criadas manualmente). Não é mais mapeado para "captada".
export function normalizeStatus(s: string | null | undefined): EditorialStatus {
  if (!s) return "captada";
  if (s === "revisao") return "em_revisao";
  if (s === "publicado") return "publicada";
  if (ALL_STATUSES.includes(s as EditorialStatus)) return s as EditorialStatus;
  return "captada";
}

export function canApproveOrPublish(role: string | null): boolean {
  return role === "admin" || role === "editor";
}

export const MATCH_REASON_LABEL: Record<string, string> = {
  slug_exato: "Slug idêntico",
  fonte_igual: "Mesma URL de fonte",
  titulo_semelhante: "Título muito semelhante",
};

