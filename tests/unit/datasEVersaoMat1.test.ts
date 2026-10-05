import { describe, expect, it } from 'vitest';
import { datasDoMaterial, formatarDia } from '../../src/utils/datasDoMaterial';
import { VERSAO_ATUAL_DO_PADRAO, padraoDesatualizado, versaoDoPadraoDoTexto } from '../../src/utils/compendiumStandardCheck';
import {
  MARCA_MATERIAL_ATUAL,
  montarArquivoParaAtualizar,
  nomeDoArquivoParaAtualizar,
  textoDeAberturaParaAtualizar,
} from '../../src/utils/baixarParaAtualizar';
import { exportarMaterialParaMarkdown } from '../../src/utils/exportarMaterial';
import { PARTE_1_DO_PADRAO, PROMPT_CRIAR_MATERIAL, TEXTO_COPIAR_CRIAR } from '../../src/content/padraoMaterial';
import { lerMaterialParaPublicar } from '../../src/utils/envioDeMaterial';
import type { Compendium, Discipline, Theme } from '../../src/types';
import { materialParaEnvio } from '../e2e/fixtures/materialParaEnvio';

// MAT-1 — as regras de datas, a versão do padrão lida do texto, o desatualizado e a montagem do arquivo "Baixar para atualizar".

describe('MAT-1 — formatarDia / datasDoMaterial', () => {
  it('formata dd/mm/aaaa e recusa o que não é data', () => {
    expect(formatarDia('2026-10-02T15:00:00.000Z')).toBe('02/10/2026');
    expect(formatarDia('')).toBe('');
    expect(formatarDia(null)).toBe('');
    expect(formatarDia(undefined)).toBe('');
    expect(formatarDia('Revisão pendente')).toBe('');
  });

  it('publicação e atualização em dias diferentes: as duas', () => {
    expect(datasDoMaterial({ publishedAt: '2026-09-10T15:00:00.000Z', lastUpdated: '2026-10-02T15:00:00.000Z' })).toEqual({
      publicado: '10/09/2026',
      atualizado: '02/10/2026',
    });
  });

  it('no mesmo dia, ou atualização antes da publicação: só a publicação', () => {
    expect(datasDoMaterial({ publishedAt: '2026-09-10T12:00:00.000Z', lastUpdated: '2026-09-10T18:00:00.000Z' }).atualizado).toBe('');
    expect(datasDoMaterial({ publishedAt: '2026-09-10T12:00:00.000Z', lastUpdated: '2026-09-01T12:00:00.000Z' }).atualizado).toBe('');
  });

  it('sem data de publicação: só a atualização, se houver', () => {
    expect(datasDoMaterial({ publishedAt: null, lastUpdated: '2026-10-02T15:00:00.000Z' })).toEqual({ publicado: '', atualizado: '02/10/2026' });
    expect(datasDoMaterial({ publishedAt: undefined, lastUpdated: '' })).toEqual({ publicado: '', atualizado: '' });
  });
});

describe('MAT-1 — versão do padrão', () => {
  it('lê a versão declarada no cabeçalho', () => {
    expect(versaoDoPadraoDoTexto(materialParaEnvio())).toBe(3);
    expect(versaoDoPadraoDoTexto(materialParaEnvio().replace('**Versão do padrão:** 3', '**Versão do padrão:** 2'))).toBe(2);
  });

  it('sem a linha, com valor que não é número positivo, ou fora do cabeçalho: nula', () => {
    expect(versaoDoPadraoDoTexto(materialParaEnvio().replace('**Versão do padrão:** 3\n', ''))).toBeNull();
    expect(versaoDoPadraoDoTexto(materialParaEnvio().replace('**Versão do padrão:** 3', '**Versão do padrão:** três'))).toBeNull();
    expect(versaoDoPadraoDoTexto(materialParaEnvio().replace('**Versão do padrão:** 3', '**Versão do padrão:** 0'))).toBeNull();
    expect(versaoDoPadraoDoTexto(materialParaEnvio().replace('**Versão do padrão:** 3\n', '').concat('\n**Versão do padrão:** 3\n'))).toBeNull();
  });

  it('desatualizado: nula (desconhecida) ou menor que a atual; a atual e as futuras, não', () => {
    expect(padraoDesatualizado(null)).toBe(true);
    expect(padraoDesatualizado(undefined)).toBe(true);
    expect(padraoDesatualizado(VERSAO_ATUAL_DO_PADRAO - 1)).toBe(true);
    expect(padraoDesatualizado(VERSAO_ATUAL_DO_PADRAO)).toBe(false);
    expect(padraoDesatualizado(VERSAO_ATUAL_DO_PADRAO + 1)).toBe(false);
  });

  it('a versão que a exportação escreve é a registrada do material, e a leitura a devolve (ida e volta)', () => {
    const disciplina = { id: 'd1', name: 'Farmacologia' } as Discipline;
    const tema = { id: 't1', disciplineId: 'd1', name: 'Clínica' } as Theme;
    const material = {
      title: 'Diuréticos',
      subtitle: 'S',
      author: '',
      estimatedReadTimeMinutes: 12,
      tags: [],
      sections: [{ id: 'a', title: 'Mecanismo', content: 'Texto.', keyTakeaways: [] }],
      references: [],
      disciplineId: 'd1',
      themeId: 't1',
    } as unknown as Compendium;
    const exportada = (standardVersion: number | null) =>
      versaoDoPadraoDoTexto(exportarMaterialParaMarkdown({ ...material, standardVersion }, [disciplina], [tema]).texto);
    expect(exportada(VERSAO_ATUAL_DO_PADRAO)).toBe(VERSAO_ATUAL_DO_PADRAO);
    expect(exportada(2)).toBe(2);
    expect(exportada(null)).toBeNull();
  });

  it('o importador lê o material com a linha da versão sem tropeçar nela', () => {
    const d = [{ id: 'd1', name: 'Farmacologia' }] as Discipline[];
    const t = [{ id: 't1', disciplineId: 'd1', name: 'Clínica' }] as Theme[];
    expect(lerMaterialParaPublicar(materialParaEnvio(), d, t).ok).toBe(true);
  });
});

