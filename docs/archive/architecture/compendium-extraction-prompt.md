# Prompt de extração de compêndio HTML → JSON (Google AI Studio)

Reconstruído em 2026-09-05 a partir das interfaces TypeScript de
`scripts/load-pilot-cardiologia.ts` (schema `PilotCompendium` e afins,
~linhas 202-239) cruzadas com o JSON de exemplo real
`_pilot-cardiologia.json.txt`. O texto literal do prompt original usado
para o piloto de Cardiologia (2 compêndios) não foi encontrado em nenhum
arquivo do repositório — provavelmente só existiu na UI do AI Studio,
nunca salvo. Este documento existe para não perder essa reconstrução de
novo.

## Achados importantes ao reconstruir

1. **O prefixo "Termo:" em `key_takeaways` é uma transformação do SCRIPT
   DE CARGA**, não do formato de saída do AI Studio. O script funde
   `glossary_terms` + `key_takeaways` na mesma coluna do banco
   (`material_sections.key_takeaways text[]`, sem coluna dedicada a
   glossário) e adiciona o prefixo nesse momento. O prompt abaixo pede
   `glossary_terms` como campo **separado**, sem prefixo — não peça ao
   AI Studio para já prefixar, isso duplicaria a transformação.
2. **Compêndios diferentes usam vocabulários HTML/CSS totalmente
   diferentes entre si** (ex.: o de Tumores do SNC usa
   `.term`/`.kbox`/`.tip`; o de Hipertensão-SRAA usa
   `.callout`/`.diagram`/`.connections-box`). O prompt é deliberadamente
   agnóstico a classes CSS específicas — extrai por significado
   semântico (definição, destaque, diagrama, tabela), não por seletor.

## Schema de saída (TypeScript, fonte da verdade — não diverge de `scripts/load-pilot-cardiologia.ts`)

```typescript
interface PilotGlossaryTerm {
  term: string;
  translation_or_definition: string;
}

interface PilotImage {
  external_url: string;
  alt_text: string | null;
  caption: string | null;
  license_or_rights: string | null;
  source_note: string | null;
}

interface PilotSection {
  title: string;
  level: number; // 2 para <h2>, 3 para <h3>
  content_html: string;
  key_takeaways: string[] | null;
  glossary_terms?: PilotGlossaryTerm[] | null;
  images?: PilotImage[] | null;
}

interface PilotReference {
  raw_citation_text: string;
}

interface PilotCompendium {
  title: string;
  subtitle: string | null;
  discipline_hint: string;
  theme_hint: string;
  estimated_read_time_minutes: number | null;
  tags: string[];
  dependencies: string[];
  sections: PilotSection[];
  references: PilotReference[];
  _unmapped?: string[];
}
```

Saída final: array de `PilotCompendium` (`[ { ... } ]`), mesmo com 1 elemento.

## Como preparar o próximo prompt (passo a passo repetível)

1. Ler o HTML do compêndio (`Read` na sessão de controle, ou abrir manualmente).
2. Descartar `<style>...</style>`, `<script>...</script>` e a sidebar de navegação (`<nav id="sidebar">` ou equivalente) — não carregam conteúdo semântico, só custam tokens.
3. Manter o `<div class="content">` (ou equivalente) inteiro: `<h1>`, subtítulo, e todas as `<section>` com seus headings/parágrafos/tabelas/figuras/referências.
4. Montar o prompt: texto de regras abaixo (reutilizável palavra por palavra) + `## HTML do compêndio a extrair` com o HTML limpo do passo 3.
5. Usuário cola no Google AI Studio (chat comum, não modo "Build" — a IA lá não tem acesso ao sistema de arquivos).
6. Usuário salva o resultado e devolve pra sessão de controle validar antes de rodar `load-pilot-cardiologia.ts`-equivalente (o script do piloto é hoje específico de Cardiologia; extrair um script genérico de carga é trabalho futuro quando o padrão escalar para mais compêndios).

