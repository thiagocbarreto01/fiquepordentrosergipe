import { describe, expect, it } from "vitest";
import { validatePublicSupabaseConfig } from "./supabaseConfig";
const ref = "aaaaaaaaaaaaaaaaaaaa";
const token = (role: string, project = ref) => `header.${btoa(JSON.stringify({ role, ref: project }))}.signature`;
describe("public Supabase configuration", () => {
  it("accepts a public key matching the project", () => {
    expect(validatePublicSupabaseConfig(`https://${ref}.supabase.co`, token("anon")).url).toContain(ref);
  });
  it("rejects a key copied from a different project", () => {
    expect(() => validatePublicSupabaseConfig(`https://${ref}.supabase.co`, token("anon", "bbbbbbbbbbbbbbbbbbbb"))).toThrow();
  });
  it("rejects service credentials and missing configuration", () => {
    for (const key of [token("service_role"), "sb_secret_example", "malformed", undefined]) {
      expect(() => validatePublicSupabaseConfig(`https://${ref}.supabase.co`, key)).toThrow();
    }
  });
  it("rejects insecure remote URLs", () => {
    expect(() => validatePublicSupabaseConfig("http://example.com", "sb_publishable_example")).toThrow();
  });
});
