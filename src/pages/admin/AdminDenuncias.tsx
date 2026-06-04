import { useEffect, useState } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";

const STATUSES = ["nova", "em_apuracao", "publicada", "arquivada"];

const STATUS_LABEL: Record<string, string> = {
  nova: "Nova",
  em_apuracao: "Em apuração",
  publicada: "Publicada",
  arquivada: "Arquivada",
};

const STATUS_COLOR: Record<string, string> = {
  nova: "bg-blue-100 text-blue-800 border-blue-200",
  em_apuracao: "bg-yellow-100 text-yellow-800 border-yellow-200",
  publicada: "bg-green-100 text-green-800 border-green-200",
  arquivada: "bg-slate-100 text-slate-600 border-slate-200",
};

export default function AdminDenuncias() {
  const [items, setItems] = useState<any[]>([]);

  async function load() {
    const { data } = await supabase.from("denuncias").select("*").order("created_at", { ascending: false });
    setItems(data ?? []);
  }
  useEffect(() => { document.title = "Denúncias — Painel"; load(); }, []);

  async function setStatus(id: string, status: string) {
    const { error } = await supabase.from("denuncias").update({ status: status as "nova" | "em_apuracao" | "publicada" | "arquivada" }).eq("id", id);
    if (error) toast.error(error.message); else { toast.success("Atualizado"); load(); }
  }
  async function remove(id: string) {
    if (!confirm("Excluir?")) return;
    await supabase.from("denuncias").delete().eq("id", id); load();
  }

  return (
    <AdminLayout>
      <h1 className="font-display text-3xl font-black mb-6">Denúncias recebidas</h1>
      <div className="space-y-3">
        {items.map((d) => (
          <div key={d.id} className="bg-card border border-border p-5 hover:border-primary/30 transition-colors shadow-sm">
            <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <span className={`px-2 py-0.5 text-[10px] font-black uppercase tracking-wider border rounded-sm ${STATUS_COLOR[d.status] || ""}`}>
                    {STATUS_LABEL[d.status] || d.status}
                  </span>
                  {d.is_anonymous && (
                    <span className="bg-slate-800 text-white text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-sm">
                      Anônima
                    </span>
                  )}
                </div>
                <h3 className="font-display text-xl font-black text-foreground mb-1">{d.title}</h3>
                <div className="text-xs text-muted-foreground flex flex-wrap gap-x-3 gap-y-1">
                  <span>{new Date(d.created_at).toLocaleString("pt-BR")}</span>
                  <span>{d.city || "Sem cidade"}</span>
                  {!d.is_anonymous && <span>Por {d.contact_name || "—"}</span>}
                </div>
              </div>
              <div className="flex flex-col gap-2 min-w-[180px]">
                <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-0.5">Alterar Status</div>
                <Select value={d.status} onValueChange={(v) => setStatus(d.id, v)}>
                  <SelectTrigger className="h-9 text-xs font-bold uppercase tracking-wider"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUSES.map((s) => (
                      <SelectItem key={s} value={s} className="text-xs font-bold uppercase tracking-wider">
                        {STATUS_LABEL[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="mt-4 p-4 bg-secondary/50 border border-border rounded-sm text-sm whitespace-pre-wrap leading-relaxed">
              {d.description}
            </div>
            {!d.is_anonymous && (d.contact_phone || d.contact_email) && (
              <div className="mt-3 text-xs bg-primary/5 p-2 rounded-sm border border-primary/10">
                <span className="font-bold text-primary uppercase text-[10px] mr-2">Contato do Denunciante:</span>
                {d.contact_phone && <span className="mr-3">📞 {d.contact_phone}</span>}
                {d.contact_email && <span>📧 {d.contact_email}</span>}
              </div>
            )}
            <div className="mt-4 pt-3 border-t border-border flex justify-end">
              <button onClick={() => remove(d.id)} className="px-3 py-1.5 text-urgent hover:bg-urgent/10 rounded-sm inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider transition-colors">
                <Trash2 className="h-3.5 w-3.5" /> Excluir permanentemente
              </button>
            </div>
          </div>
        ))}
        {items.length === 0 && <p className="text-muted-foreground">Nenhuma denúncia ainda.</p>}
      </div>
    </AdminLayout>
  );
}
