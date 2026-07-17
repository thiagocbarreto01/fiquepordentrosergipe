import { useState } from "react";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

interface Props {
  checked: boolean;
  sourceName: string;
  onToggle: (nextChecked: boolean) => Promise<{ error?: string | null }>;
  onLocalChange: (next: boolean) => void;
  disabled?: boolean;
}

/**
 * Switch de automação com:
 * - trava contra cliques concorrentes
 * - atualização otimista + rollback visual em caso de erro
 * - toasts padronizados
 * Fonte inativa continua disponível para captação manual (botão "Captar agora").
 */
export function SourceAutomationSwitch({
  checked,
  sourceName,
  onToggle,
  onLocalChange,
  disabled,
}: Props) {
  const [saving, setSaving] = useState(false);

  async function handleChange(next: boolean) {
    if (saving || disabled) return;
    setSaving(true);
    // Otimista
    onLocalChange(next);
    try {
      const res = await onToggle(next);
      if (res?.error) {
        // Rollback
        onLocalChange(!next);
        toast.error(`Não foi possível alterar "${sourceName}": ${res.error}`);
      } else {
        toast.success(
          next
            ? `"${sourceName}" marcada para automação`
            : `"${sourceName}" não marcada para automação (captação manual continua disponível)`,
        );
      }
    } catch (e) {
      onLocalChange(!next);
      toast.error(e instanceof Error ? e.message : "Falha inesperada");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Switch
      checked={checked}
      disabled={saving || disabled}
      onCheckedChange={handleChange}
      aria-label={`Automação de ${sourceName}`}
    />
  );
}
