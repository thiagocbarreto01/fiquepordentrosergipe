import { useEffect, useMemo, useState } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Trash2, Upload, Pencil, X, CalendarClock, ExternalLink } from "lucide-react";
import {
  bannerFormSchema,
  isoToLocalInput,
  localInputToIso,
  safeBannerUploadName,
  validateBannerImage,
  type BannerFormValues,
} from "@/lib/bannerValidation";

type Position = BannerFormValues["position"];

const POSITIONS: {
  v: Position;
  label: string;
  page: string;
  desktop: string;
  mobile: string;
}[] = [
  { v: "topo_home", label: "Topo do portal", page: "Home / Categoria / Matéria", desktop: "1200×200", mobile: "320×150" },
  { v: "entre_noticias", label: "Entre notícias da Home", page: "Home", desktop: "1200×250", mobile: "320×150" },
  { v: "dentro_materia", label: "Dentro da matéria", page: "Matéria", desktop: "728×90 – 1200×200", mobile: "320×150" },
  { v: "final_materia", label: "Final da matéria", page: "Matéria", desktop: "970×180", mobile: "320×120" },
  { v: "lateral", label: "Lateral desktop", page: "Home sidebar / Matéria", desktop: "300×600", mobile: "—" },
  { v: "mobile_banner", label: "Banner exclusivo mobile", page: "Todas as páginas", desktop: "—", mobile: "320×100" },
  { v: "footer", label: "Rodapé", page: "Todas as páginas", desktop: "970×150", mobile: "320×100" },
];

const POSITION_LABEL: Record<Position, string> = Object.fromEntries(
  POSITIONS.map((p) => [p.v, p.label])
) as Record<Position, string>;

type BannerRow = {
  id: string;
  name: string;
  sponsor: string | null;
  image_url: string;
  link_url: string | null;
  position: Position | null;
  is_active: boolean;
  starts_at: string | null;
  ends_at: string | null;
  clicks: number;
  impressions: number;
  created_at: string;
};

const EMPTY: BannerFormValues = {
  name: "",
  sponsor: "",
  image_url: "",
  link_url: "",
  position: "topo_home",
  is_active: true,
  starts_at: "",
  ends_at: "",
};

function scheduleState(b: BannerRow): { label: string; tone: "active" | "scheduled" | "expired" | "paused" } {
  if (!b.is_active) return { label: "Pausado", tone: "paused" };
  const now = Date.now();
  const s = b.starts_at ? new Date(b.starts_at).getTime() : null;
  const e = b.ends_at ? new Date(b.ends_at).getTime() : null;
  if (s && s > now) return { label: "Agendado", tone: "scheduled" };
  if (e && e < now) return { label: "Expirado", tone: "expired" };
  return { label: "Ativo", tone: "active" };
}

