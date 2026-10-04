// Arquivos .md de exemplo para os testes do envio de material (44-E): um que a
// checagem do padrão e a importação aceitam sem pendência, e variações com um
// defeito só. Sem dado real: o conteúdo é de mentira.

export interface OpcoesDoMaterial {
  titulo?: string;
  disciplina?: string;
  tema?: string;
  /** Texto da seção; troque por um com defeito para gerar pendência. */
  corpo?: string;
}

export function materialParaEnvio(opcoes: OpcoesDoMaterial = {}): string {
  const {
    titulo = 'Material de exemplo do envio',
    disciplina = 'Farmacologia',
    tema = 'Clínica',
    corpo = 'Texto de exemplo com citação [1](#ref-1) e outra [2](#ref-2).',
  } = opcoes;
  return [
    `# ${titulo}`,
    '',
    '**Subtítulo:** Exemplo para teste',
    `**Disciplina:** ${disciplina}`,
    `**Tema:** ${tema}`,
    '**Tempo estimado de leitura:** 12 minutos',
    '**Versão do padrão:** 3',
    '',
    '### Primeira seção',
    '**Tag de Mecanismo:** Visão geral',
    '',
    corpo,
    '',
    '### Palavras-chave',
    '`exemplo` `teste`',
    '',
    '### Referências Bibliográficas',
    '1. Fonte de exemplo 1. [Diretriz de prática clínica — entidade de exemplo]',
    '2. Fonte de exemplo 2. [Revisão sistemática]',
    '',
  ].join('\n');
}

/** Igual ao conforme, com um comparador escrito em ASCII: uma pendência do padrão. */
export function materialComPendencia(opcoes: OpcoesDoMaterial = {}): string {
  return materialParaEnvio({
    ...opcoes,
    corpo: 'Ajustar a dose se a depuração for <= 30 [1](#ref-1)[2](#ref-2).',
  });
}
