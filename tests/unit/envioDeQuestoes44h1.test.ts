import { describe, it, expect } from 'vitest';
import {
  INSTITUICAO_AUTORAL,
  avaliarLote,
  comentarioTemFonteOnLine,
  ehAutoralExata,
  lerLoteDeQuestoes,
  lerQuestoesParaPublicar,
  mencionaAutoral,
  motivosDaRecusaDoLote,
  nomeSugeridoDoLote,
} from '../../src/utils/envioDeQuestoes';
import { estadoEmPalavras, mensagemDeErroDoEnvio } from '../../src/utils/envioDeMaterial';
import { parseQuestionsMarkdownText } from '../../src/utils/questionsImport';
import type { Discipline, Theme } from '../../src/types';
import { questaoParaEnvio as questao } from '../e2e/fixtures/questoesParaEnvio';

// 44-H1 — as regras que a tela "Enviar questões" aplica ao vivo. O importador é o
// do botão "Importar questões" do Admin; aqui se prova o que o envio acrescenta
// (uma regra por teste): Disciplina e Tema pelo catálogo, tipo da questão, tags,
// fonte on-line, material, tamanho.

const disciplina: Discipline = { id: 'd1', name: 'Pneumologia', code: 'PN', icon: 'book', description: '', cycle: 'clinico', color: '#000' };
const tema: Theme = { id: 't1', disciplineId: 'd1', name: 'Espirometria', description: '', highYield: false, order: 1 };
const DISCIPLINAS = [disciplina];
const TEMAS = [tema];
const PUBLICADOS = [
  { id: 'm1', title: 'Espirometria: como interpretar' },
  { id: 'm2', title: 'DPOC' },
];

function avaliar(texto: string, escolhidos: string[] = []) {
  return avaliarLote(lerLoteDeQuestoes(texto, DISCIPLINAS, TEMAS), PUBLICADOS, escolhidos);
}
const mensagens = (texto: string, escolhidos: string[] = []) => avaliar(texto, escolhidos).pendencias.map((p) => p.mensagem);

describe('44-H1 — lote aceito', () => {
  it('questão completa de banca real passa sem pendência', () => {
    const av = avaliar(questao(1));
    expect(av.pendencias).toEqual([]);
    expect(av.aceito).toBe(true);
    expect(av.totalDeQuestoes).toBe(1);
  });

  it('questão autoral completa (banca autoral, sem ano) passa sem pendência', () => {
    const av = avaliar(questao(1, { instituicao: INSTITUICAO_AUTORAL, ano: null }));
    expect(av.pendencias).toEqual([]);
    expect(av.aceito).toBe(true);
  });

  it('vários tipos no mesmo lote', () => {
    const av = avaliar([questao(1), questao(2, { instituicao: INSTITUICAO_AUTORAL, ano: null })].join('\n\n'));
    expect(av.aceito).toBe(true);
    expect(av.totalDeQuestoes).toBe(2);
  });

  it('vinheta em branco é aceita (o importador diz "ok se não tiver caso clínico")', () => {
    expect(avaliar(questao(1, { vinheta: null })).aceito).toBe(true);
  });

  it('o nome sugerido vem do Tema e da quantidade de questões', () => {
    const leitura = lerLoteDeQuestoes([questao(1), questao(2)].join('\n\n'), DISCIPLINAS, TEMAS);
    expect(nomeSugeridoDoLote(leitura)).toBe('Questões de Espirometria (2 questões)');
    expect(nomeSugeridoDoLote(lerLoteDeQuestoes(questao(1), DISCIPLINAS, TEMAS))).toBe('Questões de Espirometria (1 questão)');
    expect(nomeSugeridoDoLote(lerLoteDeQuestoes('', DISCIPLINAS, TEMAS))).toBe('');
  });
});

