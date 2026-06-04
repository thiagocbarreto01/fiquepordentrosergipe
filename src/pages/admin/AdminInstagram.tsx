import { useEffect, useState } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Trash2, Instagram, CheckCircle2, AlertCircle, Pencil, Send, Copy, Download, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type IGStatus = "pendente" | "aprovado" | "publicado" | "erro" | "pronto_manual";

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

export default function AdminInstagram() {
  const { isAdmin, role } = useAuth();
  const canApprove = isAdmin || role === "editor";
  const [items, setItems] = useState<any[]>([]);
  const [filter, setFilter] = useState<"all" | IGStatus>("all");
  const [loading, setLoading] = useState(false);
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [backfilling, setBackfilling] = useState(false);

  const [editing, setEditing] = useState<any | null>(null);
  const [editForm, setEditForm] = useState({
    image_url: "",
    caption: "",
    hashtags: "",
    editoria: "",
    manchete: "",
    subtitulo: "",
    bullets: "",
  });
  const [savingEdit, setSavingEdit] = useState(false);

  async function load() {
    setLoading(true);
    let q = supabase
      .from("instagram_posts")
      .select("id,image_url,caption,hashtags,status,created_at,published_at,error_message,post_id,editoria,texto_arte,posts(title,slug)")
      .order("created_at", { ascending: false });
    if (filter !== "all") q = q.eq("status", filter);
    const { data, error } = await q;
    if (error) toast.error(error.message);
    setItems(data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    document.title = "Instagram — Painel";
    load();
  }, [filter]);

  async function updateStatus(id: string, status: IGStatus) {
    const patch: any = { status };
    if (status === "publicado") patch.published_at = new Date().toISOString();
    const { error } = await supabase.from("instagram_posts").update(patch).eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success(`Marcado como ${STATUS_LABEL[status]}`);
      load();
    }
  }

  async function publish(id: string) {
    if (!confirm("Publicar este post no Instagram agora?")) return;
    setPublishingId(id);
    const { data, error } = await supabase.functions.invoke("publish-instagram", {
      body: { instagram_post_id: id },
    });
    setPublishingId(null);
    if (error) {
      toast.error(error.message);
      load();
      return;
    }
    if ((data as any)?.manual) {
      toast.success("Instagram não conectado — marcado como pronto para postagem manual");
    } else {
      toast.success("Publicado no Instagram!");
    }
    load();
  }

  async function copyCaption(it: any) {
    const tags = (it.hashtags ?? [])
      .map((h: string) => (h.startsWith("#") ? h : `#${h}`))
      .join(" ");
    const full = tags ? `${it.caption ?? ""}\n\n${tags}` : (it.caption ?? "");
    try {
      await navigator.clipboard.writeText(full);
      toast.success("Legenda copiada");
    } catch {
      toast.error("Não foi possível copiar");
    }
  }

  async function downloadImage(it: any) {
    if (!it.image_url) {
      toast.error("Sem imagem para baixar");
      return;
    }
    try {
      const res = await fetch(it.image_url);
      const blob = await res.blob();
      const ext = (blob.type.split("/")[1] || "jpg").split("+")[0];
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `instagram-${it.id}.${ext}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Falha ao baixar imagem");
    }
  }

  async function markPublishedManually(id: string) {
    if (!confirm("Confirmar que você publicou este post manualmente no Instagram?")) return;
    const { error } = await supabase
      .from("instagram_posts")
      .update({ status: "publicado", published_at: new Date().toISOString(), error_message: null })
      .eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success("Marcado como publicado no Instagram");
      load();
    }
  }

  async function remove(id: string) {
    if (!confirm("Excluir este post do Instagram?")) return;
    const { error } = await supabase.from("instagram_posts").delete().eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success("Excluído");
      load();
    }
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

  async function uploadImage(file: File) {
    const path = `instagram/${crypto.randomUUID()}-${file.name}`;
    const { error: upErr } = await supabase.storage.from("media").upload(path, file, { upsert: false });
    if (upErr) {
      toast.error(upErr.message);
      return;
    }
    const { data } = supabase.storage.from("media").getPublicUrl(path);
    setEditForm((f) => ({ ...f, image_url: data.publicUrl }));
  }

  async function saveEdit() {
    if (!editing) return;
    setSavingEdit(true);
    const hashtags = editForm.hashtags
      .split(/[,\s]+/)
      .map((h) => h.replace(/^#/, "").trim())
      .filter(Boolean);
    const editoria = editForm.editoria.toUpperCase().trim() || null;
    const bullets = editForm.bullets
      .split(/\n+/)
      .map((b) => b.trim())
      .filter(Boolean)
      .slice(0, 3);
    const texto_arte = {
      editoria: editoria ?? "",
      manchete: editForm.manchete.trim(),
      subtitulo: editForm.subtitulo.trim(),
      bullets,
    };
    const { error } = await supabase
      .from("instagram_posts")
      .update({
        image_url: editForm.image_url || null,
        caption: editForm.caption,
        hashtags,
        editoria,
        texto_arte,
      })
      .eq("id", editing.id);
    setSavingEdit(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Post atualizado");
    setEditing(null);
    load();
  }

  async function backfill() {
    if (!confirm("Gerar rascunhos para notícias publicadas que ainda não têm post no Instagram?")) return;
    setBackfilling(true);
    const { data, error } = await supabase.functions.invoke("backfill-instagram-drafts", {
      body: { limit: 20 },
    });
    setBackfilling(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    const d = data as any;
    toast.success(`Gerados ${d?.success ?? 0}/${d?.processed ?? 0} rascunhos`);
    load();
  }

  return (
    <AdminLayout>
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-display text-3xl font-black flex items-center gap-2">
          <Instagram className="h-7 w-7 text-pink-600" /> Instagram
        </h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">{items.length} posts</span>
          {canApprove && (
            <Button size="sm" variant="outline" onClick={backfill} disabled={backfilling}>
              {backfilling ? "Gerando…" : "Gerar para notícias antigas"}
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 text-xs uppercase font-bold tracking-wider rounded-sm ${
              filter === f ? "bg-primary text-primary-foreground" : "bg-secondary"
            }`}
          >
            {f === "all" ? "Todos" : STATUS_LABEL[f]}
          </button>
        ))}
      </div>

      <div className="bg-card border border-border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-secondary text-xs uppercase tracking-wider">
            <tr>
              <th className="text-left p-3 w-24">Imagem</th>
              <th className="text-left p-3">Notícia</th>
              <th className="text-left p-3">Legenda</th>
              <th className="text-left p-3">Status</th>
              <th className="text-left p-3">Criado em</th>
              <th className="text-right p-3">Ações</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={6} className="p-8 text-center text-muted-foreground">Carregando…</td>
              </tr>
            )}
            {!loading && items.map((it) => {
              const s = it.status as IGStatus;
              return (
                <tr key={it.id} className="border-t border-border align-top">
                  <td className="p-3">
                    {it.image_url ? (
                      <img src={it.image_url} alt="" className="w-20 h-20 object-cover rounded-sm border" />
                    ) : (
                      <div className="w-20 h-20 bg-secondary flex items-center justify-center text-xs text-muted-foreground rounded-sm">
                        sem imagem
                      </div>
                    )}
                  </td>
                  <td className="p-3">
                    {it.editoria && (
                      <div className="mb-1">
                        <span className="px-2 py-0.5 text-[10px] font-black uppercase tracking-widest bg-foreground text-background">
                          {it.editoria}
                        </span>
                      </div>
                    )}
                    {it.posts?.title ? (
                      <a href={`/noticia/${it.posts.slug}`} target="_blank" rel="noreferrer" className="font-semibold hover:underline">
                        {it.posts.title}
                      </a>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                    {it.texto_arte?.manchete && (
                      <div className="mt-1 text-xs text-muted-foreground line-clamp-2">
                        <strong>Arte:</strong> {it.texto_arte.manchete}
                      </div>
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
                    <span className={`px-2 py-0.5 text-xs font-bold uppercase border ${STATUS_COLOR[s]}`}>
                      {STATUS_LABEL[s]}
                    </span>
                  </td>
                  <td className="p-3 text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(it.created_at).toLocaleString("pt-BR")}
                  </td>
                  <td className="p-3 text-right">
                    <div className="inline-flex flex-wrap gap-1 justify-end">
                      {(s === "pendente" || s === "aprovado" || s === "erro" || s === "pronto_manual") && (
                        <Button size="sm" variant="outline" onClick={() => openEdit(it)} title="Editar">
                          <Pencil className="h-4 w-4" />
                        </Button>
                      )}
                      {canApprove && s === "pendente" && (
                        <Button size="sm" variant="outline" onClick={() => updateStatus(it.id, "aprovado")}>
                          <CheckCircle2 className="h-4 w-4 mr-1" /> Aprovar
                        </Button>
                      )}
                      {canApprove && (s === "aprovado" || s === "erro") && (
                        <Button
                          size="sm"
                          className="bg-pink-600 hover:bg-pink-700"
                          disabled={publishingId === it.id}
                          onClick={() => publish(it.id)}
                        >
                          <Send className="h-4 w-4 mr-1" />
                          {publishingId === it.id ? "Publicando…" : "Publicar"}
                        </Button>
                      )}
                      {(s === "pronto_manual" || s === "aprovado") && (
                        <>
                          <Button size="sm" variant="outline" onClick={() => copyCaption(it)} title="Copiar legenda">
                            <Copy className="h-4 w-4 mr-1" /> Legenda
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => downloadImage(it)} title="Baixar imagem">
                            <Download className="h-4 w-4 mr-1" /> Imagem
                          </Button>
                        </>
                      )}
                      {canApprove && s === "pronto_manual" && (
                        <Button
                          size="sm"
                          className="bg-green-600 hover:bg-green-700"
                          onClick={() => markPublishedManually(it.id)}
                          title="Confirmar que já postou manualmente no Instagram"
                        >
                          <CheckCircle2 className="h-4 w-4 mr-1" /> Já postei
                        </Button>
                      )}
                      {it.posts?.slug && (
                        <a
                          href={`/noticia/${it.posts.slug}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center px-2 text-xs text-muted-foreground hover:text-foreground"
                          title="Abrir notícia"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      )}
                      {isAdmin && (
                        <button
                          onClick={() => remove(it.id)}
                          className="p-2 hover:bg-urgent/10 text-urgent"
                          title="Excluir"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {!loading && items.length === 0 && (
              <tr>
                <td colSpan={6} className="p-8 text-center text-muted-foreground">
                  Nenhum post na fila.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Editar post do Instagram</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Imagem</Label>
              <div className="flex items-start gap-3">
                {editForm.image_url ? (
                  <img src={editForm.image_url} alt="" className="w-32 h-32 object-cover border rounded-sm" />
                ) : (
                  <div className="w-32 h-32 bg-secondary flex items-center justify-center text-xs text-muted-foreground rounded-sm">
                    sem imagem
                  </div>
                )}
                <div className="flex-1 space-y-2">
                  <Input
                    value={editForm.image_url}
                    onChange={(e) => setEditForm((f) => ({ ...f, image_url: e.target.value }))}
                    placeholder="URL da imagem"
                  />
                  <Input
                    type="file"
                    accept="image/*"
                    onChange={(e) => e.target.files?.[0] && uploadImage(e.target.files[0])}
                  />
                </div>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label>Editoria</Label>
                <select
                  className="w-full h-10 px-3 border border-input bg-background rounded-md text-sm"
                  value={editForm.editoria}
                  onChange={(e) => setEditForm((f) => ({ ...f, editoria: e.target.value }))}
                >
                  <option value="">—</option>
                  {["URGENTE","POLÍCIA","POLÍTICA","MUNICÍPIOS","SERGIPE","BRASIL","MUNDO","ENTRETENIMENTO","DENÚNCIA"].map((ed) => (
                    <option key={ed} value={ed}>{ed}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label>Manchete (arte)</Label>
                <Input
                  value={editForm.manchete}
                  onChange={(e) => setEditForm((f) => ({ ...f, manchete: e.target.value }))}
                  placeholder="Curta, forte e direta"
                />
              </div>
            </div>
            <div>
              <Label>Subtítulo (arte)</Label>
              <Input
                value={editForm.subtitulo}
                onChange={(e) => setEditForm((f) => ({ ...f, subtitulo: e.target.value }))}
                placeholder="Objetivo e claro"
              />
            </div>
            <div>
              <Label>Bullets (arte) — uma linha por bullet, máx 3</Label>
              <Textarea
                rows={3}
                value={editForm.bullets}
                onChange={(e) => setEditForm((f) => ({ ...f, bullets: e.target.value }))}
                placeholder={"Primeiro ponto\nSegundo ponto\nTerceiro ponto"}
              />
            </div>
            <div>
              <Label>Legenda</Label>
              <Textarea
                rows={6}
                value={editForm.caption}
                onChange={(e) => setEditForm((f) => ({ ...f, caption: e.target.value }))}
              />
            </div>
            <div>
              <Label>Hashtags (separadas por espaço ou vírgula)</Label>
              <Textarea
                rows={2}
                value={editForm.hashtags}
                onChange={(e) => setEditForm((f) => ({ ...f, hashtags: e.target.value }))}
                placeholder="noticias sergipe tvbarretao"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button onClick={saveEdit} disabled={savingEdit}>
              {savingEdit ? "Salvando…" : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
