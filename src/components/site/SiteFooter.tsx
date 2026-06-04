import { Link } from "react-router-dom";
import logo from "@/assets/logo-tv-barretao.png";
import { Facebook, Instagram, Youtube, Mail } from "lucide-react";
import AdSlot from "./AdSlot";

export default function SiteFooter() {
  return (
    <footer className="mt-16 bg-navy-deep text-white">
      <div className="container-news py-8">
        <AdSlot position="footer" />
      </div>
      <div className="container-news py-12 grid md:grid-cols-4 gap-8 border-t border-white/10">
        <div className="md:col-span-2">
          <img src={logo} alt="TV Barretão" className="h-12 w-auto bg-white/95 px-3 py-1 rounded-sm" />
          <p className="mt-4 text-sm text-white/70 max-w-md">
            TV Barretão é um portal de notícias com cobertura de política, denúncias, polícia, Brasil e mundo.
            Apuração responsável e linguagem direta para você ficar bem informado todos os dias.
          </p>
          <div className="flex items-center gap-3 mt-4">
            <a href="https://instagram.com/barretao__news" target="_blank" rel="noreferrer" aria-label="Instagram" className="p-2 bg-white/10 hover:bg-urgent rounded-sm"><Instagram className="h-4 w-4" /></a>
            <a href="#" aria-label="Facebook" className="p-2 bg-white/10 hover:bg-urgent rounded-sm"><Facebook className="h-4 w-4" /></a>
            <a href="#" aria-label="YouTube" className="p-2 bg-white/10 hover:bg-urgent rounded-sm"><Youtube className="h-4 w-4" /></a>
            <a href="mailto:contato@tvbarretao.com" aria-label="Email" className="p-2 bg-white/10 hover:bg-urgent rounded-sm"><Mail className="h-4 w-4" /></a>
          </div>
        </div>

        <div>
          <h4 className="text-xs font-black uppercase tracking-widest text-alert mb-3">Editorias</h4>
          <ul className="space-y-2 text-sm text-white/80">
            <li><Link to="/categoria/politica" className="hover:text-alert">Política</Link></li>
            <li><Link to="/categoria/denuncias" className="hover:text-alert">Denúncias</Link></li>
            <li><Link to="/categoria/policia" className="hover:text-alert">Polícia</Link></li>
            <li><Link to="/categoria/brasil" className="hover:text-alert">Brasil</Link></li>
            <li><Link to="/categoria/mundo" className="hover:text-alert">Mundo</Link></li>
          </ul>
        </div>

        <div>
          <h4 className="text-xs font-black uppercase tracking-widest text-alert mb-3">Institucional</h4>
          <ul className="space-y-2 text-sm text-white/80">
            <li><Link to="/contato" className="hover:text-alert">Contato</Link></li>
            <li><Link to="/anuncie" className="hover:text-alert">Anuncie aqui</Link></li>
            <li><Link to="/denuncias/enviar" className="hover:text-alert">Enviar denúncia</Link></li>
            <li><Link to="/politica-de-privacidade" className="hover:text-alert">Política de privacidade</Link></li>
            <li><Link to="/termos" className="hover:text-alert">Termos de uso</Link></li>
          </ul>
        </div>
      </div>

      <div className="border-t border-white/10">
        <div className="container-news py-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-white/60">
          <span>© {new Date().getFullYear()} TV Barretão. Todos os direitos reservados.</span>
          <span>As opiniões expressas em artigos são de responsabilidade dos autores.</span>
        </div>
      </div>
    </footer>
  );
}
