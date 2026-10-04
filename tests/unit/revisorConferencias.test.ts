import { describe, expect, it } from 'vitest';
import type { Conferencia, LeitorDeMaterial, LeitorDeQuestoes } from '../../supabase/functions/revisar-envios/ciclo.ts';
import { montarConferencias } from '../../supabase/functions/revisar-envios/conferencias.ts';
import * as validacaoGerada from '../../supabase/functions/revisar-envios/gerado/validacao.js';
import type { ModuloDeValidacao } from '../../supabase/functions/revisar-envios/tipos.ts';
import { materialComPendencia, materialParaEnvio } from '../e2e/fixtures/materialParaEnvio';
import { loteParaEnvio } from '../e2e/fixtures/questoesParaEnvio';

// D-12 — as conferências saíram de `index.ts` (Edge Function) para `conferencias.ts`, para o revisor local
// usar as MESMAS regras. Este teste prova que a Edge Function continua igual: a cópia abaixo é, linha por
// linha, o texto que estava em `index.ts` em 1adc62a (antes da extração), e o resultado tem de coincidir.

const modulo = validacaoGerada as unknown as ModuloDeValidacao;

// --- o que `index.ts` fazia antes (cópia fiel) ---
const conferirAntes: Conferencia = (envio, catalogo) => {
  if (envio.tipo === 'questoes') {
    const leituraDoLote = modulo.lerLoteDeQuestoes(envio.texto, catalogo.disciplines, catalogo.themes);
    const avaliacaoDoLote = modulo.avaliarLote(leituraDoLote, catalogo.materiais ?? [], envio.materiais ?? []);
    return { aceito: avaliacaoDoLote.aceito, motivos: modulo.motivosDaRecusaDoLote(avaliacaoDoLote) };
  }
  const leitura = modulo.lerArquivoParaEnvio(envio.texto, catalogo.disciplines, catalogo.themes);
  const avaliacao = modulo.avaliarEnvio(
    leitura,
    { disciplineId: envio.disciplineId ?? '', themeId: envio.themeId ?? '' },
    catalogo.disciplines,
    catalogo.themes,
  );
  return { aceito: avaliacao.aceito, motivos: modulo.motivosDaReprovacao(avaliacao) };
};
const lerMaterialAntes: LeitorDeMaterial = (envio, catalogo) =>
  modulo.lerMaterialParaPublicar(envio.texto, catalogo.disciplines, catalogo.themes);
const lerQuestoesAntes: LeitorDeQuestoes = (envio, catalogo) =>
  modulo.lerQuestoesParaPublicar(envio.texto, catalogo.disciplines, catalogo.themes);

const catalogo = {
  disciplines: [
    { id: 'd1', name: 'Farmacologia' },
    { id: 'd2', name: 'Pneumologia' },
  ],
  themes: [
    { id: 't1', name: 'Clínica', disciplineId: 'd1' },
    { id: 't2', name: 'Espirometria', disciplineId: 'd2' },
  ],
  materiais: [{ id: 'm1', title: 'Espirometria: como interpretar' }],
};

const base = { reviewId: 'r', submissionId: 's', titulo: 'T', sha256: 'h', disciplina: '', tema: '', pai: null };

describe('conferencias.ts (extraído de index.ts) faz exatamente o que index.ts fazia', () => {
  const agora = montarConferencias(modulo);

  const materiais = [
    ['material conforme', materialParaEnvio()],
    ['material com pendência', materialComPendencia()],
    ['material vazio', ''],
    ['material com linha de lixo', '# Só um título'],
  ] as const;
  for (const [nome, texto] of materiais) {
    it(`conferir — ${nome}`, () => {
      const envio = { ...base, texto, disciplineId: 'd1', themeId: 't1' };
      expect(agora.conferir(envio, catalogo)).toEqual(conferirAntes(envio, catalogo));
    });
    it(`ler para publicar — ${nome}`, () => {
      const envio = { submissionId: 's', reviewId: 'r', texto, sha256: 'h', disciplineId: 'd1', themeId: 't1' };
      expect(agora.lerMaterial(envio, catalogo)).toEqual(lerMaterialAntes(envio, catalogo));
    });
  }

  it('material com Disciplina e Tema que não batem com a escolha: mesma recusa', () => {
    const envio = { ...base, texto: materialParaEnvio(), disciplineId: 'd2', themeId: 't2' };
    const r = agora.conferir(envio, catalogo);
    expect(r).toEqual(conferirAntes(envio, catalogo));
    expect(r.aceito).toBe(false);
  });

  const lotes = [
    ['lote conforme', loteParaEnvio(2)],
    ['lote com a banca fora do padrão', loteParaEnvio(1, { instituicao: null })],
    ['lote vazio', ''],
  ] as const;
  for (const [nome, texto] of lotes) {
    it(`conferir — ${nome}`, () => {
      const envio = { ...base, tipo: 'questoes' as const, texto, disciplineId: null, themeId: null, materiais: ['Espirometria: como interpretar'] };
      expect(agora.conferir(envio, catalogo)).toEqual(conferirAntes(envio, catalogo));
    });
    it(`ler para publicar — ${nome}`, () => {
      const envio = { submissionId: 's', reviewId: 'r', texto, sha256: 'h' };
      expect(agora.lerQuestoes(envio, catalogo)).toEqual(lerQuestoesAntes(envio, catalogo));
    });
  }

  it('o lote conforme é aceito e vira questões; o material conforme é aceito e vira material', () => {
    const lote = { ...base, tipo: 'questoes' as const, texto: loteParaEnvio(1), disciplineId: null, themeId: null, materiais: ['Espirometria: como interpretar'] };
    expect(agora.conferir(lote, catalogo).aceito).toBe(true);
    expect(agora.lerQuestoes({ submissionId: 's', reviewId: 'r', texto: loteParaEnvio(1), sha256: 'h' }, catalogo)).toMatchObject({ ok: true });
    expect(agora.conferir({ ...base, texto: materialParaEnvio(), disciplineId: 'd1', themeId: 't1' }, catalogo).aceito).toBe(true);
    expect(agora.lerMaterial({ submissionId: 's', reviewId: 'r', texto: materialParaEnvio(), sha256: 'h', disciplineId: 'd1', themeId: 't1' }, catalogo)).toMatchObject({ ok: true });
  });
});
