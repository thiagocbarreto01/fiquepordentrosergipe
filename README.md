# Fique Por Dentro Sergipe

## Open Graph dinâmico para notícias

Para Facebook, WhatsApp e outros crawlers, use o Worker `cloudflare-og-worker.js` no Cloudflare com a rota:

```txt
www.fiquepordentrosergipe.com.br/noticia/*
```

Configure a variável de ambiente do Worker:

```txt
SHARE_PREVIEW_FUNCTION_URL=<endpoint da função share-preview>
```

Fluxo esperado:

- Leitores continuam abrindo `https://www.fiquepordentrosergipe.com.br/noticia/<slug>` normalmente.
- Crawlers recebem HTML da função `share-preview` com `og:type=article`, `og:url` e `canonical` apontando para a URL pública da notícia.
- `og:image` usa a imagem manual/capa da própria matéria; se não houver imagem própria, usa `/og-default.jpg`.
