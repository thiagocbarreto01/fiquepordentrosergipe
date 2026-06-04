import { ReactNode } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import logo from "@/assets/logo-fique-por-dentro.png";
import { LayoutDashboard, FileText, FolderTree, Megaphone, AlertTriangle, Users, LogOut, ExternalLink, PlusCircle, Rss, Instagram, Home, Settings } from "lucide-react";

const ITEMS = [
  { to: "/admin", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/admin/home", label: "Controle da Home", icon: Home },
  { to: "/admin/posts", label: "Notícias", icon: FileText },
  { to: "/admin/posts/novo", label: "Nova notícia", icon: PlusCircle },
  { to: "/admin/fontes", label: "Fontes", icon: Rss },
  { to: "/admin/categorias", label: "Categorias", icon: FolderTree },
  { to: "/admin/banners", label: "Banners", icon: Megaphone },
  { to: "/admin/instagram", label: "Instagram", icon: Instagram },
  { to: "/admin/importar-instagram", label: "Importar do Instagram", icon: Instagram },
  { to: "/admin/denuncias", label: "Denúncias", icon: AlertTriangle },
  { to: "/admin/configuracoes", label: "Configurações", icon: Settings, adminOnly: true },
  { to: "/admin/usuarios", label: "Usuários", icon: Users, adminOnly: true },
];

export default function AdminLayout({ children }: { children: ReactNode }) {
  const { signOut, isAdmin, user } = useAuth();
  const nav = useNavigate();

  return (
    <div className="min-h-screen flex bg-secondary">
      <aside className="w-60 bg-sidebar text-sidebar-foreground flex flex-col">
        <Link to="/" className="p-4 border-b border-sidebar-border bg-white/95">
          <img src={logo} alt="Fique Por Dentro Sergipe" className="h-9" />
        </Link>
        <nav className="flex-1 p-2 space-y-0.5">
          {ITEMS.filter((i) => !i.adminOnly || isAdmin).map((i) => (
            <NavLink
              key={i.to} to={i.to} end={i.end}
              className={({ isActive }) =>
                `flex items-center gap-2.5 px-3 py-2 rounded-sm text-sm font-semibold ${isActive ? "bg-sidebar-primary text-sidebar-primary-foreground" : "hover:bg-sidebar-accent"}`}
            >
              <i.icon className="h-4 w-4" />
              {i.label}
            </NavLink>
          ))}
        </nav>
        <div className="p-3 border-t border-sidebar-border space-y-2">
          <div className="text-xs text-sidebar-foreground/70 truncate">{user?.email}</div>
          <a href="/" target="_blank" className="flex items-center gap-2 text-xs hover:text-alert"><ExternalLink className="h-3 w-3" /> Ver portal</a>
          <button onClick={async () => { await signOut(); nav("/auth"); }} className="flex items-center gap-2 text-xs hover:text-urgent">
            <LogOut className="h-3 w-3" /> Sair
          </button>
        </div>
      </aside>
      <main className="flex-1 min-w-0">
        <div className="p-6 max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
