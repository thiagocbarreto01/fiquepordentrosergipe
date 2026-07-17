import { useEffect, useMemo, useState } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Archive, ArchiveRestore, History, MapPin, Phone, Mail, Trash2, User } from "lucide-react";

type Status = "nova" | "em_apuracao" | "publicada" | "arquivada";

const STATUS_LABEL: Record<Status, string> = {
  nova: "Nova",
  em_apuracao: "Em apuração",
  publicada: "Publicada",
  arquivada: "Arquivada",
};
const STATUS_COLOR: Record<Status, string> = {
  nova: "bg-blue-100 text-blue-800 border-blue-200",
  em_apuracao: "bg-amber-100 text-amber-800 border-amber-200",
  publicada: "bg-emerald-100 text-emerald-800 border-emerald-200",
  arquivada: "bg-slate-200 text-slate-700 border-slate-300",
};
const ACTIVE_TABS: Array<{ key: "todas" | Status; label: string }> = [
  { key: "todas", label: "Todas ativas" },
  { key: "nova", label: "Novas" },
  { key: "em_apuracao", label: "Em apuração" },
  { key: "publicada", label: "Publicadas" },
  { key: "arquivada", label: "Arquivadas" },
];

interface Denuncia {
  id: string;
  title: string;
  description: string;
  city: string | null;
  is_anonymous: boolean;
  status: Status;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  archived_reason: string | null;
  internal_notes: string | null;
}

