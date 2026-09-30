import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { Discipline, Theme } from '../../src/types';
import {
  ESTADOS_DO_ENVIO,
  LIMITE_ENVIOS_EM_ESPERA,
  LIMITE_TEXTO_BYTES,
  avaliarEnvio,
  estadoEmPalavras,
  lerArquivoParaEnvio,
  mensagemDeErroDoEnvio,
  tamanhoEmBytes,
  tamanhoLegivel,
} from '../../src/utils/envioDeMaterial';
import { materialComPendencia, materialParaEnvio } from '../e2e/fixtures/materialParaEnvio';

// 44-E — regras que a tela aplica ao vivo ao arquivo do envio. A checagem do
// padrão e a importação são as de sempre; aqui se prova o que é do envio:
// tamanho, Disciplina/Tema escolhidos contra os do arquivo, e o aceite.

const disc = (id: string, name: string): Discipline => ({
  id,
  name,
  code: id,
  icon: 'book',
  description: '',
  cycle: 'basico',
  color: '#000',
});
const tema = (id: string, disciplineId: string, name: string): Theme => ({
  id,
  disciplineId,
  name,
  description: '',
  highYield: false,
  order: 1,
});

const disciplinas = [disc('d-farma', 'Farmacologia'), disc('d-cardio', 'Cardiologia')];
const temas = [tema('t-clinica', 'd-farma', 'Clínica'), tema('t-basica', 'd-cardio', 'Básica')];
const escolhaCerta = { disciplineId: 'd-farma', themeId: 't-clinica' };

function avaliar(texto: string, escolha = escolhaCerta) {
  return avaliarEnvio(lerArquivoParaEnvio(texto, disciplinas, temas), escolha, disciplinas, temas);
}

describe('44-E — avaliação ao vivo do arquivo', () => {
  it('arquivo conforme, com Disciplina e Tema certos, é aceito', () => {
    const r = avaliar(materialParaEnvio());
    expect(r.errosDeImportacao).toEqual([]);
    expect(r.pendencias).toEqual([]);
    expect(r.problemasDeCatalogo).toEqual([]);
    expect(r.aceito).toBe(true);
  });

  it('a leitura devolve o título e o que o arquivo declara, resolvido no catálogo', () => {
    const l = lerArquivoParaEnvio(materialParaEnvio({ titulo: 'Título X' }), disciplinas, temas);
    expect(l.titulo).toBe('Título X');
    expect(l.disciplinaDoArquivo).toEqual({ nome: 'Farmacologia', id: 'd-farma' });
    expect(l.temaDoArquivo).toEqual({ nome: 'Clínica', id: 't-clinica' });
  });

  it('pendência do padrão (a mesma de checar:material) barra o envio', () => {
    const r = avaliar(materialComPendencia());
    expect(r.pendencias.length).toBeGreaterThan(0);
    expect(r.pendencias[0]).toMatchObject({ regra: 'comparador-ascii' });
    expect(r.aceito).toBe(false);
  });

  it('arquivo que a importação recusa (sem Tema) barra o envio, com a mensagem dela', () => {
    const r = avaliar(materialParaEnvio().replace(/\*\*Tema:\*\*.*\n/, ''));
    expect(r.errosDeImportacao.join(' ')).toMatch(/não informa o tema/);
    expect(r.aceito).toBe(false);
  });

  it('Disciplina do arquivo que não existe no catálogo barra o envio', () => {
    const r = avaliar(materialParaEnvio({ disciplina: 'Inventada' }));
    expect(r.problemasDeCatalogo.join(' ')).toContain('(“Inventada”) não existe no catálogo');
    expect(r.aceito).toBe(false);
  });

  it('Disciplina escolhida diferente da do arquivo barra o envio', () => {
    const r = avaliar(materialParaEnvio(), { disciplineId: 'd-cardio', themeId: 't-basica' });
    expect(r.problemasDeCatalogo.join(' ')).toMatch(
      /Disciplina escrita no arquivo \(“Farmacologia”\) não é a que você escolheu \(“Cardiologia”\)/,
    );
    expect(r.aceito).toBe(false);
  });

  it('Tema escolhido de outra Disciplina conta como Tema não escolhido', () => {
    const r = avaliar(materialParaEnvio(), { disciplineId: 'd-farma', themeId: 't-basica' });
    expect(r.problemasDeCatalogo).toContain('Escolha o Tema do material.');
    expect(r.aceito).toBe(false);
  });

  it('sem Disciplina escolhida, pede a escolha', () => {
    const r = avaliar(materialParaEnvio(), { disciplineId: '', themeId: '' });
    expect(r.problemasDeCatalogo).toContain('Escolha a Disciplina do material.');
    expect(r.aceito).toBe(false);
  });

  it('texto vazio não é aceito e não acusa erro nenhum', () => {
    const r = avaliar('   \n');
    expect(r).toMatchObject({ vazio: true, aceito: false, errosDeImportacao: [], pendencias: [], problemasDeCatalogo: [] });
  });

  it('acima de 300 KB não é aceito, contando bytes e não letras', () => {
    const noLimite = 'a'.repeat(LIMITE_TEXTO_BYTES);
    expect(tamanhoEmBytes(noLimite)).toBe(LIMITE_TEXTO_BYTES);
    const acentuado = 'é'.repeat(153601);
    expect(acentuado.length).toBeLessThan(LIMITE_TEXTO_BYTES);
    expect(tamanhoEmBytes(acentuado)).toBeGreaterThan(LIMITE_TEXTO_BYTES);

    const grande = materialParaEnvio({ corpo: 'x '.repeat(160000) + '[1](#ref-1)[2](#ref-2).' });
    const r = avaliar(grande);
    expect(r.tamanhoExcedido).toBe(true);
    expect(r.aceito).toBe(false);
    expect(tamanhoLegivel(LIMITE_TEXTO_BYTES)).toBe('300 KB');
  });
});

