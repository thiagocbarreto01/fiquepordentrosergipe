export type DuplicateTier = "nova" | "similar" | "duplicada";

export function classifyDuplicate(score: number | null | undefined): {
  tier: DuplicateTier;
  label: string;
  pct: number;
  color: string;
  dot: string;
} {
  const s = typeof score === "number" ? score : 0;
  const pct = Math.round(s * 100);
  if (s >= 0.91) {
    return {
      tier: "duplicada",
      label: "Possível Duplicada",
      pct,
      color: "bg-red-100 text-red-800 border-red-300",
      dot: "bg-red-500",
    };
  }
  if (s >= 0.71) {
    return {
      tier: "similar",
      label: "Similar",
      pct,
      color: "bg-yellow-100 text-yellow-800 border-yellow-300",
      dot: "bg-yellow-500",
    };
  }
  return {
    tier: "nova",
    label: "Nova",
    pct,
    color: "bg-emerald-100 text-emerald-800 border-emerald-300",
    dot: "bg-emerald-500",
  };
}

export const DUPLICATE_FILTERS = [
  { key: "all", label: "Todas" },
  { key: "nova", label: "Apenas novas" },
  { key: "similar", label: "Apenas similares" },
  { key: "duplicada", label: "Apenas duplicadas" },
] as const;

export type DuplicateFilter = (typeof DUPLICATE_FILTERS)[number]["key"];
