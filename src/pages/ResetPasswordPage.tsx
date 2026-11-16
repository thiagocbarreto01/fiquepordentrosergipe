import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import logo from "@/assets/logo-fique-por-dentro.png";
import { z } from "zod";

const passwordSchema = z.string().min(8, "Use ao menos 8 caracteres").max(72);

export default function ResetPasswordPage() {
  const nav = useNavigate();
  const [ready, setReady] = useState(false);
  const [expired, setExpired] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    document.title = "Redefinir senha — Fique Por Dentro Sergipe";
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setReady(true);
    });
    // O link de recuperação cria a sessão a partir do hash da URL; se já existe sessão, libera o formulário.
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    const t = window.setTimeout(() => setExpired(true), 4000);
    return () => {
      sub.subscription.unsubscribe();
      window.clearTimeout(t);
    };
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const p = passwordSchema.safeParse(password);
    if (!p.success) return toast.error(p.error.issues[0].message);
    if (password !== confirm) return toast.error("As senhas não conferem.");
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Senha atualizada.");
    nav("/admin");
  }

  return (
    <div className="min-h-screen bg-gradient-navy text-white flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-card text-card-foreground p-8 shadow-hero">
        <Link to="/" className="flex justify-center mb-6">
          <img src={logo} alt="Fique Por Dentro Sergipe" className="h-12" />
        </Link>
        <h1 className="font-display text-2xl font-black text-center mb-1">Redefinir senha</h1>
        {ready ? (
          <form onSubmit={submit} className="space-y-3 pt-4">
            <div>
              <Label htmlFor="new-password">Nova senha</Label>
              <Input id="new-password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="confirm-password">Confirmar nova senha</Label>
              <Input id="confirm-password" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            </div>
            <Button type="submit" disabled={loading} className="w-full bg-primary hover:bg-primary/90 font-bold uppercase tracking-wider">
              {loading ? "Salvando…" : "Salvar nova senha"}
            </Button>
          </form>
        ) : (
          <p className="text-sm text-muted-foreground text-center pt-4">
            {expired
              ? "Link inválido ou expirado. Volte ao login e peça um novo link de recuperação."
              : "Validando link…"}
          </p>
        )}
        <Link to="/auth" className="text-xs text-muted-foreground hover:text-primary block w-full text-center mt-4">
          Voltar ao login
        </Link>
      </div>
    </div>
  );
}
