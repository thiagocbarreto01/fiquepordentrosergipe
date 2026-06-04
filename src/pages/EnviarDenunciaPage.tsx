import { useState } from "react";
import SiteLayout from "@/components/site/SiteLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { AlertTriangle, ShieldCheck } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

const schema = z.object({
  title: z.string().trim().min(5, "Mínimo 5 caracteres").max(200),
  description: z.string().trim().min(10, "Mínimo 10 caracteres").max(5000),
  city: z.string().trim().max(100).optional(),
  contact_name: z.string().trim().max(100).optional(),
  contact_phone: z.string().trim().max(30).optional(),
  contact_email: z.string().trim().email("E-mail inválido").max(255).optional().or(z.literal("")),
  is_anonymous: z.boolean().default(true),
});

export default function EnviarDenunciaPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [form, setForm] = useState({
    title: "", description: "", city: "", contact_name: "",
    contact_phone: "", contact_email: "", is_anonymous: true,
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = schema.safeParse(form);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }
    if (!parsed.data.is_anonymous && !user) {
      toast.error("Entre na sua conta para enviar uma denúncia com dados de contato, ou envie de forma anônima.");
      return;
    }
    setLoading(true);
    const { error } = await supabase.from("denuncias").insert({
      title: parsed.data.title,
      description: parsed.data.description,
      city: parsed.data.city || null,
      contact_name: form.is_anonymous ? null : (parsed.data.contact_name || null),
      contact_phone: form.is_anonymous ? null : (parsed.data.contact_phone || null),
      contact_email: form.is_anonymous ? null : (parsed.data.contact_email || null),
      is_anonymous: form.is_anonymous,
      status: "nova",
    });
    setLoading(false);
    if (error) {
      toast.error("Erro ao enviar. Tente novamente.");
      return;
    }
    setSent(true);
    toast.success("Denúncia recebida. Nossa equipe vai apurar.");
  }

  return (
    <SiteLayout>
      <div className="container-news max-w-3xl mt-8">
        <div className="bg-navy-deep text-white p-6 mb-6">
          <div className="flex items-center gap-3 mb-2">
            <AlertTriangle className="h-6 w-6 text-alert" />
            <h1 className="font-display text-3xl font-black">Enviar Denúncia</h1>
          </div>
          <p className="text-white/80 text-sm">
            Sua identidade é protegida. Enviamos sua denúncia para apuração editorial. Não publicamos sem checagem.
          </p>
        </div>

        {sent ? (
          <div className="bg-secondary border border-border p-8 text-center">
            <ShieldCheck className="h-12 w-12 text-primary mx-auto mb-3" />
            <h2 className="font-display text-2xl font-black">Recebemos sua denúncia.</h2>
            <p className="mt-2 text-muted-foreground">Nossa equipe vai apurar e, se confirmada, será publicada com responsabilidade editorial.</p>
            <button onClick={() => { setSent(false); setForm({ title:"", description:"", city:"", contact_name:"", contact_phone:"", contact_email:"", is_anonymous:true }); }} className="mt-6 px-5 py-2 bg-primary text-primary-foreground font-bold uppercase text-xs">
              Enviar outra
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4 bg-card border border-border p-6">
            <div>
              <Label>Título da denúncia *</Label>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Resumo curto do fato" />
            </div>
            <div>
              <Label>Descrição completa *</Label>
              <Textarea rows={8} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Conte tudo que sabe: quem, o que, quando, onde, como…" />
            </div>
            <div>
              <Label>Cidade</Label>
              <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} placeholder="Opcional" />
            </div>
            <div className="flex items-start gap-2 p-3 bg-secondary border border-border">
              <Checkbox id="anon" checked={form.is_anonymous} onCheckedChange={(v) => setForm({ ...form, is_anonymous: !!v })} />
              <Label htmlFor="anon" className="cursor-pointer">Quero enviar de forma anônima</Label>
            </div>
            {!form.is_anonymous && (
              <div className="grid md:grid-cols-3 gap-3">
                <Input placeholder="Seu nome" value={form.contact_name} onChange={(e) => setForm({ ...form, contact_name: e.target.value })} />
                <Input placeholder="Telefone/WhatsApp" value={form.contact_phone} onChange={(e) => setForm({ ...form, contact_phone: e.target.value })} />
                <Input placeholder="E-mail" value={form.contact_email} onChange={(e) => setForm({ ...form, contact_email: e.target.value })} />
              </div>
            )}
            <Button type="submit" disabled={loading} className="bg-urgent hover:bg-urgent/90 text-urgent-foreground rounded-sm font-bold uppercase tracking-wider">
              {loading ? "Enviando…" : "Enviar denúncia"}
            </Button>
            <p className="text-xs text-muted-foreground">Ao enviar, você concorda que a Fique Por Dentro Sergipe fará apuração jornalística. Não nos responsabilizamos por informações falsas enviadas.</p>
          </form>
        )}
      </div>
    </SiteLayout>
  );
}