## Texto do prompt (regras — reutilizável)

Você vai extrair o conteúdo de um compêndio médico em HTML para um formato JSON estruturado, usado para popular um banco de dados educacional (Supabase). Isso faz parte de um pipeline já validado — siga o formato exatamente.

### Regras de extração

1. **`sections`**: cada `<section>` (ou bloco de conteúdo sob um `<h2>`/`<h3>`) do HTML vira um item de `sections[]`. `title` é o texto do heading (sem o link "#" de âncora). `level` é 2 para h2, 3 para h3. Se um h3 está dentro do escopo de um h2 mas tem conteúdo próprio substancial, pode virar uma seção própria de level 3 — use julgamento, mantendo a granularidade que o autor original pretendia pelos headings.

2. **`content_html`**: copie o HTML real da seção (parágrafos, listas, tabelas, negrito/itálico, links), mas:
   - Mantenha apenas tags semânticas: `<p>`, `<ul>`/`<ol>`/`<li>`, `<table>`/`<thead>`/`<tbody>`/`<tr>`/`<th>`/`<td>`, `<strong>`/`<b>`, `<em>`/`<i>`, `<a href="...">` (só links absolutos http(s), remova links internos tipo `href="#algo"` mas mantenha o texto do link).
   - Remova completamente: atributos de estilo (`style=`, `class=`), divs decorativos sem conteúdo semântico próprio (ex.: `<div class="diagram">` com boxes/setas — se o diagrama representa uma relação importante, descreva-a em texto corrido dentro de um `<p>` no lugar do diagrama, não tente reproduzir a estrutura visual).
   - `<figure>`/`<figcaption>`: extraia a legenda como texto e mova para o campo `images[].caption` da seção (não deixe a legenda solta dentro de `content_html` como HTML de figura).
   - Nunca invente conteúdo que não está no HTML original.

3. **`key_takeaways`**: frases de resumo/destaque da seção. Extraia de `<div class="callout">` (ou blocos visualmente destacados equivalentes) quando existirem — cada callout normalmente vira 1 ou mais itens de `key_takeaways`, reescritos como frases autossuficientes (não precisa copiar literal, mas não pode inventar fato novo). Se a seção não tem nenhum destaque explícito mas tem uma frase-síntese clara (ex.: uma definição formal no primeiro parágrafo), pode extrair essa frase também. Não invente takeaway para seção que não tem nenhum ponto de síntese claro — nesse caso, `null`.

4. **`glossary_terms`**: só preencha quando o HTML explicitamente define um termo técnico com sua tradução/definição (ex.: um termo em inglês seguido da definição em português, ou uma sigla explicada). A maioria das seções não vai ter isso — é normal ficar `null` ou ausente na maioria dos casos. Não confunda com key_takeaways.

5. **`images`**: para cada `<figure>` com imagem real (não gráficos/diagramas CSS-only), extraia `external_url` (se houver uma URL de imagem real; se a "imagem" é só um gráfico feito em CSS/HTML sem arquivo de imagem, não crie um item de `images` para ela — a informação dela deve virar texto em `content_html` ou um `key_takeaway`, como instruído na regra 2), `caption` (da `<figcaption>`), `alt_text`, `license_or_rights` e `source_note` quando mencionados no texto da legenda (ex.: "Public domain", "Gray's Anatomy, 1918") — senão `null`.

6. **`references`**: cada item da lista de referências bibliográficas (geralmente uma seção "Referências" no final) vira um `{ raw_citation_text: "..." }` com o texto completo da citação (autor, título, revista/editora, ano, DOI se houver) — copie o texto integral, não resuma.

7. **`dependencies`**: se o material menciona explicitamente pré-requisitos conceituais (uma seção "Fundamentos necessários", "Conexões com outros materiais", ou similar linkando pra outro compêndio/conceito prévio), liste esses títulos/conceitos como strings em `dependencies[]`. Se não houver nada explícito, `[]`.

