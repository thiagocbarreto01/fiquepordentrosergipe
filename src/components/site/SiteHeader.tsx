import { Link } from "react-router-dom";
import { Search, Menu, X, Facebook, Instagram, Youtube, LayoutDashboard } from "lucide-react";
import { useState } from "react";
import logo from "@/assets/logo-fique-por-dentro.png";
import BreakingBar from "./BreakingBar";
import { useAuth } from "@/hooks/useAuth";
import { useSiteSettings } from "@/hooks/useSiteSettings";
import { Button } from "@/components/ui/button";
import WeatherTime from "./WeatherTime";
import { useMenuCategories } from "@/hooks/useMenuCategories";


export default function SiteHeader() {
  const { user } = useAuth();
  const s = useSiteSettings();
  const menu = useMenuCategories();
  const NAV = menu.map((c) => ({ label: c.name, to: `/categoria/${c.slug}` }));
  const [open, setOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [q, setQ] = useState("");

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!q.trim()) return;
    window.location.href = `/busca?q=${encodeURIComponent(q)}`;
  };

  return (
    <header className="sticky top-0 z-40 bg-background border-b border-border shadow-[var(--shadow-card)]">
      {/* Top utility bar */}
      <div className="hidden md:block bg-[hsl(var(--brand-navy-deep))] text-white/90 text-[11px]">
        <div className="container-news flex items-center justify-between h-8">
          <WeatherTime city="Aracaju" />
          <div className="flex items-center gap-4">
            {s.instagram_url && <a href={s.instagram_url} target="_blank" rel="noreferrer" className="hover:text-[hsl(var(--alert))] transition-colors"><Instagram className="h-3.5 w-3.5" /></a>}
            {s.facebook_url && <a href={s.facebook_url} target="_blank" rel="noreferrer" className="hover:text-[hsl(var(--alert))] transition-colors"><Facebook className="h-3.5 w-3.5" /></a>}
            {s.youtube_url && <a href={s.youtube_url} target="_blank" rel="noreferrer" className="hover:text-[hsl(var(--alert))] transition-colors"><Youtube className="h-3.5 w-3.5" /></a>}
            <span className="h-3 w-px bg-white/25" />
            {user ? (
              <Link to="/admin" className="hover:text-[hsl(var(--alert))] font-semibold uppercase tracking-wider flex items-center gap-1.5 transition-colors">
                <LayoutDashboard className="h-3.5 w-3.5" /> Painel
              </Link>
            ) : (
              <Link to="/auth" className="hover:text-[hsl(var(--alert))] font-semibold uppercase tracking-wider transition-colors">Entrar</Link>
            )}
          </div>
        </div>
      </div>

      {/* Main bar — logo à esquerda, busca centralizada, botões à direita */}
      <div className="container-news flex items-center gap-3 md:gap-5 h-20 md:h-28 py-2">
        <button
          onClick={() => setOpen(!open)}
          className="md:hidden p-2 -ml-2 hover:bg-secondary rounded-sm transition-colors"
          aria-label="Abrir menu"
        >
          {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>

        <Link
          to="/"
          className="flex items-center shrink-0 group"
          aria-label="Fique Por Dentro Sergipe - Início"
        >
          <img
            src={logo}
            alt="Fique Por Dentro Sergipe"
            className="h-16 md:h-24 lg:h-28 w-auto select-none drop-shadow-sm transition-transform duration-300 group-hover:scale-[1.03]"
            draggable={false}
          />
        </Link>


        {/* Busca grande centralizada (desktop) */}
        <form onSubmit={submitSearch} className="hidden md:flex flex-1 max-w-2xl mx-auto">
          <div className="relative w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              value={q} onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar notícias..."
              className="w-full h-11 pl-10 pr-3 rounded-md border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40 transition"
            />
          </div>
        </form>

        <div className="hidden md:flex items-center gap-2 shrink-0">
          {user && (
            <Button asChild variant="outline" className="rounded-md font-bold uppercase tracking-wider text-xs h-10 border-primary text-primary hover:bg-primary hover:text-primary-foreground">
              <Link to="/admin"><LayoutDashboard className="h-4 w-4" /> Painel</Link>
            </Button>
          )}
          <Button asChild className="bg-[hsl(var(--urgent))] hover:bg-[hsl(var(--urgent))]/90 text-[hsl(var(--urgent-foreground))] rounded-md font-bold uppercase tracking-wider text-xs h-10 px-4 shadow-sm">
            <Link to="/denuncias/enviar">Enviar Denúncia</Link>
          </Button>
        </div>

        {/* Mobile actions */}
        <div className="md:hidden flex items-center gap-1 ml-auto">
          <button
            onClick={() => setSearchOpen((s) => !s)}
            className="p-2 hover:bg-secondary rounded-sm transition-colors"
            aria-label="Buscar"
          >
            <Search className="h-5 w-5" />
          </button>
          <Link
            to="/denuncias/enviar"
            className="bg-[hsl(var(--urgent))] text-[hsl(var(--urgent-foreground))] text-[10px] font-black uppercase tracking-wider px-2.5 py-1.5 rounded-sm"
          >
            Denunciar
          </Link>
        </div>
      </div>

      {/* Campo de busca expansível no mobile */}
      {searchOpen && (
        <form onSubmit={submitSearch} className="md:hidden container-news pb-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              autoFocus
              value={q} onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar notícias..."
              className="w-full h-10 pl-10 pr-3 rounded-sm border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
        </form>
      )}

      {/* Nav principal */}
      <nav className="bg-primary text-primary-foreground border-y border-[hsl(var(--brand-navy-deep))]">
        <div className="container-news hidden md:flex items-center flex-wrap h-auto min-h-11">
          <Link to="/" className="relative px-3 py-3 text-[12px] font-bold uppercase tracking-[0.06em] hover:bg-white/10 transition-colors after:absolute after:left-3 after:right-3 after:bottom-0 after:h-[2px] after:bg-[hsl(var(--alert))] after:scale-x-0 hover:after:scale-x-100 after:origin-left after:transition-transform">
            Início
          </Link>
          {NAV.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              className="relative px-3 py-3 text-[12px] font-bold uppercase tracking-[0.06em] hover:bg-white/10 whitespace-nowrap transition-colors after:absolute after:left-3 after:right-3 after:bottom-0 after:h-[2px] after:bg-[hsl(var(--alert))] after:scale-x-0 hover:after:scale-x-100 after:origin-left after:transition-transform"
            >
              {n.label}
            </Link>
          ))}
        </div>

        {open && (
          <div className="md:hidden flex flex-col bg-primary border-t border-white/10 max-h-[70vh] overflow-y-auto">
            <Link to="/" onClick={() => setOpen(false)} className="px-4 py-3 text-sm font-bold uppercase border-b border-white/10">Início</Link>
            {NAV.map((n) => (
              <Link key={n.to} to={n.to} onClick={() => setOpen(false)} className="px-4 py-3 text-sm font-bold uppercase border-b border-white/10">
                {n.label}
              </Link>
            ))}
            {user ? (
              <Link to="/admin" onClick={() => setOpen(false)} className="px-4 py-3 text-sm font-bold uppercase border-b border-white/10 bg-[hsl(var(--brand-navy-deep))] flex items-center gap-2">
                <LayoutDashboard className="h-4 w-4" /> Painel Administrativo
              </Link>
            ) : (
              <Link to="/auth" onClick={() => setOpen(false)} className="px-4 py-3 text-sm font-bold uppercase border-b border-white/10 bg-[hsl(var(--brand-navy-deep))]">
                Entrar
              </Link>
            )}
            <Link to="/denuncias/enviar" onClick={() => setOpen(false)} className="px-4 py-3 text-sm font-bold uppercase bg-[hsl(var(--urgent))]">
              Enviar Denúncia
            </Link>
          </div>
        )}
      </nav>
      <BreakingBar />
    </header>
  );
}
