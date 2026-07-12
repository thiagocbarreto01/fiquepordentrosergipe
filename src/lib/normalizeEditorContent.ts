// Preserva a formatação do editor no momento da publicação.
//
// Regras:
// - Se o conteúdo já contém tags HTML (p, br, h1-6, ul, ol, li, img, figure, blockquote),
//   é considerado HTML e devolvido intacto (sem reescrever).
// - Caso contrário (texto puro), converte quebras de linha em parágrafos <p>...</p>
//   e quebras simples internas em <br>, garantindo que o layout digitado pelo
//   redator apareça igual na página pública (que renderiza como HTML).
// - Nunca remove nada — apenas envolve. Espaços e pontuação são preservados.

const HTML_TAG_RE = /<\/?(p|br|h[1-6]|ul|ol|li|img|figure|blockquote|table|tr|td|th|strong|em|b|i|a)\b/i;

export function normalizeEditorContent(input: string): string {
  if (!input) return input;
  const trimmed = input.trim();
  if (!trimmed) return trimmed;

  if (HTML_TAG_RE.test(trimmed)) {
    // Já é HTML — preservar exatamente como o editor deixou.
    return trimmed;
  }

  // Texto puro: separar por linhas em branco → parágrafos. Quebras simples viram <br>.
  const escape = (s: string) =>
    s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

  const paragraphs = trimmed
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  if (paragraphs.length === 0) return trimmed;

  return paragraphs
    .map((p) => `<p>${escape(p).replace(/\n/g, "<br>")}</p>`)
    .join("\n");
}
