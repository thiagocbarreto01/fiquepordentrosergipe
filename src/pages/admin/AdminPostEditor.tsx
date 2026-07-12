import { useEffect, useRef, useState } from "react";
import { normalizeEditorContent } from "@/lib/normalizeEditorContent";
import { getContentQuality } from "@/lib/contentQuality";
import { useNavigate, useParams } from "react-router-dom";
import AdminLayout from "@/components/admin/AdminLayout";
import ContentToolbar from "@/components/admin/ContentToolbar";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Upload, History, AlertTriangle, ExternalLink, Sparkles, RotateCcw, Loader2, Globe, CheckCircle2, ArchiveRestore, BrainCircuit, ThumbsUp, ThumbsDown, Pin, PinOff, Film, Share2 } from "lucide-react";
import { getSocialShareUrl, getArticleDirectUrl } from "@/lib/socialShare";
import { Link } from "react-router-dom";
import { ImageActionButtons } from "@/components/admin/ImageActionButtons";
import ReelGeneratorDialog from "@/components/admin/ReelGeneratorDialog";
import { RelevanceBadge, PLACEMENT_LABEL } from "@/components/admin/RelevanceBadge";
import {
  STATUS_LABEL,
  STATUS_COLOR,
  MATCH_REASON_LABEL,
  normalizeStatus,
  type EditorialStatus,
} from "@/lib/statusFlow";
import { SourceBadge, CaptureMethodChip, OriginalLink, detectCaptureMethod } from "@/components/admin/SourceBadge";
import { AdaptiveCoverImage } from "@/components/site/AdaptiveCoverImage";

function slugify(s: string) {
  return s
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9 -]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);
}

