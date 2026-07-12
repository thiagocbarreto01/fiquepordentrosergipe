import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type SiteSettings = {
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

const DEFAULTS: SiteSettings = {
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

export function useSiteSettings() {
  const { data } = useQuery({
    queryKey: ["site_settings"],
    queryFn: async (): Promise<SiteSettings> => {
      const { data, error } = await supabase
        .from("site_settings")
        .select("site_name,instagram_handle,instagram_url,facebook_url,threads_url,whatsapp_url,youtube_url,contact_email")
        .maybeSingle();
      if (error || !data) return DEFAULTS;
      return { ...DEFAULTS, ...data } as SiteSettings;
    },
    staleTime: 1000 * 60 * 5,
  });
  return data ?? DEFAULTS;
}
