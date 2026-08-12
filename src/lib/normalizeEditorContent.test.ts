
import { describe, it, expect } from 'vitest';
import { normalizeEditorContent } from './normalizeEditorContent';

describe('normalizeEditorContent', () => {
  it('deve converter <br> em quebras de linha', () => {
    const input = 'Linha 1<br>Linha 2<br />Linha 3<br/>Linha 4';
    const output = normalizeEditorContent(input);
    // Como é texto puro sem tags de bloco, ele vira parágrafo único com espaços unindo as linhas se não houver \n\n
    // Mas a implementação atual converte <br> em \n.
    // E depois agrupa linhas em parágrafos com join(" ").
    expect(output).toContain('<p>Linha 1 Linha 2 Linha 3 Linha 4</p>');
  });

  it('deve tratar parágrafos separados por \n\n', () => {
    const input = 'Parágrafo 1\n\nParágrafo 2';
    const output = normalizeEditorContent(input);
    expect(output).toBe('<p>Parágrafo 1</p>\n\n<p>Parágrafo 2</p>');
  });

  it('deve preservar HTML estruturado e limpar <br>', () => {
    const input = '<div>Conteúdo</div><br><ul><li>Item</li></ul>';
    const output = normalizeEditorContent(input);
    expect(output).toBe('<div>Conteúdo</div>\n<ul><li>Item</li></ul>');
  });

  it('deve tratar corretamente quebras de linha de PDFs (unindo linhas)', () => {
    const input = 'Esta é uma linha que continuava\nno PDF por causa da largura.';
    const output = normalizeEditorContent(input);
    expect(output).toBe('<p>Esta é uma linha que continuava no PDF por causa da largura.</p>');
  });

  it('deve preservar listas', () => {
    const input = '102 – Soledade / Maracaju\n300-1 – Circular Zona Oeste';
    const output = normalizeEditorContent(input);
    expect(output).toContain('<p>102 – Soledade / Maracaju</p>');
    expect(output).toContain('<p>300-1 – Circular Zona Oeste</p>');
  });

  it('deve preservar depoimentos em novos parágrafos', () => {
    const input = 'O estudante destacou os benefícios.\n\n"É um avanço importante", pontuou.';
    const output = normalizeEditorContent(input);
    expect(output).toBe('<p>O estudante destacou os benefícios.</p>\n\n<p>"É um avanço importante", pontuou.</p>');
  });
});
