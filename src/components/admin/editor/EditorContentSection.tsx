import { forwardRef, type ReactNode } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import ContentToolbar from "@/components/admin/ContentToolbar";

export type EditorContentValues = {
  content: string;
};

export interface EditorContentSectionProps {
  values: EditorContentValues;
  onChange: (patch: Partial<EditorContentValues>) => void;
  /** Ações de IA/recaptura renderizadas pelo pai (mantém integrações atuais). */
  aiActions?: ReactNode;
  /** Ref do textarea, usado pela ContentToolbar para envolver a seleção. */
  textareaRef: React.RefObject<HTMLTextAreaElement>;
}

/**
 * Seção de Conteúdo.
 *
 * Preserva integralmente o comportamento atual:
 *  - Textarea como fonte única do conteúdo (form.content).
 *  - ContentToolbar existente para envolver a seleção com marcações.
 *  - Não altera HTML/imagens internas/vídeos internos ao montar/desmontar.
 *  - Não roda sanitização client-side implícita.
 *
 * O componente NÃO consulta banco, NÃO salva, NÃO decide permissões.
 */
export const EditorContentSection = forwardRef<HTMLTextAreaElement, EditorContentSectionProps>(
  function EditorContentSection({ values, onChange, aiActions, textareaRef }, _outerRef) {
    const content = values.content ?? "";

    return (
      <section
        aria-label="Conteúdo da notícia"
        className="bg-card border border-border p-4 space-y-3"
      >
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <Label htmlFor="editor-content" className="font-bold uppercase tracking-wider text-xs">
            3. Conteúdo *
          </Label>
          {aiActions && (
            <div className="flex items-center gap-2 flex-wrap">{aiActions}</div>
          )}
        </div>

        <ContentToolbar
          onWrap={(open, close) => {
            const el = textareaRef.current;
            if (!el) return;
            const start = el.selectionStart ?? 0;
            const end = el.selectionEnd ?? 0;
            const before = content.slice(0, start);
            const sel = content.slice(start, end);
            const after = content.slice(end);
            const next = `${before}${open}${sel}${close}${after}`;
            onChange({ content: next });
            requestAnimationFrame(() => {
              el.focus();
              const pos = start + open.length + sel.length + close.length;
              el.setSelectionRange(pos, pos);
            });
          }}
        />

        <Textarea
          id="editor-content"
          ref={textareaRef}
          rows={18}
          value={content}
          onChange={(e) => onChange({ content: e.target.value })}
        />

        <p className="text-xs text-muted-foreground">
          Dica: parágrafos separados por linha em branco são preservados na
          publicação. Use a barra acima para formatação rápida. Imagens e
          vídeos internos ao conteúdo são preservados exatamente como
          escritos — a capa é gerenciada na seção acima.
        </p>
      </section>
    );
  },
);
