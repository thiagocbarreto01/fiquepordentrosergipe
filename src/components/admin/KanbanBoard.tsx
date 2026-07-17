import { useMemo, useState, type DragEvent } from "react";
import { Link } from "react-router-dom";
import { Eye, Edit, CheckCircle2, Globe, XCircle, Flame, Pin, Star, ExternalLink } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { SourceBadge } from "@/components/admin/SourceBadge";
import { classifyDuplicate } from "@/lib/duplicates";
import {
  STATUS_LABEL,
  STATUS_COLOR,
  normalizeStatus,
  type EditorialStatus,
} from "@/lib/statusFlow";

const COLUMNS: { key: EditorialStatus; label: string; accent: string }[] = [
  { key: "captada", label: "Captadas", accent: "border-t-slate-400" },
  { key: "em_revisao", label: "Em Revisão", accent: "border-t-amber-500" },
  { key: "aprovada", label: "Aprovadas", accent: "border-t-sky-500" },
  { key: "publicada", label: "Publicadas", accent: "border-t-emerald-500" },
  { key: "rejeitada", label: "Rejeitadas", accent: "border-t-red-500" },
  { key: "duplicada", label: "Duplicadas", accent: "border-t-orange-500" },
];

export interface KanbanPost {
  id: string;
  title: string;
  slug: string;
  status: string;
  is_urgent?: boolean;
  is_featured?: boolean;
  is_evergreen?: boolean;
  cover_image_url?: string | null;
  manual_image_url?: string | null;
  cover_image_original?: string | null;
  published_at?: string | null;
  created_at: string;
  source_url?: string | null;
  similarity_score?: number | null;
  categories?: { name?: string | null } | null;
  _sourceName?: string | null;
  _authorName?: string | null;
}

interface Props {
  posts: KanbanPost[];
  onChangeStatus: (post: KanbanPost, status: EditorialStatus) => void | Promise<void>;
}

function postImage(p: KanbanPost): string | null {
  return p.manual_image_url || p.cover_image_url || p.cover_image_original || null;
}

