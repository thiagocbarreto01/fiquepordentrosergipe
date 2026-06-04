import { useEffect, useMemo, useState } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  getPublishedNoticias,
  subscribeToNoticiasFeed,
  type Post,
} from "@/lib/noticias";
import { ExternalLink, Eye, RefreshCw, Info, AlertTriangle } from "lucide-react";
import { getPostImage } from "@/lib/postImage";
import { buildHomeLayout, filterEligibleHomePosts, HOME_RECENT_DAYS, type HomeLayoutSlot } from "@/lib/homeSlots";
import { Link } from "react-router-dom";

function fmtDate(s: string | null | undefined) {
  if (!s) return "—";
  return new Date(s).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function scoreBadgeClass(score: number) {
  if (score >= 100) return "bg-urgent text-white";
  if (score >= 80) return "bg-rose-600 text-white";
  if (score >= 50) return "bg-amber-500 text-white";
  if (score >= 25) return "bg-primary text-primary-foreground";
  return "bg-slate-500 text-white";
}

function tierOf(post: Post | null): { label: string; cls: string } | null {
  if (!post) return null;
  if (post.is_urgent) return { label: "PLANTÃO", cls: "bg-urgent text-white" };
  if (post.is_evergreen) return { label: "P1 · Permanente", cls: "bg-rose-700 text-white" };
  if (post.is_main_featured) return { label: "P2 · Destaque Principal", cls: "bg-amber-600 text-white" };
  if (post.is_featured) return { label: "P3 · Destaque", cls: "bg-primary text-primary-foreground" };
  return { label: "Editorial", cls: "bg-slate-500 text-white" };
}

export default function AdminControleHome() {
  const [published, setPublished] = useState<Post[]>([]);
  const [showPreview, setShowPreview] = useState(false);
  const [loadedAt, setLoadedAt] = useState<Date>(new Date());

  const load = async () => {
    const l = await getPublishedNoticias(80);
    setPublished(l);
    setLoadedAt(new Date());
  };

  useEffect(() => {
    load();
    return subscribeToNoticiasFeed(load);
  }, []);

  const layout = useMemo(() => buildHomeLayout({ published: filterEligibleHomePosts(published) }), [published]);

  const slots: { key: string; label: string; slot: HomeLayoutSlot }[] = [
    { key: "manchete", label: "Manchete Principal", slot: layout.manchetePrincipal },
    { key: "lateral_1", label: "Destaque Lateral 1", slot: layout.destaqueLateral1 },
    { key: "lateral_2", label: "Destaque Lateral 2", slot: layout.destaqueLateral2 },
    { key: "lateral_3", label: "Destaque Lateral 3", slot: layout.destaqueLateral3 },
    { key: "em_destaque", label: "Em Destaque Agora", slot: layout.destaqueAgora },
    { key: "plantao", label: "Plantão Ativo", slot: layout.plantaoAtivo },
  ];

  return (
    <AdminLayout>
      <div className="space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-black tracking-tight">Controle da Home</h1>
            <p className="text-sm text-muted-foreground">
               Home <strong>100% automática</strong> — mostra apenas notícias dos últimos <strong>{HOME_RECENT_DAYS} dias</strong>, com exceção para P1 permanente e plantão ativo dentro da validade.
            </p>
          </div>
          <div className="flex gap-2 items-center">
            <span className="text-[11px] text-muted-foreground hidden md:inline">
              Atualizado às {loadedAt.toLocaleTimeString("pt-BR")}
            </span>
            <Button variant="default" size="sm" onClick={load}>
              <RefreshCw className="h-4 w-4 mr-1.5" /> Forçar atualização
            </Button>
            <Button variant="outline" size="sm" onClick={() => setShowPreview(true)}>
              <Eye className="h-4 w-4 mr-1.5" /> Pré-visualizar
            </Button>
            <Button variant="outline" size="sm" asChild>
              <a href="/" target="_blank" rel="noreferrer">
                <ExternalLink className="h-4 w-4 mr-1.5" /> Abrir Home
              </a>
            </Button>
          </div>
        </header>

        {(() => {
          const m = layout.manchetePrincipal;
          const t = tierOf(m.post);
          return (
            <Card className="p-4 border-primary/30 bg-primary/5">
              <h2 className="text-sm font-bold uppercase tracking-wider mb-3 flex items-center gap-2 text-primary">
                <Info className="h-4 w-4" /> Diagnóstico da Manchete
              </h2>
              {m.post ? (
                <div className="grid md:grid-cols-2 gap-3 text-sm">
                  <div>
                    <div className="text-[11px] uppercase text-muted-foreground font-bold">Manchete atual</div>
                    <Link to={`/noticia/${m.post.slug}`} target="_blank" className="font-bold hover:text-primary">
                      {m.post.title}
                    </Link>
                  </div>
                  <div className="flex flex-wrap gap-1.5 items-start">
                    {t && <Badge className={t.cls}>{t.label}</Badge>}
                    <Badge className={scoreBadgeClass(m.score)}>Pontuação total: {m.score}</Badge>
                  </div>
                  <div>
                    <div className="text-[11px] uppercase text-muted-foreground font-bold">Motivo principal</div>
                    <div>{m.reasonLabel}</div>
                  </div>
                  <div>
                    <div className="text-[11px] uppercase text-muted-foreground font-bold">Publicada em</div>
                    <div>{fmtDate(m.post.published_at ?? m.post.created_at)}</div>
                  </div>
                  {m.post.is_main_featured && (
                    <div>
                      <div className="text-[11px] uppercase text-muted-foreground font-bold">P2 ativo até</div>
                      <div>
                        {m.post.main_featured_expires_at
                          ? (() => {
                              const exp = new Date(m.post.main_featured_expires_at);
                              const expired = exp.getTime() <= Date.now();
                              return (
                                <span className={expired ? "text-rose-700 font-semibold" : ""}>
                                  {fmtDate(m.post.main_featured_expires_at)} {expired && "(expirado)"}
                                </span>
                              );
                            })()
                          : <span className="text-amber-700">Sem validade — defina para liberar a manchete automaticamente</span>}
                      </div>
                    </div>
                  )}
                  {m.reasons.length > 0 && (
                    <div className="md:col-span-2">
                      <div className="text-[11px] uppercase text-muted-foreground font-bold mb-1">
                        Fatores de pontuação ({m.reasons.length})
                      </div>
                      <ul className="grid md:grid-cols-2 gap-x-4 gap-y-0.5 text-xs text-foreground/80">
                        {m.reasons.map((r, i) => <li key={i}>• {r}</li>)}
                      </ul>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground italic">{m.reasonLabel}</p>
              )}
            </Card>
          );
        })()}

        <Card className="p-4 border-blue-200 bg-blue-50/40">
          <h2 className="text-sm font-bold uppercase tracking-wider mb-2 flex items-center gap-2 text-blue-900">
            <Info className="h-4 w-4" /> Critérios de seleção
          </h2>
          <ul className="text-sm space-y-1 text-blue-950/80 grid md:grid-cols-2 gap-x-6">
            <li>Plantão/Urgente: <strong>+100</strong></li>
            <li>P1 Permanente: <strong>+90</strong></li>
            <li>P2 Destaque Principal: <strong>+80</strong></li>
            <li>Editoria Polícia: <strong>+40</strong></li>
            <li>Palavra-chave policial (acidente, prisão, operação…): <strong>+35</strong></li>
            <li>Política relevante: <strong>+25</strong></li>
            <li>Aracaju / Sergipe / Municípios: <strong>+15</strong></li>
            <li>Esporte / Entretenimento / Serviço: <strong>+5</strong></li>
            <li>Bônus de recência (até <strong>+10</strong>)</li>
            <li>Vitrine exige <strong>imagem válida</strong> e até <strong>{HOME_RECENT_DAYS} dias</strong></li>
            <li>Sem completar com notícia antiga quando faltar volume</li>
          </ul>
        </Card>

        {layout.ignoradasPorImagem.length > 0 && (
          <Card className="p-4 border-amber-300 bg-amber-50/60">
            <h2 className="text-sm font-bold uppercase tracking-wider mb-2 flex items-center gap-2 text-amber-900">
              <AlertTriangle className="h-4 w-4" /> Ignoradas por falta de imagem ({layout.ignoradasPorImagem.length})
            </h2>
            <p className="text-xs text-amber-900/80 mb-2">
              Essas notícias publicadas estão fora da vitrine porque não têm imagem própria. Faça upload de capa no editor para que possam ocupar manchete/destaques.
            </p>
            <ul className="text-sm space-y-1">
              {layout.ignoradasPorImagem.map((p) => (
                <li key={p.id} className="truncate">
                  • <Link to={`/admin/posts/${p.id}`} className="hover:underline">{p.title}</Link>
                  <span className="text-xs text-muted-foreground ml-2">({fmtDate(p.published_at)})</span>
                </li>
              ))}
            </ul>
          </Card>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          {slots.map(({ key, label, slot }) => (
            <Card key={key} className="p-4">
              <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <h3 className="font-bold text-base">{label}</h3>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {slot.post && (() => {
                        const t = tierOf(slot.post);
                        return t ? <Badge className={t.cls}>{t.label}</Badge> : null;
                      })()}
                      {slot.post && (
                        <Badge className={scoreBadgeClass(slot.score)}>
                          Pontuação: {slot.score}
                        </Badge>
                      )}
                      <Badge variant="outline" className="text-[11px]">{slot.reasonLabel}</Badge>
                    </div>
                  </div>
              </div>

              {slot.post ? (
                <div className="flex gap-3">
                  <div className="w-28 h-20 bg-muted rounded overflow-hidden flex-shrink-0">
                    <img src={getPostImage(slot.post)} alt={slot.post.title} className="w-full h-full object-cover" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <Link
                      to={`/noticia/${slot.post.slug}`}
                      target="_blank"
                      className="text-sm font-bold leading-snug line-clamp-2 hover:text-primary"
                    >
                      {slot.post.title}
                    </Link>
                    <div className="flex flex-wrap items-center gap-2 mt-1.5 text-[11px] text-muted-foreground">
                      {slot.post.categories?.name && (
                        <span className="font-semibold uppercase text-primary">{slot.post.categories.name}</span>
                      )}
                      <span>•</span>
                      <span>{fmtDate(slot.post.published_at ?? slot.post.created_at)}</span>
                    </div>
                    {slot.reasons.length > 0 && (
                      <details className="mt-2 text-[11px] text-muted-foreground">
                        <summary className="cursor-pointer hover:text-foreground">Como pontuou ({slot.reasons.length} fatores)</summary>
                        <ul className="mt-1 space-y-0.5 pl-3">
                          {slot.reasons.map((r, i) => <li key={i}>• {r}</li>)}
                        </ul>
                      </details>
                    )}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground italic">{slot.reasonLabel}</p>
              )}
            </Card>
          ))}
        </div>
      </div>

      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-6xl h-[85vh] p-0 overflow-hidden">
          <DialogHeader className="p-3 border-b">
            <DialogTitle>Pré-visualização da Home</DialogTitle>
          </DialogHeader>
          <iframe src="/" title="Preview Home" className="w-full h-full" />
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
