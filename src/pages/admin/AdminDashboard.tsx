import { useEffect, useMemo, useState } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import {
  FileText, AlertTriangle, Eye, Megaphone, Loader2, Tags, Rss, Copy,
  BrainCircuit, ArrowRight, PlusCircle, ExternalLink, Wrench, Info,
} from "lucide-react";
import { STATUS_LABEL, STATUS_COLOR, normalizeStatus, type EditorialStatus } from "@/lib/statusFlow";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { SourceBadge } from "@/components/admin/SourceBadge";
import { RelevanceBadge, PLACEMENT_LABEL } from "@/components/admin/RelevanceBadge";

type SourceRow = { name: string; count: number };
type DashboardStats = {
  total_posts: number;
  total_archived: number;
  total_views: number;
  denuncias_novas: number;
  banners_ativos: number;
  duplicadas_hoje: number;
  status_counts: Record<string, number>;
  sources_day: SourceRow[];
  sources_week: SourceRow[];
  sources_month: SourceRow[];
  generated_at: string;
};

/** Cartão de métrica principal — alturas uniformes, títulos sem truncate, acessível. */
function MetricCard({
  label, value, subtitle, icon: Icon, tone, to, tooltip,
}: {
  label: string;
  value: number | string;
  subtitle?: string;
  icon: any;
  tone: string;
  to?: string;
  tooltip?: string;
}) {
  const inner = (
    <div className="h-full min-h-[128px] bg-card border border-border p-5 flex items-start gap-4 hover:border-foreground/40 focus-within:ring-2 focus-within:ring-primary/60 transition">
      <div className={`h-12 w-12 shrink-0 flex items-center justify-center text-white ${tone}`}>
        <Icon className="h-6 w-6" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start gap-1.5">
          <div className="text-xs uppercase tracking-widest text-muted-foreground font-bold leading-tight">
            {label}
          </div>
          {tooltip && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button type="button" className="text-muted-foreground/70 hover:text-foreground" aria-label="Sobre esta métrica">
                  <Info className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs text-xs">{tooltip}</TooltipContent>
            </Tooltip>
          )}
        </div>
        <div className="font-display text-3xl font-black leading-tight mt-1 break-words">{value}</div>
        {subtitle && <div className="text-xs text-muted-foreground mt-1 leading-snug">{subtitle}</div>}
      </div>
      {to && <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0 mt-1" aria-hidden />}
    </div>
  );
  if (to) {
    return (
      <Link to={to} className="block outline-none rounded-sm">
        {inner}
      </Link>
    );
  }
  return inner;
}

// "Em revisão" agrega no banco: pronta_para_revisao + em_revisao + revisao (legado).
// O link do card usa ?status=em_revisao, cuja query em AdminPosts também expande
// para esses três valores — garantindo que o número do card e o total listado sejam idênticos.
const STATUS_TILES: { key: EditorialStatus; label: string; group: string[]; subKey?: string }[] = [
  { key: "captada", label: STATUS_LABEL.captada, group: ["captada", "rascunho"] },
  { key: "em_revisao", label: "Em revisão", group: ["pronta_para_revisao", "em_revisao", "revisao"], subKey: "pronta_para_revisao" },
  { key: "aprovada", label: STATUS_LABEL.aprovada, group: ["aprovada"] },
  { key: "publicada", label: STATUS_LABEL.publicada, group: ["publicada", "publicado"] },
  { key: "duplicada", label: STATUS_LABEL.duplicada, group: ["duplicada"] },
  { key: "rejeitada", label: STATUS_LABEL.rejeitada, group: ["rejeitada"] },
  { key: "arquivada", label: STATUS_LABEL.arquivada, group: ["arquivada"] },
];

