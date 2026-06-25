## Objetivo
Elevar o portal ao "G1 PRO": ranking ponderado, breaking news em tempo real, trending por engajamento, SEO estruturado, override editorial, cache em camadas e resiliência total. Reaproveita o que já existe (`editorialEngine`, `SectionBoundary`, `home_audit`, `posts_public`).

---

## 1. Ranking Engine v2 — `src/lib/editorialEngine.ts` (refactor)
Fórmula normalizada (0–1) em cada eixo, depois pesada:
```
finalScore = recency*0.35 + categoryWeight*0.25 + engagement*0.25 + entityImpact*0.15
```
- **recency**: `exp(-ageHours/24)` (queda exponencial; 0h=1, 24h≈0.37, 72h≈0.05)
- **categoryWeight**: tabela de pesos (Polícia 1.0 · Política 0.9 · Brasil 0.75 · Sergipe/Aracaju 0.7 · Mundo/Economia 0.55 · Saúde/Educação 0.45 · Esportes 0.35 · Entretenimento 0.25 · default 0.3)
- **engagement**: log-normalizado de `views` (`log10(views+1)/log10(maxViews+1)`)
- **entityImpact**: detector de entidades (polícia, governo, acidente, morte, eleição, prisão, operação, denúncia, escândalo, crime, tragédia, ministro, prefeito, governador, STF) → contagem normalizada
- **Boosts**: `is_urgent` +0.5 (após o cap), `is_main_featured` +0.3, `is_evergreen` recency=0.4 fixo
- Expor: `rankPosts(posts)`, `pickManchete`, `pickSecundarias`, `pickTrending(posts, n)`, `pickBreaking(posts)` (urgentes da última hora ordenadas por recência)
- Mantém wrappers atuais (`pickLatest`, `normalizePost`) para não quebrar `Index.tsx`.

## 2. Editorial Override — `applyManualOverride()`
- Lê `getManualHomePosts()` (já existe via `home_audit`) — se houver `manchete` manual, ela vence o ranking.
- Idem para `destaque_lateral_1/2/3` (secundárias).
- Integrado no `Index.tsx` antes do render do hero.

## 3. Breaking News System — `BreakingBar` (substitui `PlantaoBar` no header)
- Componente novo `src/components/site/BreakingBar.tsx` (mantém visual atual do `PlantaoBar`).
- Refetch a cada **45s** + revalida no `visibilitychange`.
- Fonte: `pickBreaking()` sobre `posts_public` com `is_urgent=true` OR publicada nas últimas 60 min (limit 10).
- Esconde se vazio. Marquee preservado.
- `SiteHeader` passa a importar `BreakingBar`.

## 4. Trending Engine — `src/lib/trending.ts`
- "Mais Lidas" passa a usar **engagement score**: combina `views` + crescimento (delta de views nas últimas N horas, aproximado pelo `published_at` recente como bônus) + bônus por `is_urgent`.
- Como não há tabela de cliques granulares, usamos `views` (já incrementado em `increment_post_views`) + janela 24h. Documentado como heurística.
- Função: `rankTrending(posts, {windowHours: 24})`, fallback 7d se vazio.
- Atualização real-time: refetch a cada 30s + canal `subscribeToNoticiasFeed` (já existe).

## 5. SEO Engine — Per-page meta com `react-helmet-async`
- `bun add react-helmet-async`
- Adicionar `<HelmetProvider>` em `src/main.tsx`.
- Em `NoticiaPage.tsx`: bloco `<Helmet>` com title (`meta_title || title`), description, canonical (`/noticia/{slug}`), `og:title|description|image|url|type=article`, `twitter:card=summary_large_image`, JSON-LD `NewsArticle` (headline, datePublished, dateModified, author, image, publisher, mainEntityOfPage).
- Remover canonical estático do `index.html` (cada rota cuida do seu).
- Slug já é amigável e usado na rota.

## 6. Cache System — `src/lib/cache.ts`
- Helper `withCache(key, ttlMs, loader)` em memória (`Map`), com:
  - **TTLs**: breaking=10s · trending=30s · home=90s · category=120s
  - **stale-while-error**: se loader rejeitar e existir cache (mesmo expirado), devolve stale e loga aviso
  - **Persistência leve**: snapshot do último resultado em `sessionStorage` (`fpd:cache:<key>`) para recuperar render se API falhar no F5
- `lib/noticias.ts` atualizado para usar `withCache` em `getNoticiasByCategory`, `getMostReadNoticias`, `getPublishedNoticias` (substitui o cache TTL atual).
- Edge cases: chave inclui params; cache invalidado no callback do realtime (`subscribeToNoticiasFeed` → `cache.clear()`).

## 7. Resiliência
- Todas as seções já estão em `SectionBoundary` — manter.
- Adicionar `try/catch` global em `Index.tsx` `load()` (já existe via `safe()`).
- `cache.ts` garante render se API cair (stale snapshot).
- `BreakingBar` retorna `null` em erro.

## 8. Verificação
- `tsgo --noEmit`
- Playwright: home + 1 artigo, screenshots, sem erros no console, verifica `<script type="application/ld+json">` na NoticiaPage.

---

## Arquivos
**Novos**
- `src/lib/cache.ts`
- `src/lib/trending.ts`
- `src/components/site/BreakingBar.tsx`

**Refator**
- `src/lib/editorialEngine.ts` (fórmula 0.35/0.25/0.25/0.15, pickBreaking, applyManualOverride)
- `src/lib/noticias.ts` (usa withCache)
- `src/pages/Index.tsx` (override manual + breaking + trending real)
- `src/pages/NoticiaPage.tsx` (Helmet + JSON-LD)
- `src/main.tsx` (HelmetProvider)
- `src/components/site/SiteHeader.tsx` (BreakingBar)
- `index.html` (remove canonical fixo)

**Intocado**
- Schema do banco, admin, edge functions, demais páginas.

## Fora do escopo
- Tracking real de cliques/tempo de leitura (exigiria tabela `post_events` + cron). Usamos `views` como proxy de engagement e documentamos.
- SSR para social crawlers (limitação conhecida do Helmet client-side).