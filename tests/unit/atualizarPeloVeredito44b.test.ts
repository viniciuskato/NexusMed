import { describe, it, expect, vi } from 'vitest';
import {
  executarCiclo,
  type ApiDeLotes,
  type Banco,
  type DepsDoCiclo,
  type DesfechoDaAplicacao,
  type ParaAplicarAtualizacao,
  type ParaPublicar,
} from '../../supabase/functions/revisar-envios/ciclo.ts';
import { bancoDoSupabase, type ClienteDoBanco } from '../../supabase/functions/revisar-envios/banco.ts';
import * as validacaoGerada from '../../supabase/functions/revisar-envios/gerado/validacao.js';
import type { ModuloDeValidacao } from '../../supabase/functions/revisar-envios/tipos.ts';
import { materialParaEnvio } from '../e2e/fixtures/materialParaEnvio';

// 44-B — o ciclo do servidor aplica a atualização que a revisão aprovou: uma vez só,
// pela função do banco, e uma falha de um envio não derruba o ciclo nem os outros.
// O banco é simulado; o que vale aqui é o encadeamento e o que vai ao banco.

const catalogo = {
  disciplines: [{ id: 'd1', name: 'Farmacologia' }],
  themes: [{ id: 't1', name: 'Clínica', disciplineId: 'd1' }],
};

function atualizacao(n: number, texto = materialParaEnvio({ titulo: `Material ${n}` })): ParaAplicarAtualizacao {
  return { submissionId: `upd-${n}`, reviewId: `rev-${n}`, texto, sha256: `sha-${n}`, materialId: `mat-${n}` };
}

interface Cenario {
  prontas?: ParaAplicarAtualizacao[];
  desfecho?: DesfechoDaAplicacao;
  falhaAoBuscar?: boolean;
  falhaAoAplicarNo?: number;
  paraPublicar?: ParaPublicar[];
}

function montar(c: Cenario = {}) {
  const ordem: string[] = [];
  const aplicadas: Array<{ envio: ParaAplicarAtualizacao; material: Record<string, unknown> }> = [];
  const recusadas: Array<{ id: string; recado: string }> = [];
  const banco: Banco = {
    travar: async () => 'tok',
    destravar: async () => undefined,
    liberarReservasVelhas: async () => 0,
    pendentes: async () => [],
    reservar: vi.fn(async () => []),
    dadosDoEnvio: async () => [],
    catalogo: vi.fn(async () => catalogo),
    marcarIncerta: async () => null,
    anexarLote: async () => 0,
    liberar: async () => 0,
    pausar: async () => true,
    registrar: async () => true,
    paraPublicar: vi.fn(async () => {
      ordem.push('paraPublicar');
      return c.paraPublicar ?? [];
    }),
    publicar: vi.fn(async (envio: ParaPublicar) => {
      ordem.push(`publicar:${envio.submissionId}`);
      return { desfecho: 'publicado' as const, materialId: 'novo' };
    }),
    paraPublicarQuestoes: async () => [],
    publicarQuestoes: async () => ({ desfecho: 'fora_de_estado' as const, questionIds: [] }),
    recusarPublicacaoDeQuestoes: async () => false,
    recusarPublicacao: vi.fn(async (envio: ParaPublicar, recado: string) => {
      ordem.push(`recusar:${envio.submissionId}`);
      recusadas.push({ id: envio.submissionId, recado });
      return true;
    }),
    paraAplicarAtualizacoes: vi.fn(async () => {
      ordem.push('paraAplicar');
      if (c.falhaAoBuscar) throw new Error('banco fora do ar');
      return c.prontas ?? [];
    }),
    aplicarAtualizacao: vi.fn(async (envio, material) => {
      ordem.push(`aplicar:${envio.submissionId}`);
      if (c.falhaAoAplicarNo !== undefined && envio.submissionId === `upd-${c.falhaAoAplicarNo}`) throw new Error('banco caiu');
      aplicadas.push({ envio, material });
      return { desfecho: c.desfecho ?? ('aplicado' as const), materialId: envio.materialId };
    }),
  };
  const api: ApiDeLotes = {
    criar: vi.fn(async () => ({ id: 'x' })),
    consultar: async () => ({ status: 'ended' as const }),
    resultados: async function* () {},
    listar: async () => [],
    cancelar: async () => undefined,
  };
  const modulo = validacaoGerada as unknown as ModuloDeValidacao;
  const deps: DepsDoCiclo = {
    banco,
    api,
    conferir: () => ({ aceito: true, motivos: [] }),
    lerMaterial: (envio, cat) => modulo.lerMaterialParaPublicar(envio.texto, cat.disciplines, cat.themes),
    baseDoRevisor: 'BASE',
    baseSha256: 'sha',
    novoCodigo: () => 'codigo',
  };
  return { deps, banco, ordem, aplicadas, recusadas };
}

