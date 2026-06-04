import { Link } from "react-router-dom";
import { Search, Menu, X, Facebook, Instagram, Youtube, LayoutDashboard } from "lucide-react";
import { useState } from "react";
import logo from "@/assets/logo-fique-por-dentro.png";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import WeatherTime from "./WeatherTime";

const NAV = [
  { label: "Últimas", to: "/ultimas" },
  { label: "Polícia", to: "/categoria/policia" },
  { label: "Política", to: "/categoria/politica" },
  { label: "Esporte", to: "/categoria/esporte" },
  { label: "Sergipe", to: "/categoria/sergipe" },
  { label: "Aracaju", to: "/categoria/aracaju" },
  { label: "Municípios", to: "/categoria/municipios" },
  { label: "Denúncias", to: "/categoria/denuncias" },
  { label: "Brasil", to: "/categoria/brasil" },
  { label: "Mundo", to: "/categoria/mundo" },
  { label: "Entretenimento", to: "/categoria/entretenimento" },
  { label: "Vídeos", to: "/categoria/videos" },
  { label: "Opinião", to: "/categoria/opiniao" },
];

export default function SiteHeader() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [q, setQ] = useState("");

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!q.trim()) return;
    window.location.href = `/busca?q=${encodeURIComponent(q)}`;
  };

  return (
    <header className="sticky top-0 z-40 bg-background border-b border-border shadow-sm">
      {/* Top utility bar — escondida no mobile para enxugar */}
      <div className="hidden md:block bg-navy-deep text-white">
        <div className="container-news flex items-center justify-between h-8">
          <WeatherTime city="Aracaju" />
          <div className="flex items-center gap-3">
            <a href="https://instagram.com/barretao__news" target="_blank" rel="noreferrer" className="hover:text-alert"><Instagram className="h-3.5 w-3.5" /></a>
            <a href="#" className="hover:text-alert"><Facebook className="h-3.5 w-3.5" /></a>
            <a href="#" className="hover:text-alert"><Youtube className="h-3.5 w-3.5" /></a>
            <span className="h-3 w-px bg-white/30 mx-1" />
            {user ? (
              <Link to="/admin" className="hover:text-alert text-xs font-semibold uppercase tracking-wider flex items-center gap-1">
                <LayoutDashboard className="h-3.5 w-3.5" /> Painel
              </Link>
            ) : (
              <Link to="/auth" className="hover:text-alert text-xs font-semibold uppercase tracking-wider">Entrar</Link>
            )}
          </div>
        </div>
      </div>

      {/* Main bar — mais compacta no mobile */}
      <div className="container-news flex items-center gap-3 h-14 md:h-20">
        <button
          onClick={() => setOpen(!open)}
          className="md:hidden p-2 -ml-2 hover:bg-secondary/50 rounded-sm transition-colors"
          aria-label="Abrir menu"
        >
          {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>

        <Link to="/" className="flex items-center" aria-label="Fique Por Dentro Sergipe - Início">
          <img src={logo} alt="Fique Por Dentro Sergipe" className="h-8 md:h-12 w-auto" />
        </Link>

        <form onSubmit={submitSearch} className="flex-1 hidden md:flex items-center max-w-md ml-4">
          <div className="relative w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              value={q} onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar notícias..."
              className="w-full h-10 pl-10 pr-3 rounded-sm border border-border bg-secondary text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
        </form>

        <div className="hidden md:flex items-center gap-2 ml-auto">
          {user && (
            <Button asChild variant="outline" className="rounded-sm font-bold uppercase tracking-wider text-xs border-primary text-primary hover:bg-primary hover:text-primary-foreground">
              <Link to="/admin"><LayoutDashboard className="h-4 w-4" /> Painel</Link>
            </Button>
          )}
          <Button asChild variant="default" className="bg-urgent hover:bg-urgent/90 text-urgent-foreground rounded-sm font-bold uppercase tracking-wider text-xs">
            <Link to="/denuncias/enviar">Enviar Denúncia</Link>
          </Button>
        </div>

        {/* Mobile actions: busca em ícone + denúncia compacta */}
        <div className="md:hidden flex items-center gap-1 ml-auto">
          <button
            onClick={() => setSearchOpen((s) => !s)}
            className="p-2 hover:bg-secondary/50 rounded-sm transition-colors"
            aria-label="Buscar"
          >
            <Search className="h-5 w-5" />
          </button>
          <Link
            to="/denuncias/enviar"
            className="bg-urgent text-urgent-foreground text-[10px] font-black uppercase tracking-wider px-2.5 py-1.5 rounded-sm"
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
              className="w-full h-10 pl-10 pr-3 rounded-sm border border-border bg-secondary text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
        </form>
      )}

      {/* Nav */}
      <nav className="bg-primary text-primary-foreground">
        <div className="container-news hidden md:flex items-center gap-1 h-10 overflow-x-auto">
          <Link to="/" className="px-3 py-2 text-sm font-bold uppercase tracking-wide hover:bg-white/10">Início</Link>
          {NAV.map((n) => (
            <Link key={n.to} to={n.to} className="px-3 py-2 text-sm font-bold uppercase tracking-wide hover:bg-white/10 whitespace-nowrap">
              {n.label}
            </Link>
          ))}
        </div>
        {/* Nav horizontal scrollável no mobile */}
        <div className="md:hidden flex items-center gap-0 h-9 overflow-x-auto scrollbar-none">
          <Link to="/" className="px-3 py-2 text-[11px] font-bold uppercase tracking-wide hover:bg-white/10 whitespace-nowrap">Início</Link>
          {NAV.map((n) => (
            <Link key={n.to} to={n.to} className="px-3 py-2 text-[11px] font-bold uppercase tracking-wide hover:bg-white/10 whitespace-nowrap">
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
              <Link to="/admin" onClick={() => setOpen(false)} className="px-4 py-3 text-sm font-bold uppercase border-b border-white/10 bg-navy-deep flex items-center gap-2">
                <LayoutDashboard className="h-4 w-4" /> Painel Administrativo
              </Link>
            ) : (
              <Link to="/auth" onClick={() => setOpen(false)} className="px-4 py-3 text-sm font-bold uppercase border-b border-white/10 bg-navy-deep">
                Entrar
              </Link>
            )}
            <Link to="/denuncias/enviar" onClick={() => setOpen(false)} className="px-4 py-3 text-sm font-bold uppercase bg-urgent">
              Enviar Denúncia
            </Link>
          </div>
        )}
      </nav>
    </header>
  );
}
