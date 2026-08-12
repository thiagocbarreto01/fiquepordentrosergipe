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
export function normalizeEditorContent(input) {
    if (!input)
        return "";
    // 1. Converter tags <br> literais em quebras de linha reais (Retrocompatibilidade)
    let content = input.replace(BR_TAG_RE, "\n");
    // 2. Se contém tags de bloco, assume que é HTML estruturado (mantém tags, mas remove <br> redundantes)
    if (HTML_BLOCK_TAG_RE.test(content)) {
        return content.trim();
    }
    // 3. Texto puro: Normalizar parágrafos
    const escape = (s) => s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
    // Remove espaços extras no início/fim de cada linha e une quebras de linha únicas que não formam parágrafos
    // (Opcional: se quisermos ser agressivos na limpeza de PDF, mas aqui focamos no armazenamento limpo)
    const lines = content.split("\n").map(line => line.trim());
    // Agrupa em parágrafos (separados por uma ou mais linhas vazias)
    const paragraphs = [];
    let currentParagraph = [];
    for (const line of lines) {
        if (line === "") {
            if (currentParagraph.length > 0) {
                paragraphs.push(currentParagraph.join(" "));
                currentParagraph = [];
            }
        }
        else {
            currentParagraph.push(line);
        }
    }
    if (currentParagraph.length > 0) {
        paragraphs.push(currentParagraph.join(" "));
    }
    if (paragraphs.length === 0)
        return "";
    // Retorna com tags <p> para a página pública, mas as quebras internas são espaços
    return paragraphs
        .map((p) => `<p>${escape(p)}</p>`)
        .join("\n\n");
}
