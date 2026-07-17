/**
 * Helpers de formatação de data no fuso America/Maceio.
 */
const TZ = "America/Maceio";

export function formatMaceio(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", {
    timeZone: TZ,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatMaceioLong(iso: string | null | undefined): string {
  if (!iso) return "Nunca executada";
  const full = new Date(iso).toLocaleString("pt-BR", {
    timeZone: TZ,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  return `${full} (America/Maceió)`;
}

export function timeAgoPt(iso: string | null | undefined): string {
  if (!iso) return "nunca";
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "agora";
  if (diff < 3600) return `há ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `há ${Math.floor(diff / 3600)} h`;
  const days = Math.floor(diff / 86400);
  if (days < 30) return `há ${days} d`;
  return formatMaceio(iso);
}
