/**
 * EditorMobileActionBar — barra fixa inferior mobile com safe-area.
 * Aparece apenas em telas < md. Ações mínimas: principal + Visualizar + menu.
 */

import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Eye, MoreVertical } from "lucide-react";

export type EditorMobileActionBarProps = {
  primaryLabel: string;
  onPrimary: () => void;
  onPreview: () => void;
  primaryDisabled?: boolean;
  onSaveDraft?: () => void;
  onUnpublish?: () => void;
  canUnpublish?: boolean;
};

export function EditorMobileActionBar(props: EditorMobileActionBarProps) {
  const {
    primaryLabel, onPrimary, onPreview,
    primaryDisabled, onSaveDraft, onUnpublish, canUnpublish,
  } = props;
  return (
    <div
      className="md:hidden fixed inset-x-0 bottom-0 z-40 bg-background/95 backdrop-blur border-t border-border shadow-lg"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      role="toolbar"
      aria-label="Ações da notícia"
    >
      <div className="flex items-center gap-2 px-3 py-2">
        <Button
          onClick={onPrimary}
          disabled={primaryDisabled}
          className="flex-1 min-h-[44px] bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
        >
          {primaryLabel}
        </Button>
        <Button
          onClick={onPreview}
          variant="outline"
          className="min-h-[44px] min-w-[44px] px-3"
          aria-label="Visualizar"
        >
          <Eye className="h-5 w-5" />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              className="min-h-[44px] min-w-[44px] px-3"
              aria-label="Mais ações"
            >
              <MoreVertical className="h-5 w-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" side="top" className="w-56">
            {onSaveDraft && (
              <DropdownMenuItem onClick={onSaveDraft}>Salvar rascunho</DropdownMenuItem>
            )}
            {canUnpublish && onUnpublish && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-red-600" onClick={onUnpublish}>
                  Despublicar
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
