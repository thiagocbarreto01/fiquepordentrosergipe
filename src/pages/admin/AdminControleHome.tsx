import { useEffect, useMemo, useState } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "@/hooks/use-toast";
import {
  getPublishedNoticias,
  subscribeToNoticiasFeed,
} from "@/lib/noticias";
import type { Post } from "@/lib/news";
import { ExternalLink, RefreshCw, Info, Pin, PinOff } from "lucide-react";
import { getPostImage } from "@/lib/postImage";
import { buildSimpleHomeLayout, type SimpleSlot } from "@/lib/simpleHomeLayout";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "react-router-dom";

const TZ = "America/Maceio";

function fmtDate(s: string | null | undefined) {
  if (!s) return "—";
  return new Date(s).toLocaleString("pt-BR", {
    timeZone: TZ,
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function ageLabel(publishedAt: string | null | undefined, now = Date.now()): string {
  if (!publishedAt) return "—";
  const diff = now - new Date(publishedAt).getTime();
  const mins = Math.max(1, Math.round(diff / 60000));
  if (mins < 60) return `${mins} min`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

function SlotCard({ label, slot }: { label: string; slot: SimpleSlot }) {
  const p = slot.post;
  return (
    <Card className="p-4 h-full">
      <div className="flex items-start justify-between gap-2 mb-3">
        <h3 className="font-bold text-base">{label}</h3>
        <div className="flex flex-wrap gap-1 justify-end">
          <Badge variant="outline" className="text-[11px]">{slot.reasonLabel}</Badge>
          {slot.usedFallback48h && (
            <Badge className="bg-amber-500 text-white text-[11px]">Fallback 48h</Badge>
          )}
        </div>
      </div>
      {p ? (
        <div className="flex gap-3">
          <div className="w-28 h-20 bg-muted rounded overflow-hidden flex-shrink-0">
            <img src={getPostImage(p)} alt={p.title} className="w-full h-full object-cover" />
          </div>
          <div className="flex-1 min-w-0">
            <Link to={`/noticia/${p.slug}`} target="_blank" className="text-sm font-bold leading-snug line-clamp-2 hover:text-primary block">
              {p.title}
            </Link>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1.5 text-[11px] text-muted-foreground">
              {p.categories?.name && (
                <span className="font-semibold uppercase text-primary">{p.categories.name}</span>
              )}
              <span>• {fmtDate(p.published_at)}</span>
              <span>• {ageLabel(p.published_at)}</span>
              {slot.recentViews != null && <span>• {slot.recentViews} views 24h</span>}
            </div>
            <Button asChild variant="link" size="sm" className="px-0 h-auto mt-1.5 min-h-[44px] md:min-h-0">
              <a href={`/noticia/${p.slug}`} target="_blank" rel="noreferrer">
                <ExternalLink className="h-3.5 w-3.5 mr-1" /> Abrir matéria
              </a>
            </Button>
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground italic">{slot.reasonLabel}</p>
      )}
    </Card>
  );
}

export default function AdminControleHome() {
  const [published, setPublished] = useState<Post[]>([]);
  const [loadedAt, setLoadedAt] = useState<Date>(new Date());
  const [pinOpen, setPinOpen] = useState(false);
  const [pinHours, setPinHours] = useState<number>(2);
  const [pinReason, setPinReason] = useState("");
  const [pinning, setPinning] = useState(false);
  const [unpinning, setUnpinning] = useState(false);

  const load = async () => {
    const l = await getPublishedNoticias(120);
    setPublished(l);
    setLoadedAt(new Date());
  };

  useEffect(() => {
    load();
    return subscribeToNoticiasFeed(load);
  }, []);

  // Sem histórico temporal de views → mapa vazio, cai em recência.
  const layout = useMemo(
    () => buildSimpleHomeLayout(published, {}, Date.now()),
    [published, loadedAt],
  );

  const manchete = layout.manchete;
  const mancheteIsPinned = manchete.reason === "fixada_manual";
  const now = Date.now();
  const pinnedUntil = manchete.post?.pinned_until
    ? new Date(manchete.post.pinned_until)
    : null;

  const openPinDialog = (hours: number) => {
    setPinHours(hours);
    setPinReason("");
    setPinOpen(true);
  };

  const confirmPin = async () => {
    if (!manchete.post) return;
    if (pinning) return;
    if (pinReason.trim().length < 3) {
      toast({ title: "Informe o motivo", description: "Mínimo de 3 caracteres.", variant: "destructive" });
      return;
    }
    if (pinHours < 1 || pinHours > 24) {
      toast({ title: "Prazo inválido", description: "Fixação de 1 a 24 horas.", variant: "destructive" });
      return;
    }
    setPinning(true);
    try {
      const { error } = await supabase.rpc("pin_post_to_home" as any, {
        _post_id: manchete.post.id,
        _hours: pinHours,
        _reason: pinReason.trim(),
        _slot: "manchete",
      });
      if (error) throw error;
      toast({ title: "Manchete fixada", description: `Por ${pinHours}h.` });
      setPinOpen(false);
      await load();
    } catch (e: any) {
      toast({ title: "Erro ao fixar", description: e?.message ?? "Falha", variant: "destructive" });
    } finally {
      setPinning(false);
    }
  };

  const doUnpin = async () => {
    if (!manchete.post || unpinning) return;
    setUnpinning(true);
    try {
      const { error } = await supabase.rpc("unpin_post_from_home" as any, {
        _post_id: manchete.post.id,
      });
      if (error) throw error;
      toast({ title: "Fixação removida" });
      await load();
    } catch (e: any) {
      toast({ title: "Erro ao remover", description: e?.message ?? "Falha", variant: "destructive" });
    } finally {
      setUnpinning(false);
    }
  };

  const finalPinDate = new Date(now + pinHours * 3600_000);

  return (
    <AdminLayout>
      <div className="space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-black tracking-tight">Controle da Home</h1>
            <p className="text-sm text-muted-foreground max-w-2xl">
              Regra simples: <strong>Plantão → Fixação manual → Notícia com menos de 2h → Mais vista em 24h → Mais recente.</strong>
            </p>
          </div>
          <div className="flex gap-2 items-center flex-wrap">
            <span className="text-[11px] text-muted-foreground hidden md:inline">
              Atualizado às {loadedAt.toLocaleTimeString("pt-BR", { timeZone: TZ })}
            </span>
            <Button variant="default" size="sm" onClick={load} className="min-h-[44px] md:min-h-0">
              <RefreshCw className="h-4 w-4 mr-1.5" /> Atualizar
            </Button>
            <Button variant="outline" size="sm" asChild className="min-h-[44px] md:min-h-0">
              <a href="/" target="_blank" rel="noreferrer">
                <ExternalLink className="h-4 w-4 mr-1.5" /> Abrir Home
              </a>
            </Button>
          </div>
        </header>

        {!layout.hasRecentViewsHistory && (
          <Card className="p-3 border-blue-200 bg-blue-50/40 text-sm text-blue-900 flex items-start gap-2">
            <Info className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <span>Sem histórico de visualizações de 24h — seleção usando recência.</span>
          </Card>
        )}

        {/* Manchete atual */}
        <Card className="p-4 border-primary/30 bg-primary/5">
          <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
            <div>
              <h2 className="text-sm font-bold uppercase tracking-wider text-primary">Manchete atual</h2>
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                <Badge variant="outline">{manchete.reasonLabel}</Badge>
                {manchete.usedFallback48h && (
                  <Badge className="bg-amber-500 text-white">Fallback 48h</Badge>
                )}
                {mancheteIsPinned && pinnedUntil && (
                  <Badge className="bg-rose-600 text-white">Fixada até {fmtDate(pinnedUntil.toISOString())}</Badge>
                )}
              </div>
            </div>
          </div>
          {manchete.post ? (
            <div className="grid md:grid-cols-[240px,1fr] gap-4">
              <div className="w-full aspect-video bg-muted rounded overflow-hidden">
                <img src={getPostImage(manchete.post)} alt={manchete.post.title} className="w-full h-full object-cover" />
              </div>
              <div className="min-w-0">
                <Link to={`/noticia/${manchete.post.slug}`} target="_blank" className="text-lg font-black leading-tight hover:text-primary block">
                  {manchete.post.title}
                </Link>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-xs text-muted-foreground">
                  {manchete.post.categories?.name && (
                    <span className="font-semibold uppercase text-primary">{manchete.post.categories.name}</span>
                  )}
                  <span>Publicada: {fmtDate(manchete.post.published_at)}</span>
                  <span>Idade: {ageLabel(manchete.post.published_at)}</span>
                  {manchete.recentViews != null && <span>{manchete.recentViews} views 24h</span>}
                </div>
                <div className="flex flex-wrap gap-2 mt-3">
                  <Button asChild size="sm" variant="outline" className="min-h-[44px] md:min-h-0">
                    <a href={`/noticia/${manchete.post.slug}`} target="_blank" rel="noreferrer">
                      <ExternalLink className="h-4 w-4 mr-1.5" /> Abrir
                    </a>
                  </Button>
                  {[2, 6, 12, 24].map((h) => (
                    <Button
                      key={h}
                      size="sm"
                      variant="secondary"
                      onClick={() => openPinDialog(h)}
                      className="min-h-[44px] md:min-h-0"
                    >
                      <Pin className="h-4 w-4 mr-1.5" /> Fixar {h}h
                    </Button>
                  ))}
                  {mancheteIsPinned && (
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={doUnpin}
                      disabled={unpinning}
                      className="min-h-[44px] md:min-h-0"
                    >
                      <PinOff className="h-4 w-4 mr-1.5" />
                      {unpinning ? "Removendo..." : "Remover fixação"}
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground italic">{manchete.reasonLabel}</p>
          )}
        </Card>

        {/* Demais slots */}
        <div className="grid gap-4 md:grid-cols-2">
          <SlotCard label="Destaque lateral 1" slot={layout.lateral1} />
          <SlotCard label="Destaque lateral 2" slot={layout.lateral2} />
          <SlotCard label="Destaque lateral 3" slot={layout.lateral3} />
          <SlotCard label="Em destaque agora" slot={layout.emDestaque} />
          <div className="md:col-span-2">
            {layout.plantao.post ? (
              <SlotCard label="Plantão ativo" slot={layout.plantao} />
            ) : (
              <Card className="p-4 text-sm text-muted-foreground italic">Nenhum Plantão ativo.</Card>
            )}
          </div>
        </div>
      </div>

      <AlertDialog open={pinOpen} onOpenChange={setPinOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Fixar manchete por {pinHours}h?</AlertDialogTitle>
            <AlertDialogDescription>
              A matéria ocupará a manchete até <strong>{fmtDate(finalPinDate.toISOString())}</strong> (horário de Maceió), sobrepondo a seleção automática (exceto Plantão ativo).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label htmlFor="pin-reason">Motivo (obrigatório)</Label>
            <Textarea
              id="pin-reason"
              placeholder="Ex.: Cobertura em desenvolvimento sobre operação policial em Aracaju."
              value={pinReason}
              onChange={(e) => setPinReason(e.target.value)}
              rows={3}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pinning}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmPin} disabled={pinning}>
              {pinning ? "Fixando..." : "Confirmar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  );
}
