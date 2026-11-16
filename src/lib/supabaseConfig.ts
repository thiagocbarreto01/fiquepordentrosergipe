/** Reject private keys and accidentally mixed Supabase projects before any request. */
export function validatePublicSupabaseConfig(url?: string, key?: string) {
  if (!url || !key) throw new Error("Configure VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY.");
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && ["localhost", "127.0.0.1"].includes(parsed.hostname))) {
    throw new Error("A conexão Supabase exige HTTPS.");
  }
  if (key.startsWith("sb_secret_")) throw new Error("Chaves privadas não podem ser usadas no navegador.");
  if (!key.startsWith("sb_publishable_")) {
    try {
      const part = key.split(".")[1];
      const payload = JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/")));
      if (payload.role !== "anon") throw new Error("private");
      const ref = parsed.hostname.match(/^([a-z]{20})\.supabase\.co$/)?.[1];
      if (ref && payload.ref !== ref) throw new Error("mixed");
    } catch {
      throw new Error("Chave pública inválida ou pertencente a outro projeto Supabase.");
    }
  }
  return { url: parsed.origin, key };
}
