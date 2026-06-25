import { Flame } from "lucide-react";
import type { Post } from "@/lib/news";
import { MostReadItem, NewsThumbItem } from "@/components/site/NewsCards";
import AdSlot from "@/components/site/AdSlot";
import DenunciaBanner from "@/components/site/DenunciaBanner";
import WeatherWidget from "@/components/site/WeatherWidget";
import { SectionBoundary } from "@/components/site/SectionBoundary";

type Props = {
  mostRead: Post[];
  latest: Post[];
};

function SideHeader({ title, color = "border-primary", icon: Icon }: { title: string; color?: string; icon?: any }) {
  return (
    <div className={`flex items-center gap-2 border-b-2 ${color} mb-3 pb-1.5`}>
      {Icon && <Icon className="h-4 w-4 text-primary" />}
      <h3 className="text-sm font-black uppercase tracking-tight">{title}</h3>
    </div>
  );
}

export default function HomeSidebar({ mostRead, latest }: Props) {
  return (
    <aside className="space-y-6">
      <div className="lg:sticky lg:top-24 space-y-6">
        <SectionBoundary title="Mais Lidas" emptyMessage="Sem rankings agora.">
          {mostRead.length > 0 ? (
            <div>
              <SideHeader title="Mais Lidas" color="border-urgent" icon={Flame} />
              <div className="bg-white border border-border/60 rounded-md px-3 py-1">
                {mostRead.slice(0, 5).map((p, i) => (
                  <MostReadItem key={`mr-${p.id}`} post={p} index={i} />
                ))}
              </div>
            </div>
          ) : null}
        </SectionBoundary>

        <SectionBoundary title="Últimas Notícias">
          {latest.length > 0 ? (
            <div>
              <SideHeader title="Últimas Notícias" />
              <div className="bg-white rounded-md border border-border/60 px-3 divide-y divide-border">
                {latest.slice(0, 5).map((p) => (
                  <NewsThumbItem key={`lt-${p.id}`} post={p} />
                ))}
              </div>
            </div>
          ) : null}
        </SectionBoundary>

        <SectionBoundary title="Tempo">
          <WeatherWidget />
        </SectionBoundary>

        <SectionBoundary title="Publicidade">
          <AdSlot position="lateral" />
        </SectionBoundary>

        <SectionBoundary title="Denúncias">
          <DenunciaBanner />
        </SectionBoundary>
      </div>
    </aside>
  );
}
