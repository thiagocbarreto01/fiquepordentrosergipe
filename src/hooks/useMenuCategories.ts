import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type MenuCategory = { slug: string; name: string };

// Fallback estático (o mesmo NAV histórico) para o menu público
// caso o banco falhe. Preserva URLs e comportamento anterior.
const FALLBACK: MenuCategory[] = [
  { name: "Polícia", slug: "policia" },
  { name: "Política", slug: "politica" },
  { name: "Sergipe", slug: "sergipe" },
  { name: "Aracaju", slug: "aracaju" },
  { name: "Interior", slug: "interior" },
  { name: "Brasil", slug: "brasil" },
  { name: "Mundo", slug: "mundo" },
  { name: "Economia", slug: "economia" },
  { name: "Saúde", slug: "saude" },
  { name: "Educação", slug: "educacao" },
  { name: "Esportes", slug: "esportes" },
  { name: "Entretenimento", slug: "entretenimento" },
];

export function useMenuCategories() {
  const [items, setItems] = useState<MenuCategory[]>(FALLBACK);

  useEffect(() => {
    let alive = true;
    supabase
      .from("categories")
      .select("name,slug,show_in_menu,position")
      .order("position", { ascending: true })
      .then(({ data, error }) => {
        if (!alive) return;
        if (error || !data) return;
        const filtered = data
          .filter((c: any) => c.show_in_menu !== false)
          .map((c: any) => ({ name: c.name as string, slug: c.slug as string }));
        if (filtered.length > 0) setItems(filtered);
      });
    return () => {
      alive = false;
    };
  }, []);

  return items;
}
