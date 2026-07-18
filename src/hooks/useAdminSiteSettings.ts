import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Configurações COMPLETAS (públicas + internas) — somente admins autenticados.
 * Acesso à tabela `site_settings` é restrito por RLS a `has_role(admin)`.
 */
export type AdminSiteSettings = {
  site_name: string;
  instagram_handle: string;
  instagram_url: string;
  facebook_url: string;
  threads_url: string;
  whatsapp_url: string;
  youtube_url: string;
  contact_email: string;
  recapture_assisted_enabled: boolean;
};

const DEFAULTS: AdminSiteSettings = {
  site_name: "Fique Por Dentro Sergipe",
  instagram_handle: "",
  instagram_url: "",
  facebook_url: "",
  threads_url: "",
  whatsapp_url: "",
  youtube_url: "",
  contact_email: "contato@fiquepordentrose.com",
  recapture_assisted_enabled: false,
};

export function useAdminSiteSettings(enabled = true) {
  return useQuery({
    queryKey: ["site_settings_admin"],
    enabled,
    queryFn: async (): Promise<AdminSiteSettings> => {
      const { data, error } = await supabase
        .from("site_settings")
        .select(
          "site_name,instagram_handle,instagram_url,facebook_url,threads_url,whatsapp_url,youtube_url,contact_email,recapture_assisted_enabled"
        )
        .maybeSingle();
      if (error || !data) return DEFAULTS;
      return { ...DEFAULTS, ...(data as Partial<AdminSiteSettings>) };
    },
    staleTime: 1000 * 60,
  });
}
