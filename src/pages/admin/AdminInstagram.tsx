import { useEffect, useMemo, useRef, useState } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import AdminImportarInstagram from "@/pages/admin/AdminImportarInstagram";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Trash2, Instagram, CheckCircle2, AlertCircle, Pencil, Copy, Download,
  ExternalLink, Search, Loader2, Sparkles, ChevronLeft, ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useSearchParams } from "react-router-dom";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

type IGStatus = "pendente" | "aprovado" | "publicado" | "erro" | "pronto_manual";
type TabKey = "preparar" | "importar";

const STATUS_LABEL: Record<IGStatus, string> = {
  pendente: "Pendente",
  aprovado: "Aprovado",
  publicado: "Publicado no Instagram",
  erro: "Erro",
  pronto_manual: "Pronto p/ postagem manual",
};

const STATUS_COLOR: Record<IGStatus, string> = {
  pendente: "bg-yellow-100 text-yellow-800 border-yellow-300",
  aprovado: "bg-blue-100 text-blue-800 border-blue-300",
  publicado: "bg-green-100 text-green-800 border-green-300",
  erro: "bg-red-100 text-red-800 border-red-300",
  pronto_manual: "bg-purple-100 text-purple-800 border-purple-300",
};

const FILTERS: Array<"all" | IGStatus> = ["all", "pendente", "aprovado", "pronto_manual", "publicado", "erro"];
const PAGE_SIZE = 20;

export default function AdminInstagram() {
  const { isAdmin, role } = useAuth();
  const canApprove = isAdmin || role === "editor";
  const [params, setParams] = useSearchParams();
  const tabParam = params.get("tab");
  const initialTab: TabKey = tabParam === "importar" ? "importar" : "preparar";
  const [tab, setTab] = useState<TabKey>(initialTab);

  useEffect(() => {
    document.title = "Central Instagram — Painel";
  }, []);

  function changeTab(next: TabKey) {
    setTab(next);
    const p = new URLSearchParams(params);
    p.set("tab", next);
    setParams(p, { replace: true });
  }

  return (
    <AdminLayout>
      <div className="flex items-center justify-between mb-4">
        <h1 className="font-display text-3xl font-black flex items-center gap-2">
          <Instagram className="h-7 w-7 text-pink-600" /> Central Instagram
        </h1>
      </div>

      <Tabs value={tab} onValueChange={(v) => changeTab(v as TabKey)}>
        <TabsList className="mb-4">
          <TabsTrigger value="preparar">Notícia → Instagram</TabsTrigger>
          <TabsTrigger value="importar">Instagram → Notícia</TabsTrigger>
        </TabsList>

        <TabsContent value="preparar" className="space-y-6">
          <div className="rounded-md border border-blue-300 bg-blue-50 text-blue-900 text-sm p-3">
            A postagem no Instagram é manual. O sistema prepara a arte, a legenda e as hashtags para você
            baixar e publicar pelo aplicativo do Instagram.
          </div>
          <PreparePanel canApprove={canApprove} isAdmin={isAdmin} />
        </TabsContent>

        <TabsContent value="importar">
          <AdminImportarInstagram embedded />
        </TabsContent>
      </Tabs>
    </AdminLayout>
  );
}

/* --------------------------- Prepare panel --------------------------- */