describe('MAT-1 — montagem do arquivo "Baixar para atualizar"', () => {
  const material = '# Cardiac anatomy\n\n**Disciplina:** X\n**Versão do padrão:** 3\n\n### Seção\n\nTexto atual.\n';

  it('a abertura é o texto exato da ordem, com o título e a versão', () => {
    expect(textoDeAberturaParaAtualizar('Cardiac anatomy', 3)).toBe(
      'Atualizar o material "Cardiac anatomy" para o padrão NexusMed de conteúdos, versão 3.\n' +
        '\n' +
        'Reescreva o material que está no fim deste arquivo seguindo o prompt e o padrão abaixo. Mantenha o mesmo assunto e o mesmo lugar na árvore, escreva em português do Brasil e entregue um único arquivo .md completo, com a linha "**Versão do padrão:** 3".',
    );
  });

  it('as três partes aparecem, nesta ordem: abertura, prompt + Parte 1 do padrão, material atual', () => {
    const arquivo = montarArquivoParaAtualizar({
      titulo: 'Cardiac anatomy',
      versaoDoPadrao: VERSAO_ATUAL_DO_PADRAO,
      promptEPadrao: TEXTO_COPIAR_CRIAR,
      materialAtual: material,
    });
    const iAbertura = arquivo.indexOf('Atualizar o material "Cardiac anatomy"');
    const iPrompt = arquivo.indexOf(PROMPT_CRIAR_MATERIAL);
    const iPadrao = arquivo.indexOf(PARTE_1_DO_PADRAO);
    const iMarca = arquivo.indexOf(MARCA_MATERIAL_ATUAL);
    const iMaterial = arquivo.indexOf('# Cardiac anatomy\n');
    expect(iAbertura).toBe(0);
    expect(iPrompt).toBeGreaterThan(iAbertura);
    expect(iPadrao).toBeGreaterThan(iPrompt);
    expect(iMarca).toBeGreaterThan(iPadrao);
    expect(iMaterial).toBeGreaterThan(iMarca);
    expect(arquivo.endsWith('Texto atual.\n')).toBe(true);
  });

  it('a Parte 2 do padrão (de quem opera o site) não vai no arquivo', () => {
    const arquivo = montarArquivoParaAtualizar({
      titulo: 'T',
      versaoDoPadrao: VERSAO_ATUAL_DO_PADRAO,
      promptEPadrao: TEXTO_COPIAR_CRIAR,
      materialAtual: material,
    });
    expect(arquivo).not.toMatch(/^# Parte 2\b/m);
    expect(PARTE_1_DO_PADRAO).not.toMatch(/^# Parte 2\b/m);
    expect(arquivo).toMatch(/^# Parte 1\b/m);
  });

  it('o nome leva o título do material e o dia de hoje', () => {
    expect(nomeDoArquivoParaAtualizar('cardiac-anatomy.md', new Date(2026, 9, 4, 22, 30))).toBe('cardiac-anatomy-para-atualizar-2026-10-04.txt');
    expect(nomeDoArquivoParaAtualizar('material.md', new Date(2026, 0, 5))).toBe('material-para-atualizar-2026-01-05.txt');
  });
});
