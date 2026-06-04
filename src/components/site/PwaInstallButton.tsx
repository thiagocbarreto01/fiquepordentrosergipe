import { useEffect, useState } from "react";
import { Download, Share, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISSED_KEY = "pwa-install-dismissed-at";
const DISMISS_DAYS = 7;

function isStandalone() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    // @ts-expect-error iOS Safari
    window.navigator.standalone === true
  );
}

function isIOS() {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent;
  const isIDevice = /iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream;
  const isIPadOS = ua.includes("Mac") && "ontouchend" in document;
  return isIDevice || isIPadOS;
}

function isInIframe() {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

function wasRecentlyDismissed() {
  try {
    const v = localStorage.getItem(DISMISSED_KEY);
    if (!v) return false;
    const ts = Number(v);
    if (!Number.isFinite(ts)) return false;
    return Date.now() - ts < DISMISS_DAYS * 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

export default function PwaInstallButton() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [showIosModal, setShowIosModal] = useState(false);
  const [iosEligible, setIosEligible] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isInIframe()) return; // never offer install inside the editor preview iframe
    if (isStandalone()) {
      setInstalled(true);
      return;
    }
    setDismissed(wasRecentlyDismissed());
    setIosEligible(isIOS());

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installed || dismissed) return null;
  // Show button only if we have a native prompt OR the user is on iOS (manual flow).
  if (!deferred && !iosEligible) return null;

  const handleClick = async () => {
    if (deferred) {
      try {
        await deferred.prompt();
        const choice = await deferred.userChoice;
        if (choice.outcome === "dismissed") {
          try {
            localStorage.setItem(DISMISSED_KEY, String(Date.now()));
          } catch {}
          setDismissed(true);
        }
      } catch {
        /* noop */
      } finally {
        setDeferred(null);
      }
    } else if (iosEligible) {
      setShowIosModal(true);
    }
  };

  const handleClose = () => {
    try {
      localStorage.setItem(DISMISSED_KEY, String(Date.now()));
    } catch {}
    setDismissed(true);
  };

  return (
    <>
      {/* Floating mobile button */}
      <div className="fixed bottom-4 right-4 z-50 md:hidden">
        <div className="relative">
          <Button
            onClick={handleClick}
            size="sm"
            className="bg-urgent hover:bg-urgent/90 text-white font-black uppercase tracking-widest text-[11px] shadow-2xl rounded-full pl-4 pr-5 h-11 flex items-center gap-2"
          >
            <Download className="h-4 w-4" />
            Instalar App
          </Button>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Dispensar"
            className="absolute -top-1.5 -right-1.5 bg-white text-foreground rounded-full h-5 w-5 flex items-center justify-center shadow border border-border"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* Inline desktop button (in header area, smaller) */}
      <Button
        onClick={handleClick}
        variant="outline"
        size="sm"
        className="hidden md:inline-flex h-8 text-[11px] font-black uppercase tracking-widest gap-1.5 border-urgent/40 text-urgent hover:bg-urgent hover:text-white"
      >
        <Download className="h-3.5 w-3.5" />
        Instalar App
      </Button>

      <Dialog open={showIosModal} onOpenChange={setShowIosModal}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-display text-xl font-black flex items-center gap-2">
              <Download className="h-5 w-5 text-urgent" />
              Instalar TV Barretão
            </DialogTitle>
            <DialogDescription>
              Adicione o app à tela de início do seu iPhone para acessar como aplicativo.
            </DialogDescription>
          </DialogHeader>
          <ol className="space-y-3 text-sm mt-2">
            <li className="flex items-start gap-3">
              <span className="shrink-0 h-7 w-7 rounded-full bg-urgent text-white font-black flex items-center justify-center text-xs">
                1
              </span>
              <span className="pt-0.5">
                Toque no botão{" "}
                <span className="inline-flex items-center gap-1 font-bold">
                  <Share className="h-4 w-4 text-primary" /> Compartilhar
                </span>{" "}
                na barra do Safari.
              </span>
            </li>
            <li className="flex items-start gap-3">
              <span className="shrink-0 h-7 w-7 rounded-full bg-urgent text-white font-black flex items-center justify-center text-xs">
                2
              </span>
              <span className="pt-0.5">
                Role e escolha{" "}
                <span className="inline-flex items-center gap-1 font-bold">
                  <Plus className="h-4 w-4 text-primary" /> Adicionar à Tela de Início
                </span>
                .
              </span>
            </li>
            <li className="flex items-start gap-3">
              <span className="shrink-0 h-7 w-7 rounded-full bg-urgent text-white font-black flex items-center justify-center text-xs">
                3
              </span>
              <span className="pt-0.5">
                Confirme tocando em <span className="font-bold">Adicionar</span>. Pronto!
              </span>
            </li>
          </ol>
        </DialogContent>
      </Dialog>
    </>
  );
}
