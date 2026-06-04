import { Link } from "react-router-dom";
import { AlertTriangle, Send } from "lucide-react";
import denunciaImg from "@/assets/news-denuncia.jpg";

export default function DenunciaBanner() {
  return (
    <section className="relative overflow-hidden bg-navy-deep text-white">
      <div
        className="absolute inset-0 opacity-30"
        style={{ backgroundImage: `url(${denunciaImg})`, backgroundSize: "cover", backgroundPosition: "center" }}
      />
      <div className="absolute inset-0 bg-gradient-to-r from-navy-deep via-navy-deep/85 to-transparent" />
      <div className="container-news relative py-12 md:py-16 grid md:grid-cols-2 gap-8 items-center">
        <div>
          <span className="alert-badge mb-3 inline-flex items-center gap-1.5">
            <AlertTriangle className="h-3 w-3" /> CANAL DE DENÚNCIAS
          </span>
          <h2 className="font-display text-3xl md:text-4xl font-black leading-tight">
            Sua denúncia pode <span className="text-alert">virar pauta</span>.
          </h2>
          <p className="mt-3 text-white/80 max-w-lg">
            Envie informações com sigilo. Nossa equipe apura todos os relatos com responsabilidade
            editorial antes de publicar. Sua identidade é protegida.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              to="/denuncias/enviar"
              className="inline-flex items-center gap-2 bg-urgent hover:bg-urgent/90 text-urgent-foreground px-5 py-3 font-bold uppercase tracking-wider text-sm rounded-sm"
            >
              <Send className="h-4 w-4" /> Enviar denúncia agora
            </Link>
            <Link
              to="/categoria/denuncias"
              className="inline-flex items-center gap-2 border border-white/30 hover:bg-white/10 px-5 py-3 font-bold uppercase tracking-wider text-sm rounded-sm"
            >
              Ver denúncias publicadas
            </Link>
          </div>
        </div>
        <div className="hidden md:block">
          <div className="border-l-4 border-alert pl-6">
            <p className="font-serif-news italic text-xl text-white/90">
              "O jornalismo sério começa quando alguém decide quebrar o silêncio."
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
