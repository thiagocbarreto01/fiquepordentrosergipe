import { loadEnv } from "vite";
import { validatePublicSupabaseConfig } from "../src/lib/supabaseConfig";

export function getBuildSupabaseConfig() {
  const env = { ...loadEnv(process.env.NODE_ENV || "production", process.cwd(), ""), ...process.env };
  return validatePublicSupabaseConfig(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY);
}
