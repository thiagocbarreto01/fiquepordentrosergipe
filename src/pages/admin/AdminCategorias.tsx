import { useEffect, useState } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";

function slugify(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9 -]/g, "").trim().replace(/\s+/g, "-");
}

export default function AdminCategorias() {
  const [cats, setCats] = useState<any[]>([]);
  const [name, setName] = useState("");
  async function load() {
    const { data } = await supabase.from("categories").select("*").order("position");
    setCats(data ?? []);
  }
  useEffect(() => { document.title = "Categorias — Painel"; load(); }, []);

  async function add() {
    if (!name) return;
    const { error } = await supabase.from("categories").insert({ name, slug: slugify(name), position: cats.length + 1 });
    if (error) toast.error(error.message); else { setName(""); load(); toast.success("Categoria criada"); }
  }
  async function remove(id: string) {
    if (!confirm("Excluir?")) return;
    const { error } = await supabase.from("categories").delete().eq("id", id);
    if (error) toast.error(error.message); else load();
  }

  return (
    <AdminLayout>
      <h1 className="font-display text-3xl font-black mb-6">Categorias</h1>
      <div className="bg-card border border-border p-4 mb-4">
        <Label>Nova categoria</Label>
        <div className="flex gap-2 mt-1">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Esportes" />
          <Button onClick={add}>Adicionar</Button>
        </div>
      </div>
      <div className="bg-card border border-border">
        <table className="w-full text-sm">
          <thead className="bg-secondary text-xs uppercase">
            <tr><th className="text-left p-3">Nome</th><th className="text-left p-3">Slug</th><th className="text-right p-3">Ações</th></tr>
          </thead>
          <tbody>
            {cats.map((c) => (
              <tr key={c.id} className="border-t border-border hover:bg-secondary/20 transition-colors">
                <td className="p-4 font-display font-bold text-base">{c.name}</td>
                <td className="p-4 text-xs font-mono text-muted-foreground">{c.slug}</td>
                <td className="p-4 text-right">
                  <Button variant="ghost" size="icon" onClick={() => remove(c.id)} className="h-8 w-8 text-urgent hover:bg-urgent/10" title="Excluir">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminLayout>
  );
}
