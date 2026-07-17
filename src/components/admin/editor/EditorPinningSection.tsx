import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Pin, PinOff, Loader2 } from "lucide-react";

/**
 * Fixação temporária da manchete via RPCs seguras.
 * Reutiliza infraestrutura existente:
 *  - colunas: posts.pinned_until / pinned_slot / pinned_reason / pinned_by
 *  - RPCs:    public.pin_post_to_home / public.unpin_post_from_home
 * Nunca grava pinned_* diretamente pelo cliente.
 */
export interface EditorPinningSectionProps {
  postId: string | null;
  isPublished: boolean;
  canManage: boolean;
  pinnedUntil: string | null;
  pinnedReason: string | null;
  onChanged: () => void;
}

const PRESETS = [
  { label: "2h", h: 2 },
  { label: "6h", h: 6 },
  { label: "12h", h: 12 },
  { label: "24h", h: 24 },
];

export function EditorPinningSection({
  postId, isPublished, canManage, pinnedUntil, pinnedReason, onChanged,
}: EditorPinningSectionProps) {
  const [open, setOpen] = useState(false);
  const [hours, setHours] = useState<number>(6);
  const [customUntil, setCustomUntil] = useState<string>("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [unpinOpen, setUnpinOpen] = useState(false);

  const activeUntil = pinnedUntil ? new Date(pinnedUntil) : null;
  const isActive = !!activeUntil && activeUntil.getTime() > Date.now();

  if (!canManage) return null;

  if (!postId || !isPublished) {
    return (
      <div className="rounded-md border border-dashed border-border bg-secondary/20 p-3 text-xs text-muted-foreground">
        A fixação temporária da manchete fica disponível apenas após a publicação da notícia.
      </div>
    );
  }

  const openPreset = (h: number) => {
    setHours(h);
    setCustomUntil("");
    setReason("");
    setOpen(true);
  };

  const openCustom = () => {
    setHours(0);
    setCustomUntil("");
    setReason("");
    setOpen(true);
  };

  const resolvedHours = (): number | null => {
    if (customUntil) {
      const d = new Date(customUntil);
      if (isNaN(d.getTime())) return null;
      const diffMs = d.getTime() - Date.now();
      const h = Math.ceil(diffMs / 3600_000);
      if (h < 1 || h > 24) return null;
      return h;
    }
    return hours >= 1 && hours <= 24 ? hours : null;
  };

  const confirmPin = async () => {
    if (busy) return;
    const h = resolvedHours();
    if (!h) {
      toast.error("Prazo inválido. Máximo 24 horas.");
      return;
    }
    if (reason.trim().length < 3) {
      toast.error("Informe um motivo (mínimo 3 caracteres).");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.rpc("pin_post_to_home" as any, {
        _post_id: postId,
        _hours: h,
        _reason: reason.trim(),
        _slot: "manchete",
      });
      if (error) throw error;
      toast.success(`Manchete fixada por ${h}h.`);
      setOpen(false);
      onChanged();
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao fixar");
    } finally {
      setBusy(false);
    }
  };

  const confirmUnpin = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const { error } = await supabase.rpc("unpin_post_from_home" as any, {
        _post_id: postId,
      });
      if (error) throw error;
      toast.success("Fixação removida.");
      setUnpinOpen(false);
      onChanged();
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao remover");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3 rounded-md border border-border bg-secondary/30 p-3">
      <p className="text-[10px] uppercase font-black tracking-widest text-muted-foreground">
        Fixação temporária da manchete
      </p>

      {isActive && activeUntil ? (
        <div className="space-y-2">
          <p className="text-xs">
            <Pin className="inline h-3.5 w-3.5 mr-1" />
            Fixada até{" "}
            <strong>
              {activeUntil.toLocaleString("pt-BR", { timeZone: "America/Maceio" })}
            </strong>
          </p>
          {pinnedReason && (
            <p className="text-[11px] text-muted-foreground italic">
              Motivo: {pinnedReason}
            </p>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setUnpinOpen(true)}
            disabled={busy}
            className="min-h-[44px] md:min-h-9"
          >
            <PinOff className="h-4 w-4 mr-1.5" />
            Remover fixação
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-[11px] text-muted-foreground">
            Fixe esta notícia como manchete por até 24 horas. Requer motivo.
          </p>
          <div className="grid grid-cols-4 gap-1.5">
            {PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => openPreset(p.h)}
                className="text-[11px] font-bold uppercase tracking-wider bg-white hover:bg-primary hover:text-primary-foreground border border-border rounded-sm py-2 transition-colors min-h-[44px] md:min-h-0"
              >
                {p.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={openCustom}
            className="text-[11px] font-semibold text-primary hover:underline"
          >
            Data/hora personalizada (até 24h)
          </button>
        </div>
      )}

      <AlertDialog open={open} onOpenChange={(v) => !busy && setOpen(v)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Fixar como manchete</AlertDialogTitle>
            <AlertDialogDescription>
              Esta notícia ficará fixada na manchete por até 24 horas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3">
            {hours === 0 && (
              <div className="space-y-1">
                <Label className="text-xs font-bold">Fixar até</Label>
                <Input
                  type="datetime-local"
                  value={customUntil}
                  onChange={(e) => setCustomUntil(e.target.value)}
                />
              </div>
            )}
            {hours > 0 && (
              <p className="text-xs">
                Duração: <strong>{hours}h</strong>
              </p>
            )}
            <div className="space-y-1">
              <Label className="text-xs font-bold">Motivo (obrigatório)</Label>
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Ex.: Cobertura de última hora"
                rows={2}
              />
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); confirmPin(); }}
              disabled={busy}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Pin className="h-4 w-4 mr-1.5" />}
              Fixar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={unpinOpen} onOpenChange={(v) => !busy && setUnpinOpen(v)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover fixação?</AlertDialogTitle>
            <AlertDialogDescription>
              A notícia deixará de ser manchete fixa e voltará à ordenação normal da Home.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); confirmUnpin(); }}
              disabled={busy}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <PinOff className="h-4 w-4 mr-1.5" />}
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
