# G1 PRO MAX — Plano de Upgrade

Arquitetura jornalística baseada em **eventos** (clusters de notícias relacionadas), com IA editorial, breaking automático, scoring v2, failsafe total, auto-sync de espelho e SEO de portal.

---

## 1. Banco de dados (migration)

Novas estruturas em `public`:

- `news_events` — cluster editorial
  - `id uuid pk`, `slug text unique`, `title text`, `summary text`
  - `category_id uuid`, `entities text[]`, `keywords text[]`
  - `impact_score numeric` (0–100), `is_breaking bool`, `breaking_until timestamptz`
  - `first_seen_at`, `last_updated_at`, `post_count int`
- `posts.event_id uuid` (FK → news_events) + `posts_public.event_id`
- `posts.ai_seo_title text`, `posts.ai_summary text`, `posts.ai_clickbait_score numeric`, `posts.ai_suggested_category uuid`
- `sync_audit_log` — `id, event_type, post_id, status, error, created_at` (drift/retry/log)
- RPCs:
  - `cluster_post_into_event(_post_id uuid)` — calcula similaridade (trigram em título+tags+entities) e atribui `event_id` (cria novo se nenhum match ≥ 0.55)
  - `detect_breaking_events()` — marca `is_breaking=true` em eventos com `impact_score ≥ 80` nas últimas 2h, define `breaking_until = now()+90min`
  - `expire_breaking_events()` — limpa `is_breaking` quando `breaking_until < now()`
  - `audit_posts_public_drift()` — retorna ids divergentes
  - `auto_repair_posts_public()` — corrige drift + grava em `sync_audit_log`
- Trigger `posts AFTER INSERT/UPDATE` → chama `cluster_post_into_event` + atualiza `news_events.last_updated_at`/`post_count`.
- GRANTs em todas as novas tabelas; RLS: leitura pública de `news_events`, escrita restrita a staff.

---

## 2. Edge Function `editorial-ai`

Nova função Supabase (`supabase/functions/editorial-ai/index.ts`) usando **Lovable AI Gateway** (`google/gemini-3-flash-preview`):

- Input: `{ post_id }`
- Ações sequenciais com `Output.object` (Zod):
  - SEO title (≤ 60 chars, sem clickbait)
  - Summary jornalístico (2–3 frases, lead invertido)
  - Clickbait score (0–1)
  - Categoria sugerida (id entre categorias existentes)
  - Entidades extraídas (pessoas/lugares/orgs)
- Persiste em `posts.ai_*` + atualiza `entities` do evento.
- Trigger automático: chamada via `secure-publish-trigger` ao publicar.

---

## 3. Impact Scoring v2 (frontend)

Refatorar `src/lib/editorialEngine.ts`:

```
finalScore = 0.30·recency + 0.25·engagement + 0.25·entityImpact + 0.20·eventImportance
```

- `eventImportance` = `news_events.impact_score` normalizado + bonus se `is_breaking`.
- `entityImpact` reusa keywords + entidades extraídas pela IA.
- Mantém override manual de `home_audit`.

---

## 4. Failsafe System

Novo módulo `src/lib/failsafe.ts`:

1. Tenta fetch normal (`posts_public` + cache de memória).
2. Em erro → cache `sessionStorage` (`lkg:home`).
3. Em erro → `localStorage` snapshot persistente (last known good).
4. Em erro total → placeholder estático mínimo (3 cards genéricos) — nunca tela vazia.
5. Toda render bem-sucedida grava o snapshot.

Aplicado em `Index.tsx`, `CategoriaPage`, `UltimasPage`.

---

## 5. Auto-Sync Engine

- Hook `useAutoSync` em `AdminLayout` que a cada 60s chama `audit_posts_public_drift`; se houver drift, dispara `auto_repair_posts_public()` e mostra toast com contagem.
- Edge function `sync-watchdog` agendada (cron 5 min) faz o mesmo no servidor.
- Página `/admin/sync` mostra `sync_audit_log` (últimos 50 eventos).

---

## 6. Breaking News Engine

- `BreakingBar` consulta `news_events where is_breaking=true order by impact_score desc limit 1`.
- Quando ativo: substitui manchete em `PortalHero` por evento breaking (post mais recente do cluster) com badge "URGENTE".
- Expira automaticamente via `expire_breaking_events()` (rodado no fetch).

---

## 7. SEO Engine

Em `NoticiaPage.tsx`:

- URL canônica `/{categoria}/{slug}`.
- `<Helmet>`: title = `ai_seo_title || title`, description = `ai_summary || excerpt`, JSON-LD `NewsArticle` completo (headline, datePublished, author, image, articleSection, keywords).
- **Internal linking**: bloco "Mais sobre este assunto" listando outros posts do mesmo `event_id`.
- Slug normalizado server-side (trigger já existente; garantir unicidade).

---

## 8. Home Structure (Index.tsx)

Ordem fixa:

1. `BreakingBar` (auto)
2. `PortalHero` — manchete por evento + 2 secundárias do mesmo cluster
3. Faixa "3 Destaques" (próximos eventos por impact_score)
4. Grid editorial por categoria (existente, agora alimentado por scoring v2)
5. Sidebar: Trending por evento (eventos com mais posts em 24h) + Mais Lidas (views reais de `posts_public`)

---

## Detalhes técnicos

- Migrations idempotentes (`IF NOT EXISTS`).
- Realtime: subscribe em `news_events` além de `posts`.
- Cache: `src/lib/cache.ts` ganha namespace `events:*` com TTL 60s.
- Backfill: script SQL roda `cluster_post_into_event` para todos os posts publicados existentes.
- IA: chamada apenas em publicação (não em rascunho) para economizar créditos; fallback silencioso se 402/429.
- Sem mudanças em `src/integrations/supabase/client.ts` e secrets existentes.

---

## Ordem de execução

1. Migration (tabelas, colunas, RPCs, triggers, GRANTs, RLS)
2. Backfill de clusters
3. Edge function `editorial-ai` + integração no `secure-publish-trigger`
4. Edge function `sync-watchdog` + cron
5. Frontend: `failsafe.ts`, `editorialEngine.ts` v2, `BreakingBar`, `PortalHero`, `Index.tsx`, `NoticiaPage.tsx`, `useAutoSync`
6. Página `/admin/sync`
7. Validação: home, breaking, evento com 2+ posts, drift forçado

Confirma para eu executar?