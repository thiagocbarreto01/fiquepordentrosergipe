import { MoreVertical, Edit, Eye, RefreshCcw, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import type { SourceActionPermissions } from "./permissions";

interface Props {
  sourceName: string;
  canRunNow: boolean;
  running: boolean;
  permissions: SourceActionPermissions;
  onEdit: () => void;
  onViewConfig: () => void;
  onRunNow: () => void;
  onDelete: () => void;
}

export function SourceActionsMenu({
  sourceName,
  canRunNow,
  running,
  permissions,
  onEdit,
  onViewConfig,
  onRunNow,
  onDelete,
}: Props) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Ações para a fonte ${sourceName}`}
          className="min-h-11 min-w-11"
        >
          <MoreVertical className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="text-xs truncate">{sourceName}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onViewConfig}>
          <Eye className="h-4 w-4 mr-2" /> Ver configuração
        </DropdownMenuItem>
        {permissions.canEdit && (
          <DropdownMenuItem onClick={onEdit}>
            <Edit className="h-4 w-4 mr-2" /> Editar
          </DropdownMenuItem>
        )}
        {canRunNow && permissions.canCapture && (
          <DropdownMenuItem onClick={onRunNow} disabled={running}>
            {running ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <RefreshCcw className="h-4 w-4 mr-2" />
            )}
            Executar somente esta fonte
          </DropdownMenuItem>
        )}
        {permissions.canDelete && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={onDelete}
              className="text-urgent focus:text-urgent focus:bg-urgent/10"
            >
              <Trash2 className="h-4 w-4 mr-2" /> Excluir
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
