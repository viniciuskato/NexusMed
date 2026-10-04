// Textos de partida do editor visual (ED-1): um grupo por construção que o leitor (`SafeMarkdown`) renderiza.
// Usado pelo teste unitário da conversão e pelos testes de componente do editor (tests/component/editorVisual*.test.tsx).

export const ID_DE_FIGURA = '0b9f1a0e-5c2d-4e8a-9a41-3d6b7c8e9f10';

export interface GrupoDoCorpus {
  /** O que o grupo cobre, nas palavras do aceite. */
  construcao: string;
  textos: string[];
}

export const CORPUS_SEGURO: GrupoDoCorpus[] = [
  {
    construcao: 'parágrafo',
    textos: [
      'Um parágrafo simples, com vírgulas, e ponto final.',
      'Primeiro parágrafo.\n\nSegundo parágrafo.\n\nTerceiro parágrafo.',
      'Tosse ≥ 8 semanas, SpO₂ ≤ 92% — dose em µg/mL, intervalo 60–89, índice 1,73 m².',
      'Um asterisco solto, como em FEV1/CVF * 100, não abre formatação nenhuma.',
      'Sublinhado entre underlines, _assim_, o leitor não formata: fica como texto.',
    ],
  },
  {
    construcao: 'quebra simples dentro do parágrafo',
    textos: [
      'Primeira linha\nsegunda linha do mesmo parágrafo.',
      'Linha com espaço no fim  \n  e linha recuada.',
      'Três\nlinhas\nseguidas.',
      '**Negrito que atravessa\na quebra** e segue.',
    ],
  },
  {
    construcao: 'negrito',
    textos: ['**Negrito** no começo do texto.', 'No meio **negrito** do texto.', 'Dois: **um** e **dois**.', '**Frase inteira em negrito.**'],
  },
  {
    construcao: 'itálico com asterisco',
    textos: ['*Itálico* no começo.', 'A *palavra* e a *outra* em itálico.', '*Frase inteira em itálico.*'],
  },
  {
    construcao: 'negrito com itálico aninhado',
    textos: [
      '**Ponto de Igual Pressão (*Equal Pressure Point*)**',
      'texto **negrito com *itálico* dentro** e fim',
      '**Início *itálico* e *outro itálico* fim**',
    ],
  },
  {
    construcao: 'código inline',
    textos: ['Use `FEV1/CVF` no cálculo.', 'O código `a*b` guarda o asterisco.', '`um` e `dois` códigos.', '**Negrito com `código` dentro**'],
  },
  {
    construcao: 'link',
    textos: [
      'Veja a [diretriz](https://example.com/diretriz?a=1&b=2) completa.',
      'Abra a [lista de materiais](/materiais).',
      '**Veja [o guia](https://example.com/guia) agora**',
    ],
  },
  {
    construcao: 'citação inline [N](#ref-N) e citações coladas',
    textos: [
      'Afirmação de peso clínico [1](#ref-1).',
      'Mais alto[1](#ref-1)[2](#ref-2).',
      'Três juntas [1](#ref-1)[3](#ref-3)[12](#ref-12) no fim.',
      '**Negrito citado [4](#ref-4)** e depois [5](#ref-5).',
    ],
  },
  {
    construcao: 'expoente (^)',
    textos: [
      'Fator 0,9938^Idade na equação.',
      'O termo max(SCr/κ, 1)^(-1,200) cresce.',
      'Potência 10^(9−pH) em texto corrido.',
      'Quadrado x^2 e letra grega y^α.',
      '**Negrito com x^2 dentro**',
    ],
  },
  {
    construcao: 'lista com marcador',
    textos: [
      '- Primeiro item\n- Segundo item\n- Terceiro item',
      '- Item com **negrito** e *itálico*\n- Item com [1](#ref-1) citação',
      '- Um item só',
    ],
  },
  {
    construcao: 'lista numerada',
    textos: [
      '1. Primeiro\n2. Segundo\n3. Terceiro',
      '1. Pergunta com **ênfase**?\n2. Outra pergunta [2](#ref-2)?',
      '1. Item único',
    ],
  },
  {
    construcao: 'item de lista com linha de continuação',
    textos: [
      '- Item que continua\n  na linha seguinte\n- Segundo item',
      '- Um item\nsem recuo na continuação\n- Outro',
      '1. Pergunta longa que continua\n   na linha de baixo?\n2. Outra pergunta',
    ],
  },
  {
    construcao: 'tabela',
    textos: [
      '| Coluna A | Coluna B |\n|---|---|\n| valor | valor |',
      '**Tabela 1.** Pares que costumam ser trocados [2](#ref-2).\n\n| Par | O que separa |\n|---|---|\n| A × B | o critério que distingue |\n| C × D | outro critério [3](#ref-3) |',
    ],
  },
  {
    construcao: 'fórmula de exibição em linha própria',
    textos: [
      'eGFRcr = 142 × min(SCr/κ, 1)^α × max(SCr/κ, 1)^(-1,200)',
      'A fórmula é expressa por:\neGFR = 142 × x^2 × 0,9938^Idade\nonde x é a creatinina.',
      '> Escore Z = (Valor Medido − Valor Previsto) ÷ Desvio Padrão [1](#ref-1)[3](#ref-3)',
      'Frase antes da fórmula.\n\nIMC = peso ÷ altura^2\n\nFrase depois da fórmula.',
    ],
  },
  {
    construcao: 'caixa Cuidado',
    textos: [
      '> **Cuidado:** simplificação que merece atenção.',
      '> **Cuidado:** texto com **negrito**, *itálico* e citação [1](#ref-1).',
      '> **Cuidado:** primeira linha\n> segunda linha da caixa',
    ],
  },
  { construcao: 'caixa Raciocínio', textos: ['> **Raciocínio:** o caminho de decisão passo a passo.', '> **Raciocínio:** com `código` e x^2.'] },
  { construcao: 'caixa Não confundir', textos: ['> **Não confundir:** A com B.', '> **Não confundir:** dois\n> termos parecidos'] },
  { construcao: 'caixa Atualização', textos: ['> **Atualização:** desde 2023 [1](#ref-1) a conduta mudou.', '> **Atualização:** mudou.'] },
  { construcao: 'caixa Aprofundar', textos: ['> **Aprofundar:** para ir além, veja [o artigo](https://example.com/a).', '> **Aprofundar:** leitura extra.'] },
  { construcao: 'caixa Essencial', textos: ['> **Essencial:** o que o estudante precisa dominar.', '> **Essencial:** ponto **central** do bloco.'] },
  {
    construcao: 'citação comum com >',
    textos: ['> Uma citação comum, em itálico no leitor.', '> Primeira linha da citação\n> segunda linha da citação', '> Citação com **negrito** e [1](#ref-1).'],
  },
  {
    construcao: 'bloco figura:<uuid> com legenda e Fonte:',
    textos: [
      `![Curva fluxo-volume](figura:${ID_DE_FIGURA})\n**Figura 2.** Curva fluxo-volume normal e obstrutiva.\nFonte: Diretriz GOLD, 2024 [3](#ref-3).`,
      '![Descrição da imagem, para quem não a vê](figura:PENDENTE)\n**Figura 1.** Legenda da figura, em uma frase.\nFonte: fonte sugerida.\nMostrar: o que a figura deve conter.',
      `Texto antes da figura.\n\n![Esquema](figura:${ID_DE_FIGURA})\n**Figura 1.** Esquema do mecanismo.\nFonte: [2](#ref-2)\n\nTexto depois.`,
    ],
  },
  {
    construcao: 'subtítulo (#, ##, ###, ####)',
    textos: ['#### Um subtítulo dentro da seção', '# Nível 1\n\n## Nível 2\n\n### Nível 3\n\n#### Nível 4', '#### Subtítulo com **negrito**'],
  },
  {
    construcao: 'texto vazio',
    textos: [''],
  },
  {
    construcao: 'seção completa, com tudo misturado',
    textos: [
      [
        'Texto da seção, com citação [1](#ref-1) em toda afirmação de peso clínico.',
        '> **Essencial:** o que o estudante precisa dominar neste ponto.',
        '#### Um subtítulo dentro da seção',
        'Frase que abre a tabela abaixo, com a citação [2](#ref-2).',
        '**Tabela 1.** Título da tabela, em uma frase [2](#ref-2).',
        '| Coluna A | Coluna B |\n|---|---|\n| valor | valor |',
        `![Descrição](figura:${ID_DE_FIGURA})\n**Figura 1.** Legenda.\nFonte: [2](#ref-2).`,
        '> **Cuidado:** uma simplificação.',
        '- Item **um**\n- Item *dois*',
        '1. Primeiro\n2. Segundo',
        'TFG = 142 × x^2',
        '> Uma citação comum.',
        'Fim, com `código`, [link](https://example.com) e 10^(9−pH).',
      ].join('\n\n'),
    ],
  },
];

