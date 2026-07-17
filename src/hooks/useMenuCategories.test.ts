import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

// Mock the supabase client BEFORE importing the hook.
const thenMock = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        then: (cb: any) => thenMock(cb),
      }),
    }),
  },
}));

import {
  useMenuCategories,
  useMenuCategoriesState,
  buildMenuItems,
  sortMenuRows,
  FALLBACK_NAV,
} from "./useMenuCategories";

function resolveWith(payload: { data: any; error: any }) {
  thenMock.mockImplementation((cb: any) => {
    cb(payload);
    return Promise.resolve(payload);
  });
}

function neverResolve() {
  thenMock.mockImplementation(() => new Promise(() => {}));
}

const rows = [
  { id: "1", name: "Sergipe", slug: "sergipe", show_in_menu: true, position: 2 },
  { id: "2", name: "Aracaju", slug: "aracaju", show_in_menu: true, position: 1 },
  { id: "3", name: "Oculta", slug: "oculta", show_in_menu: false, position: 3 },
];

beforeEach(() => {
  thenMock.mockReset();
});

describe("useMenuCategories - pure helpers", () => {
  it("1. show_in_menu=true → categoria aparece", () => {
    const items = buildMenuItems([
      { id: "1", name: "A", slug: "a", show_in_menu: true, position: 1 },
    ]);
    expect(items).toEqual([{ name: "A", slug: "a" }]);
  });

  it("2. show_in_menu=false → categoria não aparece", () => {
    const items = buildMenuItems([
      { id: "1", name: "A", slug: "a", show_in_menu: false, position: 1 },
      { id: "2", name: "B", slug: "b", show_in_menu: true, position: 2 },
    ]);
    expect(items).toEqual([{ name: "B", slug: "b" }]);
  });

  it("3. todas ocultas → nenhuma categoria dinâmica", () => {
    const items = buildMenuItems([
      { id: "1", name: "A", slug: "a", show_in_menu: false, position: 1 },
      { id: "2", name: "B", slug: "b", show_in_menu: false, position: 2 },
    ]);
    expect(items).toEqual([]);
  });

  it("7. ordem por position/name/id é determinística", () => {
    const sorted = sortMenuRows([
      { id: "z", name: "Zeta", slug: "z", show_in_menu: true, position: null },
      { id: "a", name: "Alpha", slug: "a", show_in_menu: true, position: null },
      { id: "b", name: "Beta", slug: "b", show_in_menu: true, position: 1 },
      { id: "c", name: "Beta", slug: "c", show_in_menu: true, position: 1 },
    ]);
    expect(sorted.map((r) => r.id)).toEqual(["b", "c", "a", "z"]);
  });
});

describe("useMenuCategoriesState - async behavior", () => {
  it("4. consulta retorna [] sem erro → não usa fallback", async () => {
    resolveWith({ data: [], error: null });
    const { result } = renderHook(() => useMenuCategoriesState());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.items).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it("5. consulta retorna erro → usa FALLBACK_NAV", async () => {
    resolveWith({ data: null, error: { message: "boom" } });
    const { result } = renderHook(() => useMenuCategoriesState());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.items).toEqual(FALLBACK_NAV);
    expect(result.current.error).toBe("boom");
  });

  it("6. loading → não pisca categorias do fallback", () => {
    neverResolve();
    const { result } = renderHook(() => useMenuCategoriesState());
    expect(result.current.isLoading).toBe(true);
    expect(result.current.items).toEqual([]);
  });

  it("8. desktop e mobile recebem a mesma lista dinâmica", async () => {
    resolveWith({ data: rows, error: null });
    const { result: a } = renderHook(() => useMenuCategories());
    const { result: b } = renderHook(() => useMenuCategories());
    await waitFor(() => expect(a.current.length).toBeGreaterThan(0));
    await waitFor(() => expect(b.current.length).toBeGreaterThan(0));
    expect(a.current).toEqual(b.current);
    expect(a.current).toEqual([
      { name: "Aracaju", slug: "aracaju" },
      { name: "Sergipe", slug: "sergipe" },
    ]);
  });
});
