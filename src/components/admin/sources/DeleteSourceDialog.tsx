import { useEffect, useState } from "react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, AlertTriangle } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  sourceName: string;
  linkedPostsCount: number;
  onConfirm: () => Promise<void>;
}

const CONFIRM_TOKEN = "EXCLUIR";

export function DeleteSourceDialog({
  open,
  onOpenChange,
  sourceName,
  linkedPostsCount,
  onConfirm,
}: Props) {
  const [typed, setTyped] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      setTyped("");
      setSubmitting(false);
    }
  }, [open]);

  const canConfirm = typed.trim().toUpperCase() === CONFIRM_TOKEN && !submitting;

  async function handleConfirm() {
    if (!canConfirm) return;
    setSubmitting(true);
    try {
      await onConfirm();
      onOpenChange(false);
    } catch {
      // Erro já tratado pelo caller via toast; mantém o diálogo aberto
      setSubmitting(false);
    }
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (submitting) return; // não fecha durante processamento
        onOpenChange(next);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-urgent" />
            Excluir fonte permanentemente
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-sm">
              <p>
                Você está prestes a excluir a fonte{" "}
                <span className="font-bold">"{sourceName}"</span>.
              </p>
              <div className="bg-secondary/50 border border-border p-3 space-y-1">
                <p>
                  <span className="font-bold">{linkedPostsCount}</span>{" "}
                  {linkedPostsCount === 1 ? "notícia vinculada" : "notícias vinculadas"} a esta fonte.
                </p>
                <p className="text-muted-foreground">
                  As notícias <span className="font-semibold">não serão apagadas</span>. O campo{" "}
                  <code className="text-xs bg-background px-1">source_id</code> delas será definido como
                  vazio (a fonte de origem deixará de constar).
                </p>
              </div>
              <p className="font-semibold text-urgent">Esta ação é irreversível.</p>
              <div className="space-y-1.5 pt-1">
                <Label htmlFor="confirm-delete-source" className="text-xs font-bold uppercase tracking-wider">
                  Para confirmar, digite <span className="font-mono">{CONFIRM_TOKEN}</span>
                </Label>
                <Input
                  id="confirm-delete-source"
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  autoComplete="off"
                  autoFocus
                  disabled={submitting}
                  placeholder={CONFIRM_TOKEN}
                />
              </div>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
            className="min-h-[44px]"
          >
            Cancelar
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={!canConfirm}
            className="min-h-[44px]"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Excluindo…
              </>
            ) : (
              "Excluir definitivamente"
            )}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