describe('44-H1 — o que barra o envio (uma regra por teste)', () => {
  it('arquivo vazio', () => {
    const av = avaliar('   ');
    expect(av.vazio).toBe(true);
    expect(av.aceito).toBe(false);
    expect(motivosDaRecusaDoLote(av)).toEqual(['O texto do lote está vazio.']);
  });

  it('arquivo sem nenhum "## Questão": a recusa do importador vem inteira', () => {
    const av = avaliar('# Título solto\n\ntexto');
    expect(av.aceito).toBe(false);
    expect(av.errosDeImportacao[0]).toContain('Nenhum bloco "## Questão"');
  });

  it('texto acima de 300 KB', () => {
    const av = avaliar(questao(1) + '\n' + 'a'.repeat(307200));
    expect(av.tamanhoExcedido).toBe(true);
    expect(av.aceito).toBe(false);
  });

  it('erro que impede a criação (sem gabarito, duas marcadas)', () => {
    expect(mensagens(questao(1, { gabaritos: 2 })).join(' ')).toContain('Mais de uma alternativa marcada com [GABARITO]');
    expect(avaliar(questao(1, { gabaritos: 2 })).aceito).toBe(false);
  });

  it('explicação vazia numa alternativa', () => {
    const texto = questao(1).replace('**Explicação C:** Errada: não há componente restritivo.', '**Explicação C:**');
    expect(mensagens(texto).join(' ')).toContain('Explicação vazia nas alternativas: C');
  });

  it('comentário geral e pérola vazios (o importador cairia num texto padrão)', () => {
    const m = mensagens(questao(1, { comentario: null, perola: null })).join(' ');
    expect(m).toContain('Comentário Geral vazio');
    expect(m).toContain('Pérola High-Yield vazia');
  });

  it('sem Instituição / Banca', () => {
    expect(mensagens(questao(1, { instituicao: null })).join(' ')).toContain('Instituição / Banca vazia');
  });

  it('banca real sem Ano, ou com ano inválido', () => {
    expect(mensagens(questao(1, { ano: null }))).toContain('Ano vazio.');
    expect(mensagens(questao(1, { ano: '1900' })).join(' ')).toContain('inválido');
  });

  it('autoral com Ano', () => {
    expect(mensagens(questao(1, { instituicao: INSTITUICAO_AUTORAL, ano: '2024' })).join(' ')).toContain('Questão autoral não leva Ano');
  });

  it('autoral escrita de outro jeito (o texto tem de ser exatamente o do padrão)', () => {
    const m = mensagens(questao(1, { instituicao: 'NexusMed autoral', ano: null })).join(' ');
    expect(m).toContain(`escreva exatamente “${INSTITUICAO_AUTORAL}”`);
    expect(mensagens(questao(1, { instituicao: 'Questão autoral', ano: null })).join(' ')).toContain('escreva exatamente');
  });

  it('a conferência do tipo ignora acento, caixa e espaços repetidos, mas não aceita variação de palavras', () => {
    expect(ehAutoralExata('nexusmed  (QUESTAO autoral)')).toBe(true);
    expect(ehAutoralExata('NexusMed (autoral)')).toBe(false);
    expect(mencionaAutoral('ENARE')).toBe(false);
    expect(mencionaAutoral('Autoral')).toBe(true);
  });

  it('Disciplina que não existe no catálogo (sem escolha manual)', () => {
    expect(mensagens(questao(1, { disciplina: 'Astrologia' })).join(' ')).toContain('A Disciplina escrita no arquivo (“Astrologia”) não existe no catálogo');
  });

  it('sem Tema, ou com Tema que não é da Disciplina', () => {
    expect(mensagens(questao(1, { tema: null })).join(' ')).toContain('O Tema não foi informado');
    expect(mensagens(questao(1, { tema: 'Tema Inventado' })).join(' ')).toContain('O Tema escrito no arquivo (“Tema Inventado”) não existe nessa Disciplina');
  });

  it('a mensagem manda escolher manualmente? não: nenhuma pendência pede escolha manual', () => {
    for (const texto of [questao(1, { tema: null }), questao(1, { disciplina: 'X' }), questao(1, { tema: 'Y' })]) {
      expect(mensagens(texto).join(' ')).not.toMatch(/selecione um manualmente|selecione uma manualmente/);
    }
  });

  it('tags: de duas a cinco', () => {
    expect(mensagens(questao(1, { tags: '`uma`' })).join(' ')).toContain('Use de 2 a 5 Tags (encontradas: 1)');
    expect(mensagens(questao(1, { tags: '`a` `b` `c` `d` `e` `f`' })).join(' ')).toContain('encontradas: 6');
    expect(mensagens(questao(1, { tags: '`a` `b` `c` `d` `e`' }))).toEqual([]);
    expect(mensagens(questao(1, { tags: null })).join(' ')).toContain('Tags não informadas');
  });

  it('comentário sem fonte on-line (nem endereço nem DOI)', () => {
    const texto = questao(1, {
      comentario: 'Resumo sem fonte.',
      explicacaoB: 'Certa, segundo as diretrizes.',
    });
    expect(mensagens(texto)).toContain('O comentário não cita nenhuma fonte on-line identificável (endereço ou DOI).');
  });

  it('a fonte pode estar em qualquer explicação, ou ser um DOI', () => {
    expect(mensagens(questao(1, { comentario: 'Resumo.', explicacaoB: 'Certa: doi:10.1000/xyz123.' }))).toEqual([]);
    expect(mensagens(questao(1, { comentario: 'Resumo. https://exemplo.gov.br/diretriz' , explicacaoB: 'Certa.' }))).toEqual([]);
    expect(comentarioTemFonteOnLine({ generalCommentary: 'x', options: [] })).toBe(false);
    expect(comentarioTemFonteOnLine({ generalCommentary: 'veja 10.1016/j.chest.2020.01.001', options: [] })).toBe(true);
  });

  it('sem material: nem no arquivo nem escolhido na tela', () => {
    const texto = questao(1, { materiais: null });
    expect(mensagens(texto).join(' ')).toContain('Sem material');
    // Escolhido na tela, passa.
    expect(mensagens(texto, ['m2'])).toEqual([]);
    expect(avaliar(texto, ['m2']).aceito).toBe(true);
  });

  it('título de material que não é o título exato de um publicado', () => {
    const m = mensagens(questao(1, { materiais: 'Espirometria (como interpretar)' })).join(' ');
    expect(m).toContain('O material “Espirometria (como interpretar)” não é o título exato de um material publicado');
    // Um bom e um ruim: só o ruim é apontado.
    const dois = mensagens(questao(1, { materiais: 'DPOC; Material Inventado' }));
    expect(dois).toEqual(['O material “Material Inventado” não é o título exato de um material publicado.']);
  });

  it('o título do material confere com espaços repetidos, mas não com outra caixa', () => {
    expect(mensagens(questao(1, { materiais: 'Espirometria:  como   interpretar' }))).toEqual([]);
    expect(mensagens(questao(1, { materiais: 'dpoc' })).join(' ')).toContain('não é o título exato');
  });

  it('a pendência diz a questão do arquivo (1, 2, ...)', () => {
    const av = avaliar([questao(1), questao(2, { perola: null })].join('\n\n'));
    expect(av.pendencias.map((p) => p.questao)).toEqual([2]);
    expect(motivosDaRecusaDoLote(av)[0]).toMatch(/^Questão 2: Pérola/);
  });
});

