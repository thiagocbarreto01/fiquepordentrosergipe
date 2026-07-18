import { useEffect, useMemo, useState } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Check, Ban, Shield, User as UserIcon, Search, Crown, ShieldAlert, XCircle } from "lucide-react";

const ROLES = ["super_admin", "admin", "editor", "redator", "user"] as const;
type RoleValue = typeof ROLES[number];

const ROLE_LABEL: Record<RoleValue, string> = {
  super_admin: "Superadministrador",
  admin: "Administrador",
  editor: "Editor",
  redator: "Redator",
  user: "Sem função",
};

type StatusFilter = "all" | "pending" | "approved" | "blocked" | "rejected";
type StatusValue = "pending" | "approved" | "blocked" | "rejected";

interface UserRow {
  user_id: string;
  display_name: string | null;
  email: string | null;
  created_at: string;
  role: RoleValue;
  status: StatusValue;
  approved_at: string | null;
  is_founder: boolean;
}

interface PendingAction {
  user: UserRow;
  kind: "role" | "status";
  nextValue: string;
}

export default function AdminUsuarios() {
  const { user: currentUser, isSuperAdmin } = useAuth();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("profiles")
      .select("user_id, display_name, email, created_at, role, status, approved_at, is_founder")
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    else setUsers((data ?? []) as UserRow[]);
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

  const isFounder = (u: UserRow) => !!u.is_founder;
  const isSelf = (u: UserRow) => currentUser?.id === u.user_id;

  async function execute() {
    if (!pending) return;
    setSubmitting(true);
    const rpc = pending.kind === "role" ? "admin_set_user_role" : "admin_set_user_status";
    const arg = pending.kind === "role"
      ? { _user_id: pending.user.user_id, _role: pending.nextValue }
      : { _user_id: pending.user.user_id, _status: pending.nextValue };
    const { error } = await supabase.rpc(rpc as any, arg as any);
    setSubmitting(false);
    if (error) {
      const msg = friendlyError(error.message);
      toast.error(msg);
    } else {
      toast.success(pending.kind === "role" ? "Papel atualizado" : "Status atualizado");
      setPending(null);
      load();
    }
  }

  function friendlyError(m: string) {
    if (m.includes("founder_role_locked") || m.includes("founder_status_locked"))
      return "O superadministrador principal está protegido e não pode ser alterado.";
    if (m.includes("cannot_demote_self")) return "Você não pode rebaixar seu próprio acesso.";
    if (m.includes("cannot_change_own_status")) return "Você não pode alterar seu próprio status.";
    if (m.includes("forbidden")) return "Ação restrita a administradores.";
    if (m.includes("invalid_role")) return "Papel inválido.";
    if (m.includes("invalid_status")) return "Status inválido.";
    return m;
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
  const statusLabel = (s: string) =>
    s === "approved" ? "Aprovado" : s === "pending" ? "Pendente" : s === "rejected" ? "Rejeitado" : "Bloqueado";

  const roleIcon = (r: RoleValue) => {
    if (r === "super_admin") return <Crown className="h-3 w-3 mr-1 text-amber-500" />;
    if (r === "admin") return <Shield className="h-3 w-3 mr-1" />;
    if (r === "editor") return <Shield className="h-3 w-3 mr-1 opacity-70" />;
    if (r === "redator") return <UserIcon className="h-3 w-3 mr-1" />;
    return null;
  };

  const dialogTitle = pending
    ? pending.kind === "role"
      ? `Alterar papel para ${ROLE_LABEL[pending.nextValue as RoleValue]}?`
      : pending.nextValue === "approved"
        ? "Aprovar acesso deste usuário?"
        : pending.nextValue === "blocked"
          ? "Bloquear este usuário?"
          : pending.nextValue === "rejected"
            ? "Rejeitar acesso?"
            : "Alterar status?"
    : "";

  const dialogDesc = pending
    ? pending.kind === "role"
      ? `O usuário ${pending.user.display_name || pending.user.email} passará a ter as permissões de ${ROLE_LABEL[pending.nextValue as RoleValue]}. As alterações são sincronizadas no banco.`
      : pending.nextValue === "blocked"
        ? "O usuário perderá acesso ao painel imediatamente. Todas as RPCs administrativas passarão a recusar suas ações."
        : pending.nextValue === "approved"
          ? "O usuário terá acesso liberado ao painel conforme o papel atribuído."
          : "O acesso ao painel será revogado."
    : "";

  return (
    <AdminLayout>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="font-display text-3xl font-black">Usuários</h1>
          <p className="text-muted-foreground">Gerencie acesso, papéis e aprovações.</p>
        </div>
        <Button onClick={load} variant="outline" size="sm">Atualizar</Button>
      </div>

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
        {/* Desktop table */}
        <table className="w-full text-sm hidden md:table">
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
            ) : filtered.map((u) => {
              const founder = isFounder(u);
              const self = isSelf(u);
              const roleLocked = founder;
              // Only super_admin can promote to super_admin
              const availableRoles = ROLES.filter((r) => r !== "super_admin" || isSuperAdmin);
              return (
                <tr key={u.user_id} className="hover:bg-secondary/20 transition-colors">
                  <td className="p-4">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-display font-bold text-base">{u.display_name || "Sem nome"}</span>
                      {founder && (
                        <span className="text-[9px] px-1.5 py-0.5 bg-amber-100 text-amber-900 border border-amber-300 font-black uppercase tracking-widest rounded-sm">
                          Principal
                        </span>
                      )}
                      {self && (
                        <span className="text-[9px] px-1.5 py-0.5 bg-blue-100 text-blue-900 border border-blue-300 font-black uppercase tracking-widest rounded-sm">
                          Você
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
                      onValueChange={(v) => setPending({ user: u, kind: "role", nextValue: v })}
                      disabled={roleLocked || (self && !isSuperAdmin)}
                    >
                      <SelectTrigger className="h-8 w-44 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {availableRoles.map((r) => (
                          <SelectItem key={r} value={r} className="text-xs">
                            <span className="flex items-center font-bold">
                              {roleIcon(r)} {ROLE_LABEL[r]}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="p-4 text-right">
                    <div className="flex items-center justify-end gap-2 flex-wrap">
                      {founder ? (
                        <span className="text-[10px] text-muted-foreground italic flex items-center gap-1">
                          <ShieldAlert className="h-3 w-3" /> Protegido
                        </span>
                      ) : self ? (
                        <span className="text-[10px] text-muted-foreground italic">Autoalteração bloqueada</span>
                      ) : (
                        <>
                          {u.status === "pending" && (
                            <Button size="sm" className="h-8 bg-emerald-600 hover:bg-emerald-700"
                              onClick={() => setPending({ user: u, kind: "status", nextValue: "approved" })}>
                              <Check className="h-4 w-4 mr-1" /> Aprovar
                            </Button>
                          )}
                          {u.status === "pending" && (
                            <Button size="sm" variant="outline" className="h-8 border-red-600 text-red-600 hover:bg-red-600 hover:text-white"
                              onClick={() => setPending({ user: u, kind: "status", nextValue: "rejected" })}>
                              <XCircle className="h-4 w-4 mr-1" /> Rejeitar
                            </Button>
                          )}
                          {u.status === "approved" && (
                            <Button size="sm" variant="outline"
                              className="h-8 border-urgent text-urgent hover:bg-urgent hover:text-white"
                              onClick={() => setPending({ user: u, kind: "status", nextValue: "blocked" })}>
                              <Ban className="h-4 w-4 mr-1" /> Bloquear
                            </Button>
                          )}
                          {(u.status === "blocked" || u.status === "rejected") && (
                            <Button size="sm" variant="outline"
                              className="h-8 border-emerald-600 text-emerald-600 hover:bg-emerald-600 hover:text-white"
                              onClick={() => setPending({ user: u, kind: "status", nextValue: "approved" })}>
                              <Check className="h-4 w-4 mr-1" /> Reativar
                            </Button>
                          )}
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* Mobile cards */}
        <div className="md:hidden divide-y divide-border">
          {loading ? (
            <div className="p-8 text-center text-muted-foreground text-sm">Carregando…</div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">Nenhum usuário encontrado.</div>
          ) : filtered.map((u) => {
            const founder = isFounder(u);
            const self = isSelf(u);
            const availableRoles = ROLES.filter((r) => r !== "super_admin" || isSuperAdmin);
            return (
              <div key={u.user_id} className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-display font-bold">{u.display_name || "Sem nome"}</span>
                      {founder && <span className="text-[9px] px-1.5 py-0.5 bg-amber-100 text-amber-900 border border-amber-300 font-black uppercase tracking-widest rounded-sm">Principal</span>}
                      {self && <span className="text-[9px] px-1.5 py-0.5 bg-blue-100 text-blue-900 border border-blue-300 font-black uppercase tracking-widest rounded-sm">Você</span>}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">{u.email}</div>
                  </div>
                  <span className={`px-2 py-0.5 text-[10px] font-black uppercase tracking-widest border rounded-sm shrink-0 ${statusBadge(u.status)}`}>
                    {statusLabel(u.status)}
                  </span>
                </div>
                <Select
                  value={u.role}
                  onValueChange={(v) => setPending({ user: u, kind: "role", nextValue: v })}
                  disabled={founder || (self && !isSuperAdmin)}
                >
                  <SelectTrigger className="h-10 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {availableRoles.map((r) => (
                      <SelectItem key={r} value={r} className="text-xs">
                        <span className="flex items-center font-bold">{roleIcon(r)} {ROLE_LABEL[r]}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {!founder && !self && (
                  <div className="flex flex-wrap gap-2">
                    {u.status === "pending" && (
                      <>
                        <Button size="sm" className="h-10 flex-1 bg-emerald-600 hover:bg-emerald-700"
                          onClick={() => setPending({ user: u, kind: "status", nextValue: "approved" })}>
                          <Check className="h-4 w-4 mr-1" /> Aprovar
                        </Button>
                        <Button size="sm" variant="outline" className="h-10 flex-1 border-red-600 text-red-600"
                          onClick={() => setPending({ user: u, kind: "status", nextValue: "rejected" })}>
                          <XCircle className="h-4 w-4 mr-1" /> Rejeitar
                        </Button>
                      </>
                    )}
                    {u.status === "approved" && (
                      <Button size="sm" variant="outline" className="h-10 w-full border-urgent text-urgent"
                        onClick={() => setPending({ user: u, kind: "status", nextValue: "blocked" })}>
                        <Ban className="h-4 w-4 mr-1" /> Bloquear
                      </Button>
                    )}
                    {(u.status === "blocked" || u.status === "rejected") && (
                      <Button size="sm" variant="outline" className="h-10 w-full border-emerald-600 text-emerald-600"
                        onClick={() => setPending({ user: u, kind: "status", nextValue: "approved" })}>
                        <Check className="h-4 w-4 mr-1" /> Reativar
                      </Button>
                    )}
                  </div>
                )}
                {(founder || self) && (
                  <div className="text-[10px] text-muted-foreground italic">
                    {founder ? "Superadministrador principal — protegido." : "Autoalteração bloqueada."}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <AlertDialog open={!!pending} onOpenChange={(o) => !o && !submitting && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{dialogTitle}</AlertDialogTitle>
            <AlertDialogDescription>{dialogDesc}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={submitting}
              onClick={(e) => { e.preventDefault(); execute(); }}
              className={pending?.nextValue === "blocked" || pending?.nextValue === "rejected" ? "bg-urgent hover:bg-urgent/90" : ""}
            >
              {submitting ? "Aplicando…" : "Confirmar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  );
}
