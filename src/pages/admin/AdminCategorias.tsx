import { useEffect, useMemo, useState } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Pencil, Plus, Eye, EyeOff } from "lucide-react";

type Category = {
  id: string;
  name: string;
  slug: string;
  position: number;
  color: string | null;
  description: string | null;
  show_in_menu: boolean;
  default_cover_image_url: string | null;
};

function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 -]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

export default function AdminCategorias() {
  const [cats, setCats] = useState<Category[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("categories")
      .select("id,name,slug,position,color,description,show_in_menu,default_cover_image_url")
      .order("position", { ascending: true });
    if (error) {
      toast.error("Falha ao carregar categorias");
      setLoading(false);
      return;
    }
    const list = (data ?? []) as Category[];
    setCats(list);

    // Contagem real, agregada no banco, sem limite de 1000
    const entries = await Promise.all(
      list.map(async (c) => {
        const { count } = await supabase
          .from("posts")
          .select("id", { count: "exact", head: true })
          .eq("category_id", c.id);
        return [c.id, count ?? 0] as const;
      }),
    );
    setCounts(Object.fromEntries(entries));
    setLoading(false);
  }

  useEffect(() => {
    document.title = "Categorias — Painel";
    load();
  }, []);

  const menuCount = useMemo(() => cats.filter((c) => c.show_in_menu).length, [cats]);

  async function createCategory() {
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    const slug = slugify(name);
    const position = (cats[cats.length - 1]?.position ?? 0) + 1;
    const { error } = await supabase
      .from("categories")
      .insert({ name, slug, position, show_in_menu: true });
    setCreating(false);
    if (error) return toast.error(error.message);
    setNewName("");
    toast.success("Categoria criada");
    load();
  }

  async function toggleMenu(c: Category, value: boolean) {
    setSavingId(c.id);
    // Otimista
    setCats((prev) => prev.map((x) => (x.id === c.id ? { ...x, show_in_menu: value } : x)));
    const { error } = await supabase
      .from("categories")
      .update({ show_in_menu: value })
      .eq("id", c.id);
    setSavingId(null);
    if (error) {
      toast.error("Não foi possível atualizar");
      load();
    }
  }

  async function move(c: Category, dir: -1 | 1) {
    const idx = cats.findIndex((x) => x.id === c.id);
    const swapIdx = idx + dir;
    if (swapIdx < 0 || swapIdx >= cats.length) return;
    const other = cats[swapIdx];
    const a = c.position;
    const b = other.position;
    // Otimista
    const next = [...cats];
    next[idx] = { ...c, position: b };
    next[swapIdx] = { ...other, position: a };
    next.sort((x, y) => x.position - y.position);
    setCats(next);
    const [r1, r2] = await Promise.all([
      supabase.from("categories").update({ position: b }).eq("id", c.id),
      supabase.from("categories").update({ position: a }).eq("id", other.id),
    ]);
    if (r1.error || r2.error) {
      toast.error("Falha ao reordenar");
      load();
    }
  }

  async function saveEdit(patch: Partial<Category>) {
    if (!editing) return;
    const { error } = await supabase
      .from("categories")
      .update({
        name: patch.name?.trim() ?? editing.name,
        color: patch.color ?? editing.color,
        description: patch.description ?? editing.description,
        default_cover_image_url: patch.default_cover_image_url ?? editing.default_cover_image_url,
      })
      .eq("id", editing.id);
    if (error) return toast.error(error.message);
    toast.success("Categoria atualizada");
    setEditing(null);
    load();
  }

  return (
    <AdminLayout>
      <div className="mb-6 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="font-display text-3xl font-black">Categorias</h1>
          <p className="text-sm text-muted-foreground">
            {cats.length} categorias · {menuCount} no menu superior
          </p>
        </div>
      </div>

      {/* Nova categoria */}
      <div className="bg-card border border-border rounded-md p-4 mb-6">
        <Label className="text-xs uppercase tracking-wider text-muted-foreground">
          Nova categoria
        </Label>
        <div className="flex flex-col sm:flex-row gap-2 mt-2">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Ex: Cultura"
            onKeyDown={(e) => e.key === "Enter" && createCategory()}
          />
          <Button onClick={createCategory} disabled={creating || !newName.trim()} className="min-h-11">
            <Plus className="h-4 w-4" /> Adicionar
          </Button>
        </div>
      </div>

      {/* Desktop tabela */}
      <div className="hidden md:block bg-card border border-border rounded-md overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-secondary text-xs uppercase text-muted-foreground">
            <tr>
              <th className="text-left p-3 w-20">Ordem</th>
              <th className="text-left p-3">Categoria</th>
              <th className="text-left p-3">Slug</th>
              <th className="text-right p-3">Notícias</th>
              <th className="text-center p-3">No menu</th>
              <th className="text-right p-3">Ações</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">Carregando…</td></tr>
            )}
            {!loading && cats.map((c, i) => (
              <tr key={c.id} className="border-t border-border hover:bg-secondary/20 transition-colors">
                <td className="p-3">
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8" disabled={i === 0} onClick={() => move(c, -1)} title="Subir">
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" disabled={i === cats.length - 1} onClick={() => move(c, 1)} title="Descer">
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                  </div>
                </td>
                <td className="p-3">
                  <div className="flex items-center gap-2">
                    {c.color && (
                      <span className="h-3 w-3 rounded-full border" style={{ background: c.color }} />
                    )}
                    <span className="font-display font-bold text-base">{c.name}</span>
                  </div>
                </td>
                <td className="p-3 text-xs font-mono text-muted-foreground">{c.slug}</td>
                <td className="p-3 text-right tabular-nums">{counts[c.id] ?? 0}</td>
                <td className="p-3 text-center">
                  <div className="inline-flex items-center gap-2">
                    <Switch
                      checked={c.show_in_menu}
                      onCheckedChange={(v) => toggleMenu(c, v)}
                      disabled={savingId === c.id}
                      aria-label={`Exibir ${c.name} no menu`}
                    />
                    {c.show_in_menu ? (
                      <Badge variant="secondary" className="gap-1"><Eye className="h-3 w-3" /> Visível</Badge>
                    ) : (
                      <Badge variant="outline" className="gap-1 text-muted-foreground"><EyeOff className="h-3 w-3" /> Oculta</Badge>
                    )}
                  </div>
                </td>
                <td className="p-3 text-right">
                  <Button variant="ghost" size="sm" className="min-h-11" onClick={() => setEditing(c)}>
                    <Pencil className="h-4 w-4" /> Editar
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-3">
        {loading && <p className="text-center text-muted-foreground py-8">Carregando…</p>}
        {!loading && cats.map((c, i) => (
          <div key={c.id} className="bg-card border border-border rounded-md p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  {c.color && <span className="h-3 w-3 rounded-full border shrink-0" style={{ background: c.color }} />}
                  <div className="font-display font-bold text-lg truncate">{c.name}</div>
                </div>
                <div className="text-xs font-mono text-muted-foreground mt-1">/{c.slug}</div>
                <div className="text-xs text-muted-foreground mt-1">{counts[c.id] ?? 0} notícias</div>
              </div>
              <Button variant="ghost" size="icon" className="h-11 w-11 shrink-0" onClick={() => setEditing(c)}>
                <Pencil className="h-5 w-5" />
              </Button>
            </div>
            <div className="mt-3 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Switch checked={c.show_in_menu} onCheckedChange={(v) => toggleMenu(c, v)} disabled={savingId === c.id} />
                <span className="text-sm">{c.show_in_menu ? "No menu" : "Fora do menu"}</span>
              </div>
              <div className="flex items-center gap-1">
                <Button variant="outline" size="icon" className="h-11 w-11" disabled={i === 0} onClick={() => move(c, -1)}>
                  <ArrowUp className="h-5 w-5" />
                </Button>
                <Button variant="outline" size="icon" className="h-11 w-11" disabled={i === cats.length - 1} onClick={() => move(c, 1)}>
                  <ArrowDown className="h-5 w-5" />
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Editar */}
      <EditDialog category={editing} onClose={() => setEditing(null)} onSave={saveEdit} />
    </AdminLayout>
  );
}

function EditDialog({
  category,
  onClose,
  onSave,
}: {
  category: Category | null;
  onClose: () => void;
  onSave: (patch: Partial<Category>) => void;
}) {
  const [name, setName] = useState("");
  const [color, setColor] = useState("");
  const [description, setDescription] = useState("");
  const [cover, setCover] = useState("");

  useEffect(() => {
    if (category) {
      setName(category.name);
      setColor(category.color ?? "");
      setDescription(category.description ?? "");
      setCover(category.default_cover_image_url ?? "");
    }
  }, [category]);

  return (
    <Dialog open={!!category} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar categoria</DialogTitle>
        </DialogHeader>
        {category && (
          <div className="space-y-4">
            <div>
              <Label>Nome</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
              <p className="text-xs text-muted-foreground mt-1">
                Slug atual: <span className="font-mono">/{category.slug}</span> (não editável — preserva URLs).
              </p>
            </div>
            <div>
              <Label>Cor da editoria</Label>
              <div className="flex gap-2 mt-1">
                <Input type="color" value={color || "#000000"} onChange={(e) => setColor(e.target.value)} className="w-16 h-11 p-1" />
                <Input value={color} onChange={(e) => setColor(e.target.value)} placeholder="#0f766e" />
              </div>
            </div>
            <div>
              <Label>Descrição</Label>
              <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Opcional" />
            </div>
            <div>
              <Label>Imagem padrão de capa</Label>
              <Input value={cover} onChange={(e) => setCover(e.target.value)} placeholder="URL da imagem (opcional)" />
            </div>
          </div>
        )}
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button
            onClick={() =>
              onSave({
                name,
                color: color || null,
                description: description || null,
                default_cover_image_url: cover || null,
              })
            }
          >
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
