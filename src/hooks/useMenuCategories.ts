import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type MenuCategory = { slug: string; name: string };

// Fallback estático (o mesmo NAV histórico) para o menu público
// caso o banco falhe. Preserva URLs e comportamento anterior.
// IMPORTANTE: só deve ser usado em caso de ERRO real de rede/PostgREST.
// Uma resposta bem-sucedida com lista vazia significa que o admin
// desmarcou todas as categorias — nesse caso o menu dinâmico fica vazio
// e o SiteHeader mostra apenas os itens fixos.
export const FALLBACK_NAV: MenuCategory[] = [
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

export type UseMenuCategoriesResult = {
  items: MenuCategory[];
  isLoading: boolean;
  error: string | null;
};

type CategoryRow = {
  name: string | null;
  slug: string | null;
  show_in_menu: boolean | null;
  position: number | null;
  id?: string | number | null;
};

export function sortMenuRows(rows: CategoryRow[]): CategoryRow[] {
  // Ordem determinística: position asc (nulls last), depois name, depois id.
  return [...rows].sort((a, b) => {
    const ap = a.position ?? Number.POSITIVE_INFINITY;
    const bp = b.position ?? Number.POSITIVE_INFINITY;
    if (ap !== bp) return ap - bp;
    const an = (a.name ?? "").toLocaleLowerCase();
    const bn = (b.name ?? "").toLocaleLowerCase();
    if (an !== bn) return an < bn ? -1 : 1;
    const ai = String(a.id ?? "");
    const bi = String(b.id ?? "");
    return ai < bi ? -1 : ai > bi ? 1 : 0;
  });
}

export function buildMenuItems(rows: CategoryRow[] | null | undefined): MenuCategory[] {
  if (!rows) return [];
  return sortMenuRows(rows)
    .filter((c) => c.show_in_menu !== false && !!c.slug && !!c.name)
    .map((c) => ({ name: c.name as string, slug: c.slug as string }));
}

// Hook original mantém compat: retorna array pronto para consumo.
// Durante loading retorna [] (não pisca fallback).
// Em erro real retorna FALLBACK_NAV.
export function useMenuCategories(): MenuCategory[] {
  const { items } = useMenuCategoriesState();
  return items;
}

export function useMenuCategoriesState(): UseMenuCategoriesResult {
  const [state, setState] = useState<UseMenuCategoriesResult>({
    items: [],
    isLoading: true,
    error: null,
  });

  useEffect(() => {
    let alive = true;
    supabase
      .from("categories")
      .select("id,name,slug,show_in_menu,position")
      .then(({ data, error }) => {
        if (!alive) return;
        if (error) {
          setState({
            items: FALLBACK_NAV,
            isLoading: false,
            error: error.message ?? "fetch_error",
          });
          return;
        }
        setState({
          items: buildMenuItems(data as CategoryRow[] | null),
          isLoading: false,
          error: null,
        });
      });
    return () => {
      alive = false;
    };
  }, []);

  return state;
}
