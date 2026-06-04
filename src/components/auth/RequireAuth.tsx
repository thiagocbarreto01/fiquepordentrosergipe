import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

export function RequireAuth({ children, staffOnly = false, adminOnly = false }: {
  children: ReactNode; staffOnly?: boolean; adminOnly?: boolean;
}) {
  const { user, loading, isStaff, isAdmin, isApproved, status } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Carregando…</div>;
  if (!user) return <Navigate to="/auth" replace />;
  
  if (!isApproved) {
    return <PendingAccess status={status} />;
  }

  if (adminOnly && !isAdmin) return <NoAccess label="admin" />;
  if (staffOnly && !isStaff) return <NoAccess label="redator/editor" />;
  return <>{children}</>;
}

function PendingAccess({ status }: { status: string | null }) {
  const messages: Record<string, { title: string; text: string }> = {
    pending: {
      title: "Acesso em análise",
      text: "Seu acesso está aguardando aprovação do administrador. Por favor, aguarde a liberação para acessar o painel.",
    },
    rejected: {
      title: "Acesso recusado",
      text: "Seu pedido de acesso foi recusado pelo administrador.",
    },
    blocked: {
      title: "Conta bloqueada",
      text: "Sua conta foi bloqueada por um administrador. Entre em contato para mais informações.",
    },
  };

  const { title, text } = messages[status || "pending"] || messages.pending;

  return (
    <div className="min-h-screen flex items-center justify-center p-6 text-center">
      <div className="max-w-md">
        <h1 className="font-display text-3xl font-black mb-4">{title}</h1>
        <p className="text-muted-foreground">{text}</p>
        <div className="mt-8">
          <button 
            onClick={() => window.location.href = "/"}
            className="text-sm font-bold uppercase tracking-widest hover:underline"
          >
            Voltar para o site
          </button>
        </div>
      </div>
    </div>
  );
}

function NoAccess({ label }: { label: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-6 text-center">
      <div className="max-w-md">
        <h1 className="font-display text-3xl font-black mb-4">Acesso restrito</h1>
        <p className="text-muted-foreground">
          Você precisa de permissão de <strong>{label}</strong> para acessar esta área.
        </p>
        <p className="text-sm text-muted-foreground mt-6">
          Peça a um administrador para atualizar seu papel.
        </p>
        <div className="mt-8">
          <button 
            onClick={() => window.history.back()}
            className="text-sm font-bold uppercase tracking-widest hover:underline"
          >
            Voltar
          </button>
        </div>
      </div>
    </div>
  );
}
