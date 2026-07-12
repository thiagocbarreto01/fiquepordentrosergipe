import { useEffect, useState } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { FileText, AlertTriangle, Eye, Megaphone, ImageIcon, Loader2, Tags, Rss, Copy, Flame, BrainCircuit } from "lucide-react";
import { STATUS_ORDER, STATUS_LABEL, STATUS_COLOR, normalizeStatus, type EditorialStatus } from "@/lib/statusFlow";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { SourceBadge, detectCaptureMethod } from "@/components/admin/SourceBadge";
import { RelevanceBadge, PLACEMENT_LABEL } from "@/components/admin/RelevanceBadge";

function Stat({ label, value, icon: Icon, color }: { label: string; value: number | string; icon: any; color: string }) {
  return (
    <div className="bg-card border border-border p-5 flex items-center gap-4">
      <div className={`h-12 w-12 flex items-center justify-center text-white ${color}`}><Icon className="h-6 w-6" /></div>
      <div>
        <div className="text-xs uppercase tracking-widest text-muted-foreground font-bold">{label}</div>
        <div className="font-display text-3xl font-black">{value}</div>
      </div>
    </div>
  );
}

export default function AdminDashboard() {
  const { role, status, user, isAdmin, isStaff, isApproved, loading } = useAuth();
  const FOUNDER_EMAIL = "thiagocbarreto@hotmail.com";
  const isFounder = user?.email === FOUNDER_EMAIL;

  const roleLabel = isFounder
    ? "Administrador Principal"
    : isAdmin
    ? "Administrador"
    : role === "editor"
    ? "Editor"
    : role === "redator"
    ? "Redator"
    : isStaff
    ? "Membro da equipe"
    : "Sem acesso autorizado";

  const accessLabel = isFounder
    ? { text: "Acesso Total", color: "bg-emerald-100 text-emerald-800 border-emerald-300" }
    : isApproved
    ? { text: "Acesso Ativo", color: "bg-emerald-100 text-emerald-800 border-emerald-300" }
    : status === "pending"
    ? { text: "Aguardando aprovação", color: "bg-yellow-100 text-yellow-800 border-yellow-300" }
    : { text: "Sem acesso autorizado", color: "bg-red-100 text-red-800 border-red-300" };
  const [counts, setCounts] = useState({ posts: 0, denuncias: 0, views: 0, banners: 0 });
  const [duplicatesAvoidedToday, setDuplicatesAvoidedToday] = useState(0);
  const [byStatus, setByStatus] = useState<Record<EditorialStatus, number>>({
    captada: 0, pronta_para_revisao: 0, em_revisao: 0, aprovada: 0, rejeitada: 0, publicada: 0, duplicada: 0, arquivada: 0,
  });
  const [sourcesToday, setSourcesToday] = useState<{ name: string; count: number }[]>([]);
  const [sourcesWeek, setSourcesWeek] = useState<{ name: string; count: number }[]>([]);
  const [sourcesMonth, setSourcesMonth] = useState<{ name: string; count: number }[]>([]);
  const [topRange, setTopRange] = useState<"day" | "week" | "month">("day");
  const [backfilling, setBackfilling] = useState(false);
  const [reclassifying, setReclassifying] = useState(false);

  async function runBackfill() {
    setBackfilling(true);
    try {
      const { data, error } = await supabase.functions.invoke("backfill-images");
      if (error) throw error;
      const r = data as { corrigidos_rss: number; corrigidos_categoria: number; sem_solucao: number; ja_ok: number; total_verificados: number };
      toast.success(
        `Backfill OK — ${r.corrigidos_rss + r.corrigidos_categoria} corrigidos (RSS: ${r.corrigidos_rss}, categoria: ${r.corrigidos_categoria}). Sem solução: ${r.sem_solucao}. Já OK: ${r.ja_ok}.`,
      );
    } catch (e: any) {
      toast.error(`Erro no backfill: ${e?.message ?? e}`);
    } finally {
      setBackfilling(false);
    }
  }

  async function runReclassify() {
    setReclassifying(true);
    try {
      const { data, error } = await supabase.functions.invoke("reclassify-categories");
      if (error) throw error;
      const r = data as {
        total_verificados: number;
        atualizados: number;
        inalterados: number;
        por_origem: Record<string, number>;
      };
      const origens = Object.entries(r.por_origem ?? {})
        .map(([k, v]) => `${k}:${v}`)
        .join(", ");
      toast.success(
        `Reclassificação OK — ${r.atualizados} atualizadas de ${r.total_verificados} (${origens || "sem mudanças"})`,
      );
    } catch (e: any) {
      toast.error(`Erro ao reclassificar: ${e?.message ?? e}`);
    } finally {
      setReclassifying(false);
    }
  }

  useEffect(() => {
    document.title = "Painel — Fique Por Dentro Sergipe";
    Promise.all([
      supabase.from("posts").select("*", { count: "exact", head: true }),
      supabase.from("denuncias").select("*", { count: "exact", head: true }).eq("status", "nova"),
      supabase.from("posts").select("views,status"),
      supabase.from("banners").select("*", { count: "exact", head: true }).eq("is_active", true),
    ]).then(([p, d, v, b]) => {
      const rows = (v.data ?? []) as any[];
      const totalViews = rows.reduce((acc, r) => acc + (r.views || 0), 0);
      const cnt: Record<EditorialStatus, number> = {
        captada: 0, pronta_para_revisao: 0, em_revisao: 0, aprovada: 0, rejeitada: 0, publicada: 0, duplicada: 0, arquivada: 0,
      };
      rows.forEach((r) => {
        cnt[normalizeStatus(r.status)]++;
      });
      setByStatus(cnt);
      setCounts({ posts: p.count ?? 0, denuncias: d.count ?? 0, views: totalViews, banners: b.count ?? 0 });
    });
  }, []);

  useEffect(() => {
    const startDay = new Date(); startDay.setHours(0, 0, 0, 0);
    const startWeek = new Date(); startWeek.setDate(startWeek.getDate() - 7); startWeek.setHours(0, 0, 0, 0);
    const startMonth = new Date(); startMonth.setDate(startMonth.getDate() - 30); startMonth.setHours(0, 0, 0, 0);
    Promise.all([
      supabase.from("posts").select("source_id,source_url,created_at").gte("created_at", startMonth.toISOString()),
      supabase.from("news_sources").select("id,name"),
    ]).then(([postsRes, sourcesRes]) => {
      const srcMap = new Map<string, string>();
      (sourcesRes.data ?? []).forEach((s: any) => srcMap.set(s.id, s.name));
      function bucket(from: Date) {
        const b = new Map<string, number>();
        (postsRes.data ?? []).forEach((p: any) => {
          if (new Date(p.created_at) < from) return;
          const method = detectCaptureMethod({ source_id: p.source_id, source_url: p.source_url });
          const name = (p.source_id && srcMap.get(p.source_id)) || (method === "instagram" ? "Instagram" : "Manual");
          b.set(name, (b.get(name) || 0) + 1);
        });
        return Array.from(b.entries()).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
      }
      setSourcesToday(bucket(startDay));
      setSourcesWeek(bucket(startWeek));
      setSourcesMonth(bucket(startMonth));
    });
  }, []);

  useEffect(() => {
    const start = new Date(); start.setHours(0, 0, 0, 0);
    Promise.all([
      supabase.from("posts").select("id", { count: "exact", head: true })
        .eq("status", "duplicada").gte("created_at", start.toISOString()),
      supabase.from("duplicate_decisions").select("id", { count: "exact", head: true })
        .in("decision", ["mesclar", "marcar_duplicada"]).gte("created_at", start.toISOString()),
    ]).then(([dupRes, decRes]) => {
      setDuplicatesAvoidedToday((dupRes.count ?? 0) + (decRes.count ?? 0));
    });
  }, []);

  const [topRelevant, setTopRelevant] = useState<any[]>([]);
  const [urgentPending, setUrgentPending] = useState<any[]>([]);
  useEffect(() => {
    const start = new Date(); start.setHours(0, 0, 0, 0);
    supabase.from("posts")
      .select("id,title,slug,relevance_score,relevance_level,relevance_reason,ai_suggested_placement,ai_suggestion_status,status,is_main_featured,is_featured,is_urgent,created_at")
      .gte("created_at", start.toISOString())
      .not("relevance_score", "is", null)
      .order("relevance_score", { ascending: false })
      .limit(8)
      .then(({ data }) => setTopRelevant((data as any[]) ?? []));

    supabase.from("posts")
      .select("id,title,slug,relevance_score,relevance_level,ai_suggested_placement,status")
      .eq("relevance_level", "urgente" as any)
      .eq("ai_suggestion_status", "pendente" as any)
      .in("status", ["captada", "pronta_para_revisao", "em_revisao"] as any)
      .order("relevance_score", { ascending: false })
      .limit(5)
      .then(({ data }) => setUrgentPending((data as any[]) ?? []));
  }, []);

  return (
    <AdminLayout>
      <h1 className="font-display text-3xl font-black mb-1">Painel Fique Por Dentro Sergipe</h1>
      {loading ? (
        <p className="text-muted-foreground mb-6">Carregando suas permissões…</p>
      ) : (
        <div className="flex flex-wrap items-center gap-2 mb-6 text-sm">
          <span className="text-muted-foreground">Seu papel:</span>
          <span className="px-2 py-0.5 font-black uppercase tracking-widest text-[11px] border border-border bg-secondary rounded-sm">
            {roleLabel}
          </span>
          <span className={`px-2 py-0.5 font-black uppercase tracking-widest text-[11px] border rounded-sm ${accessLabel.color}`}>
            ● {accessLabel.text}
          </span>
        </div>
      )}

      {!loading && !isApproved && !isFounder && (
        <div className="bg-alert/20 border border-alert p-4 mb-6 text-sm">
          {status === "pending"
            ? "Seu acesso está aguardando aprovação do Administrador Principal. Você não poderá realizar ações no painel até ser aprovado."
            : "Sem acesso autorizado. Entre em contato com um administrador."}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
        <Stat label="Notícias" value={counts.posts} icon={FileText} color="bg-primary" />
        <Stat label="Denúncias novas" value={counts.denuncias} icon={AlertTriangle} color="bg-urgent" />
        <Stat label="Visualizações" value={counts.views.toLocaleString("pt-BR")} icon={Eye} color="bg-navy-deep" />
        <Stat label="Banners ativos" value={counts.banners} icon={Megaphone} color="bg-alert text-alert-foreground" />
        <Stat label="Duplicadas evitadas hoje" value={duplicatesAvoidedToday} icon={Copy} color="bg-amber-600" />
      </div>

      {urgentPending.length > 0 && (
        <div className="mb-6 border-2 border-red-500 bg-red-50 dark:bg-red-950/30 p-4 animate-pulse">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="h-5 w-5 text-red-600" />
            <h3 className="font-display font-black text-lg text-red-700 dark:text-red-300">
              {urgentPending.length === 1
                ? "Existe uma notícia urgente aguardando revisão."
                : `Existem ${urgentPending.length} notícias urgentes aguardando revisão.`}
            </h3>
          </div>
          <ul className="space-y-1">
            {urgentPending.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-2 text-sm">
                <Link to={`/admin/posts/${p.id}`} className="hover:underline truncate font-bold">
                  🔴 {p.title}
                </Link>
                <span className="text-xs text-red-700 dark:text-red-300 font-mono whitespace-nowrap">
                  {p.relevance_score}% · {PLACEMENT_LABEL[p.ai_suggested_placement] ?? "—"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="bg-card border border-border p-5 mb-8">
        <div className="flex items-center gap-2 mb-4">
          <BrainCircuit className="h-5 w-5 text-primary" />
          <h2 className="font-display text-xl font-black uppercase tracking-wider">Notícias mais relevantes hoje</h2>
        </div>
        {topRelevant.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma notícia analisada hoje ainda.</p>
        ) : (
          <ul className="divide-y divide-border">
            {topRelevant.map((p) => (
              <li key={p.id} className="py-2 flex items-center justify-between gap-3 flex-wrap">
                <div className="flex-1 min-w-0">
                  <Link to={`/admin/posts/${p.id}`} className="font-bold hover:underline truncate block">
                    {p.title}
                  </Link>
                  {p.relevance_reason && (
                    <div className="text-xs text-muted-foreground line-clamp-1">{p.relevance_reason}</div>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <RelevanceBadge level={p.relevance_level} score={p.relevance_score} />
                  {p.ai_suggested_placement && (
                    <span className="text-[11px] uppercase tracking-wider px-2 py-0.5 border border-primary/40 bg-primary/5 text-primary font-bold">
                      {PLACEMENT_LABEL[p.ai_suggested_placement]}
                    </span>
                  )}
                  {p.ai_suggestion_status === "aceita" && (
                    <span className="text-[11px] uppercase tracking-wider px-2 py-0.5 border border-emerald-400 bg-emerald-50 text-emerald-700 font-bold">aceita</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>


      <h2 className="font-display text-xl font-black mb-3 uppercase tracking-wider">Fluxo editorial</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-8">
        {STATUS_ORDER.map((s) => (
          <Link
            key={s}
            to="/admin/posts"
            className={`p-4 border ${STATUS_COLOR[s]} hover:opacity-80 transition`}
          >
            <div className="text-xs uppercase font-bold tracking-wider">{STATUS_LABEL[s]}</div>
            <div className="font-display text-3xl font-black mt-1">{byStatus[s]}</div>
          </Link>
        ))}
      </div>

      {(() => {
        const data = topRange === "day" ? sourcesToday : topRange === "week" ? sourcesWeek : sourcesMonth;
        const total = data.reduce((a, s) => a + s.count, 0);
        const rangeLabel = topRange === "day" ? "do Dia" : topRange === "week" ? "da Semana" : "do Mês";
        return (
          <div className="bg-card border border-border p-5 mb-6">
            <div className="flex items-center gap-2 mb-4 flex-wrap">
              <Rss className="h-5 w-5 text-primary" />
              <h2 className="font-display text-xl font-black uppercase tracking-wider">Top Fontes {rangeLabel}</h2>
              <div className="ml-auto flex gap-1">
                {([
                  { key: "day", label: "Dia" },
                  { key: "week", label: "Semana" },
                  { key: "month", label: "Mês" },
                ] as { key: "day" | "week" | "month"; label: string }[]).map((opt) => (
                  <button
                    key={opt.key}
                    onClick={() => setTopRange(opt.key)}
                    className={`px-3 py-1 text-[11px] uppercase font-bold tracking-wider rounded-sm border ${
                      topRange === opt.key ? "bg-foreground text-background border-foreground" : "bg-white border-border hover:bg-secondary"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <span className="text-xs text-muted-foreground basis-full md:basis-auto md:ml-3">
                Total: <strong>{total}</strong>
              </span>
            </div>
            {data.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma notícia captada no período.</p>
            ) : (
              <div className="space-y-2">
                {data.map((s) => {
                  const pct = total > 0 ? Math.round((s.count / total) * 100) : 0;
                  return (
                    <Link
                      key={s.name}
                      to="/admin/posts"
                      className="flex items-center gap-3 p-2 border border-border rounded-sm hover:bg-secondary transition"
                    >
                      <SourceBadge name={s.name} />
                      <div className="flex-1 h-2 bg-secondary rounded-sm overflow-hidden">
                        <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="font-mono text-xs font-bold text-muted-foreground w-10 text-right">{pct}%</span>
                      <span className="font-display text-lg font-black leading-none w-10 text-right">{s.count}</span>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        );
      })()}




      <div className="grid md:grid-cols-2 gap-4">
        <Link to="/admin/posts/novo" className="bg-card border border-border p-5 hover:border-primary">
          <h3 className="font-display text-xl font-black">Captar nova notícia</h3>
          <p className="text-sm text-muted-foreground mt-1">Inicia como "captada" e segue o fluxo: revisão → aprovada → publicada.</p>
        </Link>
        <Link to="/admin/denuncias" className="bg-card border border-border p-5 hover:border-urgent">
          <h3 className="font-display text-xl font-black">Apurar denúncias</h3>
          <p className="text-sm text-muted-foreground mt-1">Veja relatos enviados pelo público.</p>
        </Link>
      </div>

      <div className="mt-6 bg-card border border-border p-5">
        <div className="flex items-start gap-4 flex-wrap">
          <div className="h-12 w-12 flex items-center justify-center bg-navy-deep text-white">
            <ImageIcon className="h-6 w-6" />
          </div>
          <div className="flex-1 min-w-[220px]">
            <h3 className="font-display text-xl font-black">Corrigir imagens das notícias</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Revisa todas as notícias publicadas e substitui imagens vazias ou genéricas usando, em ordem: imagem do RSS &gt; imagem padrão da categoria.
            </p>
          </div>
          <Button onClick={runBackfill} disabled={backfilling}>
            {backfilling ? <><Loader2 className="h-4 w-4 animate-spin" /> Corrigindo…</> : "Rodar backfill"}
          </Button>
        </div>
      </div>

      <div className="mt-4 bg-card border border-border p-5">
        <div className="flex items-start gap-4 flex-wrap">
          <div className="h-12 w-12 flex items-center justify-center bg-primary text-primary-foreground">
            <Tags className="h-6 w-6" />
          </div>
          <div className="flex-1 min-w-[220px]">
            <h3 className="font-display text-xl font-black">Reclassificar categorias</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Reaplica as regras de categorização nas notícias existentes. Prioridade: <strong>palavras-chave fortes de Polícia</strong> &gt; categoria do RSS &gt; palavras-chave gerais &gt; categoria padrão da fonte &gt; fallback.
            </p>
          </div>
          <Button onClick={runReclassify} disabled={reclassifying} variant="outline" className="border-2 border-foreground font-bold">
            {reclassifying ? <><Loader2 className="h-4 w-4 animate-spin" /> Reclassificando…</> : "Reclassificar agora"}
          </Button>
        </div>
      </div>
    </AdminLayout>
  );
}