function PreparePanel({ canApprove, isAdmin }: { canApprove: boolean; isAdmin: boolean }) {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [page, setPage] = useState(0);
  const [results, setResults] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [preparingId, setPreparingId] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const t = setTimeout(() => { setDebounced(query.trim()); setPage(0); }, 300);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    (async () => {
      setLoading(true);
      try {
        const from = page * PAGE_SIZE;
        const to = from + PAGE_SIZE - 1;
        let q = supabase
          .from("posts")
          .select("id,title,slug,cover_image_url,published_at,categories(name)", { count: "exact" })
          .eq("status", "publicada")
          .order("published_at", { ascending: false })
          .range(from, to)
          .abortSignal(ctrl.signal);
        if (debounced) q = q.ilike("title", `%${debounced}%`);
        const { data, count, error } = await q;
        if (ctrl.signal.aborted) return;
        if (error) {
          if ((error as any).code !== "20") toast.error(error.message);
        } else {
          setResults(data ?? []);
          setTotal(count ?? 0);
        }
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    })();
    return () => ctrl.abort();
  }, [debounced, page]);

  async function prepare(postId: string) {
    if (preparingId) return;
    setPreparingId(postId);
    try {
      const { data, error } = await supabase.functions.invoke("prepare-instagram-package", {
        body: { post_id: postId, mode: "template" },
      });
      if (error) {
        toast.error(`Falha ao preparar (${error.message}).`);
        return;
      }
      const d = data as any;
      if (!d?.success) {
        toast.error(`${d?.code ?? "erro"}: ${d?.message ?? "Falha ao preparar."}`);
        return;
      }
      if (d.duplicate) toast.info("Este post já foi preparado. Veja na fila abaixo.");
      else toast.success("Pacote pronto para postagem manual.");
      window.dispatchEvent(new Event("ig-queue-refresh"));
    } finally {
      setPreparingId(null);
    }
  }

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <section className="bg-card border border-border p-4 rounded-md">
        <h2 className="font-bold text-lg mb-3">Preparar nova publicação</h2>
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por título de notícia publicada…"
            className="pl-9"
          />
        </div>
        <div className="text-xs text-muted-foreground mb-3">
          {loading ? "Buscando…" : `${total} notícia(s) encontrada(s)`}
        </div>

        <ul className="divide-y divide-border">
          {results.map((p) => (
            <li key={p.id} className="py-3 flex items-center gap-3">
              {p.cover_image_url ? (
                <img src={p.cover_image_url} alt="" className="w-14 h-14 object-cover rounded-sm border" />
              ) : (
                <div className="w-14 h-14 bg-secondary rounded-sm" />
              )}
              <div className="flex-1 min-w-0">
                <div className="font-semibold truncate">{p.title}</div>
                <div className="text-xs text-muted-foreground truncate">
                  {p.categories?.name ?? "Sem categoria"} · {p.published_at ? new Date(p.published_at).toLocaleDateString("pt-BR") : "—"}
                </div>
              </div>
              <Button
                size="sm"
                onClick={() => prepare(p.id)}
                disabled={preparingId === p.id}
              >
                {preparingId === p.id ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1" />}
                Preparar
              </Button>
            </li>
          ))}
          {!loading && results.length === 0 && (
            <li className="py-6 text-center text-sm text-muted-foreground">Nenhuma notícia encontrada.</li>
          )}
        </ul>

        {pageCount > 1 && (
          <div className="mt-3 flex items-center justify-between text-xs">
            <span>Página {page + 1} de {pageCount}</span>
            <div className="flex gap-1">
              <Button size="sm" variant="outline" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button size="sm" variant="outline" onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))} disabled={page + 1 >= pageCount}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </section>

      <QueueList canApprove={canApprove} isAdmin={isAdmin} />
    </div>
  );
}

/* --------------------------- Queue --------------------------- */

