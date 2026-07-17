/**
 * RecoverDraftDialog — aparece ao carregar o editor quando há rascunho local.
 * Nunca aplica automaticamente. Mostra data/hora e oferece recuperar/descartar.
 */

import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export function RecoverDraftDialog({
  open, savedAt, onRecover, onDiscard,
}: {
  open: boolean;
  savedAt: Date | null;
  onRecover: () => void;
  onDiscard: () => void;
}) {
  return (
    <AlertDialog open={open}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Rascunho local encontrado</AlertDialogTitle>
          <AlertDialogDescription>
            Encontramos um rascunho salvo neste navegador
            {savedAt ? <> em <strong>{savedAt.toLocaleString("pt-BR")}</strong></> : null}.
            Ele não foi enviado ao servidor. Você deseja recuperar as alterações
            ou descartar o rascunho e continuar com a versão do servidor?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onDiscard}>Descartar rascunho</AlertDialogCancel>
          <AlertDialogAction onClick={(e) => { e.preventDefault(); onRecover(); }}>
            Recuperar rascunho
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