export default function AdminDashboard() {
  const { role, status, user, isAdmin, isStaff, isApproved, isSuperAdmin, loading } = useAuth();

  const roleLabel = isSuperAdmin
    ? "Superadministrador"
    : isAdmin ? "Administrador"
    : role === "editor" ? "Editor"
    : role === "redator" ? "Redator"
    : isStaff ? "Membro da equipe"
    : "Sem acesso autorizado";

  const accessLabel = isApproved
    ? { text: "Acesso Ativo", color: "bg-emerald-100 text-emerald-800 border-emerald-300" }
    : status === "pending"
    ? { text: "Aguardando aprovação", color: "bg-yellow-100 text-yellow-800 border-yellow-300" }
    : { text: "Sem acesso autorizado", color: "bg-red-100 text-red-800 border-red-300" };

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [topRange, setTopRange] = useState<"day" | "week" | "month">("day");
  const [backfilling, setBackfilling] = useState(false);
  const [reclassifying, setReclassifying] = useState(false);
  const [confirmAction, setConfirmAction] = useState<null | "backfill" | "reclassify">(null);
  const [topRelevant, setTopRelevant] = useState<any[]>([]);
  const [urgentPending, setUrgentPending] = useState<any[]>([]);

  useEffect(() => {
    document.title = "Painel — Fique Por Dentro Sergipe";
  }, []);

  async function loadStats() {
    setStatsLoading(true);
    setStatsError(null);
    const { data, error } = await supabase.rpc("admin_dashboard_stats" as any);
    if (error) {
      console.error("[Dashboard] admin_dashboard_stats:", error);
      setStatsError(error.message);
    } else {
      setStats(data as unknown as DashboardStats);
    }
    setStatsLoading(false);
  }

  useEffect(() => {
    if (!isStaff) return;
    loadStats();
  }, [isStaff]);

  useEffect(() => {
    if (!isStaff) return;
    const start = new Date(); start.setHours(0, 0, 0, 0);
    supabase.from("posts")
      .select("id,title,slug,relevance_score,relevance_level,relevance_reason,ai_suggested_placement,ai_suggestion_status,status")
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
  }, [isStaff]);

  const statusCells = useMemo(() => {
    const counts = stats?.status_counts ?? {};
    return STATUS_TILES.map(t => ({
      ...t,
      count: t.group.reduce((s, k) => s + Number(counts[k] ?? 0), 0),
      subCount: t.subKey ? Number(counts[t.subKey] ?? 0) : undefined,
    }));
  }, [stats]);

  const editorialSum = useMemo(() => statusCells.reduce((s, c) => s + c.count, 0), [statusCells]);
  const drift = stats ? editorialSum - stats.total_posts : 0;

  const topSources = useMemo<SourceRow[]>(() => {
    if (!stats) return [];
    return topRange === "day" ? stats.sources_day : topRange === "week" ? stats.sources_week : stats.sources_month;
  }, [stats, topRange]);
  const topSourcesTotal = topSources.reduce((s, r) => s + r.count, 0);
  const rangeLabel = topRange === "day" ? "do Dia" : topRange === "week" ? "da Semana" : "do Mês";

  async function runBackfill() {
    if (backfilling) return;
    setBackfilling(true);
    try {
      const { data, error } = await supabase.functions.invoke("backfill-images");
      if (error) throw error;
      const r = data as { corrigidos_rss: number; corrigidos_categoria: number; sem_solucao: number; ja_ok: number; total_verificados: number };
      toast.success(`Backfill OK — ${r.corrigidos_rss + r.corrigidos_categoria} corrigidos (RSS: ${r.corrigidos_rss}, categoria: ${r.corrigidos_categoria}). Sem solução: ${r.sem_solucao}. Já OK: ${r.ja_ok}.`);
    } catch (e: any) {
      toast.error(`Erro no backfill: ${e?.message ?? e}`);
    } finally { setBackfilling(false); setConfirmAction(null); }
  }

  async function runReclassify() {
    if (reclassifying) return;
    setReclassifying(true);
    try {
      const { data, error } = await supabase.functions.invoke("reclassify-categories");
      if (error) throw error;
      const r = data as { total_verificados: number; atualizados: number; inalterados: number; por_origem: Record<string, number> };
      const origens = Object.entries(r.por_origem ?? {}).map(([k, v]) => `${k}:${v}`).join(", ");
      toast.success(`Reclassificação OK — ${r.atualizados} atualizadas de ${r.total_verificados} (${origens || "sem mudanças"})`);
    } catch (e: any) {
      toast.error(`Erro ao reclassificar: ${e?.message ?? e}`);
    } finally { setReclassifying(false); setConfirmAction(null); }
  }

  const fmt = (n: number | undefined | null) => (typeof n === "number" ? n : 0).toLocaleString("pt-BR");

  return (
    <AdminLayout>
      <h1 className="font-display text-2xl md:text-3xl font-black mb-1">Painel Fique Por Dentro Sergipe</h1>
      {loading ? (
        <p className="text-muted-foreground mb-6">Carregando suas permissões…</p>
      ) : (
        <div className="flex flex-wrap items-center gap-2 mb-6 text-sm">
          <span className="text-muted-foreground">Seu papel:</span>
          <span className="px-2 py-0.5 font-black uppercase tracking-widest text-[11px] border border-border bg-secondary rounded-sm">{roleLabel}</span>
          <span className={`px-2 py-0.5 font-black uppercase tracking-widest text-[11px] border rounded-sm ${accessLabel.color}`}>● {accessLabel.text}</span>
        </div>
      )}

      {!loading && !isApproved && (
        <div className="bg-alert/20 border border-alert p-4 mb-6 text-sm">
          {status === "pending"
            ? "Seu acesso está aguardando aprovação do Administrador Principal. Você não poderá realizar ações no painel até ser aprovado."
            : "Sem acesso autorizado. Entre em contato com um administrador."}
        </div>
      )}

      {statsError && (
        <div className="bg-red-50 border border-red-300 text-red-800 p-3 mb-6 text-sm">
          Erro ao carregar métricas: {statsError}
        </div>
      )}

      {/* ============ CARDS PRINCIPAIS ============ */}
      <section aria-label="Métricas principais" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        <MetricCard
          label="Total de notícias"
          value={statsLoading ? "…" : fmt(stats?.total_posts)}
          subtitle={
            stats && stats.total_archived > 0
              ? `Todo o período · ${fmt(stats.total_archived)} arquivada${stats.total_archived === 1 ? "" : "s"}`
              : "Todo o período"
          }
          icon={FileText}
          tone="bg-primary"
          to="/admin/posts?status=all"
        />
        <MetricCard
          label="Denúncias novas"
          value={statsLoading ? "…" : fmt(stats?.denuncias_novas)}
          subtitle="Aguardando apuração"
          icon={AlertTriangle}
          tone="bg-urgent"
          to="/admin/denuncias"
        />
        <MetricCard
          label="Visualizações históricas"
          value={statsLoading ? "…" : fmt(stats?.total_views)}
          subtitle="Contador acumulado"
          icon={Eye}
          tone="bg-navy-deep"
          tooltip="Soma do contador acumulado de views em posts (coluna posts.views). Não há histórico por período neste projeto — apenas o total desde o cadastro de cada notícia."
        />
        <MetricCard
          label="Visualizações — últimos 7 dias"
          value="Sem histórico"
          subtitle="Ainda sem histórico por período"
          icon={Eye}
          tone="bg-muted text-muted-foreground"
          tooltip="Este projeto não registra ainda histórico temporal de visualizações. Quando um sistema de eventos for adicionado, este card passará a mostrar o total dos últimos 7 dias."
        />
        <MetricCard
          label="Banners ativos"
          value={statsLoading ? "…" : fmt(stats?.banners_ativos)}
          subtitle="Ativos no momento (respeitando datas)"
          icon={Megaphone}
          tone="bg-alert text-alert-foreground"
          to="/admin/banners"
        />
        <MetricCard
          label="Duplicadas evitadas · Hoje"
          value={statsLoading ? "…" : fmt(stats?.duplicadas_hoje)}
          subtitle="Marcadas como duplicadas + decisões manuais de mesclar/marcar"
          icon={Copy}
          tone="bg-amber-600"
          tooltip="Conta apenas eventos de HOJE (fuso America/Sao_Paulo): posts recém-marcados como 'duplicada' + decisões salvas em duplicate_decisions (mesclar/marcar_duplicada). Não é o estoque total de posts duplicados."
        />
      </section>

      {/* ============ URGENTES ============ */}
      {urgentPending.length > 0 && (
        <div className="mb-6 border-2 border-red-500 bg-red-50 dark:bg-red-950/30 p-4">
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
              <li key={p.id} className="flex items-center justify-between gap-2 text-sm flex-wrap">
                <Link to={`/admin/posts/${p.id}`} className="hover:underline font-bold min-w-0 flex-1">
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

      {/* ============ RELEVÂNCIA ============ */}
      <div className="bg-card border border-border p-5 mb-8">
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <BrainCircuit className="h-5 w-5 text-primary" />
          <h2 className="font-display text-lg md:text-xl font-black uppercase tracking-wider">Notícias mais relevantes hoje</h2>
        </div>
        {topRelevant.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma matéria de hoje foi analisada ainda.</p>
        ) : (
          <ul className="divide-y divide-border">
            {topRelevant.map((p) => (
              <li key={p.id} className="py-2 flex items-center justify-between gap-3 flex-wrap">
                <div className="flex-1 min-w-0">
                  <Link to={`/admin/posts/${p.id}`} className="font-bold hover:underline block">
                    {p.title}
                  </Link>
                  {p.relevance_reason && (
                    <div className="text-xs text-muted-foreground line-clamp-1">{p.relevance_reason}</div>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0 flex-wrap">
                  <RelevanceBadge level={p.relevance_level} score={p.relevance_score} />
                  {p.ai_suggested_placement && (
                    <span className="text-[11px] uppercase tracking-wider px-2 py-0.5 border border-primary/40 bg-primary/5 text-primary font-bold">
                      {PLACEMENT_LABEL[p.ai_suggested_placement]}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ============ FLUXO EDITORIAL ============ */}
      <div className="flex items-baseline justify-between gap-3 mb-3 flex-wrap">
        <h2 className="font-display text-lg md:text-xl font-black uppercase tracking-wider">Fluxo editorial · Todo o período</h2>
        {stats && drift !== 0 && (
          <span className="text-xs text-amber-700 bg-amber-50 border border-amber-300 px-2 py-1 rounded-sm">
            Aviso: soma dos status ({fmt(editorialSum)}) diverge do total ({fmt(stats.total_posts)}) em {fmt(Math.abs(drift))}.
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mb-8">
        {statusCells.map((s) => (
          <Link
            key={s.key}
            to={`/admin/posts?status=${s.key}`}
            className={`p-4 border ${STATUS_COLOR[s.key]} hover:opacity-80 focus:ring-2 focus:ring-primary transition rounded-sm min-h-[92px] flex flex-col`}
          >
            <div className="text-xs uppercase font-bold tracking-wider">{s.label}</div>
            <div className="font-display text-3xl font-black mt-1">{statsLoading ? "…" : fmt(s.count)}</div>
            {typeof s.subCount === "number" && s.subCount > 0 && (
              <div className="text-[11px] text-muted-foreground mt-1 leading-snug">
                {fmt(s.subCount)} prontas para revisão
              </div>
            )}
          </Link>
        ))}
      </div>

      {/* ============ TOP FONTES ============ */}
      <div className="bg-card border border-border p-5 mb-8">
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <Rss className="h-5 w-5 text-primary" />
          <h2 className="font-display text-lg md:text-xl font-black uppercase tracking-wider">Top Fontes {rangeLabel}</h2>
          <div className="ml-auto flex gap-1">
            {([{ key: "day", label: "Hoje" }, { key: "week", label: "7 dias" }, { key: "month", label: "30 dias" }] as const).map((opt) => (
              <button
                key={opt.key}
                onClick={() => setTopRange(opt.key as any)}
                className={`px-3 py-1 text-[11px] uppercase font-bold tracking-wider rounded-sm border ${
                  topRange === opt.key ? "bg-foreground text-background border-foreground" : "bg-white border-border hover:bg-secondary"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <span className="text-xs text-muted-foreground basis-full md:basis-auto md:ml-3">
            Total: <strong>{fmt(topSourcesTotal)}</strong>
          </span>
        </div>
        {statsLoading ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : topSources.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma notícia captada no período.</p>
        ) : (
          <div className="space-y-2">
            {topSources.map((s) => {
              const pct = topSourcesTotal > 0 ? Math.round((s.count / topSourcesTotal) * 100) : 0;
              return (
                <div key={s.name} className="flex items-center gap-3 p-2 border border-border rounded-sm">
                  <SourceBadge name={s.name} />
                  <div className="flex-1 h-2 bg-secondary rounded-sm overflow-hidden">
                    <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="font-mono text-xs font-bold text-muted-foreground w-10 text-right">{pct}%</span>
                  <span className="font-display text-lg font-black leading-none w-10 text-right">{fmt(s.count)}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ============ ATALHOS ============ */}
      <h2 className="font-display text-lg md:text-xl font-black mb-3 uppercase tracking-wider">Atalhos</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        {[
          { to: "/admin/fontes", icon: Rss, title: "Captar nova notícia", desc: "Acessar fontes e disparar captação." },
          { to: "/admin/posts/novo", icon: PlusCircle, title: "Criar notícia manual", desc: "Novo post no fluxo editorial." },
          { to: "/admin/denuncias", icon: AlertTriangle, title: "Apurar denúncias", desc: "Relatos enviados pelo público." },
          { to: "/", icon: ExternalLink, title: "Abrir portal", desc: "Ver o site público em nova aba.", external: true },
        ].map((a) => {
          const Cmp: any = a.external ? "a" : Link;
          const props: any = a.external ? { href: a.to, target: "_blank", rel: "noreferrer" } : { to: a.to };
          return (
            <Cmp
              key={a.title}
              {...props}
              className="group bg-card border border-border p-4 hover:border-primary focus:ring-2 focus:ring-primary transition flex items-start gap-3 min-h-[92px] rounded-sm"
            >
              <a.icon className="h-5 w-5 text-primary shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="font-display font-black">{a.title}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{a.desc}</div>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0 mt-1 group-hover:translate-x-0.5 transition" />
            </Cmp>
          );
        })}
      </div>

      {/* ============ FERRAMENTAS / MANUTENÇÃO ============ */}
      {isAdmin && (
        <details className="bg-card border border-border rounded-sm">
          <summary className="cursor-pointer p-4 flex items-center gap-2 font-display font-black uppercase text-sm tracking-wider">
            <Wrench className="h-4 w-4" /> Ferramentas / Manutenção
            <span className="ml-auto text-xs font-normal text-muted-foreground">clique para expandir</span>
          </summary>
          <div className="p-4 pt-0 space-y-3">
            <div className="border border-border p-4 flex items-start gap-4 flex-wrap">
              <div className="flex-1 min-w-[220px]">
                <h3 className="font-display font-black">Corrigir imagens das notícias</h3>
                <p className="text-sm text-muted-foreground mt-1">Revisa notícias publicadas e substitui imagens vazias/genéricas por imagem do RSS ou padrão da categoria. Requer confirmação.</p>
              </div>
              <Button onClick={() => setConfirmAction("backfill")} disabled={backfilling}>
                {backfilling ? <><Loader2 className="h-4 w-4 animate-spin mr-1" /> Corrigindo…</> : "Rodar backfill"}
              </Button>
            </div>
            <div className="border border-border p-4 flex items-start gap-4 flex-wrap">
              <div className="flex-1 min-w-[220px]">
                <h3 className="font-display font-black">Reclassificar categorias</h3>
                <p className="text-sm text-muted-foreground mt-1">Reaplica regras de categorização em posts existentes. Requer confirmação.</p>
              </div>
              <Button onClick={() => setConfirmAction("reclassify")} disabled={reclassifying} variant="outline" className="border-2 border-foreground font-bold">
                {reclassifying ? <><Loader2 className="h-4 w-4 animate-spin mr-1" /> Reclassificando…</> : "Reclassificar agora"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground flex items-start gap-1.5">
              <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              Nenhuma dessas ações roda automaticamente ao abrir o Dashboard. Auto Sync continua funcionando em segundo plano e não foi modificado.
            </p>
          </div>
        </details>
      )}

      <AlertDialog
        open={confirmAction !== null}
        onOpenChange={(open) => { if (!open && !backfilling && !reclassifying) setConfirmAction(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmAction === "backfill" ? "Corrigir imagens das notícias" : "Reclassificar categorias"}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>
                  {confirmAction === "backfill"
                    ? "Vai varrer todas as notícias publicadas e substituir imagens vazias ou genéricas por imagem do RSS original ou pela imagem padrão da categoria correspondente."
                    : "Vai reaplicar as regras de categorização em todos os posts existentes, reatribuindo a categoria com base nas regras atuais."}
                </p>
                <p className="text-amber-700 bg-amber-50 border border-amber-200 rounded-sm p-2">
                  <strong>Impacto:</strong> a operação altera dados em massa e não pode ser desfeita em lote.
                  O número exato de registros afetados só é conhecido ao final da execução — não há modo de prévia.
                </p>
                <p className="text-muted-foreground text-xs">
                  Nenhum título, corpo, slug ou status editorial será modificado. Ao concluir, o resultado (total processado e eventuais erros) aparece em notificação.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={backfilling || reclassifying}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={backfilling || reclassifying}
              onClick={(e) => {
                e.preventDefault();
                if (confirmAction === "backfill") runBackfill();
                else if (confirmAction === "reclassify") runReclassify();
              }}
            >
              {(backfilling || reclassifying) ? (
                <><Loader2 className="h-4 w-4 animate-spin mr-1" /> Processando…</>
              ) : "Confirmar e executar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  );
}
