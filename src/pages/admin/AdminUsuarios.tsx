import { useEffect, useMemo, useState } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Check, Ban, Shield, User as UserIcon, Search, Crown } from "lucide-react";

const ROLES = ["super_admin", "admin", "editor", "redator", "user"] as const;
const FOUNDER_EMAIL = "thiagocbarreto@hotmail.com";

type StatusFilter = "all" | "pending" | "approved" | "blocked" | "rejected";

export default function AdminUsuarios() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("profiles")
      .select("user_id, display_name, email, created_at, role, status, approved_at")
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    else setUsers(data ?? []);
    setLoading(false);
  }

  useEffect(() => { document.title = "Usuários — Painel"; load(); }, []);

  const counts = useMemo(() => ({
    pending: users.filter((u) => u.status === "pending").length,
    approved: users.filter((u) => u.status === "approved").length,
    blocked: users.filter((u) => u.status === "blocked").length,
  }), [users]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((u) => {
      if (statusFilter !== "all" && u.status !== statusFilter) return false;
      if (!q) return true;
      return (
        (u.display_name || "").toLowerCase().includes(q) ||
        (u.email || "").toLowerCase().includes(q)
      );
    });
  }, [users, statusFilter, search]);

  const isFounder = (u: any) => (u.email || "").toLowerCase() === FOUNDER_EMAIL;

  async function updateUserInfo(uid: string, patch: any) {
    const finalPatch: any = { ...patch };
    if (patch.status === "approved") {
      const { data: auth } = await supabase.auth.getUser();
      finalPatch.approved_at = new Date().toISOString();
      finalPatch.approved_by = auth.user?.id ?? null;
    }
    const { error } = await supabase.from("profiles").update(finalPatch).eq("user_id", uid);
    if (error) toast.error(error.message);
    else { toast.success("Usuário atualizado"); load(); }
  }

  const statusBadge = (s: string) => {
    switch (s) {
      case "approved": return "bg-emerald-100 text-emerald-800 border-emerald-300";
      case "pending":  return "bg-yellow-100 text-yellow-800 border-yellow-300";
      case "rejected": return "bg-red-100 text-red-800 border-red-300";
      case "blocked":  return "bg-gray-800 text-white border-gray-900";
      default: return "bg-secondary";
    }
  };
  const statusLabel = (s: string) => s === "approved" ? "Aprovado" : s === "pending" ? "Pendente" : s === "rejected" ? "Rejeitado" : "Bloqueado";

  const roleIcon = (r: string) => {
    if (r === "super_admin") return <Crown className="h-3 w-3 mr-1 text-amber-500" />;
    if (r === "admin") return <Shield className="h-3 w-3 mr-1" />;
    if (r === "editor") return <Shield className="h-3 w-3 mr-1 opacity-70" />;
    if (r === "redator") return <UserIcon className="h-3 w-3 mr-1" />;
    return null;
  };

  return (
    <AdminLayout>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-3xl font-black">Usuários</h1>
          <p className="text-muted-foreground">Gerencie acesso, papéis e aprovações.</p>
        </div>
        <Button onClick={load} variant="outline" size="sm">Atualizar</Button>
      </div>

      {/* Counters */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        {([
          ["pending", "Pendentes", counts.pending, "border-yellow-400"],
          ["approved", "Aprovados", counts.approved, "border-emerald-500"],
          ["blocked", "Bloqueados", counts.blocked, "border-gray-800"],
        ] as const).map(([key, label, n, border]) => (
          <button
            key={key}
            onClick={() => setStatusFilter(statusFilter === key ? "all" : (key as StatusFilter))}
            className={`text-left p-4 bg-card border-l-4 ${border} border-y border-r border-border hover:bg-secondary/30 transition ${statusFilter === key ? "ring-2 ring-primary" : ""}`}
          >
            <div className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground">{label}</div>
            <div className="font-display text-3xl font-black mt-1">{n}</div>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome ou email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
          <SelectTrigger className="sm:w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            <SelectItem value="pending">Pendentes</SelectItem>
            <SelectItem value="approved">Aprovados</SelectItem>
            <SelectItem value="blocked">Bloqueados</SelectItem>
            <SelectItem value="rejected">Rejeitados</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="bg-card border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-secondary text-[10px] uppercase font-bold tracking-widest text-muted-foreground">
            <tr>
              <th className="text-left p-4">Usuário</th>
              <th className="text-left p-4">Status</th>
              <th className="text-left p-4">Papel</th>
              <th className="text-right p-4">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading ? (
              <tr><td colSpan={4} className="p-12 text-center text-muted-foreground">Carregando…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={4} className="p-12 text-center text-muted-foreground">Nenhum usuário encontrado.</td></tr>
            ) : (
              filtered.map((u) => {
                const founder = isFounder(u);
                return (
                  <tr key={u.user_id} className="hover:bg-secondary/20 transition-colors">
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        <span className="font-display font-bold text-base">{u.display_name || "Sem nome"}</span>
                        {founder && (
                          <span className="text-[9px] px-1.5 py-0.5 bg-amber-100 text-amber-900 border border-amber-300 font-black uppercase tracking-widest rounded-sm">
                            Super Admin
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">{u.email || "—"}</div>
                      <div className="text-[10px] text-muted-foreground mt-1">
                        Desde {new Date(u.created_at).toLocaleDateString("pt-BR")}
                        {u.approved_at && ` · Aprovado em ${new Date(u.approved_at).toLocaleDateString("pt-BR")}`}
                      </div>
                    </td>
                    <td className="p-4">
                      <span className={`px-2 py-0.5 text-[10px] font-black uppercase tracking-widest border rounded-sm ${statusBadge(u.status)}`}>
                        {statusLabel(u.status)}
                      </span>
                    </td>
                    <td className="p-4">
                      <Select
                        value={u.role}
                        onValueChange={(v) => updateUserInfo(u.user_id, { role: v })}
                        disabled={founder}
                      >
                        <SelectTrigger className="h-8 w-36 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {ROLES.map((r) => (
                            <SelectItem key={r} value={r} className="text-xs">
                              <span className="flex items-center uppercase font-bold tracking-tighter">
                                {roleIcon(r)} {r}
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="p-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {founder ? (
                          <span className="text-[10px] text-muted-foreground italic">Protegido</span>
                        ) : (
                          <>
                            {u.status === "pending" && (
                              <Button size="sm" className="h-8 bg-emerald-600 hover:bg-emerald-700"
                                onClick={() => updateUserInfo(u.user_id, { status: "approved" })} title="Aprovar">
                                <Check className="h-4 w-4 mr-1" /> Aprovar
                              </Button>
                            )}
                            {u.status === "approved" && (
                              <Button size="sm" variant="outline"
                                className="h-8 border-urgent text-urgent hover:bg-urgent hover:text-white"
                                onClick={() => updateUserInfo(u.user_id, { status: "blocked" })} title="Bloquear">
                                <Ban className="h-4 w-4 mr-1" /> Bloquear
                              </Button>
                            )}
                            {(u.status === "blocked" || u.status === "rejected") && (
                              <Button size="sm" variant="outline"
                                className="h-8 border-emerald-600 text-emerald-600 hover:bg-emerald-600 hover:text-white"
                                onClick={() => updateUserInfo(u.user_id, { status: "approved" })} title="Desbloquear">
                                <Check className="h-4 w-4 mr-1" /> Desbloquear
                              </Button>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </AdminLayout>
  );
}