export function KanbanBoard({ posts, onChangeStatus }: Props) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<EditorialStatus | null>(null);
  const [openPost, setOpenPost] = useState<KanbanPost | null>(null);

  const grouped = useMemo(() => {
    const map: Record<EditorialStatus, KanbanPost[]> = {
      rascunho: [], captada: [], pronta_para_revisao: [], em_revisao: [], aprovada: [], publicada: [], rejeitada: [], duplicada: [], arquivada: [],
    };
    posts.forEach((p) => {
      const s = normalizeStatus(p.status);
      map[s].push(p);
    });
    return map;
  }, [posts]);

  function onDragStart(e: DragEvent, post: KanbanPost) {
    setDragId(post.id);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", post.id);
  }
  function onDrop(e: DragEvent, col: EditorialStatus) {
    e.preventDefault();
    setDragOver(null);
    const id = e.dataTransfer.getData("text/plain") || dragId;
    if (!id) return;
    const post = posts.find((p) => p.id === id);
    if (!post) return;
    if (normalizeStatus(post.status) === col) return;
    onChangeStatus(post, col);
    setDragId(null);
  }
  function onDragOver(e: DragEvent, col: EditorialStatus) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragOver !== col) setDragOver(col);
  }

  return (
    <>
      <div className="flex gap-3 overflow-x-auto pb-3 -mx-2 px-2 snap-x">
        {COLUMNS.map((col) => {
          const items = grouped[col.key] ?? [];
          const isOver = dragOver === col.key;
          return (
            <div
              key={col.key}
              onDrop={(e) => onDrop(e, col.key)}
              onDragOver={(e) => onDragOver(e, col.key)}
              onDragLeave={() => setDragOver((p) => (p === col.key ? null : p))}
              className={`snap-start min-w-[280px] md:min-w-[300px] w-[80vw] md:w-[300px] bg-secondary/40 border border-border border-t-4 ${col.accent} rounded-sm flex flex-col ${isOver ? "ring-2 ring-primary bg-primary/5" : ""}`}
            >
              <div className="flex items-center justify-between p-2.5 border-b border-border bg-white/60 sticky top-0">
                <div className="text-[11px] font-black uppercase tracking-widest">{col.label}</div>
                <span className="text-[10px] font-black tabular-nums px-1.5 py-0.5 rounded-sm bg-foreground text-background">
                  {items.length}
                </span>
              </div>
              <div className="p-2 space-y-2 max-h-[70vh] overflow-y-auto">
                {items.length === 0 && (
                  <div className="text-[10px] text-muted-foreground text-center py-6 uppercase font-bold tracking-wider">
                    Vazio
                  </div>
                )}
                {items.map((p) => {
                  const img = postImage(p);
                  const dup = classifyDuplicate(p.similarity_score);
                  return (
                    <div
                      key={p.id}
                      draggable
                      onDragStart={(e) => onDragStart(e, p)}
                      onClick={() => setOpenPost(p)}
                      className="cursor-grab active:cursor-grabbing bg-white border border-border rounded-sm overflow-hidden hover:shadow-md transition-shadow"
                    >
                      {img && (
                        <div className="aspect-[16/9] bg-secondary overflow-hidden">
                          <img src={img} alt="" loading="lazy" className="w-full h-full object-cover" />
                        </div>
                      )}
                      <div className="p-2 space-y-1.5">
                        <div className="flex items-center gap-1 flex-wrap">
                          <SourceBadge name={p._sourceName} />
                          {p.is_urgent && (
                            <span className="inline-flex items-center gap-1 text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-sm bg-red-600 text-white">
                              <Flame className="h-2.5 w-2.5" /> Urgente
                            </span>
                          )}
                          {p.is_featured && (
                            <span className="inline-flex items-center gap-1 text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-sm bg-amber-500 text-white">
                              <Star className="h-2.5 w-2.5" /> Destaque
                            </span>
                          )}
                          {p.is_evergreen && (
                            <span className="inline-flex items-center gap-1 text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-sm bg-emerald-600 text-white">
                              <Pin className="h-2.5 w-2.5" /> Plantão
                            </span>
                          )}
                        </div>
                        <div className="font-display font-bold text-sm leading-tight line-clamp-3">{p.title}</div>
                        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                          <span className="truncate">{p.categories?.name ?? "Geral"}</span>
                          <span className="font-mono">{new Date(p.published_at ?? p.created_at).toLocaleDateString("pt-BR")}</span>
                        </div>
                        {p._authorName && (
                          <div className="text-[10px] text-muted-foreground truncate">por {p._authorName}</div>
                        )}
                        {dup.pct > 0 && (
                          <div className={`inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-sm border w-fit ${dup.color}`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${dup.dot}`} />
                            {dup.label} · {dup.pct}%
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <Dialog open={!!openPost} onOpenChange={(o) => !o && setOpenPost(null)}>
        <DialogContent className="max-w-2xl">
          {openPost && (
            <>
              <DialogHeader>
                <div className="flex flex-wrap gap-2 items-center mb-2">
                  <SourceBadge name={openPost._sourceName} />
                  <span className={`px-2 py-0.5 text-[10px] font-black uppercase tracking-widest border rounded-sm ${STATUS_COLOR[normalizeStatus(openPost.status)]}`}>
                    {STATUS_LABEL[normalizeStatus(openPost.status)]}
                  </span>
                </div>
                <DialogTitle className="font-display text-xl">{openPost.title}</DialogTitle>
                <DialogDescription>
                  {openPost.categories?.name ?? "Geral"} ·{" "}
                  {new Date(openPost.published_at ?? openPost.created_at).toLocaleString("pt-BR")}
                </DialogDescription>
              </DialogHeader>
              {postImage(openPost) && (
                <div className="aspect-[16/9] bg-secondary overflow-hidden rounded-sm">
                  <img src={postImage(openPost)!} alt="" className="w-full h-full object-cover" />
                </div>
              )}
              <div className="flex flex-wrap gap-2 justify-end pt-2">
                {(normalizeStatus(openPost.status) === "captada" || normalizeStatus(openPost.status) === "em_revisao") && (
                  <Button size="sm" variant="outline" onClick={() => { onChangeStatus(openPost, "aprovada"); setOpenPost(null); }}>
                    <CheckCircle2 className="h-4 w-4 mr-1" /> Aprovar
                  </Button>
                )}
                {normalizeStatus(openPost.status) !== "publicada" && normalizeStatus(openPost.status) !== "rejeitada" && (
                  <Button size="sm" onClick={() => { onChangeStatus(openPost, "publicada"); setOpenPost(null); }}>
                    <Globe className="h-4 w-4 mr-1" /> Publicar
                  </Button>
                )}
                {normalizeStatus(openPost.status) !== "rejeitada" && (
                  <Button size="sm" variant="ghost" className="text-red-700" onClick={() => { onChangeStatus(openPost, "rejeitada"); setOpenPost(null); }}>
                    <XCircle className="h-4 w-4 mr-1" /> Rejeitar
                  </Button>
                )}
                <Button asChild size="sm" variant="outline">
                  <Link to={`/admin/posts/${openPost.id}`}><Edit className="h-4 w-4 mr-1" /> Editar</Link>
                </Button>
                {normalizeStatus(openPost.status) === "publicada" && (
                  <Button asChild size="sm" variant="ghost">
                    <a href={`/noticia/${openPost.slug}`} target="_blank" rel="noreferrer">
                      <Eye className="h-4 w-4 mr-1" /> Ver no site <ExternalLink className="h-3 w-3 ml-1" />
                    </a>
                  </Button>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
