# Fique Por Dentro Sergipe

Portal de notícias — SPA React + Vite hospedada no Lovable, backend Lovable Cloud.

## Open Graph / prévia de compartilhamento

Cada rota `/noticia/:slug` define suas próprias tags via `react-helmet-async`
em `src/pages/NoticiaPage.tsx`:

- `title`, `meta description`, `canonical`
- `og:type=article`, `og:title`, `og:description`, `og:image`, `og:url`, `og:site_name`
- `twitter:card=summary_large_image`, `twitter:title`, `twitter:description`, `twitter:image`
- JSON-LD `NewsArticle`

A imagem usada é sempre a capa real da matéria (`manual_image_url` ou
`cover_image_url`), normalizada para URL absoluta HTTPS. `og-default.jpg`
só entra como fallback quando a matéria realmente não tem imagem.

### Limitação conhecida (SPA sem SSR)

O hosting Lovable serve `index.html` estático para todas as rotas. Crawlers
que **executam JavaScript** (Googlebot moderno, Twitter/X) leem as tags
dinâmicas do Helmet corretamente. Crawlers que **não executam JS**
(WhatsApp, Facebook, Telegram, LinkedIn, Discord) veem apenas o
`index.html` bruto — não veem título/imagem por notícia.

Para atender esses crawlers seriam necessárias uma das opções abaixo,
todas fora do escopo atual do projeto:

- SSR na página de notícia (migrar Vite SPA → framework com SSR); ou
- Um proxy no caminho da requisição que detecte o User-Agent do crawler
  e devolva HTML pré-renderizado com as tags corretas.

### Edge Function `share-preview`

`supabase/functions/share-preview/index.ts` continua deployada e gera o
HTML com Open Graph pronto por slug (`?slug=<slug>`). Ela é independente
de qualquer proxy — fica disponível caso, no futuro, se opte por uma
solução de rewrite/prerender no hosting.
