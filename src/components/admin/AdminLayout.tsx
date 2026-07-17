import { ReactNode, useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import logo from "@/assets/logo-fique-por-dentro.png";
import { LayoutDashboard, FileText, FolderTree, Megaphone, AlertTriangle, Users, LogOut, ExternalLink, PlusCircle, Rss, Instagram, Home, Settings, RefreshCw, Menu, X } from "lucide-react";
import { useAutoSync } from "@/hooks/useAutoSync";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";

const ITEMS = [
  { to: "/admin", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/admin/home", label: "Controle da Home", icon: Home },
  { to: "/admin/posts", label: "Notícias", icon: FileText },
  { to: "/admin/posts/novo", label: "Nova notícia", icon: PlusCircle },
  { to: "/admin/fontes", label: "Fontes", icon: Rss },
  { to: "/admin/categorias", label: "Categorias", icon: FolderTree },
  { to: "/admin/banners", label: "Banners", icon: Megaphone },
  { to: "/admin/instagram", label: "Instagram", icon: Instagram },
  { to: "/admin/denuncias", label: "Denúncias", icon: AlertTriangle },
  { to: "/admin/sync", label: "Auto Sync", icon: RefreshCw },
  { to: "/admin/configuracoes", label: "Configurações", icon: Settings, adminOnly: true },
  { to: "/admin/usuarios", label: "Usuários", icon: Users, adminOnly: true },
];

function SidebarNav({ isAdmin, onNavigate }: { isAdmin: boolean; onNavigate?: () => void }) {
  return (
    <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
      {ITEMS.filter((i) => !i.adminOnly || isAdmin).map((i) => (
        <NavLink
          key={i.to}
          to={i.to}
          end={i.end}
          onClick={onNavigate}
          className={({ isActive }) =>
            `flex items-center gap-2.5 px-3 py-2.5 rounded-sm text-sm font-semibold ${isActive ? "bg-sidebar-primary text-sidebar-primary-foreground" : "hover:bg-sidebar-accent"}`
          }
        >
          <i.icon className="h-4 w-4" />
          {i.label}
        </NavLink>
      ))}
    </nav>
  );
}

function SidebarFooter({ email, onSignOut }: { email?: string; onSignOut: () => void }) {
  return (
    <div className="p-3 border-t border-sidebar-border space-y-2">
      <div className="text-xs text-sidebar-foreground/70 truncate">{email}</div>
      <a href="/" target="_blank" className="flex items-center gap-2 text-xs hover:text-alert"><ExternalLink className="h-3 w-3" /> Ver portal</a>
      <button onClick={onSignOut} className="flex items-center gap-2 text-xs hover:text-urgent">
        <LogOut className="h-3 w-3" /> Sair
      </button>
    </div>
  );
}

export default function AdminLayout({ children }: { children: ReactNode }) {
  useAutoSync(60_000);
  const { signOut, isAdmin, user } = useAuth();
  const nav = useNavigate();
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);

  const handleSignOut = async () => { await signOut(); nav("/auth"); };

  return (
    <div className="min-h-screen flex bg-secondary">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-60 bg-sidebar text-sidebar-foreground flex-col shrink-0">
        <Link to="/" className="p-4 border-b border-sidebar-border bg-white/95">
          <img src={logo} alt="Fique Por Dentro Sergipe" className="h-9" />
        </Link>
        <SidebarNav isAdmin={isAdmin} />
        <SidebarFooter email={user?.email} onSignOut={handleSignOut} />
      </aside>

      <main className="flex-1 min-w-0 flex flex-col">
        {/* Mobile header sticky */}
        {isMobile && (
          <header
            className="md:hidden sticky top-0 z-40 bg-sidebar text-sidebar-foreground border-b border-sidebar-border flex items-center gap-3 px-3"
            style={{ paddingTop: "calc(env(safe-area-inset-top) + 0.5rem)", paddingBottom: "0.5rem" }}
          >
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger asChild>
                <button
                  aria-label="Abrir menu"
                  className="h-10 w-10 flex items-center justify-center rounded-sm hover:bg-sidebar-accent"
                >
                  <Menu className="h-6 w-6" />
                </button>
              </SheetTrigger>
              <SheetContent side="left" className="p-0 w-72 bg-sidebar text-sidebar-foreground border-sidebar-border flex flex-col">
                <SheetTitle className="sr-only">Menu do painel</SheetTitle>
                <div className="p-4 border-b border-sidebar-border bg-white/95 flex items-center justify-between">
                  <Link to="/" onClick={() => setOpen(false)}>
                    <img src={logo} alt="Fique Por Dentro Sergipe" className="h-9" />
                  </Link>
                </div>
                <SidebarNav isAdmin={isAdmin} onNavigate={() => setOpen(false)} />
                <SidebarFooter email={user?.email} onSignOut={handleSignOut} />
              </SheetContent>
            </Sheet>
            <Link to="/admin" className="flex-1 min-w-0 flex items-center">
              <img src={logo} alt="Fique Por Dentro Sergipe" className="h-8 bg-white/95 px-2 py-1 rounded-sm" />
            </Link>
          </header>
        )}

        <div className="p-4 md:p-6 max-w-6xl w-full min-w-0">{children}</div>
      </main>
    </div>
  );
}
