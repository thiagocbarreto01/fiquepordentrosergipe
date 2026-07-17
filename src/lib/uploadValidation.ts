// Validação de upload de imagem de capa.
// Regras: JPEG/PNG/WebP, até 8MB, mínimo 400x250.
// Verifica MIME declarado + assinatura (magic bytes) real.

export const ALLOWED_MIMES = new Set(["image/jpeg", "image/png", "image/webp"]);
export const MAX_BYTES = 8 * 1024 * 1024;
export const MIN_WIDTH = 400;
export const MIN_HEIGHT = 250;

type CheckOk = { ok: true };
type CheckFail = { ok: false; message: string };
export type CheckResult = CheckOk | CheckFail;

async function detectMagicBytes(file: File): Promise<string | null> {
  const buf = await file.slice(0, 12).arrayBuffer();
  const b = new Uint8Array(buf);
  // JPEG: FF D8 FF
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  // WebP: 52 49 46 46 ... 57 45 42 50
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
      b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "image/webp";
  return null;
}

function readDimensions(file: File): Promise<{ w: number; h: number } | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve({ w: img.naturalWidth, h: img.naturalHeight }); };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    img.src = url;
  });
}

export async function validateCoverImage(file: File): Promise<CheckResult> {
  if (!ALLOWED_MIMES.has(file.type)) {
    return { ok: false, message: "Formato não permitido. Use JPEG, PNG ou WebP." };
  }
  if (file.size > MAX_BYTES) {
    const mb = (file.size / 1024 / 1024).toFixed(1);
    return { ok: false, message: `Arquivo tem ${mb} MB. O limite é 8 MB.` };
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

/** Gera um nome de arquivo seguro e não previsível. */
export function safeUploadName(originalName: string): string {
  const dot = originalName.lastIndexOf(".");
  const rawExt = dot >= 0 ? originalName.slice(dot + 1) : "";
  const ext = rawExt.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 4) || "img";
  const rand = crypto.getRandomValues(new Uint8Array(9))
    .reduce((s, b) => s + b.toString(36).padStart(2, "0"), "")
    .slice(0, 18);
  return `posts/${Date.now()}-${rand}.${ext}`;
}