function QueueList({ canApprove, isAdmin }: { canApprove: boolean; isAdmin: boolean }) {
  const [items, setItems] = useState<any[]>([]);
  const [filter, setFilter] = useState<"all" | IGStatus>("all");
  const [loading, setLoading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<any | null>(null);
  const [confirmManual, setConfirmManual] = useState<any | null>(null);
  const [editing, setEditing] = useState<any | null>(null);
  const [editForm, setEditForm] = useState({
    image_url: "", caption: "", hashtags: "", editoria: "", manchete: "", subtitulo: "", bullets: "",
  });
  const [savingEdit, setSavingEdit] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    let q = supabase
      .from("instagram_posts")
      .select("id,image_url,caption,hashtags,status,created_at,published_at,error_message,post_id,editoria,texto_arte,posts(title,slug)")
      .order("created_at", { ascending: false })
      .limit(100);
    if (filter !== "all") q = q.eq("status", filter);
    const { data, error } = await q;
    if (error) toast.error(error.message);
    setItems(data ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, [filter]);
  useEffect(() => {
    const h = () => load();
    window.addEventListener("ig-queue-refresh", h);
    return () => window.removeEventListener("ig-queue-refresh", h);
  }, [filter]);

  async function updateStatus(id: string, status: IGStatus) {
    if (busyId) return;
    setBusyId(id);
    try {
      const patch: any = { status };
      if (status === "publicado") patch.published_at = new Date().toISOString();
      const { error } = await supabase.from("instagram_posts").update(patch).eq("id", id);
      if (error) toast.error(error.message);
      else { toast.success(`Marcado como ${STATUS_LABEL[status]}`); load(); }
    } finally { setBusyId(null); }
  }

  async function copyCaption(it: any) {
    const tags = (it.hashtags ?? []).map((h: string) => (h.startsWith("#") ? h : `#${h}`)).join(" ");
    const full = tags ? `${it.caption ?? ""}\n\n${tags}` : (it.caption ?? "");
    try { await navigator.clipboard.writeText(full); toast.success("Legenda copiada"); }
    catch { toast.error("Não foi possível copiar"); }
  }

  async function downloadImage(it: any) {
    if (!it.image_url) { toast.error("Sem imagem para baixar"); return; }
    try {
      const res = await fetch(it.image_url);
      const blob = await res.blob();
      const ext = (blob.type.split("/")[1] || "jpg").split("+")[0];
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `instagram-${it.id}.${ext}`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch { toast.error("Falha ao baixar imagem"); }
  }

  async function markPublishedManually(id: string) {
    setBusyId(id);
    try {
      const { error } = await supabase
        .from("instagram_posts")
        .update({ status: "publicado", published_at: new Date().toISOString(), error_message: null })
        .eq("id", id);
      if (error) toast.error(error.message);
      else { toast.success("Marcado como publicado no Instagram"); load(); }
    } finally { setBusyId(null); setConfirmManual(null); }
  }

  async function remove(id: string) {
    setBusyId(id);
    try {
      const { error } = await supabase.from("instagram_posts").delete().eq("id", id);
      if (error) toast.error(error.message);
      else { toast.success("Excluído"); load(); }
    } finally { setBusyId(null); setConfirmDelete(null); }
  }

  function openEdit(it: any) {
    setEditing(it);
    const ta = it.texto_arte ?? {};
    setEditForm({
      image_url: it.image_url ?? "",
      caption: it.caption ?? "",
      hashtags: Array.isArray(it.hashtags) ? it.hashtags.join(" ") : "",
      editoria: it.editoria ?? ta.editoria ?? "",
      manchete: ta.manchete ?? "",
      subtitulo: ta.subtitulo ?? "",
      bullets: Array.isArray(ta.bullets) ? ta.bullets.join("\n") : "",
    });
  }

  async function saveEdit() {
    if (!editing) return;
    setSavingEdit(true);
    try {
      const hashtags = editForm.hashtags.split(/[,\s]+/).map((h) => h.replace(/^#/, "").trim()).filter(Boolean);
      const editoria = editForm.editoria.toUpperCase().trim() || null;
      const bullets = editForm.bullets.split(/\n+/).map((b) => b.trim()).filter(Boolean).slice(0, 3);
      const texto_arte = { editoria: editoria ?? "", manchete: editForm.manchete.trim(), subtitulo: editForm.subtitulo.trim(), bullets };
      const { error } = await supabase.from("instagram_posts").update({
        image_url: editForm.image_url || null, caption: editForm.caption, hashtags, editoria, texto_arte,
      }).eq("id", editing.id);
      if (error) toast.error(error.message);
      else { toast.success("Post atualizado"); setEditing(null); load(); }
    } finally { setSavingEdit(false); }
  }

  return (
    <section className="bg-card border border-border rounded-md">
      <div className="p-4 flex items-center justify-between flex-wrap gap-2 border-b border-border">
        <h2 className="font-bold text-lg">Fila de publicações manuais</h2>
        <span className="text-xs text-muted-foreground">{items.length} pacote(s)</span>
      </div>

      <div className="flex flex-wrap gap-2 p-3 border-b border-border">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 text-xs uppercase font-bold tracking-wider rounded-sm ${filter === f ? "bg-primary text-primary-foreground" : "bg-secondary"}`}
          >
            {f === "all" ? "Todos" : STATUS_LABEL[f]}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-secondary text-xs uppercase tracking-wider">
            <tr>
              <th className="text-left p-3 w-24">Imagem</th>
              <th className="text-left p-3">Notícia</th>
              <th className="text-left p-3">Legenda</th>
              <th className="text-left p-3">Status</th>
              <th className="text-right p-3">Ações</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">Carregando…</td></tr>
            )}
            {!loading && items.map((it) => {
              const s = it.status as IGStatus;
              return (
                <tr key={it.id} className="border-t border-border align-top">
                  <td className="p-3">
                    {it.image_url ? (
                      <img src={it.image_url} alt="" className="w-20 h-20 object-cover rounded-sm border" />
                    ) : (
                      <div className="w-20 h-20 bg-secondary flex items-center justify-center text-xs text-muted-foreground rounded-sm">sem imagem</div>
                    )}
                  </td>
                  <td className="p-3">
                    {it.editoria && (
                      <div className="mb-1">
                        <span className="px-2 py-0.5 text-[10px] font-black uppercase tracking-widest bg-foreground text-background">{it.editoria}</span>
                      </div>
                    )}
                    {it.posts?.title ? (
                      <a href={`/noticia/${it.posts.slug}`} target="_blank" rel="noreferrer" className="font-semibold hover:underline">{it.posts.title}</a>
                    ) : <span className="text-muted-foreground">—</span>}
                    {it.texto_arte?.manchete && (
                      <div className="mt-1 text-xs text-muted-foreground line-clamp-2"><strong>Arte:</strong> {it.texto_arte.manchete}</div>
                    )}
                  </td>
                  <td className="p-3 max-w-md">
                    <div className="line-clamp-3 whitespace-pre-wrap">{it.caption || <span className="text-muted-foreground">—</span>}</div>
                    {Array.isArray(it.hashtags) && it.hashtags.length > 0 && (
                      <div className="mt-1 text-xs text-blue-600 line-clamp-2">
                        {it.hashtags.map((h: string) => (h.startsWith("#") ? h : `#${h}`)).join(" ")}
                      </div>
                    )}
                    {it.error_message && (
                      <div className="mt-1 text-xs text-red-600 flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" /> {it.error_message}
                      </div>
                    )}
                  </td>
                  <td className="p-3">
                    <span className={`px-2 py-0.5 text-xs font-bold uppercase border ${STATUS_COLOR[s]}`}>{STATUS_LABEL[s]}</span>
                  </td>
                  <td className="p-3 text-right">
                    <div className="inline-flex flex-wrap gap-1 justify-end">
                      <Button size="sm" variant="outline" onClick={() => openEdit(it)} title="Editar">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      {canApprove && s === "pendente" && (
                        <Button size="sm" variant="outline" onClick={() => updateStatus(it.id, "aprovado")}>
                          <CheckCircle2 className="h-4 w-4 mr-1" /> Aprovar
                        </Button>
                      )}
                      <Button size="sm" variant="outline" onClick={() => copyCaption(it)} title="Copiar legenda">
                        <Copy className="h-4 w-4 mr-1" /> Legenda
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => downloadImage(it)} title="Baixar imagem">
                        <Download className="h-4 w-4 mr-1" /> Imagem
                      </Button>
                      {canApprove && s !== "publicado" && (
                        <Button
                          size="sm"
                          className="bg-green-600 hover:bg-green-700 text-white"
                          onClick={() => setConfirmManual(it)}
                          title="Confirmar que já postou manualmente no Instagram"
                        >
                          <CheckCircle2 className="h-4 w-4 mr-1" /> Já postei
                        </Button>
                      )}
                      {it.posts?.slug && (
                        <a href={`/noticia/${it.posts.slug}`} target="_blank" rel="noreferrer" className="inline-flex items-center px-2 text-xs text-muted-foreground hover:text-foreground" title="Abrir notícia">
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      )}
                      {isAdmin && (
                        <button onClick={() => setConfirmDelete(it)} className="p-2 hover:bg-urgent/10 text-urgent" title="Excluir">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {!loading && items.length === 0 && (
              <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">Nenhum pacote na fila.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Edit dialog */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Editar pacote do Instagram</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Imagem (URL)</Label>
              <Input value={editForm.image_url} onChange={(e) => setEditForm((f) => ({ ...f, image_url: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Editoria</Label>
                <Input value={editForm.editoria} onChange={(e) => setEditForm((f) => ({ ...f, editoria: e.target.value }))} />
              </div>
              <div>
                <Label>Manchete</Label>
                <Input value={editForm.manchete} onChange={(e) => setEditForm((f) => ({ ...f, manchete: e.target.value }))} />
              </div>
            </div>
            <div>
              <Label>Subtítulo</Label>
              <Input value={editForm.subtitulo} onChange={(e) => setEditForm((f) => ({ ...f, subtitulo: e.target.value }))} />
            </div>
            <div>
              <Label>Bullets (1 por linha)</Label>
              <Textarea rows={3} value={editForm.bullets} onChange={(e) => setEditForm((f) => ({ ...f, bullets: e.target.value }))} />
            </div>
            <div>
              <Label>Legenda</Label>
              <Textarea rows={5} value={editForm.caption} onChange={(e) => setEditForm((f) => ({ ...f, caption: e.target.value }))} />
            </div>
            <div>
              <Label>Hashtags (separadas por espaço)</Label>
              <Input value={editForm.hashtags} onChange={(e) => setEditForm((f) => ({ ...f, hashtags: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button onClick={saveEdit} disabled={savingEdit}>{savingEdit ? "Salvando…" : "Salvar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Manual confirm */}
      <AlertDialog open={!!confirmManual} onOpenChange={(o) => !o && setConfirmManual(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar postagem manual</AlertDialogTitle>
            <AlertDialogDescription>
              Confirma que você já publicou este pacote manualmente no aplicativo do Instagram?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirmManual && markPublishedManually(confirmManual.id)}>
              Sim, já postei
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete confirm */}
      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir pacote?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação é irreversível. O pacote de Instagram será removido. A notícia relacionada não será alterada.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => confirmDelete && remove(confirmDelete.id)}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
