import { describe, expect, it } from 'vitest';
import type { Compendium, Discipline, Question, Theme } from '../../src/types';
import { exportarMaterialParaMarkdown, VERSAO_DO_PADRAO } from '../../src/utils/exportarMaterial';
import { compararComPublicado, tituloNormalizado } from '../../src/utils/atualizarMaterial';
import { avaliarEnvio, lerArquivoParaEnvio, lerMaterialParaPublicar, type MaterialParaPublicar } from '../../src/utils/envioDeMaterial';
import { situacaoDaChecagem, checarMaterialMarkdown } from '../../src/utils/compendiumStandardCheck';
import { materialParaEnvio } from '../e2e/fixtures/materialParaEnvio';

// 44-B — exportar um material como `.md` do padrão e a prévia da atualização. O teste de IDA E VOLTA é o
// aceite automático (AGENTS.md, risco 17): exportar → checagem do padrão e importação aceitam → ler de
// novo dá exatamente o mesmo conteúdo; e o arquivo lido de volta, comparado com o material, "não muda nada".

const disciplina = { id: 'd1', name: 'Farmacologia', code: 'FARM', icon: 'pill', description: '', cycle: 'basico', color: '#000' } as unknown as Discipline;
const tema: Theme = { id: 't1', disciplineId: 'd1', name: 'Clínica', description: '', highYield: false, order: 1 };

/** Um material como o banco o entrega ao app (com ids de seção e referências vinculadas). */
function materialPublicado(over: Partial<Compendium> = {}): Compendium {
  return {
    id: 'mat-1',
    disciplineId: 'd1',
    themeId: 't1',
    title: 'Diuréticos de alça e tiazídicos',
    subtitle: 'Mecanismo e uso clínico',
    estimatedReadTimeMinutes: 14,
    lastUpdated: '',
    author: 'Equipe NexusMed',
    publicationStatus: 'published',
    tags: ['diurético', 'furosemida', 'hidroclorotiazida'],
    sections: [
      {
        id: 'sec-a',
        title: 'Mecanismo de ação',
        mechanismTag: 'Farmacodinâmica',
        content: 'Os diuréticos de alça bloqueiam o cotransportador Na-K-2Cl [1](#ref-1).\n\nOs tiazídicos agem no túbulo distal [2](#ref-2).',
        keyTakeaways: ['Alça: mais potente', 'Tiazídico: efeito anti-hipertensivo duradouro'],
        clinicalPearl: 'Furosemida age em minutos por via venosa.',
        warningAlert: 'Cuidado com hipocalemia em uso prolongado.',
      },
      { id: 'sec-b', title: 'Uso clínico', content: 'Indicados na sobrecarga de volume [1](#ref-1).', keyTakeaways: [] },
    ],
    references: ['Fonte de exemplo 1. [Diretriz de prática clínica — entidade de exemplo]', 'Fonte de exemplo 2. [Revisão sistemática]'],
    referenceSources: [{ linked: true, sourceId: 'src-1' }, { linked: false }],
    ...over,
  } as Compendium;
}

/** O que o servidor leria do arquivo (o mesmo importador da tela). */
function ler(texto: string): MaterialParaPublicar {
  const leitura = lerMaterialParaPublicar(texto, [disciplina], [tema]);
  if (!leitura.ok) throw new Error(`o arquivo exportado não foi lido: ${leitura.motivos.join(' | ')}`);
  return leitura.material;
}

