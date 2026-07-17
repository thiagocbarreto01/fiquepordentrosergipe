import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type EditorPrincipalValues = {
  title: string;
  subtitle: string;
  category_id: string;
  tags: string;
};

export type EditorPrincipalCategory = { id: string; name: string };

export interface EditorPrincipalSectionProps {
  values: EditorPrincipalValues;
  categories: EditorPrincipalCategory[];
  /** Assinatura pública exibida no site (não editável nesta passada). */
  publicByline?: string;
  /**
   * Callback chamado quando um dos campos é alterado pelo usuário.
   * O AdminPostEditor decide se dispara `dirty` / autosave.
   */
  onChange: (patch: Partial<EditorPrincipalValues>) => void;
}

/**
 * Seção Principal do Editor de Notícia.
 * Contém: título, subtítulo, categoria, assinatura pública e tags.
 *
 * IMPORTANTE:
 * - Componente puramente visual: não consulta banco, não salva, não navega.
 * - Não altera `author_id`. A assinatura é apenas informativa.
 * - Slug NÃO faz parte desta seção (será movido em passada futura).
 */
export function EditorPrincipalSection({
  values,
  categories,
  publicByline = "Redação Fique Por Dentro Sergipe",
  onChange,
}: EditorPrincipalSectionProps) {
  return (
    <section
      aria-label="Informações principais da notícia"
      className="bg-card border border-border p-4 space-y-4"
    >
      <h3 className="font-bold uppercase tracking-wider text-xs">
        1. Informações principais
      </h3>

      <div>
        <Label htmlFor="editor-title">Título *</Label>
        <Input
          id="editor-title"
          value={values.title}
          onChange={(e) => onChange({ title: e.target.value })}
        />
      </div>

      <div>
        <Label htmlFor="editor-subtitle">Subtítulo</Label>
        <Input
          id="editor-subtitle"
          value={values.subtitle ?? ""}
          onChange={(e) => onChange({ subtitle: e.target.value })}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <Label htmlFor="editor-category">Categoria</Label>
          <Select
            value={values.category_id ?? ""}
            onValueChange={(v) => onChange({ category_id: v })}
          >
            <SelectTrigger id="editor-category" className="mt-1">
              <SelectValue placeholder="Selecione" />
            </SelectTrigger>
            <SelectContent>
              {categories.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor="editor-tags">Tags (separadas por vírgula)</Label>
          <Input
            id="editor-tags"
            className="mt-1"
            value={values.tags ?? ""}
            onChange={(e) => onChange({ tags: e.target.value })}
            placeholder="Ex.: aracaju, política, saúde"
          />
        </div>
      </div>

      <div
        className="rounded-md border border-dashed border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground"
        aria-label="Assinatura pública da notícia"
      >
        <span className="font-semibold uppercase tracking-wide text-[10px] block text-foreground/70">
          Assinatura pública
        </span>
        <span className="text-sm text-foreground/90">{publicByline}</span>
        <p className="mt-1 text-[11px] leading-snug">
          Todas as notícias publicadas exibem esta assinatura no site. Alterações
          de autoria dependem de configuração futura e não podem ser feitas aqui.
        </p>
      </div>
    </section>
  );
}
