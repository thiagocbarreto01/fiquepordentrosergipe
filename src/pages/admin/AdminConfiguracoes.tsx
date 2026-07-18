import { useEffect, useMemo, useState } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useAdminSiteSettings, type AdminSiteSettings } from "@/hooks/useAdminSiteSettings";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AlertTriangle, ShieldCheck, Info } from "lucide-react";

const OFFICIAL_DOMAIN = "fiquepordentrosergipe.com.br";

const URL_RE = /^https:\/\/[A-Za-z0-9._~%-]+(:[0-9]+)?(\/.*)?$/;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const HANDLE_RE = /^[A-Za-z0-9._]{1,30}$/;

type FieldKey = keyof Pick<
  AdminSiteSettings,
  "site_name" | "instagram_handle" | "instagram_url" | "facebook_url"
  | "threads_url" | "whatsapp_url" | "youtube_url" | "contact_email"
>;

const PUBLIC_FIELDS: { key: FieldKey; label: string; placeholder?: string; hint?: string }[] = [
  { key: "site_name", label: "Nome do site" },
  { key: "instagram_handle", label: "Handle do Instagram (sem @)", placeholder: "fiquepordentrose", hint: "Somente letras, números, ponto e sublinhado." },
  { key: "instagram_url", label: "URL do Instagram", placeholder: "https://instagram.com/fiquepordentrose" },
  { key: "facebook_url", label: "URL do Facebook", placeholder: "https://facebook.com/..." },
  { key: "threads_url", label: "URL do Threads", placeholder: "https://threads.net/@..." },
  { key: "whatsapp_url", label: "URL do WhatsApp", placeholder: "https://wa.me/55..." },
  { key: "youtube_url", label: "URL do YouTube", placeholder: "https://youtube.com/@..." },
  { key: "contact_email", label: "E-mail público de contato" },
];

const URL_FIELDS: FieldKey[] = ["instagram_url", "facebook_url", "threads_url", "whatsapp_url", "youtube_url"];

function validateForm(form: AdminSiteSettings): Record<string, string> {
  const errs: Record<string, string> = {};
  if (!form.site_name?.trim()) errs.site_name = "Nome do site é obrigatório.";
  const h = (form.instagram_handle || "").replace(/^@/, "").trim();
  if (h && !HANDLE_RE.test(h)) errs.instagram_handle = "Handle inválido (só letras, números, . e _).";
  if (form.contact_email && !EMAIL_RE.test(form.contact_email.trim())) {
    errs.contact_email = "E-mail em formato inválido.";
  }
  URL_FIELDS.forEach((k) => {
    const v = (form[k] || "").trim();
    if (v && !URL_RE.test(v)) errs[k] = "URL precisa começar com https:// e ser válida.";
  });
  return errs;
}

function auditWarnings(form: AdminSiteSettings): string[] {
  const w: string[] = [];
  // Placeholder detection: reticências ou "..." remanescentes
  URL_FIELDS.forEach((k) => {
    const v = (form[k] || "").trim();
    if (v && /\.\.\.|\/\.\.\.$/.test(v)) w.push(`${k}: parece um placeholder (contém "...").`);
  });
  // Handle vs URL do Instagram
  const h = (form.instagram_handle || "").replace(/^@/, "").trim().toLowerCase();
  const iu = (form.instagram_url || "").trim().toLowerCase();
  if (h && iu && !iu.includes(h)) {
    w.push(`Handle "${h}" não aparece na URL do Instagram — verifique se são a mesma conta.`);
  }
  // E-mail com domínio divergente do domínio oficial
  const email = (form.contact_email || "").trim().toLowerCase();
  if (email && EMAIL_RE.test(email)) {
    const dom = email.split("@")[1];
    if (dom && !dom.endsWith(OFFICIAL_DOMAIN)) {
      w.push(`E-mail usa domínio "${dom}", diferente do oficial "${OFFICIAL_DOMAIN}".`);
    }
  }
  return w;
}

