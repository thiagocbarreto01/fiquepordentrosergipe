import { useEffect, useRef, useState } from "react";
import { normalizeEditorContent } from "@/lib/normalizeEditorContent";
import { getContentQuality } from "@/lib/contentQuality";
import { useNavigate, useParams } from "react-router-dom";
import AdminLayout from "@/components/admin/AdminLayout";
import ContentToolbar from "@/components/admin/ContentToolbar";
import RecaptureDialog from "@/components/admin/RecaptureDialog";
import CompletePostAIDialog from "@/components/admin/CompletePostAIDialog";
import { useSiteSettings } from "@/hooks/useSiteSettings";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Upload, History, AlertTriangle, ExternalLink, Sparkles, RotateCcw, Loader2, Globe, CheckCircle2, ArchiveRestore, BrainCircuit, ThumbsUp, ThumbsDown, Pin, PinOff, Film, Share2, Eye } from "lucide-react";
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
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useEditorAutosave } from "@/hooks/useEditorAutosave";
import { useNavigationGuard } from "@/hooks/useNavigationGuard";
import { PublishDialog } from "@/components/admin/editor/PublishDialog";
import { ArticlePreviewDialog } from "@/components/admin/editor/ArticlePreviewDialog";
import { UnsavedChangesDialog } from "@/components/admin/editor/UnsavedChangesDialog";
import { RecoverDraftDialog } from "@/components/admin/editor/RecoverDraftDialog";
import { EditorMobileActionBar } from "@/components/admin/editor/EditorMobileActionBar";
import { EditorPinningSection } from "@/components/admin/editor/EditorPinningSection";
import { EditorPrincipalSection } from "@/components/admin/editor/EditorPrincipalSection";
import { EditorCoverSection } from "@/components/admin/editor/EditorCoverSection";
import { EditorContentSection } from "@/components/admin/editor/EditorContentSection";
import { EditorAdvancedSection } from "@/components/admin/editor/EditorAdvancedSection";
import { validateCoverImage, safeUploadName } from "@/lib/uploadValidation";
import { fillMissingSeo } from "@/lib/seoAuto";

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
  const { user, isAdmin, isStaff } = useAuth();
  const canPublish = isAdmin; // Only admins as requested
  const siteSettings = useSiteSettings();
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
    // Novas notícias manuais iniciam como "rascunho".
    // Captação automática (RSS/Auto Sync/CMS API/Instagram) continua entrando como "captada".
    status: "rascunho" as EditorialStatus,
    is_featured: false,
    is_main_featured: false,
    is_urgent: false,
    is_denuncia: false,
    is_evergreen: false,
    home_expires_at: "",
    main_featured_expires_at: "",
    meta_title: "",
    meta_description: "",
    // scheduled_at: agendamento automático fica bloqueado nesta passada.
    // A coluna existe no banco, mas o editor não grava mais valor aqui até
    // que a Passada 4.2 configure pg_cron e RPCs seguras.
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
  const [hydrated, setHydrated] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    document.title = isNew ? "Nova notícia — Painel" : "Editar notícia — Painel";
    supabase.from("categories").select("*").order("position").then(({ data }) => setCats(data ?? []));
    if (isNew) {
      // Notícia nova: nenhum fetch, apenas marca como hidratada
      // (sem alterações) para o autosave/dirty-guard começarem limpos.
      setHydrated(true);
      setDirty(false);
      return;
    }
    supabase
      .from("posts")
      .select("*")
      .eq("id", id)
      .maybeSingle()
      .then(async ({ data }) => {
        if (!data) { setHydrated(true); return; }
        // CRÍTICO: abrir uma notícia NUNCA pode alterar seu status.
        // Removido o antigo UPDATE captada → em_revisao. Só ações
        // explícitas do usuário mudam status.
        const currentStatus: EditorialStatus = normalizeStatus(data.status);
        setForm({
          ...data,
          status: currentStatus,
          tags: (data.tags ?? []).join(", "),
          // scheduled_at é apenas exibido (read-only) — nunca gravado nesta passada
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
        // Hidratação inicial não conta como alteração do usuário.
        setDirty(false);
        setHydrated(true);

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
  }, [id, isNew]);

  // -------- Wrap setForm para marcar dirty apenas após hidratação --------
  const updateForm = (updater: any) => {
    setForm((prev: any) => {
      const next = typeof updater === "function" ? updater(prev) : { ...prev, ...updater };
      return next;
    });
    if (hydrated) setDirty(true);
  };

  // -------- Autosave local (fonte única: useEditorAutosave) --------
  const {
    savedAt: localSavedAt,
    readDraft,
    clearDraft,
    key: autosaveKey,
  } = useEditorAutosave({
    userId: user?.id,
    postId: isNew ? "new" : id,
    data: form,
    enabled: hydrated,
    dirty,
  });
  const [localSavedAtDisplay, setLocalSavedAtDisplay] = useState<Date | null>(null);
  useEffect(() => { setLocalSavedAtDisplay(localSavedAt); }, [localSavedAt]);

  // -------- Recuperação de rascunho local ao hidratar (nunca aplica sozinho) --------
  const [recoverOpen, setRecoverOpen] = useState(false);
  const [recoveredPayload, setRecoveredPayload] = useState<{ savedAt: Date; data: any } | null>(null);
  const recoverCheckedRef = useRef(false);
  useEffect(() => {
    if (!hydrated || !user?.id || recoverCheckedRef.current) return;
    recoverCheckedRef.current = true;
    const raw = readDraft();
    if (raw && raw.data) {
      setRecoveredPayload({ savedAt: new Date(raw.savedAt), data: raw.data });
      setRecoverOpen(true);
      setLocalSavedAtDisplay(new Date(raw.savedAt));
    }
  }, [hydrated, user?.id, readDraft]);

  // -------- Estado de salvamento (5 estados legíveis) --------
  type SaveState =
    | { kind: "idle" }
    | { kind: "dirty" }
    | { kind: "local"; at: Date }
    | { kind: "saving" }
    | { kind: "saved"; at: Date }
    | { kind: "error"; message: string };
  const [saveState, setSaveState] = useState<SaveState>({ kind: "idle" });
  useEffect(() => {
    if (saveState.kind === "saving" || saveState.kind === "saved" || saveState.kind === "error") return;
    if (dirty && localSavedAtDisplay) setSaveState({ kind: "local", at: localSavedAtDisplay });
    else if (dirty) setSaveState({ kind: "dirty" });
    else setSaveState({ kind: "idle" });
  }, [dirty, localSavedAtDisplay]); // eslint-disable-line

  // -------- Bloqueio de navegação SPA + beforeunload --------
  const guard = useNavigationGuard(dirty);


  async function uploadCover(file: File) {
    setUploading(true);
    try {
      const check = await validateCoverImage(file);
      if (check.ok !== true) {
        toast.error(check.message);
        return;
      }
      const path = safeUploadName(file.name);
      const { error } = await supabase.storage.from("media").upload(path, file, {
        upsert: false,
        contentType: file.type,
      });
      if (error) { toast.error(error.message); return; }
      const { data } = supabase.storage.from("media").getPublicUrl(path);
      setForm((f: any) => ({ ...f, manual_image_url: data.publicUrl }));
      if (hydrated) setDirty(true);
      toast.success("Imagem enviada para substituição manual");
    } finally {
      setUploading(false);
    }
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
    setSaveState({ kind: "saving" });
    const slug = form.slug || slugify(form.title);
    const videosRelacionados: string[] = (form.videos_relacionados_text ?? "")
      .split(/\r?\n/)
      .map((s: string) => s.trim())
      .filter(Boolean);
    // Auto-SEO: preenche meta_title/meta_description apenas se ainda vazios.
    // Preserva overrides manuais. Não afeta notícias antigas apenas por abrir o editor.
    const seoPatch = fillMissingSeo({
      title: form.title, subtitle: form.subtitle, content: form.content,
      meta_title: form.meta_title, meta_description: form.meta_description,
    });
    const payload: any = {
      title: form.title.trim(),
      subtitle: form.subtitle || null,
      instagram_headline: (form.instagram_headline || "").trim() || null,
      slug,
      content: normalizeEditorContent(form.content),
      previous_content: form.previous_content ?? null,
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
      meta_title: seoPatch.meta_title ?? form.meta_title ?? null,
      meta_description: seoPatch.meta_description ?? form.meta_description ?? null,
      video_url_principal: (form.video_url_principal || "").trim() || null,
      videos_relacionados: videosRelacionados,
      published_at:
        finalStatus === "publicada"
          ? form.published_at ?? new Date().toISOString()
          : null,
      // scheduled_at: Passada 4.1 desativa gravação direta.
      // A publicação agendada só volta na Passada 4.2, quando pg_cron
      // e as RPCs seguras estiverem instalados.
    };

    let res;
    if (isNew) res = await supabase.from("posts").insert(payload).select("id").maybeSingle();
    else res = await supabase.from("posts").update(payload).eq("id", id).select("id").maybeSingle();
    setSaving(false);
    if (res.error) {
      setSaveState({ kind: "error", message: res.error.message });
      return toast.error(res.error.message);
    }
    // Se o auto-SEO preencheu algo, reflete no formulário para o usuário ver.
    if (seoPatch.meta_title || seoPatch.meta_description) {
      setForm((f: any) => ({
        ...f,
        meta_title: seoPatch.meta_title ?? f.meta_title,
        meta_description: seoPatch.meta_description ?? f.meta_description,
      }));
    }

    // Salvamento real bem-sucedido → limpa o rascunho local desta chave
    clearDraft();
    setDirty(false);
    setLocalSavedAtDisplay(null);
    setSaveState({ kind: "saved", at: new Date() });

    const labels: Partial<Record<EditorialStatus, string>> = {
      publicada: "Publicada!",
      aprovada: "Aprovada",
      rejeitada: "Rejeitada",
      em_revisao: "Salva em revisão",
      captada: "Salva como captada",
      rascunho: "Rascunho salvo",
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

  // Diálogos unificados
  const [publishOpen, setPublishOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  // tryPublish agora abre o PublishDialog com checklist unificado.
  // A validação incompleto/curto vive dentro do checklist (via getContentQuality).
  function tryPublish() {
    setPublishOpen(true);
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
          <Button variant="ghost" size="sm" onClick={() => guard.attempt("/admin/posts")} className="mr-2">
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
          <Button onClick={() => setPreviewOpen(true)} variant="outline" size="sm" className="gap-1">
            <Eye className="h-4 w-4" />
            <span className="hidden sm:inline">Visualizar</span>
          </Button>
          <Button onClick={() => save()} disabled={saving} variant="outline" size="sm">
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Salvar rascunho
          </Button>

          {canPublish && (
            <div className="flex items-center gap-2 border-l pl-2 ml-2">
              <Button
                onClick={() => tryPublish()}
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

      {/* Indicador de estado de salvamento — 5 estados distintos */}
      {(() => {
        const st = saveState;
        if (st.kind === "idle") return null;
        const map: Record<string, { cls: string; label: React.ReactNode }> = {
          dirty: { cls: "bg-blue-50 border-blue-200 text-blue-900", label: <><strong>Alterações não salvas.</strong> Nada foi enviado ao servidor ainda.</> },
          local: { cls: "bg-blue-50 border-blue-200 text-blue-900", label: <><strong>Rascunho local salvo</strong> às {(st as any).at?.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}. Somente neste navegador — o servidor ainda não recebeu.</> },
          saving: { cls: "bg-amber-50 border-amber-200 text-amber-900", label: <><Loader2 className="inline h-3.5 w-3.5 animate-spin mr-1" /> Salvando no servidor…</> },
          saved: { cls: "bg-emerald-50 border-emerald-200 text-emerald-900", label: <><CheckCircle2 className="inline h-3.5 w-3.5 mr-1" /> <strong>Salvo no servidor</strong> às {(st as any).at?.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}.</> },
          error: { cls: "bg-red-50 border-red-200 text-red-900", label: <><AlertTriangle className="inline h-3.5 w-3.5 mr-1" /> <strong>Erro ao salvar:</strong> {(st as any).message}</> },
        };
        const info = map[st.kind];
        if (!info) return null;
        return (
          <div className={`mb-4 -mt-2 flex items-center justify-between gap-3 flex-wrap text-xs px-3 py-2 rounded-sm border ${info.cls}`}>
            <span>{info.label}</span>
            {(st.kind === "dirty" || st.kind === "local") && localSavedAtDisplay && (
              <button
                type="button"
                onClick={() => { clearDraft(); setLocalSavedAtDisplay(null); }}
                className="underline font-bold"
              >
                Descartar rascunho local
              </button>
            )}
          </div>
        );
      })()}

      {/* PublishDialog unificado com checklist */}
      <PublishDialog
        open={publishOpen}
        onOpenChange={setPublishOpen}
        submitting={saving}
        canOverrideCover={canPublish}
        form={{
          title: form.title,
          subtitle: form.subtitle,
          category_id: form.category_id,
          content: form.content,
          cover_image_url: form.cover_image_url,
          manual_image_url: form.manual_image_url,
          image_caption: form.image_caption,
          image_credit: form.image_credit,
          tags: form.tags,
          meta_title: form.meta_title,
          meta_description: form.meta_description,
          is_urgent: form.is_urgent,
          home_expires_at: form.home_expires_at,
          is_pinned: false,
          pinned_until: null,
          pinned_reason: null,
        }}
        onConfirm={async () => { await save("publicada"); setPublishOpen(false); }}
      />

      {/* ArticlePreviewDialog — desktop/mobile */}
      <ArticlePreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        snapshot={{
          title: form.title,
          subtitle: form.subtitle,
          content: form.content,
          cover_image_url: form.cover_image_url,
          manual_image_url: form.manual_image_url,
          image_caption: form.image_caption,
          image_credit: form.image_credit,
          categoryName: cats.find((c) => c.id === form.category_id)?.name ?? null,
          authorLabel: "Redação Fique Por Dentro Sergipe",
          publishedAtIso: form.published_at ?? null,
        }}
      />

      {/* Bloqueio de navegação SPA */}
      <UnsavedChangesDialog
        open={guard.hasPending}
        onContinueEditing={guard.cancel}
        onDiscard={guard.confirmDiscard}
      />

      {/* Recuperação de rascunho local (nunca aplica sozinho) */}
      <RecoverDraftDialog
        open={recoverOpen}
        savedAt={recoveredPayload?.savedAt ?? null}
        onRecover={() => {
          if (recoveredPayload?.data) {
            setForm(recoveredPayload.data);
            setDirty(true);
            toast.success("Rascunho local recuperado — nada foi enviado ao servidor.");
          }
          setRecoverOpen(false);
        }}
        onDiscard={() => {
          clearDraft();
          setLocalSavedAtDisplay(null);
          setRecoverOpen(false);
          toast.info("Rascunho local descartado.");
        }}
      />



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
          <EditorPrincipalSection
            values={{
              title: form.title ?? "",
              subtitle: form.subtitle ?? "",
              category_id: form.category_id ?? "",
              tags: form.tags ?? "",
            }}
            categories={cats}
            onChange={(patch) => {
              setForm((f: any) => {
                const next = { ...f, ...patch };
                if (patch.title !== undefined && !f.slug) {
                  next.slug = slugify(patch.title);
                }
                return next;
              });
            }}
          />

          {/* Slug, SEO, vídeos e manchete Instagram foram movidos para "5. Opções avançadas". */}



          <EditorCoverSection
            values={{
              cover_image_url: form.cover_image_url ?? "",
              manual_image_url: form.manual_image_url ?? "",
              cover_image_original: form.cover_image_original ?? "",
              cover_image_source: form.cover_image_source ?? null,
              image_caption: form.image_caption ?? "",
              image_credit: form.image_credit ?? "",
              slug: form.slug ?? "",
              title: form.title ?? "",
              subtitle: form.subtitle ?? "",
              excerpt: form.excerpt ?? "",
              instagram_headline: form.instagram_headline ?? "",
              is_urgent: !!form.is_urgent,
              published_at: (form as any).published_at ?? null,
            }}
            categoryName={cats.find((c) => c.id === form.category_id)?.name || ""}
            sourceName={sourceName || ""}
            uploading={uploading}
            isNew={isNew}
            onChange={(patch) => setForm((f: any) => ({ ...f, ...patch }))}
            onUpload={uploadCover}
            onReprocess={reprocessImage}
          />



          <EditorContentSection
            values={{ content: form.content ?? "" }}
            textareaRef={contentRef}
            onChange={(patch) => setForm((f: any) => ({ ...f, ...patch }))}
            aiActions={
              <>
                {!isNew && isStaff && (
                  <CompletePostAIDialog
                    postId={id}
                    currentTitle={form.title || ""}
                    currentContent={form.content || ""}
                    onApply={(r) => setForm({
                      ...form,
                      previous_content: form.content,
                      title: r.titulo || form.title,
                      subtitle: r.subtitulo || form.subtitle,
                      content: r.conteudo || form.content,
                      excerpt: r.resumo || form.excerpt,
                    })}
                  />
                )}
                {!isNew && isAdmin && siteSettings.recapture_assisted_enabled && id && (
                  <RecaptureDialog
                    postId={id}
                    currentContent={form.content || ""}
                    onReplace={(newContent) =>
                      setForm({ ...form, previous_content: form.content, content: newContent })
                    }
                  />
                )}
              </>
            }
          />

          {/* 5. Opções avançadas — slug, SEO, vídeos, Instagram (recolhido por padrão) */}
          <EditorAdvancedSection
            values={{
              slug: form.slug ?? "",
              meta_title: form.meta_title ?? "",
              meta_description: form.meta_description ?? "",
              video_url_principal: form.video_url_principal ?? "",
              videos_relacionados_text: form.videos_relacionados_text ?? "",
              instagram_headline: form.instagram_headline ?? "",
              title: form.title ?? "",
              subtitle: form.subtitle ?? "",
              content: form.content ?? "",
            }}
            slugLocked={form.status === "publicada"}
            isNew={isNew}
            genIgHeadline={genIgHeadline}
            canGenIgHeadline={!!form.title}
            slugify={slugify}
            onChange={(patch) => setForm((f: any) => ({ ...f, ...patch }))}
            onGenerateIgHeadline={async () => {
              if (!form.title) { toast.error("Informe o título antes"); return; }
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
          />
        </div>


        <aside className="space-y-4 lg:sticky lg:top-24 h-fit">
          <div className="bg-card border border-border p-4 space-y-3 shadow-sm">
            <h3 className="font-bold uppercase tracking-wider text-xs">Fluxo editorial</h3>
            <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="rascunho">Rascunho</SelectItem>
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

            <div className="rounded-md border border-dashed border-border bg-secondary/40 p-3">
              <Label className="text-xs uppercase font-bold tracking-wider text-muted-foreground">
                Publicação agendada
              </Label>
              <Input
                type="datetime-local"
                value={form.scheduled_at ?? ""}
                disabled
                aria-disabled="true"
                readOnly
                className="mt-1 cursor-not-allowed opacity-60"
              />
              <p className="text-[11px] text-muted-foreground mt-1 leading-snug">
                Agendamento automático será ativado após a configuração segura do serviço.
                Enquanto isso, use <strong>PUBLICAR AGORA</strong> quando a matéria estiver pronta.
              </p>
            </div>


            {/*
              Controles antigos ocultos nesta passada:
              - Destaque Permanente (is_evergreen)
              - Destaque Principal / Manchete (is_main_featured + main_featured_expires_at)
              - "Destaque na home" (is_featured) manual
              - Campo genérico "Exibir na Home até" (home_expires_at manual)
              - Presets P1/P2/P3 e seletor de slot

              As colunas continuam no banco e valores antigos ficam intactos
              (form.is_evergreen, form.is_main_featured, etc. seguem sendo
              inicializados do registro e regravados pelo save() como estavam).
            */}

            <div className="space-y-3 rounded-md border border-border bg-secondary/30 p-3">
              <p className="text-[10px] uppercase font-black tracking-widest text-muted-foreground">
                Plantão / Urgente
              </p>
              <label className="flex items-start gap-2 cursor-pointer">
                <Checkbox
                  checked={form.is_urgent}
                  onCheckedChange={(v) => setForm({
                    ...form,
                    is_urgent: !!v,
                    // ao desmarcar, limpar validade para evitar restos inconsistentes na UI
                    home_expires_at: v ? form.home_expires_at : "",
                  })}
                  className="mt-0.5"
                />
                <span className="text-sm">
                  <span className="font-bold text-red-700">Marcar como Plantão/Urgente</span>
                  <span className="block text-xs text-muted-foreground">
                    Aparece na faixa vermelha de Plantão no topo do site. Exige validade futura.
                  </span>
                </span>
              </label>

              {form.is_urgent && (
                <div className="ml-6 space-y-2">
                  <Label className="text-xs font-bold">Plantão válido até</Label>
                  <Input
                    type="datetime-local"
                    value={form.home_expires_at ?? ""}
                    onChange={(e) => setForm({ ...form, home_expires_at: e.target.value })}
                  />
                  <div className="grid grid-cols-4 gap-1.5">
                    {[
                      { label: "2h", h: 2 },
                      { label: "4h", h: 4 },
                      { label: "6h", h: 6 },
                      { label: "12h", h: 12 },
                    ].map((opt) => (
                      <button
                        type="button"
                        key={opt.label}
                        onClick={() => {
                          const d = new Date(Date.now() + opt.h * 3600_000);
                          setForm({ ...form, home_expires_at: d.toISOString().slice(0, 16) });
                        }}
                        className="text-[11px] font-bold uppercase tracking-wider bg-white hover:bg-urgent hover:text-white border border-border rounded-sm py-1.5 transition-colors"
                      >
                        +{opt.label}
                      </button>
                    ))}
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    O Plantão sem validade futura é bloqueado no PublishDialog.
                  </p>
                </div>
              )}

              <label className="flex items-start gap-2 cursor-pointer pt-2 border-t border-border">
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

            {/* Fixação temporária da manchete (RPCs seguras) */}
            <EditorPinningSection
              postId={isNew ? null : (id ?? null)}
              isPublished={form.status === "publicada"}
              canManage={isStaff}
              pinnedUntil={form.pinned_until ?? null}
              pinnedReason={form.pinned_reason ?? null}
              onChanged={async () => {
                if (isNew || !id) return;
                const { data } = await supabase
                  .from("posts")
                  .select("pinned_until,pinned_reason,pinned_slot,pinned_by")
                  .eq("id", id)
                  .maybeSingle();
                if (data) {
                  setForm((f: any) => ({
                    ...f,
                    pinned_until: (data as any).pinned_until,
                    pinned_reason: (data as any).pinned_reason,
                    pinned_slot: (data as any).pinned_slot,
                    pinned_by: (data as any).pinned_by,
                  }));
                }
              }}
            />




            <div className="flex flex-col gap-2 pt-2">
              <Button onClick={() => save()} disabled={saving} variant="outline" className="w-full">
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Salvar (status atual)
              </Button>
              
              {canPublish && (
                <div className="pt-4 border-t-2 border-border mt-2 space-y-3">
                  <p className="text-[10px] uppercase font-bold text-muted-foreground mb-1">Publicação Rápida</p>
                  
                  <Button
                    onClick={() => tryPublish()}
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

          {/* Categoria & tags foram movidos para EditorPrincipalSection (coluna principal). */}



          {/* SEO foi movido para "5. Opções avançadas" na coluna principal. */}


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
              onClick={() => tryPublish()}
              disabled={saving || !canPublish}
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-black"
            >
              Publicar
            </Button>
          </div>
        </div>
      )}
      {/* Barra mobile fixa inferior — ações mínimas com safe-area */}
      <EditorMobileActionBar
        primaryLabel={canPublish ? "PUBLICAR AGORA" : "Salvar rascunho"}
        onPrimary={() => (canPublish ? tryPublish() : save())}
        primaryDisabled={saving}
        onPreview={() => setPreviewOpen(true)}
        onSaveDraft={() => save()}
        canUnpublish={canPublish && currentStatus === "publicada"}
        onUnpublish={() => save("em_revisao")}
      />
      {/* Padding inferior para o conteúdo não ficar coberto pela barra mobile */}
      <div className="md:hidden h-24" aria-hidden />
    </AdminLayout>
  );
}

