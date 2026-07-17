import { useEffect, useState } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Instagram,
  Loader2,
  ExternalLink,
  CheckCircle2,
  Eye,
  RotateCcw,
  ImageOff,
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  Send,
  FileText,
  Pencil,
  Search,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { Link, useNavigate } from "react-router-dom";

interface Category {
  id: string;
  name: string;
  slug: string;
}

type Confidence = "alta" | "média" | "baixa";

interface ExtractedData {
  caption: string;
  caption_length: number;
  ocr_text: string;
  transcript: string;
  transcript_available: boolean;
  image_url: string | null;
  has_image: boolean;
  has_video: boolean;
  video_url: string | null;
  location: string | null;
  hashtags: string[];
  sufficient: boolean;
  sufficient_threshold: number;
  scrape_error: string | null;
}

interface PreviewData {
  title: string;
  subtitle: string;
  lead: string;
  excerpt: string;
  content_preview: string;
  content_html: string;
  tags: string[];
  seo_title: string;
  seo_description: string;
  confidence: Confidence;
  confidence_reason: string;
  sources_used: string[];
  extracted: ExtractedData;
  category_id: string | null;
  category_name: string | null;
  category_slug: string | null;
  ai_used_category: string | null;
  cover_image_url: string;
  image_source: "manual" | "instagram" | "category" | "placeholder";
  had_image: boolean;
  has_video: boolean;
  video_url_principal: string | null;
  quality_ok: boolean;
  quality_issues: string[];
  paragraph_count: number;
}

interface ImportResult {
  post_id: string;
  slug: string;
  status?: string;
  published?: boolean;
  ai_used_category?: string | null;
  confidence?: Confidence;
  sources_used?: string[];
  had_image: boolean;
  image_source?: "manual" | "instagram" | "category" | "placeholder";
  has_video?: boolean;
  video_url_principal?: string | null;
  instagram_post_id?: string | null;
  instagram_error?: string | null;
}

const INSTAGRAM_URL_RE =
  /^https?:\/\/(www\.)?instagram\.com\/(p|reel|reels|tv)\/[A-Za-z0-9_-]+\/?/i;

function ConfidenceBadge({ level, reason }: { level: Confidence; reason?: string }) {
  const map: Record<Confidence, { Icon: any; label: string; cls: string }> = {
    alta: {
      Icon: ShieldCheck,
      label: "Confiança: Alta",
      cls: "bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/40",
    },
    "média": {
      Icon: ShieldAlert,
      label: "Confiança: Média",
      cls: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border-yellow-500/40",
    },
    baixa: {
      Icon: ShieldX,
      label: "Confiança: Baixa",
      cls: "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/40",
    },
  };
  const { Icon, label, cls } = map[level];
  return (
    <div className={`inline-flex items-center gap-1.5 px-2 py-1 border rounded text-xs font-semibold ${cls}`} title={reason}>
      <Icon className="h-3.5 w-3.5" /> {label}
    </div>
  );
}

function ExtractedPanel({ data }: { data: ExtractedData }) {
  return (
    <div className="bg-card border border-border p-4 space-y-3 rounded">
      <div className="text-sm font-bold uppercase tracking-wide flex items-center gap-2">
        <Search className="h-4 w-4 text-primary" /> Dados extraídos do Instagram
      </div>

      <div className="grid sm:grid-cols-[140px_1fr] gap-2 text-sm">
        <div className="text-muted-foreground">Legenda</div>
        <div>
          {data.caption ? (
            <div className="bg-muted p-2 rounded whitespace-pre-wrap text-xs max-h-40 overflow-auto">
              {data.caption}
            </div>
          ) : (
            <span className="text-destructive text-xs">✗ Nenhuma legenda extraída</span>
          )}
        </div>

        <div className="text-muted-foreground">Texto OCR</div>
        <div>
          {data.ocr_text ? (
            <div className="bg-muted p-2 rounded whitespace-pre-wrap text-xs font-mono max-h-40 overflow-auto">
              {data.ocr_text}
            </div>
          ) : (
            <span className="text-muted-foreground text-xs">✗ Nenhum texto legível na imagem</span>
          )}
        </div>

        <div className="text-muted-foreground">Transcrição do vídeo</div>
        <div className="text-xs text-muted-foreground">
          {data.has_video ? "✗ Transcrição automática de áudio não disponível nesta versão" : "— (não é vídeo)"}
        </div>

        <div className="text-muted-foreground">Imagem</div>
        <div className="text-xs">
          {data.has_image ? "✓ Imagem detectada" : "✗ Sem imagem"}
        </div>

        {data.location && (
          <>
            <div className="text-muted-foreground">Localização</div>
            <div className="text-xs">📍 {data.location}</div>
          </>
        )}

        {data.hashtags.length > 0 && (
          <>
            <div className="text-muted-foreground">Hashtags</div>
            <div className="text-xs flex flex-wrap gap-1">
              {data.hashtags.map((h) => (
                <span key={h} className="bg-muted px-1.5 rounded">#{h}</span>
              ))}
            </div>
          </>
        )}
      </div>

      {!data.sufficient && (
        <div className="text-sm bg-destructive/10 border border-destructive/30 text-destructive p-3 rounded flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <div>
            <strong>Conteúdo insuficiente.</strong> Não foi possível obter informações suficientes do post para gerar uma notícia confiável.
            Cole a legenda manualmente no campo abaixo para complementar.
          </div>
        </div>
      )}
      {data.scrape_error && (
        <div className="text-xs text-muted-foreground italic">
          Aviso: erro ao raspar o post ({data.scrape_error}).
        </div>
      )}
    </div>
  );
}

