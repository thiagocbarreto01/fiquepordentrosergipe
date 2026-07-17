/**
 * UnsavedChangesDialog — diálogo acessível de proteção contra perda.
 * Usado com useNavigationGuard.
 */

import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export function UnsavedChangesDialog({
  open, onContinueEditing, onDiscard,
}: {
  open: boolean;
  onContinueEditing: () => void;
  onDiscard: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={(o) => { if (!o) onContinueEditing(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Você tem alterações não salvas</AlertDialogTitle>
          <AlertDialogDescription>
            Sair agora vai descartar o que você ainda não enviou ao servidor.
            O rascunho local (neste navegador) é mantido, mas nada será enviado ao banco.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onContinueEditing}>Continuar editando</AlertDialogCancel>
          <AlertDialogAction
            className="bg-red-600 hover:bg-red-700 focus:ring-red-600 text-white"
            onClick={(e) => { e.preventDefault(); onDiscard(); }}
          >
            Descartar alterações e sair
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