/** Textos que o editor visual NÃO sabe representar com segurança: a guarda recusa e o texto não é tocado. */
export const CORPUS_NAO_SEGURO: Array<{ motivo: string; texto: string }> = [
  { motivo: 'HTML cru', texto: 'Texto com <b>negrito em HTML</b> no meio.' },
  { motivo: 'HTML cru (bloco)', texto: '<div class="aviso">Cuidado</div>' },
  { motivo: 'comentário HTML', texto: 'Antes\n\n<!-- nota do autor -->\n\nDepois' },
  { motivo: 'marcação desconhecida: caixa antiga do leitor [!NOTE]', texto: '> [!NOTE] Uma diretriz oficial.' },
  { motivo: 'marcação desconhecida: caixa antiga **Pegadinha**', texto: '> **Pegadinha:** a banca troca os termos.' },
  { motivo: 'marcação desconhecida: caixa com rótulo fora do padrão', texto: '> **cuidado:** rótulo em minúsculas, que o leitor ainda aceita.' },
  { motivo: 'marcação desconhecida: rótulo com variação aceita pelo leitor', texto: '> **Raciocínio clínico:** variação do rótulo.' },
  { motivo: 'combinação malformada: negrito vazio', texto: '****' },
  { motivo: 'combinação malformada: asteriscos soltos que o leitor engole', texto: '**' },
  { motivo: 'lista com marcador diferente de "- "', texto: '* um item\n* outro item' },
  { motivo: 'lista com recuo no marcador', texto: '- um\n  - sub-item recuado' },
  { motivo: 'lista numerada fora de sequência', texto: '1. um\n3. três' },
  { motivo: 'falta linha em branco antes da lista', texto: 'Frase de abertura.\n- item colado na frase' },
  { motivo: 'espaços a mais depois do #', texto: '####  Subtítulo com dois espaços' },
  { motivo: 'tabela com linha de texto no meio', texto: '| A | B |\nlinha solta\n| 1 | 2 |' },
  { motivo: 'linhas em branco a mais entre blocos', texto: 'Um\n\n\nDois' },
  { motivo: 'espaço sobrando no fim', texto: 'Um parágrafo com sobra \n' },
  { motivo: 'quebra de linha do Windows', texto: 'Linha um\r\nlinha dois' },
  { motivo: 'caixa fora do formato "> **Rótulo:** texto"', texto: '> **Cuidado**: dois-pontos fora do negrito.' },
];