describe('44-B — exportar o material para o .md do padrão', () => {
  it('o arquivo tem o formato do padrão: título, metadados, versão, seções, palavras-chave e referências', () => {
    const { texto, nomeDoArquivo, avisos } = exportarMaterialParaMarkdown(materialPublicado(), [disciplina], [tema]);
    expect(nomeDoArquivo).toBe('diureticos-de-alca-e-tiazidicos.md');
    expect(avisos).toEqual([]);
    expect(texto.startsWith('# Diuréticos de alça e tiazídicos\n')).toBe(true);
    expect(texto).toContain('**Subtítulo:** Mecanismo e uso clínico');
    expect(texto).toContain('**Disciplina:** Farmacologia');
    expect(texto).toContain('**Tema:** Clínica');
    expect(texto).toContain('**Autor:** Equipe NexusMed');
    expect(texto).toContain('**Tempo estimado de leitura:** 14 minutos');
    expect(texto).toContain(`**Versão do padrão:** ${VERSAO_DO_PADRAO}`);
    expect(texto).toContain('### Mecanismo de ação');
    expect(texto).toContain('**Tag de Mecanismo:** Farmacodinâmica');
    expect(texto).toContain('**Pontos-Chave:**');
    expect(texto).toContain('> 💡 **Pérola Clínica:** Furosemida age em minutos por via venosa.');
    expect(texto).toContain('> ⚠️ **Alerta de Armadilha:** Cuidado com hipocalemia em uso prolongado.');
    expect(texto).toContain('### Palavras-chave\n`diurético` `furosemida` `hidroclorotiazida`');
    expect(texto).toContain('### Referências Bibliográficas\n1. Fonte de exemplo 1.');
    expect(texto.endsWith('\n')).toBe(true);
  });

  it('IDA E VOLTA: a checagem do padrão e o importador aceitam, e ler de novo dá exatamente o mesmo conteúdo', () => {
    const publicado = materialPublicado();
    const { texto } = exportarMaterialParaMarkdown(publicado, [disciplina], [tema]);

    // Aceito pela checagem do padrão, sem nenhuma pendência, e pela importação.
    const checagem = checarMaterialMarkdown(texto);
    expect(checagem.errosDeImportacao).toEqual([]);
    expect(checagem.pendencias).toEqual([]);
    expect(situacaoDaChecagem(checagem)).toBe('conforme');
    const leitura = lerArquivoParaEnvio(texto, [disciplina], [tema]);
    expect(avaliarEnvio(leitura, { disciplineId: 'd1', themeId: 't1' }, [disciplina], [tema]).aceito).toBe(true);

    // O mesmo conteúdo.
    const volta = ler(texto);
    expect(volta.title).toBe(publicado.title);
    expect(volta.subtitle).toBe(publicado.subtitle);
    expect(volta.author).toBe(publicado.author);
    expect(volta.estimated_read_time_minutes).toBe(14);
    expect(volta.tags).toEqual(publicado.tags);
    expect(volta.references).toEqual(publicado.references);
    expect(volta.sections).toHaveLength(2);
    publicado.sections.forEach((s, i) => {
      expect(volta.sections[i]).toEqual({
        title: s.title,
        content: s.content,
        key_takeaways: s.keyTakeaways,
        mechanism_tag: s.mechanismTag ?? null,
        clinical_pearl: s.clinicalPearl ?? null,
        warning_alert: s.warningAlert ?? null,
      });
    });

    // Exportar de novo o que foi lido dá o mesmo arquivo (ponto fixo).
    const reexportado = exportarMaterialParaMarkdown(
      {
        ...publicado,
        title: volta.title,
        subtitle: volta.subtitle ?? '',
        author: volta.author ?? '',
        tags: volta.tags,
        sections: volta.sections.map((s, i) => ({
          id: `n${i}`,
          title: s.title,
          content: s.content,
          keyTakeaways: s.key_takeaways,
          mechanismTag: s.mechanism_tag ?? undefined,
          clinicalPearl: s.clinical_pearl ?? undefined,
          warningAlert: s.warning_alert ?? undefined,
        })),
        references: volta.references,
      },
      [disciplina],
      [tema],
    );
    expect(reexportado.texto).toBe(texto);

    // E, comparado com o material, o arquivo "não muda nada": é o que garante que atualizar sem mudança é no-op.
    const previa = compararComPublicado(publicado, volta);
    expect(previa.identico).toBe(true);
    expect(previa.secoes).toMatchObject({ novas: [], alteradas: [], removidas: [], iguais: 2, reordenadas: false });
  });

  it('IDA E VOLTA com o arquivo de exemplo do padrão: importar → exportar → importar dá o mesmo conteúdo', () => {
    const original = ler(materialParaEnvio({ titulo: 'Material de exemplo', disciplina: 'Farmacologia', tema: 'Clínica' }));
    const comoPublicado = materialPublicado({
      title: original.title,
      subtitle: original.subtitle ?? '',
      author: original.author ?? '',
      estimatedReadTimeMinutes: original.estimated_read_time_minutes ?? 0,
      tags: original.tags,
      references: original.references,
      referenceSources: undefined,
      sections: original.sections.map((s, i) => ({
        id: `s${i}`,
        title: s.title,
        content: s.content,
        keyTakeaways: s.key_takeaways,
        mechanismTag: s.mechanism_tag ?? undefined,
        clinicalPearl: s.clinical_pearl ?? undefined,
        warningAlert: s.warning_alert ?? undefined,
      })),
    });
    const { texto } = exportarMaterialParaMarkdown(comoPublicado, [disciplina], [tema]);
    expect(situacaoDaChecagem(checarMaterialMarkdown(texto))).toBe('conforme');
    expect(ler(texto)).toEqual(original);
  });

  it('o que o formato não representa vira aviso (e o arquivo sai como o formato permite)', () => {
    const { avisos, texto } = exportarMaterialParaMarkdown(
      materialPublicado({
        sections: [
          { id: 'x', title: 'Seção com problema', content: 'Texto.\n### Não pode\nMais texto.', keyTakeaways: [], clinicalPearl: 'Linha 1\nLinha 2' },
        ],
      }),
      [disciplina],
      [tema],
    );
    expect(avisos.join(' ')).toContain('há linhas que o arquivo lê como outra coisa');
    expect(avisos.join(' ')).toContain('A Pérola da seção “Seção com problema” tem quebra de linha');
    expect(texto).toContain('> 💡 **Pérola Clínica:** Linha 1 Linha 2');
  });

  it('material sem subtítulo, autor, tempo, palavras-chave nem referências: só o que existe entra', () => {
    const { texto } = exportarMaterialParaMarkdown(
      materialPublicado({ subtitle: '', author: '', estimatedReadTimeMinutes: 0, tags: [], references: [], referenceSources: undefined }),
      [disciplina],
      [tema],
    );
    expect(texto).not.toContain('**Subtítulo:**');
    expect(texto).not.toContain('**Autor:**');
    expect(texto).not.toContain('**Tempo estimado');
    expect(texto).not.toContain('### Palavras-chave');
    expect(texto).not.toContain('### Referências');
  });
});

