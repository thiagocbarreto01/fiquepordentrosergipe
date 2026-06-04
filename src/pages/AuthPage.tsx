import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import logo from "@/assets/logo-tv-barretao.png";
import { z } from "zod";

const emailSchema = z.string().trim().email("E-mail inválido").max(255);
const passwordSchema = z.string().min(6, "Senha precisa ter ao menos 6 caracteres").max(72);

export default function AuthPage() {
  const { user, isStaff } = useAuth();
  const nav = useNavigate();
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");

  useEffect(() => {
    document.title = "Entrar — TV Barretão";
    if (user) nav(isStaff ? "/admin" : "/");
  }, [user, isStaff, nav]);

  async function signIn() {
    const e = emailSchema.safeParse(email); if (!e.success) return toast.error(e.error.issues[0].message);
    const p = passwordSchema.safeParse(password); if (!p.success) return toast.error(p.error.issues[0].message);
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Bem-vindo(a)!");
  }

  async function signUp() {
    const e = emailSchema.safeParse(email); if (!e.success) return toast.error(e.error.issues[0].message);
    const p = passwordSchema.safeParse(password); if (!p.success) return toast.error(p.error.issues[0].message);
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email, password,
      options: {
        emailRedirectTo: `${window.location.origin}/`,
        data: { display_name: name || email.split("@")[0] },
      },
    });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Cadastro enviado. Aguarde aprovação do administrador.");
  }

  async function reset() {
    const e = emailSchema.safeParse(email); if (!e.success) return toast.error("Informe um e-mail válido para recuperar.");
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/` });
    if (error) return toast.error(error.message);
    toast.success("Enviamos um link para seu e-mail.");
  }

  return (
    <div className="min-h-screen bg-gradient-navy text-white flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-card text-card-foreground p-8 shadow-hero">
        <Link to="/" className="flex justify-center mb-6">
          <img src={logo} alt="TV Barretão" className="h-12" />
        </Link>
        <h1 className="font-display text-2xl font-black text-center mb-1">Acesso da Redação</h1>
        <p className="text-sm text-muted-foreground text-center mb-6">Área restrita para equipe TV Barretão</p>

        <Tabs defaultValue="login">
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="login">Entrar</TabsTrigger>
            <TabsTrigger value="signup">Criar conta</TabsTrigger>
          </TabsList>
          <TabsContent value="login" className="space-y-3 pt-4">
            <div><Label>E-mail</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
            <div><Label>Senha</Label><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></div>
            <Button onClick={signIn} disabled={loading} className="w-full bg-primary hover:bg-primary/90 font-bold uppercase tracking-wider">
              {loading ? "Entrando…" : "Entrar"}
            </Button>
            <button type="button" onClick={reset} className="text-xs text-muted-foreground hover:text-primary block w-full text-center">
              Esqueci minha senha
            </button>
          </TabsContent>
          <TabsContent value="signup" className="space-y-3 pt-4">
            <div><Label>Nome</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
            <div><Label>E-mail</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
            <div><Label>Senha</Label><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></div>
            <Button onClick={signUp} disabled={loading} className="w-full bg-urgent hover:bg-urgent/90 text-urgent-foreground font-bold uppercase tracking-wider">
              {loading ? "Criando…" : "Criar conta"}
            </Button>
            <p className="text-xs text-muted-foreground">A primeira pessoa que criar conta deve ser promovida a admin pelo banco. Após isso, o admin gerencia papéis pelo painel.</p>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
