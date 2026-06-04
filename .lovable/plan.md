## Sistema Inteligente de Detecção de Duplicadas

### Situação atual
- A função `capture-sources` já chama o RPC `find_duplicate_post` (que retorna `similarity` e `match_reason`), mas o resultado é binário: ou marca como `duplicada` ou ignora. O score de similaridade é descartado.
- Já existe o campo `posts.duplicate_of` e o status `duplicada`.
- Não existe registro de decisões nem nível "similar" intermediário.

### Plano

#### 1. Banco de dados (migração)
- Adicionar em `posts`:
  - `similarity_score` (real, 0–1)
  - `similar_to` (uuid, FK lógica para `posts.id` — usado quando similaridade fica em 71–90%, ainda não é duplicada)
  - `duplicate_match_reason` (text — `slug_exato`, `fonte_igual`, `titulo_semelhante`)
- Nova tabela `duplicate_decisions` (id, post_id, decided_by, decision `manter|mesclar|marcar_duplicada`, reference_post_id, note, created_at) com RLS (staff lê, staff insere).

#### 2. Captação (`supabase/functions/capture-sources/index.ts`)
- Salvar sempre `similarity_score`, `duplicate_match_reason` e referência ao melhor match.
- Classificação automática no insert:
  - `≥ 0.91` → status `duplicada`, preencher `duplicate_of` (comportamento atual)
  - `0.71 – 0.90` → status `em_revisao`, preencher apenas `similar_to` (NÃO bloqueia)
  - `< 0.71` → status `em_revisao`, sem referência

#### 3. Tipos & helpers
- `src/lib/duplicates.ts` — helper `classifyDuplicate(score)` retornando `{ tier: "nova"|"similar"|"duplicada", label, color, pct }`.

#### 4. Lista de Captadas (`AdminPosts.tsx`)
- Buscar também `similarity_score, similar_to, duplicate_of, duplicate_match_reason` + join no post referenciado (`title, published_at, slug`).
- Adicionar coluna/badge "Duplicidade" com cor por tier (verde/amarelo/vermelho) e tooltip mostrando:
  - "Possível duplicada de: [Título]"
  - "Publicada em: [Data]"
  - "Similaridade: XX%"
- Novo filtro de duplicidade (Todas | Apenas novas | Apenas similares | Apenas duplicadas) aplicado no client após o fetch.
- Ações na linha quando há referência:
  - **Manter** (registra decisão `manter`, limpa `similar_to`/`duplicate_of`, mantém status atual)
  - **Mesclar** (abre o editor do post de referência em nova aba e marca este como `duplicada`)
  - **Marcar como duplicada** (registra decisão e seta status `duplicada` + `duplicate_of`)

#### 5. Dashboard (`AdminDashboard.tsx`)
- Novo card "Duplicadas evitadas hoje" = contagem de posts criados hoje com status `duplicada` OU decisões `mesclar`/`marcar_duplicada` registradas hoje.

#### 6. Histórico
- Toda ação editorial sobre duplicidade insere linha em `duplicate_decisions`.
- Mini-painel "Últimas decisões" no editor (`AdminPostEditor.tsx`), só quando o post tem similar/duplicado.

### Detalhes técnicos
- O RPC `find_duplicate_post` já retorna `similarity` — usaremos o valor diretamente; para matches por slug/fonte forçamos `1.0`.
- Filtros de duplicidade ficam no client (a tabela é pequena após o filtro de status); evita SQL complexo.
- Sem alteração de RLS de `posts`. Nova tabela usa as mesmas regras (staff lê/insere via `is_staff`).
- Nenhuma exclusão automática (regra 7).

### O que não muda
- Layout do site público.
- Fluxo editorial existente (`captada → em_revisao → aprovada → publicada`).
- Lógica de reescrita por IA, imagens, vídeos, fontes.