export default function AdminConfiguracoes() {
  const qc = useQueryClient();
  const { isAdmin } = useAuth();
  const { data: initial } = useAdminSiteSettings(!!isAdmin);
  const [form, setForm] = useState<AdminSiteSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    if (initial && !form) setForm(initial);
  }, [initial, form]);

  const errors = useMemo(() => (form ? validateForm(form) : {}), [form]);
  const warnings = useMemo(() => (form ? auditWarnings(form) : []), [form]);
  const hasErrors = Object.keys(errors).length > 0;

  const attemptSave = () => {
    if (!form) return;
    if (hasErrors) {
      toast.error("Corrija os campos destacados antes de salvar.");
      return;
    }
    setConfirmOpen(true);
  };

  const save = async () => {
    if (!form) return;
    setConfirmOpen(false);
    setSaving(true);
    // Normaliza handle antes de enviar
    const payload: AdminSiteSettings = {
      ...form,
      instagram_handle: (form.instagram_handle || "").replace(/^@/, "").trim(),
      site_name: form.site_name.trim(),
      contact_email: (form.contact_email || "").trim(),
      instagram_url: (form.instagram_url || "").trim(),
      facebook_url: (form.facebook_url || "").trim(),
      threads_url: (form.threads_url || "").trim(),
      whatsapp_url: (form.whatsapp_url || "").trim(),
      youtube_url: (form.youtube_url || "").trim(),
    };
    const { error } = await supabase.from("site_settings").update(payload).eq("id", true);
    setSaving(false);
    if (error) {
      const msg = (error.message || "").toLowerCase();
      const friendly =
        msg.includes("site_name_required") ? "Nome do site é obrigatório." :
        msg.includes("instagram_handle_invalid") ? "Handle do Instagram inválido." :
        msg.includes("contact_email_invalid") ? "E-mail em formato inválido." :
        msg.match(/(instagram|facebook|threads|whatsapp|youtube)_url_invalid/) ?
          `URL de ${(msg.match(/(instagram|facebook|threads|whatsapp|youtube)/) || [])[0]} inválida (use https://).` :
        error.message;
      toast.error("Falha ao salvar: " + friendly);
      return;
    }
    toast.success("Configurações salvas");
    qc.invalidateQueries({ queryKey: ["site_settings_public"] });
    qc.invalidateQueries({ queryKey: ["site_settings_admin"] });
  };

  if (!form) {
    return <AdminLayout><div className="p-6">Carregando…</div></AdminLayout>;
  }

  return (
    <AdminLayout>
      <div className="max-w-3xl">
        <div className="mb-6">
          <h1 className="text-2xl font-black">Configurações do site</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Dados públicos aparecem no header, footer e SEO. Recursos internos ficam ocultos do visitante.
          </p>
        </div>

        {/* Auditoria visual */}
        {warnings.length > 0 && (
          <div className="mb-6 border border-amber-300 bg-amber-50 text-amber-900 rounded-sm p-4">
            <div className="flex items-center gap-2 font-bold text-sm mb-2">
              <AlertTriangle className="h-4 w-4" /> Auditoria — revisar valores
            </div>
            <ul className="text-sm space-y-1 list-disc pl-5">
              {warnings.map((w, i) => <li key={i}>{w}</li>)}
            </ul>
            <p className="text-xs mt-2 opacity-80">
              Esses avisos não impedem salvar. Confirme se são intencionais.
            </p>
          </div>
        )}

        {/* Configurações públicas */}
        <section className="bg-card border rounded-sm p-6 space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-border">
            <ShieldCheck className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-bold uppercase tracking-wider">Configurações públicas</h2>
          </div>
          <p className="text-xs text-muted-foreground -mt-2">
            Consumidas pelo site público via <code>get_public_site_settings()</code>.
          </p>

          {PUBLIC_FIELDS.map((f) => (
            <div key={f.key}>
              <Label className="text-xs font-bold uppercase tracking-wider">{f.label}</Label>
              <Input
                value={(form[f.key] as string) ?? ""}
                placeholder={f.placeholder}
                onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                className={`mt-1 ${errors[f.key] ? "border-destructive" : ""}`}
                aria-invalid={!!errors[f.key]}
              />
              {errors[f.key] ? (
                <p className="text-xs text-destructive mt-1">{errors[f.key]}</p>
              ) : f.hint ? (
                <p className="text-xs text-muted-foreground mt-1">{f.hint}</p>
              ) : null}
            </div>
          ))}
        </section>

        {/* Configurações internas — só admin */}
        {isAdmin && (
          <section className="bg-card border rounded-sm p-6 mt-6 space-y-4">
            <div className="flex items-center gap-2 pb-2 border-b border-border">
              <Info className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-bold uppercase tracking-wider">Configurações internas</h2>
            </div>
            <p className="text-xs text-muted-foreground -mt-2">
              Recursos administrativos. Nunca expostos a visitantes anônimos.
            </p>

            <div className="flex items-start justify-between gap-4">
              <div>
                <Label className="text-sm font-semibold">Recaptura assistida</Label>
                <p className="text-xs text-muted-foreground mt-1 max-w-md">
                  Permite reextrair o conteúdo da fonte original e comparar antes de substituir.
                  Só admins veem o botão no editor.
                </p>
              </div>
              <Switch
                checked={!!form.recapture_assisted_enabled}
                onCheckedChange={(v) => setForm({ ...form, recapture_assisted_enabled: v })}
              />
            </div>
          </section>
        )}

        <div className="mt-6 flex items-center gap-3">
          <Button onClick={attemptSave} disabled={saving || hasErrors}>
            {saving ? "Salvando…" : "Salvar configurações"}
          </Button>
          {hasErrors && (
            <span className="text-xs text-destructive">
              {Object.keys(errors).length} campo(s) com erro
            </span>
          )}
        </div>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar alterações</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>
                  As configurações públicas serão aplicadas imediatamente no header, footer e nos
                  metadados sociais do site.
                </p>
                {warnings.length > 0 && (
                  <div className="mt-2 rounded-sm border border-amber-300 bg-amber-50 p-3 text-amber-900 text-sm">
                    <div className="font-semibold mb-1 flex items-center gap-1">
                      <AlertTriangle className="h-3.5 w-3.5" /> Avisos pendentes
                    </div>
                    <ul className="list-disc pl-5 space-y-0.5">
                      {warnings.map((w, i) => <li key={i}>{w}</li>)}
                    </ul>
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={save}>Salvar mesmo assim</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  );
}