export default function AdminImportarInstagram({ embedded = false }: { embedded?: boolean } = {}) {
  const navigate = useNavigate();
  const [url, setUrl] = useState("");
  const [caption, setCaption] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [categoryId, setCategoryId] = useState<string>("");
  const [categories, setCategories] = useState<Category[]>([]);
  const [loadingExtract, setLoadingExtract] = useState(false);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [loadingSave, setLoadingSave] = useState(false);
  const [savingMode, setSavingMode] = useState<"draft" | "publish" | "edit" | "ig" | null>(null);
  const [extracted, setExtracted] = useState<ExtractedData | null>(null);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  useEffect(() => {
    document.title = "Importar do Instagram — Painel";
    supabase
      .from("categories")
      .select("id,name,slug")
      .order("position", { ascending: true })
      .then(({ data }) => setCategories(data ?? []));
  }, []);

  function validate(): string | null {
    const trimmed = url.trim();
    if (!INSTAGRAM_URL_RE.test(trimmed)) {
      return "URL inválida. Cole um link de post (https://www.instagram.com/p/...) ou reel.";
    }
    if (caption.length > 8000) return "Legenda muito longa (máx 8000 caracteres).";
    if (imageUrl && !/^https?:\/\//i.test(imageUrl)) return "URL da imagem inválida.";
    return null;
  }

  async function extrairDados(e?: React.FormEvent) {
    e?.preventDefault();
    setResult(null);
    setPreview(null);
    setExtracted(null);

    const err = validate();
    if (err) return toast.error(err);

    setLoadingExtract(true);
    const { data, error } = await supabase.functions.invoke("import-instagram-post", {
      body: {
        instagram_url: url.trim(),
        caption_override: caption.trim() || undefined,
        image_url_override: imageUrl.trim() || undefined,
        extract_only: true,
      },
    });
    setLoadingExtract(false);

    if (error) return toast.error(error.message ?? "Falha ao extrair dados");
    const d = data as any;
    if (!d?.ok) return toast.error(d?.error ?? "Falha ao extrair dados");

    setExtracted(d.extracted as ExtractedData);
    if (!d.extracted?.sufficient) {
      toast.warning("Conteúdo insuficiente. Cole a legenda manualmente para complementar.");
    } else {
      toast.success("Dados extraídos. Você pode gerar a matéria agora.");
    }
  }

  async function gerarPreview() {
    setResult(null);
    setPreview(null);

    const err = validate();
    if (err) return toast.error(err);

    setLoadingPreview(true);
    const { data, error } = await supabase.functions.invoke("import-instagram-post", {
      body: {
        instagram_url: url.trim(),
        caption_override: caption.trim() || undefined,
        image_url_override: imageUrl.trim() || undefined,
        category_id: categoryId || null,
        preview_only: true,
      },
    });
    setLoadingPreview(false);

    if (error) return toast.error(error.message ?? "Falha ao gerar matéria");
    const d = data as any;
    if (!d?.ok) {
      if (d?.extracted) setExtracted(d.extracted as ExtractedData);
      if (d?.validation_failed) {
        toast.error(d?.error ?? "Geração bloqueada por inconsistência com a fonte.");
      } else if (d?.insufficient) {
        toast.error(d?.error ?? "Conteúdo insuficiente.");
      } else {
        toast.error(d?.error ?? "Falha ao gerar matéria");
      }
      return;
    }

    if (d.extracted) setExtracted(d.extracted as ExtractedData);

    setPreview({
      title: d.title,
      subtitle: d.subtitle ?? "",
      lead: d.lead ?? "",
      excerpt: d.excerpt ?? "",
      content_preview: d.content_preview ?? "",
      content_html: d.content_html ?? "",
      tags: d.tags ?? [],
      seo_title: d.seo_title ?? "",
      seo_description: d.seo_description ?? "",
      confidence: (d.confidence ?? "média") as Confidence,
      confidence_reason: d.confidence_reason ?? "",
      sources_used: d.sources_used ?? [],
      extracted: d.extracted,
      category_id: d.category_id ?? null,
      category_name: d.category_name ?? null,
      category_slug: d.category_slug ?? null,
      ai_used_category: d.ai_used_category ?? null,
      cover_image_url: d.cover_image_url,
      image_source: d.image_source,
      had_image: !!d.had_image,
      has_video: !!d.has_video,
      video_url_principal: d.video_url_principal ?? null,
      quality_ok: d.quality_ok !== false,
      quality_issues: Array.isArray(d.quality_issues) ? d.quality_issues : [],
      paragraph_count: typeof d.paragraph_count === "number" ? d.paragraph_count : 0,
    });
    toast.success("Matéria gerada. Revise antes de publicar.");
  }

  async function confirmar(opts: {
    publishNow?: boolean;
    alsoIg?: boolean;
    thenEdit?: boolean;
    mode: "draft" | "publish" | "edit" | "ig";
  }) {
    const err = validate();
    if (err) return toast.error(err);

    // Publicação direta desabilitada: importação sempre gera rascunho.
    setLoadingSave(true);
    setSavingMode(opts.mode);
    const { data, error } = await supabase.functions.invoke("import-instagram-post", {
      body: {
        instagram_url: url.trim(),
        caption_override: caption.trim() || undefined,
        image_url_override: imageUrl.trim() || undefined,
        category_id: categoryId || preview?.category_id || null,
        also_generate_instagram: !!opts.alsoIg,
        publish_now: false,
      },
    });
    setLoadingSave(false);
    setSavingMode(null);

    if (error) return toast.error(error.message ?? "Falha ao salvar");
    const d = data as any;
    if (!d?.ok) return toast.error(d?.error ?? "Falha ao salvar");

    if (d.duplicate) {
      toast.warning(d.message ?? "Este post já foi importado anteriormente.");
    } else if (opts.publishNow) {
      toast.success("Matéria publicada com sucesso!");
    } else if (opts.alsoIg) {
      if (d.instagram_post_id) toast.success("Notícia + rascunho de Instagram criados!");
      else toast.warning(`Notícia criada, mas falhou ao gerar Instagram: ${d.instagram_error ?? "erro desconhecido"}`);
    } else {
      toast.success("Rascunho criado!");
    }

    const importResult: ImportResult = {
      post_id: d.post_id,
      slug: d.slug,
      status: d.status,
      published: !!d.published,
      ai_used_category: d.ai_used_category,
      confidence: d.confidence,
      sources_used: d.sources_used,
      had_image: !!d.had_image,
      image_source: d.image_source,
      has_video: !!d.has_video,
      video_url_principal: d.video_url_principal ?? null,
      instagram_post_id: d.instagram_post_id ?? null,
      instagram_error: d.instagram_error ?? null,
    };
    setResult(importResult);
    setPreview(null);

    if (opts.thenEdit && d.post_id) {
      navigate(`/admin/posts/${d.post_id}`);
    }
  }

  function descartarPreview() {
    setPreview(null);
  }

  const canGenerate = extracted?.sufficient || caption.trim().length >= 40;
  const qualityIssues = preview?.quality_issues ?? [];
  const qualityFailed = !!preview && preview.quality_ok === false;
  const publishBlocked = preview?.confidence === "baixa" || qualityFailed;

  const inner = (
      <div className="max-w-3xl">
        {!embedded && (
          <h1 className="font-display text-3xl font-black flex items-center gap-2 mb-2">
            <Instagram className="h-7 w-7 text-pink-600" /> Importar do Instagram
          </h1>
        )}
        <p className="text-muted-foreground mb-6">
          1) Extraia os dados do post. 2) Revise legenda, OCR e imagem reais. 3) Só então gere a matéria.
          A IA é proibida de inventar fatos: usará apenas legenda, OCR e transcrição reais.
        </p>

        <form onSubmit={extrairDados} className="space-y-5 bg-card border border-border p-6">
          <div>
            <Label htmlFor="ig-url">URL do post no Instagram *</Label>
            <Input
              id="ig-url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://www.instagram.com/p/CxYzAbC123/"
              required
            />
          </div>

          <div>
            <Label htmlFor="ig-caption">
              Legenda manual{" "}
              <span className="text-xs text-muted-foreground">
                (opcional — use se a extração automática falhar)
              </span>
            </Label>
            <Textarea
              id="ig-caption"
              rows={6}
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="Cole a legenda do post se a extração automática não trouxer o texto"
              maxLength={8000}
            />
            <div className="text-xs text-muted-foreground mt-1">{caption.length}/8000</div>
          </div>

          <div>
            <Label htmlFor="ig-image">
              URL da imagem{" "}
              <span className="text-xs text-muted-foreground">(opcional)</span>
            </Label>
            <Input
              id="ig-image"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="https://..."
            />
          </div>

          <div>
            <Label htmlFor="ig-cat">
              Categoria{" "}
              <span className="text-xs text-muted-foreground">
                (deixe em branco para a IA sugerir)
              </span>
            </Label>
            <select
              id="ig-cat"
              className="w-full h-10 px-3 border border-input bg-background rounded-md text-sm"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
            >
              <option value="">— IA escolhe automaticamente —</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <Button type="submit" disabled={loadingExtract || loadingPreview || loadingSave} className="w-full">
            {loadingExtract ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Extraindo dados…</>
            ) : (
              <><Search className="h-4 w-4 mr-2" /> 1) Extrair dados do Instagram</>
            )}
          </Button>
        </form>

        {extracted && (
          <div className="mt-6 space-y-4">
            <ExtractedPanel data={extracted} />

            <Button
              onClick={gerarPreview}
              disabled={loadingPreview || loadingSave || !canGenerate}
              className="w-full"
            >
              {loadingPreview ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Gerando matéria…</>
              ) : (
                <><Eye className="h-4 w-4 mr-2" /> 2) Gerar matéria a partir desses dados</>
              )}
            </Button>
            {!canGenerate && (
              <p className="text-xs text-muted-foreground text-center">
                Cole a legenda manualmente acima (mín. 40 caracteres) para liberar a geração.
              </p>
            )}
          </div>
        )}

        {preview && (
          <div className="mt-6 bg-card border-2 border-primary p-6 space-y-5">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h2 className="font-display text-xl font-bold flex items-center gap-2">
                <Eye className="h-5 w-5 text-primary" /> Pré-visualização da matéria
              </h2>
              <div className="flex items-center gap-2">
                <ConfidenceBadge level={preview.confidence} reason={preview.confidence_reason} />
                <Button variant="ghost" size="sm" onClick={descartarPreview} disabled={loadingSave}>
                  <RotateCcw className="h-4 w-4 mr-1" /> Descartar
                </Button>
              </div>
            </div>

            {preview.confidence_reason && (
              <p className="text-xs text-muted-foreground -mt-2 italic">
                {preview.confidence_reason}
              </p>
            )}

            {preview.sources_used.length > 0 && (
              <div className="bg-primary/5 border border-primary/30 p-3 rounded">
                <div className="text-xs font-bold uppercase text-primary mb-1">
                  Fonte da informação utilizada
                </div>
                <ul className="text-sm space-y-0.5">
                  {preview.sources_used.map((s) => (
                    <li key={s} className="flex items-center gap-1.5">
                      <CheckCircle2 className="h-3.5 w-3.5 text-primary" /> {s}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-4">
              <div className="sm:w-48 flex-shrink-0">
                <div className="aspect-video sm:aspect-square w-full overflow-hidden bg-muted rounded">
                  {preview.cover_image_url ? (
                    <img
                      src={preview.cover_image_url}
                      alt={preview.title}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                      <ImageOff className="h-8 w-8" />
                    </div>
                  )}
                </div>
                <div className="text-xs text-muted-foreground mt-1 text-center">
                  {preview.image_source === "instagram" && "Imagem do Instagram"}
                  {preview.image_source === "manual" && "Imagem manual"}
                  {preview.image_source === "category" && "Imagem padrão da categoria"}
                  {preview.image_source === "placeholder" && "Placeholder genérico"}
                </div>
              </div>

              <div className="flex-1 min-w-0 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  {preview.category_name && (
                    <div className="inline-block px-2 py-0.5 bg-primary/10 text-primary text-xs font-bold uppercase rounded">
                      {preview.category_name}
                    </div>
                  )}
                  {preview.has_video && (
                    <div className="inline-flex items-center gap-1 px-2 py-0.5 bg-urgent/10 text-urgent text-xs font-bold uppercase rounded">
                      ▶ Vídeo detectado
                    </div>
                  )}
                </div>
                <h3 className="font-display text-2xl font-black leading-tight">{preview.title}</h3>
                {preview.subtitle && (
                  <p className="text-base text-muted-foreground italic">{preview.subtitle}</p>
                )}
              </div>
            </div>

            {preview.lead && (
              <div>
                <div className="text-xs font-semibold uppercase text-muted-foreground mb-1">
                  Lide jornalístico
                </div>
                <p className="text-sm text-foreground bg-primary/5 border-l-2 border-primary p-3 rounded-r leading-relaxed">
                  {preview.lead}
                </p>
              </div>
            )}

            {preview.excerpt && (
              <div>
                <div className="text-xs font-semibold uppercase text-muted-foreground mb-1">
                  Resumo / chamada
                </div>
                <p className="text-sm text-foreground">{preview.excerpt}</p>
              </div>
            )}

            <div>
              <div className="text-xs font-semibold uppercase text-muted-foreground mb-1">
                Corpo da matéria
              </div>
              <div
                className="text-sm text-foreground bg-secondary/40 p-4 rounded leading-relaxed prose prose-sm max-w-none dark:prose-invert"
                dangerouslySetInnerHTML={{ __html: preview.content_html }}
              />
            </div>

            {preview.has_video && (
              <div className="text-xs text-muted-foreground bg-secondary/40 p-3 rounded">
                ⚠ Vídeo/Reel detectado. Transcrição automática do áudio <strong>não disponível</strong>.
                Matéria gerada apenas a partir da legenda, OCR e imagem.
              </div>
            )}

            {qualityIssues.length > 0 && (
              <div className="text-sm bg-destructive/10 border border-destructive/30 text-destructive p-3 rounded space-y-2">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <div>
                    <strong>Problemas de qualidade detectados.</strong> Corrija antes de publicar:
                  </div>
                </div>
                <ul className="list-disc list-inside text-xs space-y-1 ml-6">
                  {qualityIssues.map((q, i) => (
                    <li key={i}>{q}</li>
                  ))}
                </ul>
              </div>
            )}

            {publishBlocked && !qualityFailed && (
              <div className="text-sm bg-destructive/10 border border-destructive/30 text-destructive p-3 rounded flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <div>
                  <strong>Publicação automática bloqueada.</strong> A confiança da IA está baixa.
                  Use "Salvar como rascunho" ou "Editar antes de publicar" para revisar manualmente.
                </div>
              </div>
            )}

            {preview.tags.length > 0 && (
              <div>
                <div className="text-xs font-semibold uppercase text-muted-foreground mb-1">
                  Tags
                </div>
                <div className="flex flex-wrap gap-1">
                  {preview.tags.map((t) => (
                    <span key={t} className="text-xs bg-muted px-2 py-0.5 rounded">
                      #{t}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="grid sm:grid-cols-2 gap-3 pt-2 border-t border-border">
              <div>
                <div className="text-xs font-semibold uppercase text-muted-foreground mb-1">
                  SEO Title
                </div>
                <p className="text-sm text-foreground bg-muted/50 p-2 rounded">
                  {preview.seo_title}{" "}
                  <span className="text-xs text-muted-foreground">({preview.seo_title.length}/70)</span>
                </p>
              </div>
              <div>
                <div className="text-xs font-semibold uppercase text-muted-foreground mb-1">
                  SEO Description
                </div>
                <p className="text-sm text-foreground bg-muted/50 p-2 rounded">
                  {preview.seo_description}{" "}
                  <span className="text-xs text-muted-foreground">({preview.seo_description.length}/160)</span>
                </p>
              </div>
            </div>

            {preview.image_source === "placeholder" && (
              <div className="text-sm text-foreground bg-secondary border border-border p-3 rounded">
                ⚠ Imagem é apenas um <strong>placeholder genérico</strong>. Recomenda-se trocar antes de publicar.
              </div>
            )}
            {preview.image_source === "category" && (
              <div className="text-sm text-foreground bg-accent/30 border border-accent p-3 rounded">
                Imagem usada é a <strong>padrão da categoria</strong> (Instagram não retornou imagem).
              </div>
            )}

            <div className="grid sm:grid-cols-2 gap-3 pt-3 border-t border-border">
              <Button
                variant="outline"
                disabled={loadingSave}
                onClick={() => confirmar({ mode: "draft" })}
                className="w-full"
              >
                {savingMode === "draft" ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Salvando…</>
                ) : (
                  <><FileText className="h-4 w-4 mr-2" /> Salvar como rascunho</>
                )}
              </Button>
              <Button
                variant="outline"
                disabled={loadingSave}
                onClick={() => confirmar({ mode: "edit", thenEdit: true })}
                className="w-full"
              >
                {savingMode === "edit" ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Abrindo…</>
                ) : (
                  <><Pencil className="h-4 w-4 mr-2" /> Editar antes de publicar</>
                )}
              </Button>
              {/* Publicação direta desabilitada — importação sempre cria rascunho para revisão editorial. */}
            </div>

            <Button
              variant="ghost"
              size="sm"
              disabled={loadingSave}
              onClick={() => confirmar({ mode: "ig", alsoIg: true })}
              className="w-full"
            >
              {savingMode === "ig" ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Salvando…</>
              ) : (
                <><Instagram className="h-4 w-4 mr-2" /> Salvar rascunho + gerar arte de Instagram</>
              )}
            </Button>

            <p className="text-xs text-muted-foreground">
              Ao confirmar, a IA é chamada novamente para garantir consistência. Pode haver pequenas variações em relação à pré-visualização.
            </p>
          </div>
        )}

        {result && (
          <div className="mt-6 bg-card border border-border p-6 space-y-3">
            <div className="flex items-center gap-2 text-green-600 font-semibold">
              <CheckCircle2 className="h-5 w-5" />
              {result.published ? "Matéria publicada" : "Rascunho criado"} com sucesso
            </div>
            {result.confidence && (
              <ConfidenceBadge level={result.confidence} />
            )}
            {result.sources_used && result.sources_used.length > 0 && (
              <div className="text-xs text-muted-foreground">
                Fonte: <strong className="text-foreground">{result.sources_used.join(" · ")}</strong>
              </div>
            )}
            {result.ai_used_category && (
              <div className="text-sm text-muted-foreground">
                Categoria sugerida pela IA:{" "}
                <strong className="text-foreground">{result.ai_used_category}</strong>
              </div>
            )}
            {result.image_source === "category" && (
              <div className="text-sm text-foreground bg-accent/30 border border-accent p-3 rounded">
                A imagem do Instagram não foi extraída. Foi aplicada a <strong>imagem padrão da categoria</strong>. Você pode trocá-la no editor.
              </div>
            )}
            {result.instagram_post_id && (
              <div className="text-sm text-foreground bg-accent/30 border border-accent p-3 rounded">
                Rascunho de Instagram criado em paralelo. <Link to="/admin/instagram" className="underline font-semibold">Abrir painel do Instagram</Link>.
              </div>
            )}
            {result.instagram_error && (
              <div className="text-sm text-destructive bg-destructive/10 border border-destructive/30 p-3 rounded">
                Falha ao gerar rascunho de Instagram: {result.instagram_error}
              </div>
            )}
            {result.image_source === "placeholder" && (
              <div className="text-sm text-foreground bg-secondary border border-border p-3 rounded">
                A imagem do Instagram não foi extraída e a categoria não tem imagem padrão. Foi aplicada uma <strong>imagem temporária (placeholder)</strong>. Recomenda-se trocar antes de publicar.
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <Link to={`/admin/posts/${result.post_id}`}>
                <Button>{result.published ? "Editar matéria" : "Editar rascunho"}</Button>
              </Link>
              {result.published && (
                <Link to={`/noticia/${result.slug}`} target="_blank" rel="noreferrer">
                  <Button variant="outline">
                    <ExternalLink className="h-4 w-4 mr-1" /> Ver no site
                  </Button>
                </Link>
              )}
              <Link to="/admin/posts">
                <Button variant="outline">Ir para a lista de posts</Button>
              </Link>
              <a
                href={url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center px-3 py-2 text-sm border border-border rounded-md hover:bg-secondary"
              >
                <ExternalLink className="h-4 w-4 mr-1" /> Ver post original
              </a>
            </div>
          </div>
        )}
      </div>
  );

  return embedded ? inner : <AdminLayout>{inner}</AdminLayout>;
}