describe('44-E — os limites da tela são os do banco', () => {
  const migration = readFileSync(
    path.resolve(process.cwd(), 'supabase/migrations/20260929120000_envio_de_material_44e.sql'),
    'utf8',
  );

  it('300 KB e 3 envios esperando revisão estão na migration com os mesmos números', () => {
    expect(migration).toContain(`octet_length(content_md) between 1 and ${LIMITE_TEXTO_BYTES}`);
    expect(migration).toContain(`>= ${LIMITE_ENVIOS_EM_ESPERA} then`);
  });

  it('os estados são os da tabela', () => {
    for (const estado of ESTADOS_DO_ENVIO) expect(migration).toContain(`'${estado}'`);
    expect(ESTADOS_DO_ENVIO).toHaveLength(6);
  });
});

describe('44-E — palavras leigas', () => {
  it('cada estado tem nome e explicação em português, sem o código interno', () => {
    for (const estado of ESTADOS_DO_ENVIO) {
      const { rotulo, explicacao } = estadoEmPalavras(estado);
      expect(rotulo.length).toBeGreaterThan(3);
      expect(explicacao.length).toBeGreaterThan(10);
      expect(rotulo).not.toMatch(/_/);
    }
    expect(estadoEmPalavras('aguardando_revisao').rotulo).toBe('Aguardando revisão');
    expect(estadoEmPalavras('nao_apto').rotulo).toBe('Precisa de correção');
  });

  it('estado que não conhece não quebra a tela', () => {
    expect(estadoEmPalavras('inventado').rotulo).toBe('Estado desconhecido');
  });
});

describe('44-E — erro do banco em uma frase leiga', () => {
  it('limite de envios esperando', () => {
    const m = mensagemDeErroDoEnvio({
      code: 'P0001',
      message: 'Você já tem 3 envios esperando revisão',
      hint: 'limite_envios_em_espera',
    });
    expect(m).toBe(
      'Você já tem 3 envios esperando revisão. Quando a revisão de um deles terminar, você poderá enviar outro.',
    );
  });

  it('texto acima de 300 KB', () => {
    const m = mensagemDeErroDoEnvio({
      code: '23514',
      message: 'new row for relation "material_submissions" violates check constraint "material_submissions_content_size"',
    });
    expect(m).toMatch(/passa de 300 KB/);
  });

  it('material acima não publicado', () => {
    expect(mensagemDeErroDoEnvio({ code: 'P0001', message: 'o material acima precisa estar publicado' })).toMatch(
      /Escolha outro/,
    );
  });

  it('qualquer outro erro não vaza texto técnico', () => {
    const m = mensagemDeErroDoEnvio({ code: 'XX000', message: 'relation "x" does not exist' });
    expect(m).toBe('Não foi possível enviar o material agora. Tente de novo em instantes.');
  });
});
