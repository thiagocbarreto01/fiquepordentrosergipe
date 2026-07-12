export type QualityLevel = "completo" | "curto" | "incompleto";

export function stripHtml(html: string | null | undefined): string {
  if (!html) return "";
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function getContentQuality(html: string | null | undefined): {
  level: QualityLevel;
  chars: number;
  words: number;
  readingMinutes: number;
} {
  const text = stripHtml(html);
  const chars = text.length;
  const words = text ? text.split(/\s+/).length : 0;
  const readingMinutes = Math.max(1, Math.round(words / 220));
  let level: QualityLevel;
  if (chars >= 1200) level = "completo";
  else if (chars >= 500) level = "curto";
  else level = "incompleto";
  return { level, chars, words, readingMinutes };
}

export const QUALITY_META: Record<
  QualityLevel,
  { label: string; icon: string; className: string; description: string }
> = {
  completo: {
    label: "Completo",
    icon: "🟢",
    className: "bg-emerald-100 text-emerald-800 border-emerald-300",
    description: "1200+ caracteres",
  },
  curto: {
    label: "Curto",
    icon: "🟡",
    className: "bg-amber-100 text-amber-800 border-amber-300",
    description: "500 a 1199 caracteres",
  },
  incompleto: {
    label: "Incompleto",
    icon: "🔴",
    className: "bg-red-100 text-red-800 border-red-300",
    description: "Menos de 500 caracteres",
  },
};