describe('44-H1 — o importador reconhece "Materiais cobertos" (sem mudar o que o Admin faz)', () => {
  it('lê os títulos separados por ponto e vírgula, sem repetir', () => {
    const r = parseQuestionsMarkdownText(questao(1, { materiais: 'A ;  B; A' }), DISCIPLINAS, TEMAS);
    expect(r.ok && r.rows[0].materialTitles).toEqual(['A', 'B']);
  });

  it('sem o campo, a lista é vazia', () => {
    const r = parseQuestionsMarkdownText(questao(1, { materiais: null }), DISCIPLINAS, TEMAS);
    expect(r.ok && r.rows[0].materialTitles).toEqual([]);
  });

  it('a linha do campo não vaza para o texto de outro campo (antes ela era colada ao campo anterior)', () => {
    const r = parseQuestionsMarkdownText(questao(1), DISCIPLINAS, TEMAS);
    expect(r.ok && r.rows[0].institution).toBe('ENARE');
    expect(r.ok && r.rows[0].year).toBe(2024);
  });
});

describe('44-H1 — estados e mensagens do envio de questões', () => {
  it('o estado em palavras leigas fala do lote de questões, com o mesmo rótulo do material', () => {
    expect(estadoEmPalavras('aguardando_revisao', 'questoes').rotulo).toBe('Aguardando revisão');
    expect(estadoEmPalavras('aguardando_revisao', 'questoes').explicacao).toContain('lote de questões');
    expect(estadoEmPalavras('aguardando_revisao').explicacao).toContain('material');
    expect(estadoEmPalavras('publicado', 'questoes').explicacao).toContain('As questões');
  });

  it('erros do banco viram frases leigas: tamanho, fila cheia e material que saiu do ar', () => {
    expect(mensagemDeErroDoEnvio({ code: '23514', message: 'violates check constraint "question_submissions_content_size"' })).toContain('passa de 300 KB');
    expect(mensagemDeErroDoEnvio({ code: 'P0001', hint: 'limite_envios_em_espera' })).toContain('3 envios esperando revisão');
    expect(mensagemDeErroDoEnvio({ code: 'P0001', message: 'os materiais escolhidos precisam estar publicados' })).toBe(
      'Um dos materiais escolhidos não está mais publicado. Escolha outro.',
    );
  });
});