export default function AdminBanners() {
  const { isAdmin } = useAuth();
  const [items, setItems] = useState<BannerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<BannerFormValues>(EMPTY);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof BannerFormValues, string>>>({});
  const [deleteTarget, setDeleteTarget] = useState<BannerRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    document.title = "Banners & Patrocinadores — Painel";
    load();
  }, []);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("banners")
      .select("id,name,sponsor,image_url,link_url,position,is_active,starts_at,ends_at,clicks,impressions,created_at")
      .order("created_at", { ascending: false });
    if (error) toast.error("Falha ao carregar banners: " + error.message);
    setItems((data ?? []) as BannerRow[]);
    setLoading(false);
  }

  const summary = useMemo(() => {
    const total = items.length;
    let active = 0, scheduled = 0, expired = 0, paused = 0;
    for (const b of items) {
      const s = scheduleState(b).tone;
      if (s === "active") active++;
      else if (s === "scheduled") scheduled++;
      else if (s === "expired") expired++;
      else paused++;
    }
    return { total, active, scheduled, expired, paused };
  }, [items]);

  async function handleUpload(file: File) {
    setUploading(true);
    try {
      const check = await validateBannerImage(file);
      if (check.ok === false) {
        toast.error(check.message);
        return;
      }
      const path = safeBannerUploadName(file.name);
      const { error } = await supabase.storage
        .from("media")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (error) {
        toast.error("Upload falhou: " + error.message);
        return;
      }
      const { data } = supabase.storage.from("media").getPublicUrl(path);
      setForm((f) => ({ ...f, image_url: data.publicUrl }));
      setErrors((e) => ({ ...e, image_url: undefined }));
      toast.success("Imagem enviada");
    } finally {
      setUploading(false);
    }
  }

  function startEdit(b: BannerRow) {
    setEditingId(b.id);
    setErrors({});
    setForm({
      name: b.name ?? "",
      sponsor: b.sponsor ?? "",
      image_url: b.image_url ?? "",
      link_url: b.link_url ?? "",
      position: (b.position ?? "topo_home") as Position,
      is_active: !!b.is_active,
      starts_at: isoToLocalInput(b.starts_at),
      ends_at: isoToLocalInput(b.ends_at),
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(EMPTY);
    setErrors({});
  }

  async function save() {
    const parsed = bannerFormSchema.safeParse(form);
    if (!parsed.success) {
      const fieldErrors: typeof errors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof BannerFormValues;
        if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
      }
      setErrors(fieldErrors);
      toast.error("Confira os campos destacados");
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      const v = parsed.data;
      const payload = {
        name: v.name,
        sponsor: v.sponsor ? v.sponsor : null,
        image_url: v.image_url,
        link_url: v.link_url,
        position: v.position,
        is_active: v.is_active,
        starts_at: localInputToIso(v.starts_at),
        ends_at: localInputToIso(v.ends_at),
      };
      if (editingId) {
        const { error } = await supabase.from("banners").update(payload).eq("id", editingId);
        if (error) {
          toast.error("Falha ao salvar: " + error.message);
          return;
        }
        toast.success("Banner atualizado");
      } else {
        const { error } = await supabase.from("banners").insert(payload);
        if (error) {
          toast.error("Falha ao criar: " + error.message);
          return;
        }
        toast.success("Banner criado");
      }
      cancelEdit();
      load();
    } finally {
      setSaving(false);
    }
  }

  async function toggle(b: BannerRow, is_active: boolean) {
    const { error } = await supabase.from("banners").update({ is_active }).eq("id", b.id);
    if (error) return toast.error(error.message);
    setItems((prev) => prev.map((it) => (it.id === b.id ? { ...it, is_active } : it)));
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const { error } = await supabase.from("banners").delete().eq("id", deleteTarget.id);
      if (error) {
        toast.error("Falha ao excluir: " + error.message);
        return;
      }
      toast.success("Banner excluído");
      setItems((prev) => prev.filter((it) => it.id !== deleteTarget.id));
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <AdminLayout>
      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div>
          <h1 className="font-display text-3xl font-black">Banners & Patrocinadores</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Gestão de campanhas por posição, com agendamento e validação de mídia.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <Badge variant="secondary">Total: {summary.total}</Badge>
          <Badge className="bg-emerald-600/15 text-emerald-700 border border-emerald-600/30">Ativos: {summary.active}</Badge>
          <Badge className="bg-sky-600/15 text-sky-700 border border-sky-600/30">Agendados: {summary.scheduled}</Badge>
          <Badge className="bg-amber-600/15 text-amber-700 border border-amber-600/30">Pausados: {summary.paused}</Badge>
          <Badge className="bg-muted text-muted-foreground border">Expirados: {summary.expired}</Badge>
        </div>
      </div>

      <div className="grid lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)] gap-6">
        {/* FORMULÁRIO */}
        <div className="bg-card border border-border rounded-md p-4 space-y-4 h-fit lg:sticky lg:top-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold uppercase tracking-wider text-xs">
              {editingId ? "Editar campanha" : "Nova campanha"}
            </h3>
            {editingId && (
              <button
                type="button"
                onClick={cancelEdit}
                className="text-xs flex items-center gap-1 text-muted-foreground hover:text-foreground min-h-[36px] px-2"
              >
                <X className="h-3 w-3" /> Cancelar
              </button>
            )}
          </div>

          <div>
            <Label htmlFor="banner-name">Nome interno</Label>
            <Input
              id="banner-name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              aria-invalid={!!errors.name}
            />
            {errors.name && <p className="text-xs text-destructive mt-1">{errors.name}</p>}
          </div>

          <div>
            <Label htmlFor="banner-sponsor">Patrocinador</Label>
            <Input
              id="banner-sponsor"
              value={form.sponsor ?? ""}
              onChange={(e) => setForm({ ...form, sponsor: e.target.value })}
            />
          </div>

          <div>
            <Label>Imagem</Label>
            {form.image_url && (
              <img
                src={form.image_url}
                alt="Prévia"
                className="max-h-32 mb-2 rounded border border-border object-contain bg-muted/30"
              />
            )}
            <label className="inline-flex items-center gap-2 px-3 py-2 border border-border bg-secondary hover:bg-secondary/80 cursor-pointer text-sm rounded min-h-[44px]">
              <Upload className="h-4 w-4" />
              {uploading ? "Enviando…" : "Enviar imagem"}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleUpload(f);
                  e.currentTarget.value = "";
                }}
              />
            </label>
            <Input
              className="mt-2"
              placeholder="ou cole a URL (https://…)"
              value={form.image_url}
              onChange={(e) => setForm({ ...form, image_url: e.target.value })}
              aria-invalid={!!errors.image_url}
            />
            {errors.image_url && <p className="text-xs text-destructive mt-1">{errors.image_url}</p>}
            <p className="text-[11px] text-muted-foreground mt-1">
              JPEG/PNG/WebP, até 4 MB, mínimo 320×80.
            </p>
          </div>

          <div>
            <Label htmlFor="banner-link">Link (opcional)</Label>
            <Input
              id="banner-link"
              placeholder="https://…"
              value={form.link_url ?? ""}
              onChange={(e) => setForm({ ...form, link_url: e.target.value })}
              aria-invalid={!!errors.link_url}
            />
            {errors.link_url && <p className="text-xs text-destructive mt-1">{errors.link_url}</p>}
          </div>

          <div>
            <Label htmlFor="banner-position">Posição</Label>
            <Select
              value={form.position}
              onValueChange={(v) => setForm({ ...form, position: v as Position })}
            >
              <SelectTrigger id="banner-position">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {POSITIONS.map((p) => (
                  <SelectItem key={p.v} value={p.v}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground mt-1">
              {POSITIONS.find((p) => p.v === form.position)?.page} · desktop{" "}
              {POSITIONS.find((p) => p.v === form.position)?.desktop} · mobile{" "}
              {POSITIONS.find((p) => p.v === form.position)?.mobile}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="banner-starts" className="flex items-center gap-1">
                <CalendarClock className="h-3 w-3" /> Início
              </Label>
              <Input
                id="banner-starts"
                type="datetime-local"
                value={form.starts_at ?? ""}
                onChange={(e) => setForm({ ...form, starts_at: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="banner-ends" className="flex items-center gap-1">
                <CalendarClock className="h-3 w-3" /> Fim
              </Label>
              <Input
                id="banner-ends"
                type="datetime-local"
                value={form.ends_at ?? ""}
                onChange={(e) => setForm({ ...form, ends_at: e.target.value })}
                aria-invalid={!!errors.ends_at}
              />
              {errors.ends_at && <p className="text-xs text-destructive mt-1">{errors.ends_at}</p>}
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground -mt-2">
            Deixe em branco para veicular sem prazo. Horário local (Maceió).
          </p>

          <label className="flex items-center gap-2 min-h-[44px]">
            <Switch
              checked={form.is_active}
              onCheckedChange={(v) => setForm({ ...form, is_active: v })}
            />
            <span className="text-sm">Ativo</span>
          </label>

          <Button onClick={save} disabled={saving || uploading} className="w-full min-h-[44px]">
            {saving ? "Salvando…" : editingId ? "Salvar alterações" : "Criar campanha"}
          </Button>
        </div>

        {/* LISTA */}
        <div className="space-y-3 min-w-0">
          {loading && <p className="text-sm text-muted-foreground">Carregando…</p>}
          {!loading && items.length === 0 && (
            <div className="bg-card border border-dashed border-border rounded-md p-8 text-center">
              <p className="text-sm text-muted-foreground">
                Nenhuma campanha cadastrada. Use o formulário ao lado para criar a primeira.
              </p>
            </div>
          )}
          {items.map((b) => {
            const s = scheduleState(b);
            const pos = POSITION_LABEL[b.position as Position] ?? b.position ?? "—";
            return (
              <div
                key={b.id}
                className={`bg-card border rounded-md p-3 flex flex-col sm:flex-row gap-3 sm:items-center ${
                  editingId === b.id ? "border-primary ring-1 ring-primary/30" : "border-border"
                }`}
              >
                <img
                  src={b.image_url}
                  alt={b.name}
                  className="w-full sm:w-28 h-20 object-contain bg-muted/30 rounded border border-border shrink-0"
                  loading="lazy"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold truncate">{b.name}</span>
                    <Badge
                      className={
                        s.tone === "active"
                          ? "bg-emerald-600/15 text-emerald-700 border border-emerald-600/30"
                          : s.tone === "scheduled"
                          ? "bg-sky-600/15 text-sky-700 border border-sky-600/30"
                          : s.tone === "expired"
                          ? "bg-muted text-muted-foreground border"
                          : "bg-amber-600/15 text-amber-700 border border-amber-600/30"
                      }
                    >
                      {s.label}
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {pos} · {b.sponsor || "sem patrocinador"}
                  </div>
                  {(b.starts_at || b.ends_at) && (
                    <div className="text-[11px] text-muted-foreground mt-1">
                      {b.starts_at ? new Date(b.starts_at).toLocaleString("pt-BR") : "—"} →{" "}
                      {b.ends_at ? new Date(b.ends_at).toLocaleString("pt-BR") : "sem prazo"}
                    </div>
                  )}
                  {b.link_url && (
                    <a
                      href={b.link_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] text-primary hover:underline inline-flex items-center gap-1 mt-1"
                    >
                      <ExternalLink className="h-3 w-3" /> Abrir link
                    </a>
                  )}
                </div>
                <div className="flex items-center gap-1 sm:gap-2 self-end sm:self-center">
                  <Switch
                    checked={b.is_active}
                    onCheckedChange={(v) => toggle(b, v)}
                    aria-label={b.is_active ? "Pausar" : "Ativar"}
                  />
                  <button
                    type="button"
                    onClick={() => startEdit(b)}
                    className={`p-2 rounded hover:bg-primary/10 min-h-[44px] min-w-[44px] flex items-center justify-center ${
                      editingId === b.id ? "text-primary" : ""
                    }`}
                    title="Editar"
                    aria-label="Editar"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(b)}
                      className="p-2 rounded text-destructive hover:bg-destructive/10 min-h-[44px] min-w-[44px] flex items-center justify-center"
                      title="Excluir"
                      aria-label="Excluir"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir campanha?</AlertDialogTitle>
            <AlertDialogDescription>
              A campanha <strong>{deleteTarget?.name}</strong> será removida permanentemente. Esta
              ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                confirmDelete();
              }}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Excluindo…" : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  );
}
