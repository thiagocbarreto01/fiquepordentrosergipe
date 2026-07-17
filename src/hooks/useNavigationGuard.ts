/**
 * useNavigationGuard — bloqueio de navegação SPA para BrowserRouter.
 *
 * react-router-dom 6 só oferece `useBlocker` em data routers.
 * Este hook cobre os casos práticos ao editar uma notícia:
 *  - clique em `<a href>` no DOM (sidebar, links internos)
 *  - botão "Voltar" do navegador (popstate)
 *  - `beforeunload` (fechar aba / recarregar)
 *
 * O componente pai chama `attempt(nextUrl)` antes de qualquer `navigate()`
 * disparado por botões próprios — se `enabled=false` o pedido passa direto.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

export function useNavigationGuard(enabled: boolean) {
  const [pending, setPending] = useState<string | null>(null);
  const navigate = useNavigate();
  const enabledRef = useRef(enabled);
  useEffect(() => { enabledRef.current = enabled; }, [enabled]);

  // beforeunload — fechar aba / recarregar
  useEffect(() => {
    if (!enabled) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [enabled]);

  // Cliques em <a href> internos
  useEffect(() => {
    if (!enabled) return;
    const onClick = (ev: MouseEvent) => {
      if (!enabledRef.current) return;
      if (ev.defaultPrevented) return;
      if (ev.button !== 0) return;
      if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
      const a = (ev.target as HTMLElement | null)?.closest("a");
      if (!a) return;
      const href = a.getAttribute("href");
      if (!href) return;
      if (a.target && a.target !== "" && a.target !== "_self") return;
      if (href.startsWith("http") || href.startsWith("mailto:") || href.startsWith("tel:")) return;
      if (href.startsWith("#")) return;
      // Mesma URL — ignora
      const url = new URL(href, window.location.origin);
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      ev.preventDefault();
      ev.stopPropagation();
      setPending(url.pathname + url.search + url.hash);
    };
    document.addEventListener("click", onClick, { capture: true });
    return () => document.removeEventListener("click", onClick, { capture: true } as any);
  }, [enabled]);

  // Botão "Voltar" do navegador
  useEffect(() => {
    if (!enabled) return;
    // Empurra um estado sentinela para poder cancelar o próximo popstate
    window.history.pushState({ __guard: true }, "");
    const onPop = () => {
      if (!enabledRef.current) return;
      // Reenfileira o estado para manter o usuário na página
      window.history.pushState({ __guard: true }, "");
      setPending(-1 as any);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [enabled]);

  /** Tenta uma navegação programática; se dirty, abre o diálogo. */
  const attempt = useCallback((to: string | number) => {
    if (!enabledRef.current) {
      if (typeof to === "number") window.history.go(to);
      else navigate(to);
      return;
    }
    setPending(to as any);
  }, [navigate]);

  const confirmDiscard = useCallback(() => {
    const to = pending;
    setPending(null);
    // Desligar o guard antes de navegar para não reabrir o diálogo
    enabledRef.current = false;
    setTimeout(() => {
      if (typeof to === "number") window.history.go(to);
      else if (typeof to === "string") navigate(to);
    }, 0);
  }, [pending, navigate]);

  const cancel = useCallback(() => setPending(null), []);

  return { pending, attempt, confirmDiscard, cancel, hasPending: pending !== null };
}
