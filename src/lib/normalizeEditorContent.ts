// Preserva a formatação do editor no momento da publicação.
//
// Regras:
// - Se o conteúdo já contém tags HTML (p, br, h1-6, ul, ol, li, img, figure, blockquote),
//   é considerado HTML e devolvido intacto (sem reescrever).
// - Caso contrário (texto puro), converte quebras de linha em parágrafos <p>...</p>
//   e quebras simples internas em <br>, garantindo que o layout digitado pelo
//   redator apareça igual na página pública (que renderiza como HTML).
// - Nunca remove nada — apenas envolve. Espaços e pontuação são preservados.

const HTML_BLOCK_TAG_RE = /<\/?(p|h[1-6]|ul|ol|li|img|figure|blockquote|table|tr|td|th|div|section|article|header|footer)\b/i;
const BR_TAG_RE = /<br\s*\/?>/gi;

/**
 * Normaliza o conteúdo do editor antes de salvar ou ao exibir.
 *
 * Regras:
 * 1. Converte <br>, <br/> e <br /> em quebras de linha reais (\n).
 * 2. Se o conteúdo contém tags de bloco HTML, é tratado como HTML e retornado (limpo de <br> literais).
 * 3. Se for texto puro, converte parágrafos (separados por \n\n) em <p> e quebras simples em \n.
 */
export function normalizeEditorContent(input: string): string {
  if (!input) return "";

  // 1. Converter tags <br> literais em quebras de linha reais (Retrocompatibilidade)
  let content = input.replace(BR_TAG_RE, "\n");

  // 2. Se contém tags de bloco, assume que é HTML estruturado (mantém tags, mas remove <br> redundantes)
  if (HTML_BLOCK_TAG_RE.test(content)) {
    return content.trim();
  }

  // 3. Texto puro: Normalizar parágrafos
  const escape = (s: string) =>
    s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

  // Remove espaços extras no início/fim de cada linha
  const lines = content.split("\n").map(line => line.trim());
  
  // Agrupa em parágrafos
  const paragraphs: string[] = [];
  let currentParagraph: string[] = [];

  const isListItem = (line: string) => /^\d+\.?\s+|[•\-\*]\s+/.test(line);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    if (line === "") {
      if (currentParagraph.length > 0) {
        paragraphs.push(currentParagraph.join(" "));
        currentParagraph = [];
      }
      continue;
    }

    // Se for um item de lista, deve ser tratado como parágrafo próprio ou manter sua quebra se estiver dentro de um bloco
    if (isListItem(line)) {
      if (currentParagraph.length > 0) {
        paragraphs.push(currentParagraph.join(" "));
        currentParagraph = [];
      }
      paragraphs.push(line);
      continue;
    }

    // Lógica para detectar se a quebra de linha é artificial (PDF) ou intencional
    // Se a linha atual não termina com pontuação de fim de frase e a próxima linha existe e não é vazia nem lista:
    // Provavelmente é uma quebra artificial do PDF.
    const isEndOfSentence = /[.!?:"”]$/.test(line);
    const nextLine = lines[i + 1];
    const isNextArtificial = nextLine && nextLine !== "" && !isListItem(nextLine);

    currentParagraph.push(line);
    
    if (isEndOfSentence || !isNextArtificial) {
      paragraphs.push(currentParagraph.join(" "));
      currentParagraph = [];
    }
  }
  
  if (currentParagraph.length > 0) {
    paragraphs.push(currentParagraph.join(" "));
  }

  if (paragraphs.length === 0) return "";

  // Retorna com tags <p> para a página pública
  // O espaçamento visual (margin-bottom) deve ser controlado via CSS (.article-content p)
  return paragraphs
    .map((p) => `<p>${escape(p)}</p>`)
    .join("\n\n");
}
