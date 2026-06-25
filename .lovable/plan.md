## Objetivo
Transformar a Home do "Fique por Dentro Sergipe" em um portal editorial nível G1, com motor de priorização, seções fixas, sidebar enriquecida, fallback resiliente e melhor performance/responsividade. Mantém-se a camada de dados atual (Supabase `posts_public` + `categories`), apenas reorganizando frontend + lógica editorial.

---

## 1. Motor Editorial (`src/lib/editorialEngine.ts` — novo)
- Função `pickManchete(posts)` com score:
  - Peso de categoria: Polícia 5 · Política 4 · Brasil 3 · Sergipe/Aracaju 3 · Economia 2 · demais 1
  - Recência: bônus decrescente por hora (até 48h)
  - Palavras-chave de impacto: `morte, acidente, governo, crime, prisão, operação, eleição, escândalo, denúncia, tragédia` → +N
  - Flags editoriais: `is_main_featured` (+10), `is_urgent` (+8), `is_evergreen` baixa prioridade
- `pickSecundarias(posts, manchete, n)` — mesma categoria ou últimas 24h, dedup
- `pickTrending(posts, n)` — por `views` (fallback recência)
- `normalizePost(post)` — garante `title, summary, image, category, date, source`; categoria fallback = "Geral"
- Substitui (ou complementa) o atual `buildHomeLayout`

## 2. Proteção do Sistema (`src/components/site/SectionBoundary.tsx` — novo)
- ErrorBoundary leve por seção + skeleton + mensagem "Sem notícias no momento"
- Envolver cada bloco da home (hero, sidebar, cada categoria)
- `useEffect` da home já usa `safe()` — manter e estender (cada categoria também isolada em try/catch)

## 3. Estrutura da Home (`src/pages/Index.tsx` — refatorado)
Layout fixo, em ordem:
```text
┌────────────────────────────────────────────┬──────────────┐
│ HERO (manchete grande)  │  3 destaques sec │   SIDEBAR    │
├──────────────────────────┴──────────────────┤   • Mais     │
│ Faixa "Últimas Notícias" (chips horizontais)│     Lidas    │
├─────────────────────────────────────────────┤   • Últimas  │
│ SEÇÃO Sergipe   │  SEÇÃO Aracaju            │   • Tempo    │
├─────────────────────────────────────────────┤     (Aracaju)│
│ SEÇÃO Polícia   │  SEÇÃO Política           │   • Banner   │
├─────────────────────────────────────────────┤     Lateral  │
│ SEÇÃO Brasil    │  SEÇÃO Mundo              │              │
├─────────────────────────────────────────────┤              │
│ SEÇÃO Economia  │  SEÇÃO Esportes           │              │
├─────────────────────────────────────────────┤              │
│ SEÇÃO Entretenimento (full width)           │              │
└─────────────────────────────────────────────┴──────────────┘
```
- Cada seção: cabeçalho colorido + 1 card grande + 3 thumbs
- Componente reutilizável `EditorialSection` em `src/components/site/EditorialSection.tsx`

## 4. Novas Categorias / Dados
- Verificar `categories`: criar `brasil`, `mundo`, `economia`, `entretenimento` se faltarem (migration somente se ausentes)
- `getNoticiasByCategory(slug, n)` já existe — usar para todas
- `normalizePost` garante `category = "Geral"` quando ausente

## 5. Sidebar (`src/components/site/HomeSidebar.tsx` — novo)
- Mais Lidas (top 5 por views, 7d, fallback 90d)
- Últimas Notícias (top 5 cronológico)
- **Previsão do Tempo Aracaju**: widget client-side via Open-Meteo (sem chave) — `https://api.open-meteo.com/v1/forecast?latitude=-10.91&longitude=-37.07&current_weather=true&timezone=America/Fortaleza`
- AdSlot `lateral`
- Banner de Denúncia (componente atual)

## 6. Performance
- `React.lazy` + `Suspense` para seções abaixo da dobra (Brasil, Mundo, Economia, Esportes, Entretenimento, Vídeos, Denúncias)
- Cache em memória (`Map<string, {data, ts}>`) em `lib/noticias.ts` com TTL 60s para `getNoticiasByCategory`, `getMostReadNoticias`
- `loading="lazy"` já presente em `SmartImage` — manter
- Pré-carregar só imagem da manchete (`<link rel="preload">` já em index.html não — adicionar via React dinâmico apenas para manchete)

## 7. Responsividade
- Desktop ≥ lg: grid 3 colunas (conteúdo 2 / sidebar 1), seções em 2 colunas
- Tablet md: 2 colunas conteúdo, sidebar abaixo
- Mobile: 1 coluna, cards empilhados, hamburger já existe em `SiteHeader`
- Sidebar sticky só em ≥ lg

## 8. Arquivos a criar / modificar
**Criar**
- `src/lib/editorialEngine.ts`
- `src/components/site/SectionBoundary.tsx`
- `src/components/site/EditorialSection.tsx`
- `src/components/site/HomeSidebar.tsx`
- `src/components/site/WeatherWidget.tsx`

**Modificar**
- `src/pages/Index.tsx` (refator completo da home, mantém SiteLayout e SiteHeader)
- `src/lib/noticias.ts` (cache TTL leve)
- `src/lib/homeSlots.ts` (delegar score ao novo `editorialEngine`)

**Não tocar**
- Header, Footer, rotas, painel admin, edge functions, schema do banco (exceto categorias se faltarem)

## 9. Verificação
- Build TS
- Playwright: abrir `/`, screenshot mobile + desktop, confirmar seções renderizadas e fallback quando categoria vazia
- Console: validar logs do motor editorial (score da manchete)

---

## Fora do escopo
- Mudanças no admin / fluxo de publicação
- Novos endpoints/edge functions
- Sistema real de tracking de "trending" por sessão (usa `views` já existente)
- Redesign do header (já alinhado em iteração anterior)
