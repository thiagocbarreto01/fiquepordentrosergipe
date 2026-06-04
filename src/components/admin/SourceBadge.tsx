import { Rss, PenLine, Instagram, Link as LinkIcon, ExternalLink } from "lucide-react";

// Cores fixas para fontes conhecidas; demais usam hash determinístico.
const KNOWN_COLORS: Record<string, string> = {
  g1: "bg-red-600 text-white border-red-700",
  infonet: "bg-blue-700 text-white border-blue-800",
  faxaju: "bg-orange-600 text-white border-orange-700",
  uol: "bg-yellow-400 text-black border-yellow-500",
  "agencia brasil": "bg-emerald-700 text-white border-emerald-800",
  "agência brasil": "bg-emerald-700 text-white border-emerald-800",
  instagram: "bg-gradient-to-r from-pink-600 to-purple-600 text-white border-pink-700",
  manual: "bg-slate-700 text-white border-slate-800",
};

const PALETTE = [
  "bg-sky-700 text-white border-sky-800",
  "bg-fuchsia-700 text-white border-fuchsia-800",
  "bg-teal-700 text-white border-teal-800",
  "bg-amber-700 text-white border-amber-800",
  "bg-rose-700 text-white border-rose-800",
  "bg-indigo-700 text-white border-indigo-800",
  "bg-lime-700 text-white border-lime-800",
];

function norm(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

function hashColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return PALETTE[Math.abs(h) % PALETTE.length];
}

export function sourceColor(name?: string | null) {
  const n = norm(name || "manual");
  // Match parcial por palavras-chave (ex: "Portal G1 SE" → g1)
  for (const key of Object.keys(KNOWN_COLORS)) {
    if (n.includes(key)) return KNOWN_COLORS[key];
  }
  return hashColor(n);
}

export type CaptureMethod = "automatic" | "manual" | "instagram";

export function detectCaptureMethod(p: { source_id?: string | null; source_url?: string | null }): CaptureMethod {
  if (p.source_id) return "automatic";
  if (p.source_url && /instagram\.com/i.test(p.source_url)) return "instagram";
  return "manual";
}

export const METHOD_LABEL: Record<CaptureMethod, string> = {
  automatic: "Automática",
  manual: "Manual",
  instagram: "Instagram",
};

export function CaptureMethodIcon({ method, className = "h-3.5 w-3.5" }: { method: CaptureMethod; className?: string }) {
  if (method === "automatic") return <Rss className={className} />;
  if (method === "instagram") return <Instagram className={className} />;
  return <PenLine className={className} />;
}

export function SourceBadge({ name, className = "" }: { name?: string | null; className?: string }) {
  const label = (name || "Manual").toUpperCase();
  const color = sourceColor(name);
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 text-[10px] font-black uppercase tracking-widest border rounded-sm ${color} ${className}`}
      title={`Fonte: ${name || "Manual"}`}
    >
      {label}
    </span>
  );
}

export function OriginalLink({ url, className = "" }: { url?: string | null; className?: string }) {
  if (!url) return null;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-primary hover:underline ${className}`}
      title="Abrir notícia original em nova aba"
      onClick={(e) => e.stopPropagation()}
    >
      <ExternalLink className="h-3 w-3" /> Ver original
    </a>
  );
}

export function CaptureMethodChip({ method }: { method: CaptureMethod }) {
  const cls =
    method === "automatic"
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : method === "instagram"
        ? "bg-pink-50 text-pink-700 border-pink-200"
        : "bg-slate-50 text-slate-700 border-slate-200";
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-widest border rounded-sm ${cls}`}>
      <CaptureMethodIcon method={method} className="h-2.5 w-2.5" />
      {METHOD_LABEL[method]}
    </span>
  );
}

export { LinkIcon };
