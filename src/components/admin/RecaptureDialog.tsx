import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Loader2, RefreshCw } from "lucide-react";

interface Props {
  postId: string;
  currentContent: string;
  onReplace: (newContent: string) => void;
}

interface PreviewData {
  preview: string;
  stats: {
    current_chars: number;
    new_chars: number;
    char_delta: number;
    current_paragraphs: number;
    new_paragraphs: number;
  };
  source_url: string;
}

export default function RecaptureDialog({ postId, currentContent, onReplace }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<PreviewData | null>(null);

  const load = async () => {
    setLoading(true);
    setData(null);
    try {
      const { data: res, error } = await supabase.functions.invoke("recapture-post", {
        body: { post_id: postId },
      });
      if (error) {
        toast.error(error.message || "Falha ao recapturar");
        return;
      }
      if (!res?.success) {
        toast.error(res?.error || "Falha ao recapturar");
        return;
      }
      setData(res as PreviewData);
    } finally {
      setLoading(false);
    }
  };

  const openAndLoad = async () => {
    setOpen(true);
    await load();
  };

  const substituir = () => {
    if (!data) return;
    onReplace(data.preview);
    toast.success("Conteúdo substituído. Revise e salve.");
    setOpen(false);
  };

  const copiar = async () => {
    if (!data) return;
    try {
      await navigator.clipboard.writeText(data.preview);
      toast.success("Conteúdo copiado para a área de transferência");
    } catch {
      toast.error("Falha ao copiar");
    }
  };

  return (
    <>
      <Button type="button" size="sm" variant="outline" onClick={openAndLoad} className="gap-1">
        <RefreshCw className="h-4 w-4" /> Recapturar
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Recaptura assistida</DialogTitle>
          </DialogHeader>

          {loading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground p-8 justify-center">
              <Loader2 className="h-4 w-4 animate-spin" /> Buscando conteúdo na fonte…
            </div>
          )}

          {!loading && data && (
            <div className="flex-1 overflow-auto space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm bg-muted/40 border rounded p-3">
                <div>
                  <div className="text-xs uppercase text-muted-foreground">Atual</div>
                  <div className="font-semibold">{data.stats.current_chars} chars · {data.stats.current_paragraphs} parágrafos</div>
                </div>
                <div>
                  <div className="text-xs uppercase text-muted-foreground">Recapturado</div>
                  <div className="font-semibold">
                    {data.stats.new_chars} chars · {data.stats.new_paragraphs} parágrafos
                    {data.stats.char_delta !== 0 && (
                      <span className={`ml-2 text-xs ${data.stats.char_delta > 0 ? "text-emerald-600" : "text-red-600"}`}>
                        {data.stats.char_delta > 0 ? "+" : ""}{data.stats.char_delta}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div>
                <div className="text-xs uppercase text-muted-foreground mb-1">Preview</div>
                <div className="border rounded p-3 whitespace-pre-wrap text-sm max-h-[45vh] overflow-auto bg-background">
                  {data.preview}
                </div>
                <div className="text-xs text-muted-foreground mt-2 break-all">Fonte: {data.source_url}</div>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 pt-2 border-t">
            <Button variant="ghost" onClick={() => setOpen(false)}>Manter atual</Button>
            <Button variant="outline" onClick={copiar} disabled={!data}>Copiar</Button>
            <Button onClick={substituir} disabled={!data} className="bg-emerald-600 hover:bg-emerald-700 text-white">
              Substituir conteúdo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