export default function AdminDenuncias() {
  const { isAdmin } = useAuth();
  const [items, setItems] = useState<Denuncia[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"todas" | Status>("todas");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const [statusDialog, setStatusDialog] = useState<{ d: Denuncia; next: Status } | null>(null);
  const [archiveDialog, setArchiveDialog] = useState<Denuncia | null>(null);
  const [archiveReason, setArchiveReason] = useState("");
  const [restoreDialog, setRestoreDialog] = useState<Denuncia | null>(null);
  const [deleteDialog, setDeleteDialog] = useState<Denuncia | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [historyOf, setHistoryOf] = useState<Denuncia | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [notesOf, setNotesOf] = useState<Denuncia | null>(null);
  const [notesDraft, setNotesDraft] = useState("");

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("denuncias")
      .select("id,title,description,city,is_anonymous,status,contact_name,contact_phone,contact_email,created_at,updated_at,archived_at,archived_reason,internal_notes")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) toast.error(error.message);
    setItems((data ?? []) as Denuncia[]);
    setLoading(false);
  }

  useEffect(() => { document.title = "Denúncias — Painel"; load(); }, []);

  const counts = useMemo(() => {
    const c: Record<string, number> = { todas: 0, nova: 0, em_apuracao: 0, publicada: 0, arquivada: 0 };
    for (const d of items) {
      c[d.status] = (c[d.status] || 0) + 1;
      if (d.status !== "arquivada") c.todas += 1;
    }
    return c;
  }, [items]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return items.filter((d) => {
      if (tab === "todas" ? d.status === "arquivada" : d.status !== tab) return false;
      if (!term) return true;
      return (
        d.title.toLowerCase().includes(term) ||
        d.description.toLowerCase().includes(term) ||
        (d.city ?? "").toLowerCase().includes(term)
      );
    });
  }, [items, tab, q]);

  async function changeStatus(d: Denuncia, next: Status) {
    setBusy(d.id);
    const { error } = await supabase.rpc("denuncia_set_status", { _id: d.id, _status: next, _note: null });
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success("Status atualizado.");
    setStatusDialog(null);
    load();
  }

  async function archive(d: Denuncia) {
    if (archiveReason.trim().length < 3) return toast.error("Informe um motivo (mín. 3 caracteres).");
    setBusy(d.id);
    const { error } = await supabase.rpc("denuncia_archive", { _id: d.id, _reason: archiveReason.trim() });
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success("Denúncia arquivada.");
    setArchiveDialog(null); setArchiveReason("");
    load();
  }

  async function restore(d: Denuncia) {
    setBusy(d.id);
    const { error } = await supabase.rpc("denuncia_restore", { _id: d.id });
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success("Denúncia restaurada.");
    setRestoreDialog(null);
    load();
  }

  async function del(d: Denuncia) {
    if (deleteConfirm !== "EXCLUIR") return toast.error("Digite EXCLUIR para confirmar.");
    setBusy(d.id);
    const { error } = await supabase.rpc("denuncia_delete", { _id: d.id, _confirm: "EXCLUIR" });
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success("Denúncia excluída.");
    setDeleteDialog(null); setDeleteConfirm("");
    load();
  }

  async function openHistory(d: Denuncia) {
    setHistoryOf(d); setHistory([]);
    const { data } = await supabase
      .from("denuncia_status_history")
      .select("id,from_status,to_status,note,changed_at,changed_by")
      .eq("denuncia_id", d.id)
      .order("changed_at", { ascending: false });
    setHistory(data ?? []);
  }

  async function saveNotes(d: Denuncia) {
    setBusy(d.id);
    const { error } = await supabase.rpc("denuncia_update_notes", { _id: d.id, _internal_notes: notesDraft, _assigned_to: null });
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success("Notas salvas.");
    setNotesOf(null);
    load();
  }

  return (
    <AdminLayout>
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-6">
        <div>
          <h1 className="font-display text-3xl font-black">Denúncias</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Envio público protegido por Edge Function. Ações do painel exigem sessão de editor ou administrador.
          </p>
        </div>
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por título, descrição ou cidade…"
          className="md:max-w-sm"
        />
      </div>

      <div className="flex flex-wrap gap-2 mb-5 border-b border-border pb-3">
        {ACTIVE_TABS.map((t) => {
          const active = tab === t.key;
          const n = counts[t.key] ?? 0;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-3 py-2 text-xs font-black uppercase tracking-wider rounded-sm border transition-colors min-h-11 ${
                active ? "bg-primary text-primary-foreground border-primary" : "bg-secondary text-foreground border-border hover:border-primary/40"
              }`}
            >
              {t.label} <span className="ml-1 opacity-80">({n})</span>
            </button>
          );
        })}
      </div>

      {loading ? (
        <p className="text-muted-foreground">Carregando…</p>
      ) : filtered.length === 0 ? (
        <div className="bg-secondary/50 border border-dashed border-border p-10 text-center rounded-sm">
          <p className="text-muted-foreground">Nenhuma denúncia nesta visão.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((d) => (
            <article key={d.id} className="bg-card border border-border rounded-sm p-4 md:p-5 shadow-sm hover:border-primary/30 transition-colors">
              <header className="flex flex-col md:flex-row md:items-start md:justify-between gap-3 mb-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <span className={`px-2 py-0.5 text-[10px] font-black uppercase tracking-wider border rounded-sm ${STATUS_COLOR[d.status]}`}>
                      {STATUS_LABEL[d.status]}
                    </span>
                    {d.is_anonymous && (
                      <span className="bg-slate-800 text-white text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-sm">Anônima</span>
                    )}
                    {d.internal_notes && (
                      <span className="bg-primary/10 text-primary text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-sm">Com notas</span>
                    )}
                  </div>
                  <h3 className="font-display text-lg md:text-xl font-black break-words">{d.title}</h3>
                  <div className="text-xs text-muted-foreground flex flex-wrap gap-x-3 gap-y-1 mt-1">
                    <span>{new Date(d.created_at).toLocaleString("pt-BR", { timeZone: "America/Maceio" })}</span>
                    {d.city && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" /> {d.city}</span>}
                    {!d.is_anonymous && d.contact_name && <span className="inline-flex items-center gap-1"><User className="h-3 w-3" /> {d.contact_name}</span>}
                  </div>
                </div>
                <div className="flex flex-col gap-2 md:min-w-[200px]">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Alterar status</div>
                  <Select
                    value={d.status}
                    onValueChange={(v) => {
                      const next = v as Status;
                      if (next === d.status) return;
                      if (next === "arquivada") { setArchiveDialog(d); return; }
                      setStatusDialog({ d, next });
                    }}
                    disabled={busy === d.id || d.status === "arquivada"}
                  >
                    <SelectTrigger className="h-11 text-xs font-bold uppercase tracking-wider"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(["nova", "em_apuracao", "publicada", "arquivada"] as Status[]).map((s) => (
                        <SelectItem key={s} value={s} className="text-xs font-bold uppercase tracking-wider">{STATUS_LABEL[s]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </header>

              <div className="p-3 md:p-4 bg-secondary/50 border border-border rounded-sm text-sm whitespace-pre-wrap leading-relaxed break-words">
                {d.description}
              </div>

              {!d.is_anonymous && (d.contact_phone || d.contact_email) && (
                <div className="mt-3 text-xs bg-primary/5 p-2 rounded-sm border border-primary/10 flex flex-wrap gap-3">
                  <span className="font-bold text-primary uppercase text-[10px]">Contato</span>
                  {d.contact_phone && <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" /> {d.contact_phone}</span>}
                  {d.contact_email && <span className="inline-flex items-center gap-1"><Mail className="h-3 w-3" /> {d.contact_email}</span>}
                </div>
              )}

              {d.status === "arquivada" && d.archived_reason && (
                <div className="mt-3 text-xs text-muted-foreground border-l-2 border-slate-400 pl-3">
                  Arquivada em {d.archived_at ? new Date(d.archived_at).toLocaleString("pt-BR", { timeZone: "America/Maceio" }) : "—"} — Motivo: {d.archived_reason}
                </div>
              )}

              {d.internal_notes && (
                <div className="mt-3 text-xs bg-amber-50 border border-amber-200 rounded-sm p-2 whitespace-pre-wrap">
                  <strong className="uppercase tracking-wider text-[10px] text-amber-800">Notas internas: </strong>
                  {d.internal_notes}
                </div>
              )}

              <footer className="mt-4 pt-3 border-t border-border flex flex-wrap items-center justify-end gap-2">
                <Button variant="ghost" size="sm" className="min-h-11 text-xs font-bold uppercase tracking-wider" onClick={() => { setNotesOf(d); setNotesDraft(d.internal_notes ?? ""); }}>
                  Notas internas
                </Button>
                <Button variant="ghost" size="sm" className="min-h-11 text-xs font-bold uppercase tracking-wider" onClick={() => openHistory(d)}>
                  <History className="h-3.5 w-3.5 mr-1" /> Histórico
                </Button>
                {d.status === "arquivada" ? (
                  <Button variant="outline" size="sm" className="min-h-11 text-xs font-bold uppercase tracking-wider" onClick={() => setRestoreDialog(d)}>
                    <ArchiveRestore className="h-3.5 w-3.5 mr-1" /> Restaurar
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" className="min-h-11 text-xs font-bold uppercase tracking-wider" onClick={() => setArchiveDialog(d)}>
                    <Archive className="h-3.5 w-3.5 mr-1" /> Arquivar
                  </Button>
                )}
                {isAdmin && (
                  <Button
                    variant="ghost" size="sm"
                    className="min-h-11 text-xs font-bold uppercase tracking-wider text-urgent hover:bg-urgent/10 hover:text-urgent"
                    onClick={() => { setDeleteDialog(d); setDeleteConfirm(""); }}
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-1" /> Excluir
                  </Button>
                )}
              </footer>
            </article>
          ))}
        </div>
      )}

      {/* Confirmar mudança de status */}
      <AlertDialog open={!!statusDialog} onOpenChange={(o) => !o && setStatusDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Alterar status?</AlertDialogTitle>
            <AlertDialogDescription>
              A denúncia passará de <strong>{statusDialog && STATUS_LABEL[statusDialog.d.status]}</strong> para{" "}
              <strong>{statusDialog && STATUS_LABEL[statusDialog.next]}</strong>. A mudança fica registrada no histórico.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => statusDialog && changeStatus(statusDialog.d, statusDialog.next)}
              disabled={!!busy}
            >
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Arquivar */}
      <AlertDialog open={!!archiveDialog} onOpenChange={(o) => { if (!o) { setArchiveDialog(null); setArchiveReason(""); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Arquivar denúncia</AlertDialogTitle>
            <AlertDialogDescription>
              Denúncias arquivadas saem das visões ativas mas permanecem auditáveis. Informe um motivo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea
            value={archiveReason}
            onChange={(e) => setArchiveReason(e.target.value)}
            placeholder="Motivo do arquivamento (mín. 3 caracteres)"
            rows={3}
            maxLength={500}
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => archiveDialog && archive(archiveDialog)} disabled={!!busy || archiveReason.trim().length < 3}>
              Arquivar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Restaurar */}
      <AlertDialog open={!!restoreDialog} onOpenChange={(o) => !o && setRestoreDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restaurar denúncia?</AlertDialogTitle>
            <AlertDialogDescription>Volta ao status anterior ao arquivamento (ou "Nova" se não houver).</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => restoreDialog && restore(restoreDialog)} disabled={!!busy}>Restaurar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Excluir */}
      <AlertDialog open={!!deleteDialog} onOpenChange={(o) => { if (!o) { setDeleteDialog(null); setDeleteConfirm(""); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-urgent">Excluir permanentemente?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação é irreversível. A denúncia e seu histórico serão removidos. Digite <strong>EXCLUIR</strong> para confirmar.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input value={deleteConfirm} onChange={(e) => setDeleteConfirm(e.target.value)} placeholder="Digite EXCLUIR" autoFocus />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteDialog && del(deleteDialog)}
              disabled={!!busy || deleteConfirm !== "EXCLUIR"}
              className="bg-urgent hover:bg-urgent/90 text-urgent-foreground"
            >
              Excluir para sempre
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Notas internas */}
      <Dialog open={!!notesOf} onOpenChange={(o) => !o && setNotesOf(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Notas internas</DialogTitle></DialogHeader>
          <p className="text-xs text-muted-foreground">Visíveis apenas para editores e administradores. Não aparecem para o denunciante.</p>
          <Textarea rows={6} value={notesDraft} onChange={(e) => setNotesDraft(e.target.value)} maxLength={2000} placeholder="Ex.: contato feito com fonte X em 12/03…" />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setNotesOf(null)}>Cancelar</Button>
            <Button onClick={() => notesOf && saveNotes(notesOf)} disabled={!!busy}>Salvar notas</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Histórico */}
      <Dialog open={!!historyOf} onOpenChange={(o) => !o && setHistoryOf(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Histórico de status</DialogTitle></DialogHeader>
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma alteração registrada ainda.</p>
          ) : (
            <ul className="space-y-2 max-h-[60vh] overflow-auto">
              {history.map((h) => (
                <li key={h.id} className="border border-border rounded-sm p-3 text-sm">
                  <div className="text-xs text-muted-foreground mb-1">
                    {new Date(h.changed_at).toLocaleString("pt-BR", { timeZone: "America/Maceio" })}
                  </div>
                  <div>
                    <span className="font-bold uppercase text-[10px]">{h.from_status ?? "—"}</span>
                    {" → "}
                    <span className="font-bold uppercase text-[10px] text-primary">{h.to_status}</span>
                  </div>
                  {h.note && <div className="mt-1 text-muted-foreground whitespace-pre-wrap">{h.note}</div>}
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
