import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, ChevronRight, Clock, AlertCircle } from "lucide-react";
import { SourceBadge, detectCaptureMethod } from "@/components/admin/SourceBadge";
import { STATUS_LABEL, STATUS_COLOR, normalizeStatus } from "@/lib/statusFlow";

export type GroupSort = "count_desc" | "count_asc" | "recent";

const PENDING_STATUSES = new Set(["captada", "rascunho", "em_revisao", "revisao", "aprovada"]);

function fmtTime(iso: string) {
  const d = new Date(iso);
  const diffMin = (Date.now() - d.getTime()) / 60000;
  if (diffMin < 1) return "agora";
  if (diffMin < 60) return `há ${Math.round(diffMin)} min`;
  if (diffMin < 60 * 24) return `há ${Math.round(diffMin / 60)}h`;
  return d.toLocaleDateString("pt-BR");
}

export function SourceGroupedView({
  posts,
  sort,
  onSortChange,
}: {
  posts: any[];
  sort: GroupSort;
  onSortChange: (s: GroupSort) => void;
}) {
  const groups = useMemo(() => {
    const map = new Map<string, { name: string; items: any[]; lastUpdate: number; pending: number }>();
    for (const p of posts) {
      const method = detectCaptureMethod({ source_id: p.source_id, source_url: p.source_url });
      const name = p.categories && p._sourceName ? p._sourceName : (p._sourceName as string) || (method === "instagram" ? "Instagram" : "Manual");
      const key = name;
      const ts = new Date(p.created_at).getTime();
      const status = normalizeStatus(p.status);
      const isPending = PENDING_STATUSES.has(p.status) || PENDING_STATUSES.has(status);
      const cur = map.get(key);
      if (cur) {
        cur.items.push(p);
        if (ts > cur.lastUpdate) cur.lastUpdate = ts;
        if (isPending) cur.pending++;
      } else {
        map.set(key, { name, items: [p], lastUpdate: ts, pending: isPending ? 1 : 0 });
      }
    }
    const arr = Array.from(map.values());
    if (sort === "count_desc") arr.sort((a, b) => b.items.length - a.items.length);
    else if (sort === "count_asc") arr.sort((a, b) => a.items.length - b.items.length);
    else arr.sort((a, b) => b.lastUpdate - a.lastUpdate);
    return arr;
  }, [posts, sort]);

  const [open, setOpen] = useState<Record<string, boolean>>({});

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mr-1">Ordenar:</span>
        {([
          { key: "count_desc", label: "Maior quantidade" },
          { key: "count_asc", label: "Menor quantidade" },
          { key: "recent", label: "Mais recente" },
        ] as { key: GroupSort; label: string }[]).map((opt) => (
          <button
            key={opt.key}
            onClick={() => onSortChange(opt.key)}
            className={`px-3 py-1.5 text-[11px] uppercase font-bold tracking-wider rounded-sm border ${
              sort === opt.key ? "bg-foreground text-background border-foreground" : "bg-white border-border hover:bg-secondary"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {groups.length === 0 && (
        <div className="bg-card border border-border p-8 text-center text-muted-foreground">Nenhuma notícia.</div>
      )}

      {groups.map((g) => {
        const isOpen = open[g.name] ?? true;
        return (
          <div key={g.name} className="bg-card border border-border">
            <button
              onClick={() => setOpen({ ...open, [g.name]: !isOpen })}
              className="w-full flex items-center gap-3 p-3 hover:bg-secondary/30 transition text-left"
            >
              {isOpen ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
              <SourceBadge name={g.name} />
              <span className="font-display text-xl font-black">({g.items.length})</span>
              <div className="ml-auto flex flex-wrap gap-3 items-center text-[10px] uppercase font-bold tracking-widest text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  Atualizada {fmtTime(new Date(g.lastUpdate).toISOString())}
                </span>
                {g.pending > 0 && (
                  <span className="inline-flex items-center gap-1 text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-sm">
                    <AlertCircle className="h-3 w-3" />
                    {g.pending} pendente{g.pending > 1 ? "s" : ""}
                  </span>
                )}
              </div>
            </button>
            {isOpen && (
              <div className="border-t border-border divide-y divide-border">
                {g.items.map((p) => {
                  const s = normalizeStatus(p.status);
                  return (
                    <div key={p.id} className="p-3 flex items-center gap-3 hover:bg-secondary/20">
                      <span className={`px-2 py-0.5 text-[10px] font-black uppercase tracking-widest border rounded-sm shrink-0 ${STATUS_COLOR[s]}`}>
                        {STATUS_LABEL[s]}
                      </span>
                      <Link to={`/admin/posts/${p.id}`} className="flex-1 min-w-0 font-bold hover:underline truncate">
                        {p.title}
                      </Link>
                      <span className="text-[10px] uppercase font-bold text-muted-foreground shrink-0">
                        {fmtTime(p.created_at)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
