import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Configurações PÚBLICAS do site — visíveis a qualquer visitante.
 * Vem via RPC `get_public_site_settings` para nunca expor flags internas
 * (ex.: `recapture_assisted_enabled`) ao anon.
 */
export type SiteSettings = {
  site_name: string;
  instagram_handle: string;
  instagram_url: string;
  facebook_url: string;
  threads_url: string;
  whatsapp_url: string;
  youtube_url: string;
  contact_email: string;
};

const DEFAULTS: SiteSettings = {
  site_name: "Fique Por Dentro Sergipe",
  instagram_handle: "",
  instagram_url: "",
  facebook_url: "",
  threads_url: "",
  whatsapp_url: "",
  youtube_url: "",
  contact_email: "contato@fiquepordentrose.com",
};

export function useSiteSettings() {
  const { data } = useQuery({
    queryKey: ["site_settings_public"],
    queryFn: async (): Promise<SiteSettings> => {
      const { data, error } = await supabase.rpc("get_public_site_settings");
      if (error || !data || !data.length) return DEFAULTS;
      const row = data[0] as Partial<SiteSettings>;
      return { ...DEFAULTS, ...row };
    },
    staleTime: 1000 * 60 * 5,
  });
  return data ?? DEFAULTS;
}