export default function AdminPostEditor() {
  const { id } = useParams();
  const isNew = !id || id === "novo";
  const nav = useNavigate();
  const { user, isAdmin } = useAuth();
  const canPublish = isAdmin; // Only admins as requested
  const [cats, setCats] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const contentRef = useRef<HTMLTextAreaElement>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [duplicateOriginal, setDuplicateOriginal] = useState<any>(null);
  const [duplicateMatches, setDuplicateMatches] = useState<any[]>([]);
  const [sourceName, setSourceName] = useState<string | null>(null);
  const [generatingAI, setGeneratingAI] = useState(false);
  const [genIgHeadline, setGenIgHeadline] = useState(false);
  const [reelOpen, setReelOpen] = useState(false);
  const [form, setForm] = useState<any>({
    title: "",
    subtitle: "",
    slug: "",
    content: "",
    cover_image_url: "",
    manual_image_url: "",
    image_caption: "",
    image_credit: "",
    cover_image_original: "",
    cover_image_source: null,
    category_id: "",
    tags: "",
    status: "captada" as EditorialStatus,
    is_featured: false,
    is_main_featured: false,
    is_urgent: false,
    is_denuncia: false,
    is_evergreen: false,
    home_expires_at: "",
    main_featured_expires_at: "",
    meta_title: "",
    meta_description: "",
    scheduled_at: "",
    titulo_original: "",
    conteudo_original: "",
    titulo_gerado: "",
    resumo_gerado: "",
    conteudo_gerado: "",
    ai_rewritten_at: null,
    ai_version_used: "original",
    ai_rewrite_quality: "jornalistica" as "basica" | "jornalistica" | "premium",
    ai_review_status: "pendente" as "pendente" | "reescrito_ia" | "revisado_editor",
    meta_keywords: [] as string[],
    video_url_principal: "",
    videos_relacionados_text: "",
  });

  useEffect(() => {
    document.title = isNew ? "Nova notícia — Painel" : "Editar notícia — Painel";
    supabase.from("categories").select("*").order("position").then(({ data }) => setCats(data ?? []));
    if (!isNew) {
      supabase
        .from("posts")
        .select("*")
        .eq("id", id)
        .maybeSingle()
        .then(async ({ data }) => {
          if (!data) return;
          const normalized = normalizeStatus(data.status);
          let currentStatus: EditorialStatus = normalized;
          if (normalized === "captada") {
            const { error } = await supabase
              .from("posts")
              .update({ status: "em_revisao" as any })
              .eq("id", id);
            if (!error) currentStatus = "em_revisao";
          }
          setForm({
            ...data,
            status: currentStatus,
            tags: (data.tags ?? []).join(", "),
            scheduled_at: data.scheduled_at
              ? new Date(data.scheduled_at).toISOString().slice(0, 16)
              : "",
            home_expires_at: (data as any).home_expires_at
              ? new Date((data as any).home_expires_at).toISOString().slice(0, 16)
              : "",
            main_featured_expires_at: (data as any).main_featured_expires_at
              ? new Date((data as any).main_featured_expires_at).toISOString().slice(0, 16)
              : "",
            is_evergreen: !!(data as any).is_evergreen,
            is_main_featured: !!(data as any).is_main_featured,
            video_url_principal: (data as any).video_url_principal ?? "",
            videos_relacionados_text: ((data as any).videos_relacionados ?? []).join("\n"),
          });

          if ((data as any).duplicate_of) {
            const { data: orig } = await supabase
              .from("posts")
              .select("id, title, slug, status, published_at, created_at, source_url")
              .eq("id", (data as any).duplicate_of)
              .maybeSingle();
            setDuplicateOriginal(orig);
          }

          const { data: matches } = await supabase.rpc("find_duplicate_post", {
            _title: data.title,
            _slug: data.slug,
            _source_url: data.source_url ?? null,
            _exclude_id: data.id,
          });
          setDuplicateMatches((matches as any[]) ?? []);

          if ((data as any).source_id) {
            const { data: src } = await supabase
              .from("news_sources")
              .select("name")
              .eq("id", (data as any).source_id)
              .maybeSingle();
            setSourceName(src?.name ?? null);
          }
        });



      supabase
        .from("post_status_history")
        .select("from_status,to_status,note,created_at,changed_by")
        .eq("post_id", id)
        .order("created_at", { ascending: false })
        .then(({ data }) => setHistory(data ?? []));
    }
  }, [id, isNew]);

  async function uploadCover(file: File) {
    setUploading(true);
    const path = `posts/${Date.now()}-${file.name.replace(/[^a-z0-9.-]/gi, "_")}`;
    const { error } = await supabase.storage.from("media").upload(path, file, { upsert: false });
    if (error) {
      setUploading(false);
      toast.error(error.message);
      return;
    }
    const { data } = supabase.storage.from("media").getPublicUrl(path);
    setForm((f: any) => ({ ...f, manual_image_url: data.publicUrl }));
    setUploading(false);
    toast.success("Imagem enviada para substituição manual");
  }

  async function reprocessImage() {
    if (isNew) return;
    setUploading(true);
    try {
      const { data, error } = await supabase.functions.invoke("capture-sources", {
        body: { post_id: id },
      });
      if (error) throw error;
      if (data?.ok) {
        setForm((f: any) => ({
          ...f,
          cover_image_url: data.cover_image_url,
          cover_image_original: data.cover_image_url,
          cover_image_source: data.source,
        }));
        toast.success("Imagem reprocessada com sucesso");
      }
    } catch (e: any) {
      toast.error("Falha ao reprocessar: " + e.message);
    } finally {
      setUploading(false);
    }
  }

  async function save(targetStatus?: EditorialStatus) {
    if (!user) return;
    if (!form.title || !form.content) return toast.error("Título e conteúdo são obrigatórios");

    const restricted: EditorialStatus[] = ["aprovada", "publicada", "rejeitada"];
    const finalStatus = (targetStatus ?? form.status) as EditorialStatus;
    if (restricted.includes(finalStatus) && !canPublish) {
      return toast.error("Apenas editores e admins podem aprovar, publicar ou rejeitar");
    }
    // Permitir publicar direto conforme solicitado
    if (finalStatus === "publicada" && form.status !== "aprovada" && !isNew && !canPublish) {
      return toast.error("A notícia precisa estar APROVADA antes de publicar");
    }

    setSaving(true);
    const slug = form.slug || slugify(form.title);
    const videosRelacionados: string[] = (form.videos_relacionados_text ?? "")
      .split(/\r?\n/)
      .map((s: string) => s.trim())
      .filter(Boolean);
    const payload: any = {
      title: form.title.trim(),
      subtitle: form.subtitle || null,
      instagram_headline: (form.instagram_headline || "").trim() || null,
      slug,
      content: normalizeEditorContent(form.content),
      cover_image_url: form.cover_image_url || null,
      manual_image_url: form.manual_image_url || null,
      image_caption: (form.image_caption || "").trim() || null,
      image_credit: (form.image_credit || "").trim() || null,
      cover_image_original: form.cover_image_original || null,
      cover_image_source: form.cover_image_source || null,
      category_id: form.category_id || null,
      author_id: user.id,
      tags: form.tags ? form.tags.split(",").map((t: string) => t.trim()).filter(Boolean) : [],
      status: finalStatus,
      is_featured: form.is_featured,
      is_main_featured: !!form.is_main_featured,
      is_urgent: form.is_urgent,
      is_denuncia: form.is_denuncia,
      is_evergreen: !!form.is_evergreen,
      home_expires_at: form.is_evergreen
        ? null
        : form.home_expires_at
          ? new Date(form.home_expires_at).toISOString()
          : null,
      main_featured_expires_at: form.is_main_featured && form.main_featured_expires_at
        ? new Date(form.main_featured_expires_at).toISOString()
        : null,
      meta_title: form.meta_title || null,
      meta_description: form.meta_description || null,
      video_url_principal: (form.video_url_principal || "").trim() || null,
      videos_relacionados: videosRelacionados,
      published_at:
        finalStatus === "publicada"
          ? form.published_at ?? new Date().toISOString()
          : null,
      scheduled_at: form.scheduled_at ? new Date(form.scheduled_at).toISOString() : null,
    };

    let res;
    if (isNew) res = await supabase.from("posts").insert(payload).select("id").maybeSingle();
    else res = await supabase.from("posts").update(payload).eq("id", id).select("id").maybeSingle();
    setSaving(false);
    if (res.error) return toast.error(res.error.message);

    const labels: Partial<Record<EditorialStatus, string>> = {
      publicada: "Publicada!",
      aprovada: "Aprovada",
      rejeitada: "Rejeitada",
      em_revisao: "Salva em revisão",
      captada: "Salva como captada",
    };
    toast.success(labels[finalStatus] ?? "Salva");
    if (isNew && res.data?.id) {
      nav(`/admin/posts/${res.data.id}`);
    } else if (!targetStatus) {
      // Se apenas salvou rascunho sem mudar status drasticamente, pode voltar pra lista
      nav("/admin/posts");
    } else {
      // Se aprovou ou publicou, fica na tela para ver o resultado
      setForm(f => ({ ...f, status: finalStatus }));
    }
  }

  async function gerarComIA() {
    if (!form.title || !form.content) {
      return toast.error("Título e conteúdo são obrigatórios para gerar com IA");
    }
    setGeneratingAI(true);
    try {
      const { data, error } = await supabase.functions.invoke("rewrite-post", {
        body: {
          post_id: isNew ? undefined : id,
          title: form.titulo_original || form.title,
          content: form.conteudo_original || form.content,
          quality: form.ai_rewrite_quality || "jornalistica",
          apply: !isNew,
        },
      });
      if (error) {
        const msg = (error as any).context?.error || error.message || "Falha na IA";
        if (msg.includes("Limite") || msg.includes("RATE")) {
          toast.error("Limite de requisições da IA atingido. Tente em alguns instantes.");
        } else if (msg.includes("Créditos") || msg.includes("PAYMENT")) {
          toast.error("Créditos da IA esgotados. Adicione fundos no workspace.");
        } else {
          toast.error(msg);
        }
        return;
      }
      if (!data?.success) {
        toast.error(data?.error || "Falha ao gerar conteúdo");
        return;
      }
      setForm((f: any) => ({
        ...f,
        titulo_original: f.titulo_original || f.title,
        conteudo_original: f.conteudo_original || f.content,
        titulo_gerado: data.titulo_gerado,
        resumo_gerado: data.resumo_gerado,
        conteudo_gerado: data.conteudo_gerado,
        meta_keywords: data.meta_keywords ?? f.meta_keywords ?? [],
        subtitle: data.subtitle_gerado || f.subtitle,
        ai_rewritten_at: new Date().toISOString(),
        ai_review_status: "reescrito_ia",
      }));
      toast.success(`Versão ${data.quality || "jornalística"} gerada por IA — compare e escolha`);
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao chamar IA");
    } finally {
      setGeneratingAI(false);
    }
  }

  async function marcarRevisadoPorEditor() {
    if (isNew) return;
    const { error } = await supabase
      .from("posts")
      .update({ ai_review_status: "revisado_editor" } as any)
      .eq("id", id);
    if (error) return toast.error(error.message);
    setForm((f: any) => ({ ...f, ai_review_status: "revisado_editor" }));
    toast.success("Marcado como revisado por editor");
  }

  const [analyzingRel, setAnalyzingRel] = useState(false);
  async function analisarRelevancia() {
    if (isNew) return toast.error("Salve a notícia antes de analisar");
    setAnalyzingRel(true);
    try {
      const { data, error } = await supabase.functions.invoke("analyze-relevance", {
        body: { post_id: id, apply: true },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Falha ao analisar");
      setForm((f: any) => ({
        ...f,
        relevance_score: data.score,
        relevance_level: data.level,
        relevance_reason: data.reason,
        relevance_factors: data.factors,
        ai_suggested_placement: data.placement,
        ai_suggestion_status: "pendente",
        relevance_analyzed_at: new Date().toISOString(),
      }));
      toast.success(`Relevância ${data.level} (${data.score}%) — sugestão: ${PLACEMENT_LABEL[data.placement] ?? data.placement}`);
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao analisar relevância");
    } finally {
      setAnalyzingRel(false);
    }
  }

  function flagsForPlacement(placement: string) {
    switch (placement) {
      case "manchete_principal": return { is_main_featured: true, is_featured: true, is_urgent: false };
      case "destaque_principal": return { is_main_featured: false, is_featured: true, is_urgent: false };
      case "destaque_secundario": return { is_main_featured: false, is_featured: true, is_urgent: false };
      case "plantao": return { is_main_featured: false, is_featured: true, is_urgent: true };
      default: return { is_main_featured: false, is_featured: false, is_urgent: false };
    }
  }

  async function aceitarSugestaoIA() {
    if (isNew || !form.ai_suggested_placement) return;
    const flags = flagsForPlacement(form.ai_suggested_placement);
    // Manchete deve ser exclusiva
    if (flags.is_main_featured) {
      await supabase.from("posts").update({ is_main_featured: false } as any).neq("id", id!);
    }
    const payload = { ...flags, ai_suggestion_status: "aceita", ai_suggestion_decided_by: user?.id, ai_suggestion_decided_at: new Date().toISOString() };
    const { error } = await supabase.from("posts").update(payload as any).eq("id", id);
    if (error) return toast.error(error.message);
    await supabase.from("home_audit" as any).insert({
      post_id: id, action: "ai_suggestion_accepted",
      position: form.ai_suggested_placement, reason: `Editor aceitou sugestão da IA (${form.relevance_level} ${form.relevance_score}%)`,
      changed_by: user?.id,
    });
    setForm((f: any) => ({ ...f, ...flags, ai_suggestion_status: "aceita" }));
    toast.success(`Sugestão aceita — ${PLACEMENT_LABEL[form.ai_suggested_placement]}`);
  }

  async function ignorarSugestaoIA() {
    if (isNew) return;
    const { error } = await supabase.from("posts").update({
      ai_suggestion_status: "ignorada",
      ai_suggestion_decided_by: user?.id,
      ai_suggestion_decided_at: new Date().toISOString(),
    } as any).eq("id", id);
    if (error) return toast.error(error.message);
    await supabase.from("home_audit" as any).insert({
      post_id: id, action: "ai_suggestion_ignored",
      reason: `Editor ignorou sugestão da IA (${form.ai_suggested_placement ?? "—"})`,
      changed_by: user?.id,
    });
    setForm((f: any) => ({ ...f, ai_suggestion_status: "ignorada" }));
    toast.info("Sugestão ignorada");
  }

  async function marcarDestaqueManual() {
    if (isNew) return;
    const { error } = await supabase.from("posts").update({
      is_featured: true,
      ai_suggestion_status: "ignorada",
      ai_suggestion_decided_by: user?.id,
      ai_suggestion_decided_at: new Date().toISOString(),
    } as any).eq("id", id);
    if (error) return toast.error(error.message);
    await supabase.from("home_audit" as any).insert({
      post_id: id, action: "manual_featured_on", reason: "Editor marcou destaque manualmente", changed_by: user?.id,
    });
    setForm((f: any) => ({ ...f, is_featured: true, ai_suggestion_status: "ignorada" }));
    toast.success("Marcado como destaque");
  }

  async function removerDestaque() {
    if (isNew) return;
    const { error } = await supabase.from("posts").update({
      is_featured: false, is_main_featured: false, is_urgent: false,
    } as any).eq("id", id);
    if (error) return toast.error(error.message);
    await supabase.from("home_audit" as any).insert({
      post_id: id, action: "manual_featured_off", reason: "Editor removeu destaque", changed_by: user?.id,
    });
    setForm((f: any) => ({ ...f, is_featured: false, is_main_featured: false, is_urgent: false }));
    toast.success("Destaque removido");
  }



  async function aplicarVersao(versao: "original" | "gerada") {
    if (versao === "gerada" && !form.titulo_gerado) {
      return toast.error("Não há versão gerada por IA ainda");
    }
    const novoTitulo = versao === "gerada" ? form.titulo_gerado : form.titulo_original || form.title;
    const novoConteudo = versao === "gerada" ? form.conteudo_gerado : form.conteudo_original || form.content;
    const novoExcerpt = versao === "gerada" ? form.resumo_gerado : null;
    setForm((f: any) => ({
      ...f,
      title: novoTitulo,
      content: novoConteudo,
      meta_description: novoExcerpt || f.meta_description,
      ai_version_used: versao,
    }));
    if (!isNew) {
      await supabase.from("posts").update({ ai_version_used: versao }).eq("id", id);
    }
    toast.success(`Versão ${versao === "gerada" ? "gerada por IA" : "original"} aplicada ao editor`);
  }

  const currentStatus = normalizeStatus(form.status);

  return (
    <AdminLayout>
      {/* Barra de ações fixa no topo para agilizar o fluxo editorial */}
      <div className="sticky top-0 z-30 bg-background/95 backdrop-blur-sm border-b border-border -mx-4 px-4 py-3 mb-6 flex items-center justify-between gap-4 shadow-md">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => nav("/admin/posts")} className="mr-2">
            <RotateCcw className="h-4 w-4 mr-2" />
            Voltar
          </Button>
          <h1 className="font-display text-lg font-black truncate hidden md:block max-w-[300px]">
            {isNew ? "Nova notícia" : form.title || "Editar notícia"}
          </h1>
          {!isNew && (
            <span className={`px-3 py-1 text-[10px] font-bold uppercase border rounded-full shadow-sm ${STATUS_COLOR[currentStatus]}`}>
              {STATUS_LABEL[currentStatus]}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {!isNew && (
            <Button
              onClick={() => setReelOpen(true)}
              variant="outline"
              size="sm"
              className="gap-2"
              title="Gerar Reel vertical 1080x1920 a partir desta notícia"
            >
              <Film className="h-4 w-4" /> Gerar Reel
            </Button>
          )}
          <Button onClick={() => save()} disabled={saving} variant="outline" size="sm">
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Salvar rascunho
          </Button>

          {canPublish && (
            <div className="flex items-center gap-2 border-l pl-2 ml-2">
              <Button
                onClick={() => save("publicada")}
                disabled={saving}
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
              >
                <Globe className="h-4 w-4 mr-1" />
                <span className="hidden xs:inline">PUBLICAR</span> AGORA
              </Button>

              {currentStatus === "publicada" && (
                <Button
                  onClick={() => save("em_revisao")}
                  disabled={saving}
                  size="sm"
                  variant="outline"
                  className="text-red-600 border-red-200 hover:bg-red-50"
                >
                  <ArchiveRestore className="h-4 w-4 mr-1" />
                  Despublicar
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      {!isNew && (
        <ReelGeneratorDialog
          open={reelOpen}
          onOpenChange={setReelOpen}
          post={{ ...form, id } as any}
        />
      )}



      <div className="flex items-center justify-between mb-6 flex-wrap gap-3 hidden">
        <h1 className="font-display text-3xl font-black">{isNew ? "Nova notícia" : "Editar notícia"}</h1>
        {!isNew && (
          <span className={`px-3 py-1 text-xs font-bold uppercase border ${STATUS_COLOR[currentStatus]}`}>
            Status atual: {STATUS_LABEL[currentStatus]}
          </span>
        )}
      </div>

      {!isNew && form.slug && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            className="gap-2"
            onClick={async () => {
              await navigator.clipboard.writeText(getSocialShareUrl(form.slug));
              toast.success("Link com prévia copiado.");
            }}
          >
            <Share2 className="h-4 w-4" /> Copiar link para WhatsApp
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="gap-2"
            onClick={async () => {
              await navigator.clipboard.writeText(getArticleDirectUrl(form.slug));
              toast.success("Link do site copiado.");
            }}
          >
            <Share2 className="h-4 w-4" /> Link do site
          </Button>
          <span className="text-xs text-muted-foreground">
            "WhatsApp" gera prévia da matéria; "Link do site" abre a página diretamente.
          </span>
        </div>
      )}

      {!isNew && (() => {
        const method = detectCaptureMethod({ source_id: form.source_id, source_url: form.source_url });
        const displayName = sourceName ?? (method === "instagram" ? "Instagram" : "Manual");
        const currentCat = cats.find((c) => c.id === form.category_id);
        return (
          <div className="mb-6 bg-card border border-border p-4 rounded-sm">
            <div className="text-[10px] uppercase font-black tracking-widest text-muted-foreground mb-3">
              Origem da captação
            </div>
            <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <div className="text-[10px] uppercase font-bold text-muted-foreground mb-1">Fonte</div>
                <SourceBadge name={displayName} />
              </div>
              <div>
                <div className="text-[10px] uppercase font-bold text-muted-foreground mb-1">Método</div>
                <CaptureMethodChip method={method} />
              </div>
              <div>
                <div className="text-[10px] uppercase font-bold text-muted-foreground mb-1">Capturada em</div>
                <div className="font-mono text-xs">
                  {form.created_at ? new Date(form.created_at).toLocaleString("pt-BR") : "—"}
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase font-bold text-muted-foreground mb-1">Categoria atual</div>
                <span className="text-xs font-bold text-primary uppercase">
                  {currentCat?.name ?? "Sem categoria"}
                </span>
                {form.ai_version_used && form.ai_version_used !== "original" && (
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    Versão usada: <strong>{form.ai_version_used}</strong>
                  </div>
                )}
              </div>
              {form.source_url && (
                <div className="sm:col-span-2 md:col-span-4">
                  <div className="text-[10px] uppercase font-bold text-muted-foreground mb-1">URL original</div>
                  <div className="flex items-center gap-3 flex-wrap">
                    <a
                      href={form.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-primary hover:underline break-all"
                    >
                      {form.source_url}
                    </a>
                    <OriginalLink url={form.source_url} />
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {(duplicateOriginal || duplicateMatches.length > 0) && (
        <div className="mb-6 border-2 border-orange-400 bg-orange-50 p-4 rounded-sm">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-6 w-6 text-orange-700 flex-shrink-0 mt-0.5" />
            <div className="flex-1 space-y-3">
              <div>
                <h3 className="font-display font-black text-lg text-orange-900">
                  ⚠️ POSSÍVEL DUPLICATA
                </h3>
                <p className="text-sm text-orange-800">
                  {duplicateOriginal
                    ? "Esta notícia foi marcada como duplicata de outra já existente. Compare antes de aprovar ou rejeitar."
                    : "Encontramos notícias parecidas no sistema. Verifique se não é a mesma matéria."}
                </p>
              </div>

              {duplicateOriginal && (
                <div className="bg-white border border-orange-300 p-3 rounded-sm">
                  <div className="text-xs uppercase font-bold text-orange-700 tracking-wider mb-1">
                    Notícia original
                  </div>
                  <div className="font-bold">{duplicateOriginal.title}</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Status: {STATUS_LABEL[normalizeStatus(duplicateOriginal.status)]} ·{" "}
                    {duplicateOriginal.published_at
                      ? `publicada em ${new Date(duplicateOriginal.published_at).toLocaleDateString("pt-BR")}`
                      : `criada em ${new Date(duplicateOriginal.created_at).toLocaleDateString("pt-BR")}`}
                  </div>
                  <div className="flex gap-3 mt-2 text-sm">
                    <Link
                      to={`/admin/posts/${duplicateOriginal.id}`}
                      className="text-orange-700 underline font-bold inline-flex items-center gap-1"
                    >
                      Abrir original <ExternalLink className="h-3 w-3" />
                    </Link>
                    {normalizeStatus(duplicateOriginal.status) === "publicada" && (
                      <a
                        href={`/noticia/${duplicateOriginal.slug}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-orange-700 underline inline-flex items-center gap-1"
                      >
                        Ver no site <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                </div>
              )}

              {duplicateMatches.length > 0 && (
                <div>
                  <div className="text-xs uppercase font-bold text-orange-700 tracking-wider mb-1">
                    Outras semelhantes
                  </div>
                  <ul className="space-y-1 text-sm">
                    {duplicateMatches.slice(0, 5).map((m: any) => (
                      <li key={m.id} className="bg-white border border-orange-200 px-3 py-2 rounded-sm">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="font-bold truncate">{m.title}</div>
                            <div className="text-xs text-muted-foreground">
                              {MATCH_REASON_LABEL[m.match_reason] ?? m.match_reason} ·{" "}
                              {Math.round((m.similarity ?? 0) * 100)}%
                            </div>
                          </div>
                          <Link
                            to={`/admin/posts/${m.id}`}
                            className="text-xs text-orange-700 underline whitespace-nowrap"
                          >
                            comparar
                          </Link>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {!isNew && (
        <div className="mb-6 border border-border bg-card p-4">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <BrainCircuit className="h-5 w-5 text-primary" />
              <h3 className="font-display font-black text-lg">IA Editora · Relevância</h3>
              <RelevanceBadge level={form.relevance_level} score={form.relevance_score} />
              {form.ai_suggestion_status === "aceita" && (
                <span className="text-xs px-2 py-0.5 bg-emerald-500/15 text-emerald-700 border border-emerald-500/40 uppercase font-bold">Sugestão aceita</span>
              )}
              {form.ai_suggestion_status === "ignorada" && (
                <span className="text-xs px-2 py-0.5 bg-muted text-muted-foreground border border-border uppercase font-bold">Sugestão ignorada</span>
              )}
            </div>
            <Button type="button" size="sm" variant="outline" onClick={analisarRelevancia} disabled={analyzingRel}>
              {analyzingRel ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Analisando…</> : <><BrainCircuit className="h-4 w-4 mr-1" /> {form.relevance_score != null ? "Reanalisar" : "Analisar agora"}</>}
            </Button>
          </div>

          {form.relevance_score != null ? (
            <div className="space-y-3">
              {form.relevance_reason && (
                <div className="text-sm">
                  <span className="text-xs uppercase font-bold tracking-wider text-muted-foreground mr-2">Motivo:</span>
                  {form.relevance_reason}
                </div>
              )}
              {form.ai_suggested_placement && (
                <div className="border border-dashed border-primary/40 bg-primary/5 p-3 flex items-center justify-between flex-wrap gap-2">
                  <div className="text-sm">
                    <span className="text-xs uppercase font-bold tracking-wider text-muted-foreground mr-2">Sugestão da IA:</span>
                    <span className="font-bold">{PLACEMENT_LABEL[form.ai_suggested_placement] ?? form.ai_suggested_placement}</span>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Button type="button" size="sm" onClick={aceitarSugestaoIA} disabled={form.ai_suggestion_status === "aceita"} className="bg-emerald-600 text-white hover:bg-emerald-700">
                      <ThumbsUp className="h-4 w-4 mr-1" /> Aceitar
                    </Button>
                    <Button type="button" size="sm" variant="outline" onClick={ignorarSugestaoIA} disabled={form.ai_suggestion_status === "ignorada"}>
                      <ThumbsDown className="h-4 w-4 mr-1" /> Ignorar
                    </Button>
                    <Button type="button" size="sm" variant="outline" onClick={marcarDestaqueManual}>
                      <Pin className="h-4 w-4 mr-1" /> Marcar destaque
                    </Button>
                    <Button type="button" size="sm" variant="outline" onClick={removerDestaque}>
                      <PinOff className="h-4 w-4 mr-1" /> Remover destaque
                    </Button>
                  </div>
                </div>
              )}
              {form.relevance_factors && typeof form.relevance_factors === "object" && (
                <details className="text-xs">
                  <summary className="cursor-pointer text-muted-foreground uppercase tracking-wider font-bold">Fatores avaliados</summary>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-1 mt-2">
                    {Object.entries(form.relevance_factors).map(([k, v]) => (
                      <div key={k} className="flex justify-between border-b border-border py-0.5">
                        <span className="capitalize">{k.replace(/_/g, " ")}</span>
                        <span className="font-mono font-bold">{String(v)}</span>
                      </div>
                    ))}
                  </div>
                </details>
              )}
              {form.relevance_analyzed_at && (
                <div className="text-xs text-muted-foreground">Analisado em {new Date(form.relevance_analyzed_at).toLocaleString("pt-BR")}</div>
              )}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">
              Sem análise de relevância ainda. Clique em "Analisar agora" para a IA Editora avaliar esta matéria e sugerir um posicionamento.
            </div>
          )}
        </div>
      )}

      {!isNew && (
        <div className="mb-6 border border-border bg-card p-4">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <Sparkles className="h-5 w-5 text-primary" />
              <h3 className="font-display font-black text-lg">Reescrita com IA</h3>
              {form.ai_rewritten_at && (
                <span className="text-xs text-muted-foreground">
                  · gerada em {new Date(form.ai_rewritten_at).toLocaleString("pt-BR")}
                </span>
              )}
              {form.ai_version_used && (
                <span className="text-xs px-2 py-0.5 border border-primary text-primary uppercase font-bold">
                  Em uso: {form.ai_version_used === "gerada" ? "IA" : "Original"}
                </span>
              )}
              {form.ai_review_status === "reescrito_ia" && (
                <span className="text-xs px-2 py-0.5 bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/40 uppercase font-bold">
                  Reescrito pela IA
                </span>
              )}
              {form.ai_review_status === "revisado_editor" && (
                <span className="text-xs px-2 py-0.5 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/40 uppercase font-bold">
                  Revisado por editor
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <select
                value={form.ai_rewrite_quality || "jornalistica"}
                onChange={(e) => setForm((f: any) => ({ ...f, ai_rewrite_quality: e.target.value }))}
                className="text-xs border border-border bg-background px-2 py-1.5 font-bold uppercase tracking-wider"
                title="Nível de qualidade da reescrita"
              >
                <option value="basica">Básica</option>
                <option value="jornalistica">Jornalística (padrão)</option>
                <option value="premium">Premium</option>
              </select>
              <Button
                type="button"
                size="sm"
                onClick={gerarComIA}
                disabled={generatingAI}
                className="bg-primary text-primary-foreground"
              >
                {generatingAI ? (
                  <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Gerando…</>
                ) : (
                  <><Sparkles className="h-4 w-4 mr-1" /> {form.titulo_gerado ? "Regerar com IA" : "Gerar com IA"}</>
                )}
              </Button>
              {!isNew && form.ai_review_status === "reescrito_ia" && (
                <Button type="button" size="sm" variant="outline" onClick={marcarRevisadoPorEditor}>
                  Marcar revisado
                </Button>
              )}
            </div>
          </div>

          {(form.titulo_original || form.titulo_gerado) ? (
            <div className="grid md:grid-cols-2 gap-3">
              <div className="border border-border p-3 bg-background">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs uppercase font-bold tracking-wider text-muted-foreground">Original</span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => aplicarVersao("original")}
                    disabled={!form.titulo_original && !form.conteudo_original}
                  >
                    <RotateCcw className="h-3.5 w-3.5 mr-1" /> Usar original
                  </Button>
                </div>
                <div className="text-sm font-bold mb-1 line-clamp-2">
                  {form.titulo_original || <span className="text-muted-foreground italic">— sem título original —</span>}
                </div>
                <div className="text-xs text-muted-foreground line-clamp-6 whitespace-pre-wrap">
                  {form.conteudo_original || "—"}
                </div>
              </div>

              <div className="border border-primary p-3 bg-primary/5">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs uppercase font-bold tracking-wider text-primary">Reescrita por IA</span>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => aplicarVersao("gerada")}
                    disabled={!form.titulo_gerado}
                    className="bg-primary text-primary-foreground"
                  >
                    <Sparkles className="h-3.5 w-3.5 mr-1" /> Usar IA
                  </Button>
                </div>
                <div className="text-sm font-bold mb-1 line-clamp-2">
                  {form.titulo_gerado || <span className="text-muted-foreground italic">— ainda não gerada —</span>}
                </div>
                {form.resumo_gerado && (
                  <div className="text-xs italic text-muted-foreground mb-1">{form.resumo_gerado}</div>
                )}
                <div className="text-xs text-muted-foreground line-clamp-6 whitespace-pre-wrap">
                  {form.conteudo_gerado || "—"}
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Clique em <strong>Gerar com IA</strong> para criar uma version reescrita do título, resumo e conteúdo.
              A versão original será preservada para comparação.
            </p>
          )}
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <div>
            <Label>Título *</Label>
            <Input
              value={form.title}
              onChange={(e) =>
                setForm({ ...form, title: e.target.value, slug: form.slug || slugify(e.target.value) })
              }
            />
          </div>
          <div>
            <Label>Subtítulo</Label>
            <Input
              value={form.subtitle ?? ""}
              onChange={(e) => setForm({ ...form, subtitle: e.target.value })}
            />
          </div>
          <div>
            <Label className="flex items-center justify-between">
              <span>Manchete Instagram (curta, usada só na arte)</span>
              <span
                className={`text-[10px] font-mono ${
                  (form.instagram_headline ?? "").length > 80
                    ? "text-destructive"
                    : (form.instagram_headline ?? "").length > 60
                      ? "text-amber-500"
                      : "text-muted-foreground"
                }`}
              >
                {(form.instagram_headline ?? "").length}/80 (ideal ≤60)
              </span>
            </Label>
            <div className="flex gap-2 mt-1">
              <Input
                value={form.instagram_headline ?? ""}
                maxLength={80}
                placeholder="Ex.: Pré-candidatos devem deixar rádio e TV em junho"
                onChange={(e) => setForm({ ...form, instagram_headline: e.target.value })}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={genIgHeadline || !form.title}
                onClick={async () => {
                  if (!form.title) return toast.error("Informe o título antes");
                  setGenIgHeadline(true);
                  try {
                    const { data, error } = await supabase.functions.invoke(
                      "generate-instagram-headline",
                      { body: { title: form.title, subtitle: form.subtitle, excerpt: form.excerpt } },
                    );
                    if (error) throw error;
                    if (!data?.headline) throw new Error("Sem manchete");
                    setForm((f: any) => ({ ...f, instagram_headline: data.headline }));
                    toast.success("Manchete Instagram gerada");
                  } catch (e: any) {
                    toast.error(`Falha: ${e?.message ?? e}`);
                  } finally {
                    setGenIgHeadline(false);
                  }
                }}
              >
                {genIgHeadline ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1" />}
                Gerar com IA
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">
              Se vazio, a arte usa o título completo com ajuste automático de fonte e reticências.
            </p>

          </div>
          <div>
            <Label>Slug (URL)</Label>
            <Input value={form.slug} onChange={(e) => setForm({ ...form, slug: slugify(e.target.value) })} />
          </div>

          
          <div className="bg-card border border-border p-4 space-y-4">
            <div className="flex items-center justify-between">
              <Label className="font-bold uppercase tracking-wider text-xs">Imagem de capa</Label>
              {form.cover_image_source && (
                <span className="text-[10px] px-2 py-0.5 bg-secondary border border-border rounded-full font-bold uppercase text-muted-foreground">
                  Origem: {
                    form.cover_image_source === 'manual' ? 'Manual' :
                    form.cover_image_source === 'rss' ? 'Feed RSS' :
                    form.cover_image_source === 'extracted' ? 'Extraída da URL' :
                    form.cover_image_source === 'category_fallback' ? 'Padrão da Categoria' : form.cover_image_source
                  }
                </span>
              )}
            </div>
            
            <div className="relative group mb-4 border border-border bg-secondary/30">
              <AdaptiveCoverImage
                src={form.manual_image_url || form.cover_image_url || "https://placehold.co/600x400?text=Sem+imagem"}
                alt="preview"
                maxHeight={480}
              />
              {form.manual_image_url && (
                <div className="absolute top-2 left-2 bg-primary text-primary-foreground text-[10px] font-bold px-2 py-0.5 uppercase">
                  Substituição Manual Ativa
                </div>
              )}
              {!isNew && !form.manual_image_url && (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={reprocessImage}
                  disabled={uploading}
                  className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  {uploading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <><RotateCcw className="h-3.5 w-3.5 mr-1" /> Reprocessar automática</>
                  )}
                </Button>
              )}
            </div>

            <ImageActionButtons
              imageUrl={form.manual_image_url || form.cover_image_url || ""}
              slug={form.slug || "noticia"}
              title={form.title || ""}
              instagramHeadline={form.instagram_headline || ""}
              subtitle={form.subtitle || form.excerpt || ""}
              isUrgent={!!form.is_urgent}
              sourceName={sourceName || ""}
              publishedAt={(form as any).published_at || undefined}
              categoryName={cats.find((c) => c.id === form.category_id)?.name || ""}
            />




            <div className="space-y-4">
              <div>
                <Label className="text-xs uppercase text-muted-foreground">Substituir imagem manualmente</Label>
                <div className="flex gap-2 mt-1">
                  <label className="flex-shrink-0 inline-flex items-center gap-2 px-3 py-2 border border-border bg-secondary cursor-pointer text-sm hover:bg-secondary/80 transition-colors">
                    <Upload className="h-4 w-4" /> {uploading ? "Enviando…" : "Upload"}
                    <input
                      type="file"
                      accept="image/*"
                      hidden
                      onChange={(e) => e.target.files?.[0] && uploadCover(e.target.files[0])}
                    />
                  </label>
                  <Input
                    placeholder="URL da imagem manual..."
                    value={form.manual_image_url ?? ""}
                    onChange={(e) => setForm({ ...form, manual_image_url: e.target.value })}
                  />
                  {form.manual_image_url && (
                    <Button 
                      variant="outline" 
                      size="icon" 
                      title="Remover substituição"
                      onClick={() => setForm({ ...form, manual_image_url: "" })}
                    >
                      <RotateCcw className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">
                  Se preenchido, esta imagem será exibida no site no lugar da imagem captada automaticamente.
                </p>
              </div>

              {!form.manual_image_url && (
                <div>
                  <Label className="text-xs uppercase text-muted-foreground">Imagem captada automaticamente</Label>
                  <Input
                    className="mt-1 bg-secondary/50"
                    placeholder="URL automática..."
                    value={form.cover_image_url ?? ""}
                    onChange={(e) => setForm({ ...form, cover_image_url: e.target.value, cover_image_source: "manual" })}
                  />
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 border-t border-border">
                <div>
                  <Label className="text-xs uppercase text-muted-foreground">Legenda da imagem</Label>
                  <Input
                    className="mt-1"
                    placeholder="Ex: Vista aérea da orla de Aracaju"
                    value={form.image_caption ?? ""}
                    onChange={(e) => setForm({ ...form, image_caption: e.target.value })}
                  />
                  <p className="text-[10px] text-muted-foreground mt-1">
                    Exibida abaixo da imagem principal. Se vazia, nada é mostrado.
                  </p>
                </div>
                <div>
                  <Label className="text-xs uppercase text-muted-foreground">Crédito da imagem</Label>
                  <Input
                    className="mt-1"
                    placeholder="Ex: Assessoria de Comunicação / TV Barretão"
                    value={form.image_credit ?? ""}
                    onChange={(e) => setForm({ ...form, image_credit: e.target.value })}
                  />
                  <p className="text-[10px] text-muted-foreground mt-1">
                    Exibido abaixo da legenda (opcional).
                  </p>
                </div>
              </div>
            </div>
          </div>


          <div className="border border-border bg-card p-4 space-y-3">
            <div>
              <Label>Vídeo principal (URL)</Label>
              <p className="text-xs text-muted-foreground mb-1">
                YouTube, Instagram (post/reel), Vimeo ou embed. Quando preenchido, o vídeo aparece no topo da matéria, acima da imagem de capa.
              </p>
              <Input
                placeholder="https://www.youtube.com/watch?v=… ou https://www.instagram.com/reel/…"
                value={form.video_url_principal ?? ""}
                onChange={(e) => setForm({ ...form, video_url_principal: e.target.value })}
              />
            </div>
            <div>
              <Label>Vídeos relacionados (uma URL por linha)</Label>
              <p className="text-xs text-muted-foreground mb-1">
                Aparecem abaixo do conteúdo da matéria. Útil para galerias de vídeos curtos.
              </p>
              <Textarea
                rows={3}
                placeholder="https://www.youtube.com/watch?v=...&#10;https://www.instagram.com/reel/..."
                value={form.videos_relacionados_text ?? ""}
                onChange={(e) => setForm({ ...form, videos_relacionados_text: e.target.value })}
              />
            </div>
          </div>

          <div>
            <Label>Conteúdo *</Label>
            <ContentToolbar
              onWrap={(open, close) => {
                const el = contentRef.current;
                if (!el) return;
                const start = el.selectionStart ?? 0;
                const end = el.selectionEnd ?? 0;
                const before = form.content.slice(0, start);
                const sel = form.content.slice(start, end);
                const after = form.content.slice(end);
                const next = `${before}${open}${sel}${close}${after}`;
                setForm({ ...form, content: next });
                requestAnimationFrame(() => {
                  el.focus();
                  const pos = start + open.length + sel.length + close.length;
                  el.setSelectionRange(pos, pos);
                });
              }}
            />
            <Textarea
              ref={contentRef}
              rows={18}
              value={form.content}
              onChange={(e) => setForm({ ...form, content: e.target.value })}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Dica: parágrafos separados por linha em branco são preservados na publicação. Use a barra acima para formatação rápida.
            </p>
          </div>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-24 h-fit">
          <div className="bg-card border border-border p-4 space-y-3 shadow-sm">
            <h3 className="font-bold uppercase tracking-wider text-xs">Fluxo editorial</h3>
            <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="captada">Captada</SelectItem>
                <SelectItem value="em_revisao">Em revisão</SelectItem>
                <SelectItem value="aprovada" disabled={!canPublish}>
                  Aprovada {!canPublish && "(editor/admin)"}
                </SelectItem>
                <SelectItem value="rejeitada" disabled={!canPublish}>
                  Rejeitada {!canPublish && "(editor/admin)"}
                </SelectItem>
                <SelectItem value="publicada" disabled={!canPublish}>
                  Publicada {!canPublish && "(editor/admin)"}
                </SelectItem>
              </SelectContent>
            </Select>

            <div>
              <Label>Agendar para</Label>
              <Input
                type="datetime-local"
                value={form.scheduled_at ?? ""}
                onChange={(e) => setForm({ ...form, scheduled_at: e.target.value })}
              />
            </div>

            <div className="space-y-3 rounded-md border border-border bg-secondary/30 p-3">
              <p className="text-[10px] uppercase font-black tracking-widest text-muted-foreground">
                Visibilidade na home
              </p>
              <label className="flex items-start gap-2 cursor-pointer">
                <Checkbox
                  checked={form.is_urgent}
                  onCheckedChange={(v) => setForm({ ...form, is_urgent: !!v })}
                  className="mt-0.5"
                />
                <span className="text-sm">
                  <span className="font-bold text-red-700">Plantão / Urgente</span>
                  <span className="block text-xs text-muted-foreground">
                    Aparece na faixa vermelha de Plantão no topo do site.
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-2 cursor-pointer">
                <Checkbox
                  checked={form.is_featured}
                  onCheckedChange={(v) => setForm({ ...form, is_featured: !!v })}
                  className="mt-0.5"
                />
                <span className="text-sm">
                  <span className="font-bold text-amber-700">Destaque na home</span>
                  <span className="block text-xs text-muted-foreground">
                    Entra como destaque secundário (P3). Captadas só viram destaque após esta marcação.
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-2 cursor-pointer">
                <Checkbox
                  checked={!!form.is_main_featured}
                  onCheckedChange={(v) => setForm({ ...form, is_main_featured: !!v, is_featured: v ? true : form.is_featured })}
                  className="mt-0.5"
                />
                <span className="text-sm">
                  <span className="font-bold text-rose-700">Destaque Principal (Manchete)</span>
                  <span className="block text-xs text-muted-foreground">
                    Prioridade P2. Reservado para escolha editorial — ocupa a manchete principal da Home.
                  </span>
                </span>
              </label>
              {form.is_main_featured && (
                <div className="ml-6 -mt-1 mb-1 rounded-md border border-rose-200 bg-rose-50/50 p-3 space-y-2">
                  {!form.main_featured_expires_at && (
                    <div className="rounded-md border border-rose-400 bg-rose-100 px-3 py-2 text-xs font-semibold text-rose-900">
                      ⚠ P2 sem validade definida. Esta notícia NÃO recebe o bônus +80 e não ocupará a manchete até você definir uma data abaixo.
                    </div>
                  )}
                  <Label className="text-xs font-semibold text-rose-900">Exibir como manchete até</Label>
                  <Input
                    type="datetime-local"
                    value={form.main_featured_expires_at ?? ""}
                    onChange={(e) => setForm({ ...form, main_featured_expires_at: e.target.value })}
                  />
                  <div className="flex flex-wrap gap-2">
                    {[
                      { label: "12 horas", h: 12 },
                      { label: "24 horas", h: 24 },
                      { label: "48 horas", h: 48 },
                    ].map((opt) => (
                      <Button
                        key={opt.h}
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          const d = new Date(Date.now() + opt.h * 3600_000);
                          setForm({ ...form, main_featured_expires_at: d.toISOString().slice(0, 16) });
                        }}
                      >
                        +{opt.label}
                      </Button>
                    ))}
                    {form.main_featured_expires_at && (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => setForm({ ...form, main_featured_expires_at: "" })}
                      >
                        Limpar
                      </Button>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Após esta data, o peso P2 (+80) é removido automaticamente e a Home recalcula a manchete.
                  </p>
                </div>
              )}
              <label className="flex items-start gap-2 cursor-pointer">
                <Checkbox
                  checked={form.is_denuncia}
                  onCheckedChange={(v) => setForm({ ...form, is_denuncia: !!v })}
                  className="mt-0.5"
                />
                <span className="text-sm">
                  <span className="font-bold">É uma denúncia</span>
                </span>
              </label>
            </div>

            {/* ============== Validade na Home ============== */}
            <div className="space-y-3 rounded-md border border-border bg-secondary/30 p-3">
              <p className="text-[10px] uppercase font-black tracking-widest text-muted-foreground">
                Validade na Home
              </p>

              <label className="flex items-start gap-2 cursor-pointer">
                <Checkbox
                  checked={!!form.is_evergreen}
                  onCheckedChange={(v) => setForm({ ...form, is_evergreen: !!v, home_expires_at: v ? "" : form.home_expires_at })}
                  className="mt-0.5"
                />
                <span className="text-sm">
                  <span className="font-bold text-emerald-700">Destaque Permanente</span>
                  <span className="block text-xs text-muted-foreground">
                    Ignora a data de validade e mantém a notícia elegível para a Home indefinidamente.
                  </span>
                </span>
              </label>

              {!form.is_evergreen && (
                <>
                  <div>
                    <Label className="text-xs font-bold">Exibir na Home até</Label>
                    <Input
                      type="datetime-local"
                      value={form.home_expires_at ?? ""}
                      onChange={(e) => setForm({ ...form, home_expires_at: e.target.value })}
                    />
                    <p className="text-[11px] text-muted-foreground mt-1 leading-snug">
                      Depois desta data a notícia sai automaticamente da Home, do Plantão e dos destaques.
                      A página continua acessível e indexada pelo Google.
                    </p>
                  </div>

                  {(form.is_urgent || form.is_featured) && (
                    <div className="pt-1">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1.5">
                        Expirar Plantão em
                      </p>
                      <div className="grid grid-cols-4 gap-1.5">
                        {[
                          { label: "24h", hours: 24 },
                          { label: "48h", hours: 48 },
                          { label: "72h", hours: 72 },
                          { label: "7 dias", hours: 24 * 7 },
                        ].map((opt) => (
                          <button
                            type="button"
                            key={opt.label}
                            onClick={() => {
                              const d = new Date();
                              d.setHours(d.getHours() + opt.hours);
                              setForm({ ...form, home_expires_at: d.toISOString().slice(0, 16) });
                            }}
                            className="text-[11px] font-bold uppercase tracking-wider bg-white hover:bg-urgent hover:text-white border border-border rounded-sm py-1.5 transition-colors"
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {form.home_expires_at && (
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, home_expires_at: "" })}
                      className="text-[11px] font-bold text-muted-foreground hover:text-urgent underline"
                    >
                      Limpar validade
                    </button>
                  )}
                </>
              )}
            </div>

            <div className="flex flex-col gap-2 pt-2">
              <Button onClick={() => save()} disabled={saving} variant="outline" className="w-full">
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Salvar (status atual)
              </Button>
              
              {canPublish && (
                <div className="pt-4 border-t-2 border-border mt-2 space-y-3">
                  <p className="text-[10px] uppercase font-bold text-muted-foreground mb-1">Publicação Rápida</p>
                  
                  <Button
                    onClick={() => save("publicada")}
                    disabled={saving}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-black py-7 text-lg shadow-md group transition-all"
                  >
                    <Globe className="h-5 w-5 mr-2 group-hover:animate-pulse" />
                    PUBLICAR AGORA
                  </Button>
                  
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      onClick={() => save("aprovada")}
                      disabled={saving || currentStatus === "aprovada"}
                      variant="outline"
                      size="sm"
                      className="border-emerald-600 text-emerald-600 hover:bg-emerald-50 font-bold"
                    >
                      <CheckCircle2 className="h-4 w-4 mr-2" />
                      Aprovar
                    </Button>
                    
                    <Button
                      onClick={() => save("em_revisao")}
                      disabled={saving || currentStatus === "em_revisao"}
                      variant="outline"
                      size="sm"
                      className="font-bold"
                    >
                      <RotateCcw className="h-4 w-4 mr-2" />
                      Revisão
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="bg-card border border-border p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-bold uppercase tracking-wider text-xs">Categoria & tags</h3>
              {form.ai_review_status === "reescrito_ia" && (
                <span className="text-[10px] uppercase font-bold px-2 py-0.5 bg-primary/10 text-primary border border-primary/30">
                  Sugerida pela IA
                </span>
              )}
            </div>
            <Select value={form.category_id ?? ""} onValueChange={(v) => setForm({ ...form, category_id: v })}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {cats.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div>
              <Label>Tags (vírgulas)</Label>
              <Input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} />
            </div>
          </div>

          <div className="bg-card border border-border p-4 space-y-3">
            <h3 className="font-bold uppercase tracking-wider text-xs">SEO</h3>
            <div>
              <Label>Meta title</Label>
              <Input
                value={form.meta_title ?? ""}
                onChange={(e) => setForm({ ...form, meta_title: e.target.value })}
              />
            </div>
            <div>
              <Label>Meta description</Label>
              <Textarea
                rows={3}
                value={form.meta_description ?? ""}
                onChange={(e) => setForm({ ...form, meta_description: e.target.value })}
              />
            </div>
          </div>

          {!isNew && history.length > 0 && (
            <div className="bg-card border border-border p-4 space-y-3">
              <h3 className="font-bold uppercase tracking-wider text-xs flex items-center gap-2">
                <History className="h-3.5 w-3.5" /> Histórico
              </h3>
              <ul className="space-y-2 text-xs">
                {history.map((h, i) => {
                  const from = h.from_status ? normalizeStatus(h.from_status) : null;
                  const to = normalizeStatus(h.to_status);
                  return (
                    <li key={i} className="border-l-2 border-primary pl-2">
                      <div className="font-mono text-muted-foreground">
                        {new Date(h.created_at).toLocaleString("pt-BR")}
                      </div>
                      <div>
                        {from ? (
                          <>
                            <span className="text-muted-foreground">{STATUS_LABEL[from]}</span> →{" "}
                            <strong>{STATUS_LABEL[to]}</strong>
                          </>
                        ) : (
                          <strong>Criada como {STATUS_LABEL[to]}</strong>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </aside>
      </div>

      {/* Barra fixa mobile: Salvar / Visualizar / Publicar */}
      {!isNew && (
        <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-card border-t border-border shadow-lg admin-editor-bottombar px-3 pt-2">
          <div className="grid grid-cols-3 gap-2">
            <Button
              onClick={() => save()}
              disabled={saving}
              variant="outline"
              size="sm"
              className="font-bold"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar"}
            </Button>
            <Button
              onClick={() => {
                const s = form.slug || slugify(form.title);
                if (s) window.open(`/noticia/${s}`, "_blank");
              }}
              variant="outline"
              size="sm"
              className="font-bold"
            >
              Visualizar
            </Button>
            <Button
              onClick={() => save("publicada")}
              disabled={saving || !canPublish}
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-black"
            >
              Publicar
            </Button>
          </div>
        </div>
      )}
      {/* Espaço para não sobrepor conteúdo no mobile */}
      {!isNew && <div className="md:hidden h-20" aria-hidden />}
    </AdminLayout>
  );
}

