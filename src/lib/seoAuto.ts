// Deriva meta_title / meta_description automaticamente APENAS quando estão vazios.
// Nunca sobrescreve valores preenchidos manualmente pelo editor.
// Chamado somente no momento do salvamento — não altera nada ao abrir a notícia.

const META_TITLE_MAX = 60;
const META_DESC_MAX = 160;

function stripHtml(input: string): string {
  return input
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim();
}

/** Corta uma string sem partir palavra, respeitando o limite máximo. */
export function safeTruncate(input: string, max: number): string {
  const s = input.trim();
  if (s.length <= max) return s;
  const slice = s.slice(0, max + 1);
  const lastSpace = slice.lastIndexOf(" ");
  const base = lastSpace > 30 ? slice.slice(0, lastSpace) : slice.slice(0, max);
  return base.replace(/[\s\p{P}]+$/u, "") + "…";
}

export function deriveMetaTitle(title: string): string {
  const clean = stripHtml(title || "");
  return safeTruncate(clean, META_TITLE_MAX);
}

export function deriveMetaDescription(subtitle: string, content: string): string {
  const sub = stripHtml(subtitle || "");
  if (sub.length >= 40) return safeTruncate(sub, META_DESC_MAX);
  // Primeiro parágrafo do conteúdo
  const bodyHtml = content || "";
  const firstPara = (() => {
    const m = bodyHtml.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
    if (m) return stripHtml(m[1]);
    return stripHtml(bodyHtml).split(/\n{2,}|\.\s+/)[0] || "";
  })();
  const merged = [sub, firstPara].filter(Boolean).join(" ").trim();
  return safeTruncate(merged, META_DESC_MAX);
}

/**
 * Retorna somente os campos SEO que devem ser gravados. Valores manuais
 * (não vazios) são preservados. Retorna objeto vazio se nada deve mudar.
 */
export function fillMissingSeo(form: {
  title?: string | null;
  subtitle?: string | null;
  content?: string | null;
  meta_title?: string | null;
  meta_description?: string | null;
}): { meta_title?: string; meta_description?: string } {
  const patch: { meta_title?: string; meta_description?: string } = {};
  const currentTitle = (form.meta_title || "").trim();
  const currentDesc = (form.meta_description || "").trim();
  if (!currentTitle && form.title) {
    const v = deriveMetaTitle(form.title);
    if (v) patch.meta_title = v;
  }
  if (!currentDesc) {
    const v = deriveMetaDescription(form.subtitle || "", form.content || "");
    if (v) patch.meta_description = v;
  }
  return patch;
}