// P10 — a questão se liga à SEÇÃO do material: "Título do material > Título da seção".
describe('P10 — o importador lê a seção do material', () => {
  const leitura = (materiais: string | null) => {
    const r = parseQuestionsMarkdownText(questao(1, { materiais }), DISCIPLINAS, TEMAS);
    if (!r.ok) throw new Error('importador recusou');
    return r.rows[0];
  };

  it('"Material > Seção" vira o material e a seção; sem ">" a seção fica ausente (arquivo antigo)', () => {
    const l = leitura('Espirometria: como interpretar > Padrão obstrutivo; DPOC');
    expect(l.materialLinks).toEqual([
      { title: 'Espirometria: como interpretar', sectionTitle: 'Padrão obstrutivo' },
      { title: 'DPOC', sectionTitle: null },
    ]);
    expect(l.materialTitles).toEqual(['Espirometria: como interpretar', 'DPOC']);
    expect(l.blockingErrors).toEqual([]);
  });

  it('arquivo antigo (só títulos) continua igual: materialLinks sem seção e materialTitles intactos', () => {
    const l = leitura('A ;  B; A');
    expect(l.materialTitles).toEqual(['A', 'B']);
    expect(l.materialLinks).toEqual([
      { title: 'A', sectionTitle: null },
      { title: 'B', sectionTitle: null },
    ]);
  });

  it('o mesmo material com duas seções diferentes é erro claro; repetir igual não é', () => {
    expect(leitura('A > Uma; A > Outra').blockingErrors.join(' ')).toContain('mais de uma seção');
    expect(leitura('A > Uma; A > Uma').blockingErrors).toEqual([]);
    expect(leitura('A; A > Uma').materialLinks).toEqual([{ title: 'A', sectionTitle: 'Uma' }]);
  });

  it('seção vazia depois do ">" é ignorada como "sem seção"', () => {
    expect(leitura('A >').materialLinks).toEqual([{ title: 'A', sectionTitle: null }]);
  });
});

describe('P10 — a checagem do envio confere a seção contra o material publicado', () => {
  const PUBLICADOS_COM_SECOES = [
    {
      id: 'm1',
      title: 'Espirometria: como interpretar',
      sections: [
        { id: 's1', title: 'Padrão obstrutivo' },
        { id: 's2', title: 'Padrão restritivo' },
        { id: 's3', title: 'Repetida' },
        { id: 's4', title: 'repetida' },
      ],
    },
    { id: 'm2', title: 'DPOC', sections: [] },
  ];
  const pend = (materiais: string) =>
    avaliarLote(lerLoteDeQuestoes(questao(1, { materiais }), DISCIPLINAS, TEMAS), PUBLICADOS_COM_SECOES, []).pendencias.map((p) => p.mensagem);

  it('seção que existe no material: sem pendência (ignora acento, caixa e espaços repetidos)', () => {
    expect(pend('Espirometria: como interpretar > Padrão obstrutivo')).toEqual([]);
    expect(pend('Espirometria: como interpretar >  padrao   OBSTRUTIVO')).toEqual([]);
  });

  it('seção inexistente: pendência clara com o material e a seção', () => {
    const m = pend('Espirometria: como interpretar > Padrão misto');
    expect(m).toHaveLength(1);
    expect(m[0]).toContain('“Padrão misto”');
    expect(m[0]).toContain('“Espirometria: como interpretar”');
    expect(m[0]).toContain('não existe');
  });

  it('seção com título repetido no material: pendência de ambiguidade', () => {
    expect(pend('Espirometria: como interpretar > Repetida').join(' ')).toContain('mais de uma seção');
  });

  it('material sem seção pedida continua valendo; material sem a lista de seções não confere a seção', () => {
    expect(pend('DPOC')).toEqual([]);
    const semLista = avaliarLote(
      lerLoteDeQuestoes(questao(1, { materiais: 'DPOC > Qualquer' }), DISCIPLINAS, TEMAS),
      [{ id: 'm2', title: 'DPOC' }],
      [],
    );
    expect(semLista.pendencias).toEqual([]);
  });

  it('o servidor recebe o título e a seção de cada ligação (material_links) além dos títulos', () => {
    const r = lerQuestoesParaPublicar(questao(1, { materiais: 'DPOC > Uma; Outro' }), DISCIPLINAS, TEMAS);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.questoes[0].material_titles).toEqual(['DPOC', 'Outro']);
    expect(r.questoes[0].material_links).toEqual([
      { title: 'DPOC', section_title: 'Uma' },
      { title: 'Outro', section_title: null },
    ]);
  });
});