8. **`tags`**: 4 a 8 palavras-chave livres que resumem os principais assuntos do compêndio (disciplina, subtemas, fármacos/estruturas centrais).

9. **`discipline_hint`/`theme_hint`**: infira a partir do título/conteúdo — `discipline_hint` é a área médica ampla (ex. "Cardiologia", "Farmacologia"), `theme_hint` é o subtema mais específico dentro dela.

10. **`estimated_read_time_minutes`**: estime com base no volume de texto (regra geral: ~200 palavras/minuto de leitura), como número inteiro.

11. **Nunca descarte conteúdo real do HTML.** Se algo não se encaixa claramente em nenhum campo (ex. uma pergunta motivadora solta, nota de rodapé de UI), coloque o texto em `_unmapped[]` em vez de descartar.

12. Devolva **apenas o JSON**, sem comentário nenhum antes ou depois, começando com `[` e terminando com `]`.

## Lista de compêndios (Estudos/Base de Estudos/Biblioteca/Medicina) — status em 2026-09-05

Já extraídos (piloto Cardiologia, carregados no Supabase local):
- `Cardiologia/Anatomia/anatomia-cardiaca.html` ("Cardiac Anatomy")
- `Cardiologia/Fisiologia/ciclo-cardiaco.html` ("Ciclo Cardíaco")

Prompt já gerado, aguardando o usuário rodar no AI Studio:
- `Cardiologia/Farmacologia/hipertensao-sraa-e-anti-hipertensivos.html`

Ainda sem prompt gerado (~29 compêndios de conteúdo real, excluindo `index.html` de navegação e `_archive/` legado):
- `Cardiologia/Fisiologia/hipotensao-pos-exercicio-e-barorreflexo.html`
- `Cardiologia/Fisiopatologia/doencas-circulatorias.html`
- `Cardiologia/Semiologia/semiologia-cardiaca.html`
- `Hematologia/Clínica/hemograma-e-anemias.html`
- `Hematologia/Farmacologia/antiagregantes-anticoagulantes-e-tromboliticos.html`
- `Hematologia/Fisiopatologia/trombose-e-hemostasia.html`
- `Imunologia/Fundamentos/*.html` (12 arquivos: anticorpos-imunidade-humoral, celulas-sistema-imune, citocinas-visao-integradora, hipersensibilidade, imunidade-inata, linfocitos-t-diferenciacao, mhc-apresentacao-antigenica, moleculas-sistema-imune, orgaos-linfoides, resposta-a-patogenos, resposta-imune-bacterias-extra-intracelulares, respostas-th1-th2-th17, sistema-complemento, vacinas-imunidade-protetora — conferir contagem exata, pode ser 13)
- `Infectologia/Farmacologia/antifungicos.html`
- `Infectologia/Fundamentos/fundamentos-de-infectologia.html`
- `Infectologia/Microbiologia/micologia-medica.html`
- `Infectologia/Microbiologia/virologia-geral.html`
- `Medicina Geral/Fundamentos/medicina.html`
- `Medicina de Emergência/Fisiopatologia/choque-circulatorio.html`
- `Medicina de Família e Comunidade/Fundamentos/medicina-de-familia-e-comunidade.html`
- `Nefrologia/Fisiologia/avaliacao-da-funcao-renal.html`
- `Neurologia/Clínica/tumores-do-sistema-nervoso-central.html` (mesmo tema do piloto de conceitos em `Questões/_banco/conceitos/`, mas ainda não extraído pro Supabase — são projetos independentes)
- `Pneumologia/Semiologia/sindromes-bronco-pleuro-pulmonares.html`

Não contar de novo os `index.html` (11 arquivos, navegação pura) nem os arquivos em `_archive/` (17 arquivos, versões legadas superadas — não retroagir, ver memória `project_base_estudos_regra_nao_retroagir`).