describe('44-B — a prévia do que muda (mesma regra de casamento do servidor)', () => {
  const publicado = materialPublicado();
  const arquivoIgual = (): MaterialParaPublicar => ler(exportarMaterialParaMarkdown(publicado, [disciplina], [tema]).texto);

  it('título normalizado: sem acento, sem maiúscula, espaços colapsados', () => {
    expect(tituloNormalizado('  Mecanismo   DE Ação ')).toBe('mecanismo de acao');
  });

  it('seções novas, alteradas e removidas; referências novas e removidas; mudança de campo', () => {
    const arquivo = arquivoIgual();
    arquivo.subtitle = 'Outro subtítulo';
    arquivo.sections = [
      { ...arquivo.sections[0], content: `${arquivo.sections[0].content}\n\nParágrafo novo.` }, // alterada
      // "Uso clínico" saiu; "Dose e ajuste" é nova
      { title: 'Dose e ajuste', content: 'Ajuste pela função renal.', key_takeaways: [], mechanism_tag: null, clinical_pearl: null, warning_alert: null },
    ];
    arquivo.references = [arquivo.references[0], 'Fonte nova 3. [Guia]'];
    const previa = compararComPublicado(publicado, arquivo);
    expect(previa.identico).toBe(false);
    expect(previa.campos).toEqual([{ campo: 'Subtítulo', de: 'Mecanismo e uso clínico', para: 'Outro subtítulo' }]);
    expect(previa.secoes).toMatchObject({ novas: ['Dose e ajuste'], alteradas: ['Mecanismo de ação'], removidas: ['Uso clínico'], iguais: 0 });
    expect(previa.referencias).toMatchObject({ novas: ['Fonte nova 3. [Guia]'], removidas: [publicado.references[1]] });
  });

  it('título mudado (mais que acento e maiúscula) é seção nova, sem heurística de similaridade', () => {
    const arquivo = arquivoIgual();
    arquivo.sections[1] = { ...arquivo.sections[1], title: 'Uso clínico principal' };
    const previa = compararComPublicado(publicado, arquivo);
    expect(previa.secoes.novas).toEqual(['Uso clínico principal']);
    expect(previa.secoes.removidas).toEqual(['Uso clínico']);
  });

  it('só acento ou maiúscula diferente no título: é a mesma seção (mantém o id), e conta como alterada', () => {
    const arquivo = arquivoIgual();
    arquivo.sections[0] = { ...arquivo.sections[0], title: 'MECANISMO DE ACAO' };
    const previa = compararComPublicado(publicado, arquivo);
    expect(previa.secoes.novas).toEqual([]);
    expect(previa.secoes.removidas).toEqual([]);
    expect(previa.secoes.alteradas).toEqual(['MECANISMO DE ACAO']);
  });

  it('só a ordem das seções mudou: reordenadas (não é idêntico)', () => {
    const arquivo = arquivoIgual();
    arquivo.sections = [arquivo.sections[1], arquivo.sections[0]];
    const previa = compararComPublicado(publicado, arquivo);
    expect(previa.secoes.reordenadas).toBe(true);
    expect(previa.identico).toBe(false);
  });

  it('avisa quantas questões apontam para seções que vão sumir (pela seção da questão ou pelas ligações)', () => {
    const arquivo = arquivoIgual();
    arquivo.sections = [arquivo.sections[0]]; // "Uso clínico" (sec-b) some
    const questoes = [
      { compendiumSectionId: 'sec-b' },
      { materialLinks: [{ materialId: 'mat-1', sectionId: 'sec-b' }] },
      { compendiumSectionId: 'sec-a' },
      { materialLinks: [{ materialId: 'mat-1' }] },
    ] as Array<Pick<Question, 'compendiumSectionId' | 'materialLinks'>>;
    expect(compararComPublicado(publicado, arquivo, questoes).questoesEmSecoesQueSomem).toBe(2);
    expect(compararComPublicado(publicado, arquivoIgual(), questoes).questoesEmSecoesQueSomem).toBe(0);
  });

  it('arquivo sem palavras-chave vira "Geral": para material sem palavras-chave, não é mudança', () => {
    const semTags = materialPublicado({ tags: [] });
    const arquivo = ler(exportarMaterialParaMarkdown(semTags, [disciplina], [tema]).texto);
    expect(arquivo.tags).toEqual(['Geral']);
    expect(compararComPublicado(semTags, arquivo).identico).toBe(true);
    // Mas para um material COM palavras-chave, perder todas é mudança.
    const previa = compararComPublicado(publicado, arquivo);
    expect(previa.campos.map((c) => c.campo)).toContain('Palavras-chave');
  });
});
