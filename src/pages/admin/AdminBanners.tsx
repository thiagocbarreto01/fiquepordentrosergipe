import { useEffect, useState } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Trash2, Upload, Pencil, X } from "lucide-react";

const POSITIONS = [
  { v: "topo_home", l: "Topo da home (150-200px)" },
  { v: "entre_noticias", l: "Entre notícias (1200x250)" },
  { v: "dentro_materia", l: "Dentro da matéria" },
  { v: "final_materia", l: "Fim da matéria" },
  { v: "lateral", l: "Lateral (300x600)" },
  { v: "mobile_banner", l: "Mobile (320x100)" },
  { v: "footer", l: "Rodapé" },
];

const EMPTY_FORM = { name: "", sponsor: "", image_url: "", link_url: "", position: "topo_home", is_active: true };

export default function AdminBanners() {
  const [items, setItems] = useState<any[]>([]);
  const [form, setForm] = useState<any>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  async function load() {
    const { data } = await supabase.from("banners").select("*").order("created_at", { ascending: false });
    setItems(data ?? []);
  }
  useEffect(() => { document.title = "Banners — Painel"; load(); }, []);

  async function upload(file: File) {
    setUploading(true);
    const path = `banners/${Date.now()}-${file.name.replace(/[^a-z0-9.\-]/gi, "_")}`;
    const { error } = await supabase.storage.from("media").upload(path, file);
    if (error) { setUploading(false); return toast.error(error.message); }
    const { data } = supabase.storage.from("media").getPublicUrl(path);
    setForm((f: any) => ({ ...f, image_url: data.publicUrl }));
    setUploading(false);
  }

  function startEdit(b: any) {
    setEditingId(b.id);
    setForm({
      name: b.name ?? "",
      sponsor: b.sponsor ?? "",
      image_url: b.image_url ?? "",
      link_url: b.link_url ?? "",
      position: b.position ?? "top",
      is_active: !!b.is_active,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  async function save() {
    if (!form.name || !form.image_url) return toast.error("Nome e imagem são obrigatórios");
    if (editingId) {
      const { error } = await supabase.from("banners").update(form).eq("id", editingId);
      if (error) return toast.error(error.message);
      toast.success("Banner atualizado");
    } else {
      const { error } = await supabase.from("banners").insert(form);
      if (error) return toast.error(error.message);
      toast.success("Banner criado");
    }
    setEditingId(null);
    setForm(EMPTY_FORM);
    load();
  }
  async function toggle(id: string, is_active: boolean) {
    await supabase.from("banners").update({ is_active }).eq("id", id);
    load();
  }
  async function remove(id: string) {
    if (!confirm("Excluir banner?")) return;
    await supabase.from("banners").delete().eq("id", id); load();
  }

  return (
    <AdminLayout>
      <h1 className="font-display text-3xl font-black mb-6">Banners & Patrocinadores</h1>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-card border border-border p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-bold uppercase tracking-wider text-xs">{editingId ? "Editar banner" : "Novo banner"}</h3>
            {editingId && (
              <button onClick={cancelEdit} className="text-xs flex items-center gap-1 text-muted-foreground hover:text-foreground">
                <X className="h-3 w-3" /> Cancelar
              </button>
            )}
          </div>
          <div><Label>Nome</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div><Label>Patrocinador</Label><Input value={form.sponsor} onChange={(e) => setForm({ ...form, sponsor: e.target.value })} /></div>
          <div>
            <Label>Imagem</Label>
            {form.image_url && <img src={form.image_url} className="max-h-32 mb-2" />}
            <label className="inline-flex items-center gap-2 px-3 py-2 border border-border bg-secondary cursor-pointer text-sm">
              <Upload className="h-4 w-4" /> {uploading ? "Enviando…" : "Enviar imagem"}
              <input type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
            </label>
            <Input className="mt-2" placeholder="ou URL da imagem" value={form.image_url} onChange={(e) => setForm({ ...form, image_url: e.target.value })} />
          </div>
          <div><Label>Link</Label><Input value={form.link_url} onChange={(e) => setForm({ ...form, link_url: e.target.value })} /></div>
          <div>
            <Label>Posição</Label>
            <Select value={form.position} onValueChange={(v) => setForm({ ...form, position: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{POSITIONS.map((p) => <SelectItem key={p.v} value={p.v}>{p.l}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <label className="flex items-center gap-2"><Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} /> Ativo</label>
          <Button onClick={save} className="w-full bg-primary">{editingId ? "Salvar alterações" : "Criar banner"}</Button>
        </div>

        <div className="space-y-3">
          {items.map((b) => (
            <div key={b.id} className="bg-card border border-border p-3 flex gap-3 items-center">
              <img src={b.image_url} className="w-24 h-16 object-cover" />
              <div className="flex-1 min-w-0">
                <div className="font-bold truncate">{b.name}</div>
                <div className="text-xs text-muted-foreground">{POSITIONS.find((p) => p.v === b.position)?.l} · {b.sponsor || "—"}</div>
              </div>
              <Switch checked={b.is_active} onCheckedChange={(v) => toggle(b.id, v)} />
              <button onClick={() => startEdit(b)} className={`p-2 hover:bg-primary/10 ${editingId === b.id ? "text-primary" : ""}`} title="Editar"><Pencil className="h-4 w-4" /></button>
              <button onClick={() => remove(b.id)} className="p-2 text-urgent hover:bg-urgent/10" title="Excluir"><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
          {items.length === 0 && <p className="text-muted-foreground text-sm">Nenhum banner ainda.</p>}
        </div>
      </div>
    </AdminLayout>
  );
}
