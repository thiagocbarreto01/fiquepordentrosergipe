import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ShieldCheck, ShieldAlert, RefreshCw } from "lucide-react";
import AdminLayout from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface AllowedHost {
  id: string;
  source_id: string;
  hostname: string;
  purpose: "feed" | "article" | "media";
  allow_subdomains: boolean;
  created_at: string;
}

interface PreviewRow {
  source_id: string;
  source_name: string;
  purpose: "feed" | "article" | "media";
  hostname: string;
  occurrences: number;
  already_allowed: boolean;
  is_valid: boolean;
  invalid_reason: string | null;
}

const PURPOSE_LABEL: Record<PreviewRow["purpose"], string> = {
  feed: "Feed",
  article: "Página original",
  media: "Mídia (imagens)",
};

const PURPOSE_COLOR: Record<PreviewRow["purpose"], string> = {
  feed: "bg-blue-100 text-blue-800 border-blue-300",
  article: "bg-emerald-100 text-emerald-800 border-emerald-300",
  media: "bg-amber-100 text-amber-800 border-amber-300",
};

export default function AdminFontesAllowlist() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [allowed, setAllowed] = useState<AllowedHost[]>([]);
  const [preview, setPreview] = useState<PreviewRow[]>([]);
  const [q, setQ] = useState("");

  async function load() {
    setLoading(true);
    try {
      const [{ data: rows, error: e1 }, { data: prev, error: e2 }] = await Promise.all([
        supabase
          .from("news_source_allowed_hosts")
          .select("id, source_id, hostname, purpose, allow_subdomains, created_at")
          .order("hostname"),
        supabase.rpc("preview_allowed_hosts_backfill"),
      ]);
      if (e1) throw e1;
      if (e2) throw e2;
      setAllowed((rows ?? []) as AllowedHost[]);
      setPreview((prev ?? []) as PreviewRow[]);
    } catch (err) {
      toast({
        title: "Erro ao carregar allowlist",
        description: err instanceof Error ? err.message : "Falha desconhecida",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const filteredPreview = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return preview;
    return preview.filter(
      (r) =>
        r.hostname.includes(term) ||
        r.source_name.toLowerCase().includes(term) ||
        r.purpose.includes(term),
    );
  }, [q, preview]);

  const stats = useMemo(() => {
    const total = preview.length;
    const invalid = preview.filter((r) => !r.is_valid).length;
    const missing = preview.filter((r) => r.is_valid && !r.already_allowed).length;
    const covered = preview.filter((r) => r.already_allowed).length;
    return { total, invalid, missing, covered };
  }, [preview]);

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <Button variant="ghost" size="sm" asChild className="mb-2 -ml-2 h-8">
              <Link to="/admin/fontes">
                <ArrowLeft className="h-4 w-4 mr-1" /> Voltar para Fontes
              </Link>
            </Button>
            <h1 className="text-2xl font-bold">Allowlist de hosts</h1>
            <p className="text-sm text-muted-foreground max-w-2xl">
              Infraestrutura da <strong>Fase F3C.1</strong>. Nenhum bloqueio está ativo — a captação
              atual segue funcionando normalmente. Esta tela apenas expõe os hosts já cadastrados
              e a prévia do futuro backfill.
            </p>
          </div>
          <Button variant="outline" onClick={load} disabled={loading} className="min-h-[44px]">
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Recarregar
          </Button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="Registros na allowlist" value={allowed.length} tone="neutral" />
          <StatCard label="Hosts na prévia" value={stats.total} tone="neutral" />
          <StatCard label="Já cobertos" value={stats.covered} tone="ok" />
          <StatCard
            label="Faltando cadastrar"
            value={stats.missing}
            tone={stats.missing > 0 ? "warn" : "ok"}
          />
        </div>

        <Tabs defaultValue="preview" className="space-y-4">
          <TabsList>
            <TabsTrigger value="preview">Prévia do backfill ({stats.total})</TabsTrigger>
            <TabsTrigger value="current">Cadastrados ({allowed.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="preview" className="space-y-3">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Hosts observados nos dados</CardTitle>
                <p className="text-xs text-muted-foreground">
                  Agrupamento por fonte × host × finalidade. Nada é inserido automaticamente.
                  Hosts inválidos ficam destacados e não serão sugeridos pelo backfill.
                </p>
              </CardHeader>
              <CardContent className="space-y-3">
                <Input
                  placeholder="Filtrar por host, fonte ou finalidade…"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  className="max-w-md"
                />

                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Fonte</TableHead>
                        <TableHead>Finalidade</TableHead>
                        <TableHead>Hostname</TableHead>
                        <TableHead className="text-right">Ocorrências</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredPreview.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center text-muted-foreground py-6">
                            {loading ? "Carregando…" : "Nenhum host encontrado."}
                          </TableCell>
                        </TableRow>
                      )}
                      {filteredPreview.map((r) => (
                        <TableRow key={`${r.source_id}-${r.purpose}-${r.hostname}`}>
                          <TableCell className="font-medium">{r.source_name}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={PURPOSE_COLOR[r.purpose]}>
                              {PURPOSE_LABEL[r.purpose]}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-mono text-xs break-all">
                            {r.hostname}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {r.occurrences.toLocaleString("pt-BR")}
                          </TableCell>
                          <TableCell>
                            {!r.is_valid ? (
                              <Badge variant="destructive" className="gap-1">
                                <ShieldAlert className="h-3 w-3" />
                                inválido: {r.invalid_reason}
                              </Badge>
                            ) : r.already_allowed ? (
                              <Badge className="bg-emerald-600 hover:bg-emerald-600 gap-1">
                                <ShieldCheck className="h-3 w-3" /> na allowlist
                              </Badge>
                            ) : (
                              <Badge variant="secondary">a cadastrar</Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="current">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Hosts atualmente na allowlist</CardTitle>
                <p className="text-xs text-muted-foreground">
                  A tabela está vazia por design nesta subfase — nenhum backfill foi executado.
                </p>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Hostname</TableHead>
                        <TableHead>Finalidade</TableHead>
                        <TableHead>Subdomínios</TableHead>
                        <TableHead>Fonte</TableHead>
                        <TableHead>Criado em</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {allowed.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center text-muted-foreground py-6">
                            Nenhum host cadastrado.
                          </TableCell>
                        </TableRow>
                      )}
                      {allowed.map((h) => (
                        <TableRow key={h.id}>
                          <TableCell className="font-mono text-xs">{h.hostname}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={PURPOSE_COLOR[h.purpose]}>
                              {PURPOSE_LABEL[h.purpose]}
                            </Badge>
                          </TableCell>
                          <TableCell>{h.allow_subdomains ? "sim" : "não"}</TableCell>
                          <TableCell className="font-mono text-xs">{h.source_id}</TableCell>
                          <TableCell className="text-xs">
                            {new Date(h.created_at).toLocaleString("pt-BR")}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "ok" | "warn" | "neutral";
}) {
  const toneClass =
    tone === "warn"
      ? "border-amber-300 bg-amber-50 dark:bg-amber-950/20"
      : tone === "ok"
        ? "border-emerald-300 bg-emerald-50 dark:bg-emerald-950/20"
        : "";
  return (
    <Card className={toneClass}>
      <CardContent className="p-4">
        <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
          {label}
        </div>
        <div className="text-2xl font-bold tabular-nums mt-1">{value.toLocaleString("pt-BR")}</div>
      </CardContent>
    </Card>
  );
}
