// Validação de banners. Regras:
// - URLs (imagem/link) apenas http/https, sem javascript:/data:/file:/relativo.
// - Upload: JPEG/PNG/WebP, até 4MB, mínimo 320×80 (mobile) — banners maiores continuam válidos.
// - MIME declarado deve bater com assinatura real (magic bytes).
import { z } from "zod";

export const ALLOWED_MIMES = new Set(["image/jpeg", "image/png", "image/webp"]);
export const MAX_BYTES = 4 * 1024 * 1024;
export const MIN_WIDTH = 320;
export const MIN_HEIGHT = 80;

const URL_RE = /^https?:\/\/[^\s]+$/i;

export const httpUrl = z
  .string()
  .trim()
  .regex(URL_RE, { message: "Use uma URL http:// ou https://" })
  .max(2048, { message: "URL muito longa" });

export const optionalHttpUrl = z
  .string()
  .trim()
  .max(2048, { message: "URL muito longa" })
  .transform((v) => (v === "" ? null : v))
  .refine((v) => v === null || URL_RE.test(v), {
    message: "Use uma URL http:// ou https:// (ou deixe em branco)",
  });

export const bannerFormSchema = z
  .object({
    name: z.string().trim().min(1, "Informe o nome").max(120),
    sponsor: z.string().trim().max(120).optional().or(z.literal("")),
    image_url: httpUrl,
    link_url: optionalHttpUrl,
    position: z.enum([
      "topo_home",
      "entre_noticias",
      "dentro_materia",
      "final_materia",
      "lateral",
      "mobile_banner",
      "footer",
    ]),
    is_active: z.boolean(),
    starts_at: z.string().optional().nullable(),
    ends_at: z.string().optional().nullable(),
  })
  .refine(
    (v) =>
      !v.starts_at ||
      !v.ends_at ||
      new Date(v.ends_at).getTime() > new Date(v.starts_at).getTime(),
    { message: "Fim do agendamento deve ser depois do início", path: ["ends_at"] }
  );

export type BannerFormValues = z.infer<typeof bannerFormSchema>;

type CheckOk = { ok: true };
type CheckFail = { ok: false; message: string };
export type CheckResult = CheckOk | CheckFail;

async function detectMagicBytes(file: File): Promise<string | null> {
  const buf = await file.slice(0, 12).arrayBuffer();
  const b = new Uint8Array(buf);
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (
    b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
    b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50
  )
    return "image/webp";
  return null;
}

function readDimensions(file: File): Promise<{ w: number; h: number } | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ w: img.naturalWidth, h: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}

export async function validateBannerImage(file: File): Promise<CheckResult> {
  if (!ALLOWED_MIMES.has(file.type)) {
    return { ok: false, message: "Formato não permitido. Use JPEG, PNG ou WebP." };
  }
  if (file.size > MAX_BYTES) {
    const mb = (file.size / 1024 / 1024).toFixed(1);
    return { ok: false, message: `Arquivo tem ${mb} MB. Limite: 4 MB.` };
  }
  const magic = await detectMagicBytes(file);
  if (!magic || magic !== file.type) {
    return { ok: false, message: "Assinatura do arquivo não confere com o formato declarado." };
  }
  const dims = await readDimensions(file);
  if (!dims) return { ok: false, message: "Não foi possível ler as dimensões da imagem." };
  if (dims.w < MIN_WIDTH || dims.h < MIN_HEIGHT) {
    return { ok: false, message: `Imagem muito pequena (${dims.w}×${dims.h}). Mínimo: ${MIN_WIDTH}×${MIN_HEIGHT}.` };
  }
  return { ok: true };
}

export function safeBannerUploadName(originalName: string): string {
  const dot = originalName.lastIndexOf(".");
  const rawExt = dot >= 0 ? originalName.slice(dot + 1) : "";
  const ext = rawExt.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 4) || "img";
  const rand = crypto
    .getRandomValues(new Uint8Array(9))
    .reduce((s, b) => s + b.toString(36).padStart(2, "0"), "")
    .slice(0, 18);
  return `banners/${Date.now()}-${rand}.${ext}`;
}

/** ISO (UTC) -> valor para <input type="datetime-local"> em horário local. */
export function isoToLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Valor de <input type="datetime-local"> (horário local) -> ISO UTC. */
export function localInputToIso(v: string | null | undefined): string | null {
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}