describe('44-B — o ciclo aplica a atualização aprovada pelo revisor', () => {
  it('lê o texto como o importador da tela e entrega ao banco o material lido, com a revisão e o hash do envio', async () => {
    const { deps, aplicadas } = montar({ prontas: [atualizacao(1, materialParaEnvio({ titulo: 'Título novo' }))] });
    const resumo = await executarCiclo(deps);
    expect(aplicadas).toHaveLength(1);
    expect(aplicadas[0].envio).toMatchObject({ submissionId: 'upd-1', reviewId: 'rev-1', sha256: 'sha-1', materialId: 'mat-1' });
    expect(aplicadas[0].material).toMatchObject({ title: 'Título novo' });
    expect((aplicadas[0].material.sections as unknown[]).length).toBeGreaterThan(0);
    expect(resumo.atualizados).toBe(1);
    expect(resumo.erros).toEqual([]);
  });

  it('nada aprovado, nada feito: sem atualização pronta, o banco não é chamado para aplicar', async () => {
    const { deps, banco } = montar();
    const resumo = await executarCiclo(deps);
    expect(banco.aplicarAtualizacao).not.toHaveBeenCalled();
    expect(resumo.atualizados).toBe(0);
  });

  it('a aplicação vem depois da publicação de material novo, uma por envio', async () => {
    const { deps, ordem } = montar({
      prontas: [atualizacao(1), atualizacao(2)],
      paraPublicar: [
        { submissionId: 'novo-1', reviewId: 'r', texto: materialParaEnvio({ titulo: 'Novo' }), sha256: 's', disciplineId: 'd1', themeId: 't1' },
      ],
    });
    await executarCiclo(deps);
    expect(ordem.filter((o) => o !== 'paraAplicar' && o !== 'paraPublicar')).toEqual(['publicar:novo-1', 'aplicar:upd-1', 'aplicar:upd-2']);
  });

  it('só as atualizações que mudaram o conteúdo contam como atualizadas; recusa e falha contam como recusadas', async () => {
    for (const [desfecho, atualizados, recusadas] of [
      ['aplicado', 1, 0],
      ['sem_mudanca', 0, 0],
      ['ja_publicado', 0, 0],
      ['recusado', 0, 1],
      ['falhou', 0, 1],
      ['fora_de_estado', 0, 0],
      ['revisao_invalida', 0, 0],
    ] as const) {
      const { deps } = montar({ prontas: [atualizacao(1)], desfecho });
      const resumo = await executarCiclo(deps);
      expect([desfecho, resumo.atualizados, resumo.publicacoesRecusadas]).toEqual([desfecho, atualizados, recusadas]);
    }
  });

  it('texto aprovado que o importador não lê: o material não muda, o envio vai a "não apto" com recado, e o ciclo segue', async () => {
    const { deps, banco, recusadas, aplicadas } = montar({ prontas: [atualizacao(1, 'sem título nenhum'), atualizacao(2)] });
    const resumo = await executarCiclo(deps);
    expect(banco.aplicarAtualizacao).toHaveBeenCalledTimes(1);
    expect(aplicadas.map((a) => a.envio.submissionId)).toEqual(['upd-2']);
    expect(recusadas).toHaveLength(1);
    expect(recusadas[0].id).toBe('upd-1');
    expect(recusadas[0].recado).toContain('O material publicado não foi alterado');
    expect(resumo.publicacoesRecusadas).toBe(1);
    expect(resumo.atualizados).toBe(1);
  });

  it('falha do banco em um envio não derruba o ciclo nem os outros', async () => {
    const { deps, aplicadas } = montar({ prontas: [atualizacao(1), atualizacao(2)], falhaAoAplicarNo: 1 });
    const resumo = await executarCiclo(deps);
    expect(aplicadas.map((a) => a.envio.submissionId)).toEqual(['upd-2']);
    expect(resumo.erros.some((e) => e.includes('upd-1') && e.includes('banco caiu'))).toBe(true);
    expect(resumo.atualizados).toBe(1);
  });

  it('falha ao buscar as atualizações prontas vira erro do resumo, sem derrubar o resto do ciclo', async () => {
    const { deps, ordem } = montar({ falhaAoBuscar: true });
    const resumo = await executarCiclo(deps);
    expect(resumo.erros.some((e) => e.includes('atualização (buscar envios)'))).toBe(true);
    expect(ordem).toContain('paraPublicar');
  });
});

describe('44-B — a ponte com o banco chama as funções certas', () => {
  it('lista os envios de atualização e aplica pela função do banco, sem inventar nada', async () => {
    const chamadas: Array<{ nome: string; args: Record<string, unknown> }> = [];
    const cliente: ClienteDoBanco = {
      rpc: async (nome, args) => {
        chamadas.push({ nome, args: args ?? {} });
        if (nome === 'revisao_envios_de_atualizacao_para_aplicar') {
          return { data: [{ submission_id: 's1', review_id: 'r1', content_md: '# x', content_sha256: 'h1', target_material_id: 'm1' }], error: null };
        }
        if (nome === 'revisao_aplicar_atualizacao') return { data: { resultado: 'aplicado', material_id: 'm1' }, error: null };
        return { data: null, error: null };
      },
      from: () => {
        throw new Error('não usado');
      },
    };
    const banco = bancoDoSupabase(cliente);
    const prontas = await banco.paraAplicarAtualizacoes(5);
    expect(prontas).toEqual([{ submissionId: 's1', reviewId: 'r1', texto: '# x', sha256: 'h1', materialId: 'm1' }]);
    const r = await banco.aplicarAtualizacao(prontas[0], { title: 'T' });
    expect(r).toEqual({ desfecho: 'aplicado', materialId: 'm1' });
    expect(chamadas).toEqual([
      { nome: 'revisao_envios_de_atualizacao_para_aplicar', args: { p_max: 5 } },
      { nome: 'revisao_aplicar_atualizacao', args: { p_submission_id: 's1', p_review_id: 'r1', p_content_sha256: 'h1', p_material: { title: 'T' } } },
    ]);
  });
});
