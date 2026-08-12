# Atualização do Painel Administrativo — Fique Por Dentro Sergipe

Escopo grande. Vou entregar em **fases numeradas**, cada uma testável isoladamente. Só sigo para a próxima após você confirmar.

## Fase 1 — Responsividade do Painel (base para tudo)

- `AdminLayout.tsx`: sidebar vira **Drawer** (`Sheet` do shadcn) em <768px, fecha ao clicar item / ESC / clicar fora / botão X.
- Header sticky com safe-area iPhone (`env(safe-area-inset-top)`), logo alinhada, botão hambúrguer visível só no mobile.
- `body { overflow-x: hidden }` no `index.css`; tabelas ganham wrapper `overflow-x-auto`.
- Grid do Dashboard: 1 col <480px, 2 col <768px, mantém 5 col desktop.
- Editor de post (`AdminPostEditor.tsx`): barra fixa inferior mobile com **Salvar / Visualizar / Publicar** + safe-area-bottom.

## Fase 2 — Tela Fontes (Cards mobile)

- `AdminFontes.tsx`: mantém tabela desktop; abaixo de 768px renderiza **grid de cards** com todos os campos pedidos (Nome, URL, Editorial, Tipo, Frequência, Última atualização, Qtd captada, Status) e 3 botões full-width (Editar / Executar Captação / Excluir).
- Busca full-width, filtros em `<Collapsible>`.

## Fase 3 — Tela Notícias (Cards mobile) + novo fluxo padrão

- `AdminPosts.tsx`: cards mobile com Imagem, Título, Fonte, Categoria, Status, Duplicidade, Data, **Qualidade** (badge nova), ações verticais (Editar, Publicar, Arquivar, Excluir, Compartilhar, Visualizar).
- Filtro inicial ao abrir a tela: `status = captada` **e** `período = hoje` (querystring default).
- Toggle "Ver tudo" para limpar filtros.

## Fase 4 — Fluxo de Captura: CAPTADA por padrão

- `supabase/functions/capture-sources/index.ts`: novas notícias entram como `captada` (hoje entram como `pronta_para_revisao`).
- Sem migração de banco — só muda o valor default no insert. Notícias antigas ficam como estão.

## Fase 5 — Extração completa das matérias

- `capture-sources`: após ler o RSS, faz `fetch` da URL original e extrai o corpo com seletores semânticos (`article`, `main`, `[itemprop=articleBody]`, `.entry-content`, etc.), removendo `nav/footer/aside/script/iframe/.ad/.share/.related/.comments`.
- Fallback para o `content:encoded` do RSS quando a página bloquear.
- Salva HTML estruturado em `posts.content`.

## Fase 6 — Qualidade + Origem + Estatísticas

- Utilitário `src/lib/contentQuality.ts` com `getQuality(html)` → `completo | curto | incompleto` (por nº de caracteres do texto puro).
- Badge `QualityBadge` reutilizável (verde/amarelo/vermelho).
- Barra de stats acima do editor: Caracteres, Palavras, Tempo de leitura, Qualidade, **Origem** (RSS / Página Original / IA / Manual, derivada de `source_id` + metadata), SEO score simples.
- Origem exibida também na página da notícia pública? **Não** — o pedido é do painel; mantenho só no admin para não mexer no SEO/public.

## Fase 7 — Publicação segura

- No botão Publicar do editor: verifica qualidade.
  - Completo → publica.
  - Curto → `AlertDialog` de confirmação.
  - Incompleto → bloqueia com opções: **Recapturar**, **Completar com IA**, **Editar manualmente**.

## Fase 8 — Recaptura assistida (feature flag)

- Flag em `site_settings` (linha `recapture_assisted_enabled`, default `false`, só admin ativa em `AdminConfiguracoes`).
- Nova edge function `recapture-post`: extrai versão nova, retorna preview **sem gravar**.
- Diálogo compara caracteres/qualidade/parágrafos adicionados|removidos, com botões **Manter atual / Substituir / Copiar para edição**. Backup do conteúdo em `posts.previous_content` (coluna nova via migração).

## Fase 9 — IA para completar matérias

- Nova edge function `complete-post-ai` usando Lovable AI (`google/gemini-2.5-flash`), prompt restritivo (não inventa fatos/números/datas/cargos/falas — só melhora redação, cria intro/fechamento, transições, SEO, com base no texto existente).
- Preview no editor antes de aplicar.

## Fase 10 — Auditoria final

Relatório com arquivos alterados, migrações, riscos e checklist dos ✓ pedidos.

## Detalhes técnicos

**Migrações** (apenas o mínimo necessário):
- `posts.previous_content text` (backup para recaptura).
- `site_settings` já existe — apenas insert de linha `recapture_assisted_enabled`.

**Sem alterações em**: URLs públicas, SEO público, categorias, autoria, imagens/backfill, RSS parser (só adição de extração de página), Auto Sync, sistema de duplicidade.

**Compatibilidade**: tudo testado em 390px e desktop; `useIsMobile()` já existe.

**Risco principal**: extração de página original pode falhar em sites com bloqueio anti-bot → fallback garantido para conteúdo do RSS mantém comportamento atual.

---

**Confirma o plano?** Se sim, começo pela **Fase 1 (responsividade)** e paro para você validar antes de seguir. Se quiser reordenar (ex: começar pela Fase 4 que é a mudança de comportamento mais visível), me diga.
