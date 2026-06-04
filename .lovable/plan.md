# Fase 1 — FIQUE POR DENTRO SERGIPE

## 1. Inventário do projeto herdado (Fique Por Dentro Sergipe)

### Rotas públicas (src/App.tsx)
- `/` Home, `/ultimas`, `/busca`, `/categoria/:slug`, `/noticia/:slug`
- `/denuncias/enviar`, `/auth`

### Rotas admin (todas com RequireAuth)
- `/admin` dashboard, `/admin/posts` (lista + novo + editor), `/admin/revisao`
- `/admin/categorias`, `/admin/banners`, `/admin/denuncias`
- `/admin/fontes`, `/admin/instagram`, `/admin/importar-instagram`
- `/admin/usuarios`, `/admin/home`

### Edge functions (supabase/functions)
- `capture-sources` (captação automática / RSS)
- `analyze-relevance`, `reclassify-categories`
- `rewrite-post` (IA jornalística / reescrita)
- `generate-instagram-draft`, `generate-instagram-headline`, `publish-instagram`, `backfill-instagram-drafts`
- `import-instagram-post`, `import-image-to-storage`, `backfill-images`
- `cms-api`, `noticias`, `secure-publish-trigger`

### Tabelas no banco (15)
posts, posts_public, categories, news_sources, banners, denuncias, instagram_posts, profiles, user_roles, post_status_history, duplicate_decisions, home_audit, financial_* (3 — herdadas, sem uso visível no app).

### Estado atual dos dados
- `categories`: **0 linhas** (vazio)
- `news_sources`: **0 linhas** (vazio)
- Ou seja: precisa popular categorias novas e fontes de captação.

## 2. O que será REAPROVEITADO (sem alteração)

- Toda a camada de dados (schema, RLS, functions SECURITY DEFINER já blindadas).
- Todas as edge functions (captação, IA, Instagram 4:5, publish-trigger).
- Workflow editorial completo: status, histórico, duplicatas, auto-arquivamento.
- Dashboard, editor, banners, denúncias, fontes, usuários, controle home.
- PWA (manifest + sw.js), SEO base, JSON-LD, AdSlot.
- Hooks (useAuth), helpers (homeSlots, news, postImage, statusFlow).

## 3. O que será RENOMEADO / SUBSTITUÍDO (Fase 1)

### Identidade textual
- `index.html`: title, description, og:*, twitter:*, canonical, JSON-LD `name` e `url`, apple-mobile-web-app-title, keywords.
- `public/manifest.webmanifest`: name, short_name, description.
- `public/news-placeholder.svg`: "FIQUE POR DENTRO SERGIPE" → "FIQUE POR DENTRO SERGIPE" + subtítulo.
- `src/components/site/SiteHeader.tsx`: logo alt, label de aria, link Instagram (se trocar).
- `src/components/site/SiteFooter.tsx`: nome, descrição, redes sociais, e-mail.
- Strings espalhadas em: `Index`, `UltimasPage`, `NoticiaPage`, `CategoriaPage`, `BuscaPage`, `AuthPage`, `EnviarDenunciaPage`, `AdminDashboard`, `AdminInstagram`, `AdminPosts`, `AdminLayout`, `PwaInstallButton`, `NewsCards`, `ImageActionButtons`, `lib/postImage.ts`.

### Visual
- `src/index.css`: tokens HSL (paleta nova — definida pela escolha de design).
- `src/assets/logo-fique-por-dentro.*`: substituir por novo logo (manter nome do arquivo OU renomear + atualizar imports).

### Navegação (SiteHeader NAV)
Substituir lista atual pelas 12 categorias pedidas:
Polícia, Política, Sergipe, Aracaju, Interior, Brasil, Mundo, Economia, Saúde, Educação, Esportes, Entretenimento.

## 4. O que EXIGE nova configuração

### Dados (migration única, mínima)
- Inserir as 12 categorias em `public.categories` com slug correto. Nenhuma alteração de schema.
- Fontes (`news_sources`): vazio hoje. Cadastro fica para Fase 2 (ou via UI `/admin/fontes`).

### Assets a gerar
- Novo logo "FIQUE POR DENTRO SERGIPE" (PNG transparente).
- Novo favicon + apple-touch-icon + icon-192 + icon-512 (PWA).
- Nova og-image (opcional — só se útil).
- Novo `news-placeholder.svg` com nova marca.

### Segredos / integrações externas
Nada novo. Já existem: LOVABLE_API_KEY (IA), CMS_API_KEY, bucket `media`.
Trocar handle do Instagram (`barretao__news`) pelo novo @ — usuário precisa informar.

## 5. Dependências externas em uso
- Supabase (Lovable Cloud) — auth, db, storage, edge functions, pg_net, pg_trgm.
- Lovable AI Gateway (LOVABLE_API_KEY) — análise de relevância, reescrita, Instagram.
- Instagram (publish-instagram) — credenciais ainda dependentes de configuração do usuário.

## 6. Fontes de captação existentes
Zero cadastradas. A infraestrutura (`capture-sources`, tabela `news_sources`, página `/admin/fontes`) está pronta. O usuário cadastra as URLs RSS / sites de origem na UI; nada a fazer em código nesta fase.

---

## Plano de execução da Fase 1

Antes de implementar, preciso de 1 decisão visual (paleta + tipografia + layout) e o handle correto do Instagram. Vou perguntar logo a seguir.

Depois da escolha, executo nesta ordem:

1. **Identidade textual global** — `index.html`, `manifest.webmanifest`, JSON-LD, SEO meta, og:*.
2. **Tokens de design** — reescrever paleta em `src/index.css` (HSL) conforme escolha.
3. **Logo + favicon + PWA icons + placeholder SVG** — gerar e substituir arquivos em `src/assets/` e `public/`.
4. **Header / Footer** — atualizar marca, nav (12 categorias novas), redes sociais.
5. **Strings institucionais** — varrer todas as ocorrências de "Fique Por Dentro Sergipe"/"barretao" nas páginas e componentes e substituir.
6. **Categorias no banco** — migration inserindo as 12 categorias com slugs.
7. **QA visual** — abrir Home, uma Categoria, uma Notícia, Enviar Denúncia, Dashboard admin no mobile e desktop.

Nada de schema novo, nada removido, nada de mexer em segurança ou edge functions.

```text
Inventory  →  Ask design  →  Tokens+Logo  →  Header/Footer  →  Strings  →  Categories migration  →  QA
```
