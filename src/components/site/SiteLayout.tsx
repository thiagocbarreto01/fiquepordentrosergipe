import { ReactNode } from "react";
import SiteHeader from "./SiteHeader";
import SiteFooter from "./SiteFooter";
import BreakingTicker from "./BreakingTicker";
import AdSlot from "./AdSlot";
import PwaInstallButton from "./PwaInstallButton";

export default function SiteLayout({ children, hideTicker = false }: { children: ReactNode; hideTicker?: boolean }) {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <SiteHeader />
      <div className="container-news lg:hidden">
        <AdSlot position="mobile_banner" />
      </div>
      {!hideTicker && <BreakingTicker />}
      <main className="flex-1">{children}</main>
      <SiteFooter />
      <PwaInstallButton />
    </div>
  );
}
