import { useEffect, useState } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import type { SiteSettings } from "@/hooks/useSiteSettings";

const FIELDS: { key: keyof SiteSettings; label: string; placeholder?: string }[] = [
  { key: "site_name", label: "Nome do site" },
  { key: "instagram_handle", label: "Handle do Instagram (sem @)", placeholder: "fiquepordentrose" },
  { key: "instagram_url", label: "URL do Instagram", placeholder: "https://instagram.com/fiquepordentrose" },
  { key: "facebook_url", label: "URL do Facebook", placeholder: "https://facebook.com/..." },
  { key: "threads_url", label: "URL do Threads", placeholder: "https://threads.net/@..." },
  { key: "whatsapp_url", label: "URL do WhatsApp", placeholder: "https://wa.me/55..." },
  { key: "youtube_url", label: "URL do YouTube", placeholder: "https://youtube.com/@..." },
  { key: "contact_email", label: "E-mail de contato" },
];

export default function AdminConfiguracoes() {
  const qc = useQueryClient();
  const [form, setForm] = useState<SiteSettings | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("site_settings").select("*").maybeSingle();
      if (data) setForm(data as unknown as SiteSettings);
      else setForm({
        site_name: "Fique Por Dentro Sergipe",
        instagram_handle: "", instagram_url: "", facebook_url: "", threads_url: "",
        whatsapp_url: "", youtube_url: "", contact_email: "contato@fiquepordentrose.com",
        recapture_assisted_enabled: false,
      });
    })();
  }, []);

  const save = async () => {
    if (!form) return;
    setSaving(true);
    const { error } = await supabase
      .from("site_settings")
      .update(form)
      .eq("id", true);
    setSaving(false);
    if (error) { toast.error("Falha ao salvar: " + error.message); return; }
    toast.success("Configurações salvas");
    qc.invalidateQueries({ queryKey: ["site_settings"] });
  };

  if (!form) return <AdminLayout><div>Carregando…</div></AdminLayout>;

  return (
    <AdminLayout>
      <h1 className="text-2xl font-black mb-6">Configurações do site</h1>
      <div className="bg-card border rounded-sm p-6 max-w-2xl space-y-4">
        {FIELDS.map((f) => (
          <div key={f.key}>
            <Label className="text-xs font-bold uppercase tracking-wider">{f.label}</Label>
            <Input
              value={(form as any)[f.key] ?? ""}
              placeholder={f.placeholder}
              onChange={(e) => setForm({ ...form, [f.key]: e.target.value } as SiteSettings)}
              className="mt-1"
            />
          </div>
        ))}
        <Button onClick={save} disabled={saving} className="mt-2">
          {saving ? "Salvando…" : "Salvar"}
        </Button>
      </div>
    </AdminLayout>
  );
}
