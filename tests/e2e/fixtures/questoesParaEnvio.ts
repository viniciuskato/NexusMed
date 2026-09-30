// Arquivos .md de exemplo para os testes do envio de questões (44-H1): uma questão
// completa e aceita pelo importador e pela checagem do envio, e opções para tirar
// ou mudar uma coisa de cada vez. Sem dado real: o conteúdo é de mentira.

export const INSTITUICAO_AUTORAL_DE_EXEMPLO = 'NexusMed (questão autoral)';

export interface OpcoesDaQuestao {
  disciplina?: string | null;
  tema?: string | null;
  instituicao?: string | null;
  ano?: string | null;
  materiais?: string | null;
  comentario?: string | null;
  perola?: string | null;
  tags?: string | null;
  explicacaoB?: string;
  gabaritos?: number;
  vinheta?: string | null;
}

/** Uma questão completa e aceita; cada teste tira ou muda uma coisa. */
export function questaoParaEnvio(n: number, o: OpcoesDaQuestao = {}): string {
  const campo = (rotulo: string, valor: string | null | undefined, padrao: string | null) => {
    const v = valor === undefined ? padrao : valor;
    return v === null ? null : `**${rotulo}:** ${v}`;
  };
  const linhas = [
    `## Questão ${n}`,
    '',
    campo('Disciplina', o.disciplina, 'Pneumologia'),
    campo('Tema', o.tema, 'Espirometria'),
    campo('Instituição / Banca', o.instituicao, 'ENARE'),
    campo('Ano', o.ano, '2024'),
    campo('Materiais cobertos', o.materiais, 'Espirometria: como interpretar'),
    '',
    o.vinheta === null ? null : `**Enunciado Clínico (Caso / Vinheta):**\n${o.vinheta ?? 'Paciente com dispneia.'}`,
    '',
    '**Comando da Questão (Pergunta):**',
    'Qual o padrão esperado?',
    '',
    '**A)** Restritivo',
    '**Explicação A:** Errada: a CPT não está reduzida.',
    `**B)** Obstrutivo [GABARITO]${o.gabaritos === 2 ? '\n**C)** Misto [GABARITO]' : ''}`,
    `**Explicação B:** ${o.explicacaoB ?? 'Certa: [GOLD 2024](https://goldcopd.org/2024) sustenta o achado.'}`,
    o.gabaritos === 2 ? '**Explicação C:** Também marcada.' : '**C)** Misto',
    o.gabaritos === 2 ? null : '**Explicação C:** Errada: não há componente restritivo.',
    '',
    campo('Comentário Geral', o.comentario, 'Resumo do raciocínio. Fonte: [GOLD 2024](https://goldcopd.org/2024).'),
    campo('Pérola High-Yield', o.perola, 'CPT aumentada confirma o obstrutivo.'),
    '',
    o.tags === null ? null : `### Tags\n${o.tags ?? '`espirometria` `dpoc`'}`,
    '',
  ];
  return linhas.filter((l) => l !== null).join('\n');
}


/** Um lote de `n` questões completas de banca real. */
export function loteParaEnvio(n: number, o: OpcoesDaQuestao = {}): string {
  return Array.from({ length: n }, (_, i) => questaoParaEnvio(i + 1, o)).join('\n\n');
}
