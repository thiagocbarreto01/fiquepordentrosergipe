import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Loader2, Sparkles } from "lucide-react";
export default function CompletePostAIDialog({ postId, currentTitle, currentContent, onApply }) {
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [data, setData] = useState(null);
    const load = async () => {
        setLoading(true);
        setData(null);
        try {
            const { data: res, error } = await supabase.functions.invoke("complete-post-ai", {
                body: { post_id: postId, title: currentTitle, content: currentContent },
            });
            if (error) {
                toast.error(error.message || "Falha ao chamar IA");
                return;
            }
            if (!res?.success) {
                toast.error(res?.error || "Falha ao chamar IA");
                return;
            }
            setData(res);
        }
        finally {
            setLoading(false);
        }
    };
    const openAndLoad = async () => {
        setOpen(true);
        await load();
    };
    const aplicar = () => {
        if (!data)
            return;
        // Garante que o conteúdo da IA não venha com <br>
        const cleanContent = data.preview.conteudo.replace(/<br\s*\/?>/gi, "\n");
        onApply({
            ...data.preview,
            conteudo: cleanContent
        });
        toast.success("Aplicado. Revise e salve.");
        setOpen(false);
    };
    return (<>
      <Button type="button" size="sm" variant="outline" onClick={openAndLoad} className="gap-1">
        <Sparkles className="h-4 w-4"/> Completar com IA
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Completar matéria com IA</DialogTitle>
          </DialogHeader>

          {loading && (<div className="flex items-center gap-2 text-sm text-muted-foreground p-8 justify-center">
              <Loader2 className="h-4 w-4 animate-spin"/> A IA está analisando e melhorando a redação…
            </div>)}

          {!loading && data && (<div className="flex-1 overflow-auto space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm bg-muted/40 border rounded p-3">
                <div>
                  <div className="text-xs uppercase text-muted-foreground">Original</div>
                  <div className="font-semibold">{data.stats.original_chars} chars</div>
                </div>
                <div>
                  <div className="text-xs uppercase text-muted-foreground">Após IA</div>
                  <div className="font-semibold">
                    {data.stats.new_chars} chars
                    <span className={`ml-2 text-xs ${data.stats.new_chars >= data.stats.original_chars ? "text-emerald-600" : "text-red-600"}`}>
                      {data.stats.new_chars - data.stats.original_chars > 0 ? "+" : ""}
                      {data.stats.new_chars - data.stats.original_chars}
                    </span>
                  </div>
                </div>
              </div>

              <div>
                <div className="text-xs uppercase text-muted-foreground mb-1">Título sugerido</div>
                <div className="border rounded p-2 text-sm font-semibold bg-background">{data.preview.titulo}</div>
              </div>

              {data.preview.subtitulo && (<div>
                  <div className="text-xs uppercase text-muted-foreground mb-1">Subtítulo</div>
                  <div className="border rounded p-2 text-sm bg-background">{data.preview.subtitulo}</div>
                </div>)}

              {data.preview.resumo && (<div>
                  <div className="text-xs uppercase text-muted-foreground mb-1">Resumo</div>
                  <div className="border rounded p-2 text-sm bg-background">{data.preview.resumo}</div>
                </div>)}

              <div>
                <div className="text-xs uppercase text-muted-foreground mb-1">Conteúdo</div>
                <div className="border rounded p-3 text-sm max-h-[40vh] overflow-auto bg-background prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: data.preview.conteudo }}/>
              </div>

              <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
                ⚠ Confira todos os fatos, nomes, números e datas antes de aplicar. A IA foi orientada a NÃO inventar informações, mas a revisão editorial é obrigatória.
              </div>
            </div>)}

          <DialogFooter className="gap-2 pt-2 border-t">
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={aplicar} disabled={!data} className="bg-emerald-600 hover:bg-emerald-700 text-white">
              Aplicar sugestão
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>);
}
