import { QUALITY_META, type QualityLevel } from "@/lib/contentQuality";

type Props = {
  level: QualityLevel;
  chars?: number;
  className?: string;
  showChars?: boolean;
};

export function QualityBadge({ level, chars, className = "", showChars = false }: Props) {
  const meta = QUALITY_META[level];
  return (
    <span
      title={`${meta.label} — ${meta.description}${chars != null ? ` (${chars} chars)` : ""}`}
      className={`inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-sm border ${meta.className} ${className}`}
    >
      <span aria-hidden>{meta.icon}</span>
      {meta.label}
      {showChars && chars != null && <span className="font-mono opacity-80">· {chars}</span>}
    </span>
  );
}
