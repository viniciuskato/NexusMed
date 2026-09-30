import { describe, it, expect, vi } from 'vitest';
import {
  executarCiclo,
  type ApiDeLotes,
  type Banco,
  type DepsDoCiclo,
  type ParaPublicar,
  type Pendente,
} from '../../supabase/functions/revisar-envios/ciclo.ts';
import { bancoDoSupabase } from '../../supabase/functions/revisar-envios/banco.ts';
import * as validacaoGerada from '../../supabase/functions/revisar-envios/gerado/validacao.js';
import type { ModuloDeValidacao } from '../../supabase/functions/revisar-envios/tipos.ts';
import { lerMaterialParaPublicar } from '../../src/utils/envioDeMaterial';
import type { Discipline, Theme } from '../../src/types';
import { materialParaEnvio } from '../e2e/fixtures/materialParaEnvio';

// 44-G — o ciclo publica o que a revisão aprovou. O banco é simulado; o que
// vale aqui é o encadeamento (coleta, depois publicação), o que vai ao banco e
// que uma falha de um envio não derruba o ciclo nem os outros.

const catalogo = {
  disciplines: [{ id: 'd1', name: 'Farmacologia' }],
  themes: [{ id: 't1', name: 'Clínica', disciplineId: 'd1' }],
};
const disciplinasDoTipo: Discipline[] = catalogo.disciplines.map((d) => ({
  ...d,
  code: 'FARM',
  icon: 'pill',
  description: '',
  cycle: 'clinico',
  color: '#0F766E',
}));
const temasDoTipo: Theme[] = catalogo.themes.map((t) => ({ ...t, description: '', highYield: false, order: 1 }));

function pronto(n: number, texto = materialParaEnvio({ titulo: `Material ${n}` })): ParaPublicar {
  return { submissionId: `sub-${n}`, reviewId: `rev-${n}`, texto, sha256: `sha-${n}`, disciplineId: 'd1', themeId: 't1' };
}

interface Cenario {
  prontos?: ParaPublicar[];
  pendentes?: Pendente[];
  desfecho?: 'publicado' | 'ja_publicado' | 'recusado' | 'falhou';
  falhaAoBuscar?: boolean;
  falhaAoPublicarNo?: number;
  /** O banco não aceita a recusa (o envio já mudou de estado). */
  recusaNaoAceita?: boolean;
}

function montar(c: Cenario = {}) {
  const ordem: string[] = [];
  const recados: string[] = [];
  const publicados: Array<{ envio: ParaPublicar; material: Record<string, unknown> }> = [];
  const banco: Banco = {
    travar: async () => 'tok',
    destravar: async () => undefined,
    liberarReservasVelhas: async () => 0,
    pendentes: async () => c.pendentes ?? [],
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
      if (c.falhaAoBuscar) throw new Error('banco fora do ar');
      return c.prontos ?? [];
    }),
    publicar: vi.fn(async (envio, material) => {
      ordem.push(`publicar:${envio.submissionId}`);
      if (c.falhaAoPublicarNo !== undefined && envio.submissionId === `sub-${c.falhaAoPublicarNo}`) throw new Error('banco caiu');
      publicados.push({ envio, material });
      return { desfecho: c.desfecho ?? 'publicado', materialId: c.desfecho === 'recusado' ? null : `mat-${envio.submissionId}` };
    }),
    paraPublicarQuestoes: async () => [],
    publicarQuestoes: async () => ({ desfecho: 'fora_de_estado' as const, questionIds: [] }),
    recusarPublicacaoDeQuestoes: async () => false,
    recusarPublicacao: vi.fn(async (envio: ParaPublicar, recado: string) => {
      ordem.push(`recusar:${envio.submissionId}`);
      recados.push(recado);
      return !c.recusaNaoAceita;
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
  return { deps, banco, ordem, publicados, recados };
}

describe('44-G — o texto aprovado vira o material que o banco recebe', () => {
  it('lê o .md com o importador da tela: título, subtítulo, autor, tempo, tags, seções e referências', () => {
    const leitura = lerMaterialParaPublicar(materialParaEnvio({ titulo: 'Meu material' }), disciplinasDoTipo, temasDoTipo);
    expect(leitura.ok).toBe(true);
    if (!leitura.ok) return;
    const m = leitura.material;
    expect(m.title).toBe('Meu material');
    expect(m.subtitle).toBe('Exemplo para teste');
    expect(m.estimated_read_time_minutes).toBe(12);
    expect(m.tags).toEqual(['exemplo', 'teste']);
    expect(m.sections).toHaveLength(1);
    expect(m.sections[0]).toMatchObject({ title: 'Primeira seção', mechanism_tag: 'Visão geral' });
    expect(m.sections[0].content).toContain('Texto de exemplo');
    expect(m.references).toHaveLength(2);
    // Disciplina, Tema e material acima NÃO vão no material: o banco os toma do envio.
    expect(Object.keys(m)).not.toContain('discipline_id');
    expect(Object.keys(m)).not.toContain('theme_id');
    expect(Object.keys(m)).not.toContain('parent_material_id');
  });

  it('texto que o importador recusa não vira material (e o motivo vem em palavras)', () => {
    const leitura = lerMaterialParaPublicar('sem título nenhum', disciplinasDoTipo, temasDoTipo);
    expect(leitura.ok).toBe(false);
    if (leitura.ok) return;
    expect(leitura.motivos.length).toBeGreaterThan(0);
  });

  it('o pacote gerado para o servidor faz a mesma leitura que a tela', () => {
    const modulo = validacaoGerada as unknown as ModuloDeValidacao;
    const texto = materialParaEnvio({ titulo: 'Igual à tela' });
    expect(modulo.lerMaterialParaPublicar(texto, catalogo.disciplines, catalogo.themes)).toEqual(
      lerMaterialParaPublicar(texto, disciplinasDoTipo, temasDoTipo),
    );
  });
});

describe('44-G — o ciclo publica os envios aprovados', () => {
  it('publica cada envio pronto, com o material lido do texto, o id da revisão e o hash do texto', async () => {
    const { deps, banco, publicados } = montar({ prontos: [pronto(1), pronto(2)] });
    const resumo = await executarCiclo(deps);
    expect(banco.paraPublicar).toHaveBeenCalledTimes(1);
    expect(publicados.map((p) => p.envio.submissionId)).toEqual(['sub-1', 'sub-2']);
    expect(publicados[0].envio).toMatchObject({ reviewId: 'rev-1', sha256: 'sha-1', disciplineId: 'd1', themeId: 't1' });
    expect(publicados[0].material).toMatchObject({ title: 'Material 1' });
    expect(resumo).toMatchObject({ publicados: 2, publicacoesRecusadas: 0 });
    expect(resumo.erros).toEqual([]);
  });

  it('sem envio pronto, não pede o catálogo nem publica nada', async () => {
    const { deps, banco } = montar();
    const resumo = await executarCiclo(deps);
    expect(banco.publicar).not.toHaveBeenCalled();
    expect(banco.catalogo).not.toHaveBeenCalled();
    expect(resumo.publicados).toBe(0);
  });

  it('o banco recusou (título repetido, material acima fora do ar): conta como recusa, sem erro do ciclo', async () => {
    const { deps } = montar({ prontos: [pronto(1)], desfecho: 'recusado' });
    const resumo = await executarCiclo(deps);
    expect(resumo).toMatchObject({ publicados: 0, publicacoesRecusadas: 1 });
    expect(resumo.erros).toEqual([]);
  });

  it('um envio já publicado (idempotência do banco) não conta de novo', async () => {
    const { deps } = montar({ prontos: [pronto(1)], desfecho: 'ja_publicado' });
    const resumo = await executarCiclo(deps);
    expect(resumo).toMatchObject({ publicados: 0, publicacoesRecusadas: 0 });
  });

  it('se publicar um envio falha, o erro vai no resumo e os outros seguem', async () => {
    const { deps, publicados } = montar({ prontos: [pronto(1), pronto(2), pronto(3)], falhaAoPublicarNo: 2 });
    const resumo = await executarCiclo(deps);
    expect(publicados.map((p) => p.envio.submissionId)).toEqual(['sub-1', 'sub-3']);
    expect(resumo.publicados).toBe(2);
    expect(resumo.erros.join(' ')).toContain('publicação sub-2: banco caiu');
  });

  it('se buscar os envios prontos falha, o ciclo não quebra: o erro vai no resumo e o resto do ciclo roda', async () => {
    const { deps, banco } = montar({ falhaAoBuscar: true });
    const resumo = await executarCiclo(deps);
    expect(resumo.erros.join(' ')).toContain('publicação (buscar envios): banco fora do ar');
    expect(banco.reservar).toHaveBeenCalled();
  });

  it('texto que já não é lido pelo importador não é publicado e SAI da fila: vai a "não apto" com recado leigo, e os outros seguem', async () => {
    const { deps, banco, publicados, recados, ordem } = montar({ prontos: [pronto(1, 'texto sem título'), pronto(2)] });
    const resumo = await executarCiclo(deps);
    expect(banco.publicar).toHaveBeenCalledTimes(1);
    expect(publicados.map((p) => p.envio.submissionId)).toEqual(['sub-2']);
    expect(ordem).toEqual(['paraPublicar', 'recusar:sub-1', 'publicar:sub-2']);
    expect(recados).toHaveLength(1);
    expect(recados[0]).toMatch(/^O texto foi aprovado na revisão, mas não pôde ser montado como material: /);
    expect(recados[0]).toMatch(/Corrija o texto e envie de novo\.$/);
    expect(resumo.erros.join(' ')).toContain('publicação sub-1: texto não lido');
    expect(resumo).toMatchObject({ publicados: 1, publicacoesRecusadas: 1 });
  });

  it('o recado leva no máximo 5 motivos (a pessoa não recebe uma parede de texto)', async () => {
    const { deps, recados } = montar({ prontos: [pronto(1)] });
    deps.lerMaterial = () => ({ ok: false, motivos: ['m1.', 'm2.', 'm3.', 'm4.', 'm5.', 'm6.', 'm7.'] });
    await executarCiclo(deps);
    expect(recados[0]).toContain('m5.');
    expect(recados[0]).not.toContain('m6.');
  });

  it('se ler o texto lança exceção, o efeito é o mesmo: recusa com recado, sem derrubar o ciclo', async () => {
    const { deps, recados, banco } = montar({ prontos: [pronto(1), pronto(2)] });
    let n = 0;
    const original = deps.lerMaterial;
    deps.lerMaterial = (e, c) => {
      n += 1;
      if (n === 1) throw new Error('importador quebrou');
      return original(e, c);
    };
    const resumo = await executarCiclo(deps);
    expect(recados[0]).toContain('erro ao ler o texto (importador quebrou)');
    expect(banco.publicar).toHaveBeenCalledTimes(1);
    expect(resumo).toMatchObject({ publicados: 1, publicacoesRecusadas: 1 });
  });

  it('se o banco não aceita a recusa (o envio já mudou de estado), não conta como recusa e o ciclo segue', async () => {
    const { deps } = montar({ prontos: [pronto(1, 'texto sem título')], recusaNaoAceita: true });
    const resumo = await executarCiclo(deps);
    expect(resumo.publicacoesRecusadas).toBe(0);
    expect(resumo.publicados).toBe(0);
  });

  it('publica ANTES de reservar envios novos, e mesmo com uma tentativa incerta pendente (a publicação não gasta com a IA)', async () => {
    const incerta: Pendente = { reviewId: 'rev-9', status: 'incerta', batchId: null, tentativaEm: '2026-09-30T12:00:00.000Z' };
    const { deps, banco, ordem } = montar({ prontos: [pronto(1)], pendentes: [incerta] });
    const resumo = await executarCiclo(deps);
    expect(ordem).toEqual(['paraPublicar', 'publicar:sub-1']);
    expect(resumo.publicados).toBe(1);
    // ...e a incerta pendente segura o lote novo.
    expect(resumo.semLoteNovoPorIncerta).toBe(true);
    expect(banco.reservar).not.toHaveBeenCalled();
  });

  it('passado o prazo do ciclo, não publica (fica para o próximo disparo)', async () => {
    let agora = 0;
    const { deps, banco } = montar({ prontos: [pronto(1)] });
    deps.agora = () => agora;
    deps.prazoMs = 10;
    (banco.pendentes as ReturnType<typeof vi.fn>) = vi.fn(async () => {
      agora += 100; // a coleta estoura o prazo
      return [];
    });
    const resumo = await executarCiclo(deps);
    expect(banco.publicar).not.toHaveBeenCalled();
    expect(resumo.publicados).toBe(0);
  });
});

describe('44-G — do envio ao material publicado, com a revisão simulada (ciclo inteiro, uma vez só)', () => {
  /** Um banco em memória com o comportamento que importa: só o "apto" do texto atual publica, e uma vez. */
  function mundo(veredito: 'apto' | 'nao_apto' | 'erro', inicial: { envio?: string; revisao?: string } = {}) {
    const envio = { reviewId: 'rev-1', submissionId: 'sub-1', titulo: 'Material 1', texto: materialParaEnvio({ titulo: 'Material 1' }), sha256: 'sha-1', disciplineId: 'd1', themeId: 't1', disciplina: 'Farmacologia', tema: 'Clínica', pai: null };
    const estado = { envio: inicial.envio ?? 'aguardando_revisao', revisao: inicial.revisao ?? 'nenhuma', batch: null as string | null, materiais: [] as string[], publicacoes: 0 };
    const banco: Banco = {
      travar: async () => 'tok',
      destravar: async () => undefined,
      liberarReservasVelhas: async () => 0,
      pendentes: async () =>
        estado.revisao === 'submetida' ? [{ reviewId: 'rev-1', status: 'submetida' as const, batchId: estado.batch, tentativaEm: null }] : [],
      reservar: async () => {
        if (estado.envio !== 'aguardando_revisao') return [];
        estado.envio = 'em_revisao';
        estado.revisao = 'reservada';
        return [envio];
      },
      dadosDoEnvio: async () => [],
      catalogo: async () => catalogo,
      marcarIncerta: async () => null,
      anexarLote: async (_ids, batch) => {
        estado.revisao = 'submetida';
        estado.batch = batch;
        return 1;
      },
      liberar: async () => 0,
      pausar: async () => true,
      registrar: async (r) => {
        estado.revisao = 'concluida:' + r.veredito;
        estado.envio = r.veredito;
        return true;
      },
      paraPublicar: async () =>
        estado.envio === 'apto' && estado.revisao === 'concluida:apto'
          ? [{ submissionId: 'sub-1', reviewId: 'rev-1', texto: envio.texto, sha256: 'sha-1', disciplineId: 'd1', themeId: 't1' }]
          : [],
      paraPublicarQuestoes: async () => [],
      publicarQuestoes: async () => ({ desfecho: 'fora_de_estado' as const, questionIds: [] }),
      recusarPublicacaoDeQuestoes: async () => false,
      recusarPublicacao: async () => true,
      publicar: async () => {
        if (estado.envio === 'publicado') return { desfecho: 'ja_publicado' as const, materialId: estado.materiais[0] };
        estado.envio = 'publicado';
        estado.materiais.push('mat-1');
        estado.publicacoes += 1;
        return { desfecho: 'publicado' as const, materialId: 'mat-1' };
      },
    };
    const resposta = (texto: string) => ({
      type: 'succeeded' as const,
      message: { stop_reason: 'end_turn', model: 'simulado', content: [{ type: 'text', text: texto }], usage: { input_tokens: 1, output_tokens: 1 } },
    });
    const texto =
      veredito === 'apto'
        ? 'Achados.\n\nAPTO PARA ENVIAR'
        : veredito === 'nao_apto'
          ? 'Achados.\n\nNÃO APTO — 1 achado grave'
          : 'resposta sem veredito nenhum';
    const api: ApiDeLotes = {
      criar: async () => ({ id: 'msgbatch_1' }),
      consultar: async () => ({ status: 'ended' as const }),
      resultados: async function* () {
        yield { custom_id: 'rev-1', result: resposta(texto) };
      },
      listar: async () => [],
      cancelar: async () => undefined,
    };
    const modulo = validacaoGerada as unknown as ModuloDeValidacao;
    const deps: DepsDoCiclo = {
      banco,
      api,
      conferir: (e, cat) => {
        const av = modulo.avaliarEnvio(modulo.lerArquivoParaEnvio(e.texto, cat.disciplines, cat.themes), { disciplineId: e.disciplineId ?? '', themeId: e.themeId ?? '' }, cat.disciplines, cat.themes);
        return { aceito: av.aceito, motivos: modulo.motivosDaReprovacao(av) };
      },
      lerMaterial: (e, cat) => modulo.lerMaterialParaPublicar(e.texto, cat.disciplines, cat.themes),
      baseDoRevisor: 'BASE',
      baseSha256: 'sha',
      novoCodigo: () => 'codigo',
    };
    return { deps, estado };
  }

  it('apto: o 1º ciclo manda ao lote, o 2º coleta e publica, o 3º não publica de novo', async () => {
    const { deps, estado } = mundo('apto');
    const r1 = await executarCiclo(deps);
    expect(r1).toMatchObject({ enviadosAoLote: 1, publicados: 0 });
    expect(estado.envio).toBe('em_revisao');

    const r2 = await executarCiclo(deps);
    expect(r2).toMatchObject({ resultadosRegistrados: 1, publicados: 1 });
    expect(estado).toMatchObject({ envio: 'publicado', materiais: ['mat-1'], publicacoes: 1 });

    const r3 = await executarCiclo(deps);
    expect(r3.publicados).toBe(0);
    expect(estado.publicacoes).toBe(1);
  });

  it('"Tentar de novo": o envio já volta "apto" com a revisão apto do mesmo texto, e SÓ a publicação é refeita (nenhum lote, nenhuma reserva de envio, nenhuma revisão nova)', async () => {
    const { deps, estado } = mundo('apto', { envio: 'apto', revisao: 'concluida:apto' });
    const criar = vi.spyOn(deps.api, 'criar');
    const r = await executarCiclo(deps);
    expect(r.publicados).toBe(1);
    expect(r.enviadosAoLote).toBe(0);
    expect(criar).not.toHaveBeenCalled();
    expect(estado).toMatchObject({ envio: 'publicado', publicacoes: 1, materiais: ['mat-1'], revisao: 'concluida:apto' });
  });

  it.each(['nao_apto', 'erro'] as const)('%s: nada é publicado', async (veredito) => {
    const { deps, estado } = mundo(veredito);
    await executarCiclo(deps);
    const r2 = await executarCiclo(deps);
    expect(r2.publicados).toBe(0);
    expect(estado.materiais).toEqual([]);
    expect(estado.publicacoes).toBe(0);
    expect(estado.envio).toBe(veredito);
  });
});

describe('44-G — a ponte com o Supabase chama só as funções do servidor da publicação', () => {
  it('paraPublicar e publicar mapeiam para revisao_envios_para_publicar e revisao_publicar_envio', async () => {
    const chamadas: Array<{ fn: string; args?: Record<string, unknown> }> = [];
    const cliente = {
      rpc: (fn: string, args?: Record<string, unknown>) => {
        chamadas.push({ fn, args });
        const data =
          fn === 'revisao_envios_para_publicar'
            ? [{ submission_id: 's1', review_id: 'r1', content_md: '# T', content_sha256: 'h', discipline_id: 'd1', theme_id: 't1' }]
            : { resultado: 'publicado', material_id: 'm1' };
        return Promise.resolve({ data, error: null });
      },
      from: () => ({ select: () => Promise.resolve({ data: [], error: null }) }),
    };
    const banco = bancoDoSupabase(cliente);
    const prontos = await banco.paraPublicar(7);
    expect(prontos).toEqual([{ submissionId: 's1', reviewId: 'r1', texto: '# T', sha256: 'h', disciplineId: 'd1', themeId: 't1' }]);
    const r = await banco.publicar(prontos[0], { title: 'T' });
    expect(r).toEqual({ desfecho: 'publicado', materialId: 'm1' });
    expect(chamadas[0]).toEqual({ fn: 'revisao_envios_para_publicar', args: { p_max: 7 } });
    expect(chamadas[1]).toEqual({
      fn: 'revisao_publicar_envio',
      args: { p_submission_id: 's1', p_review_id: 'r1', p_content_sha256: 'h', p_material: { title: 'T' } },
    });
  });

  it('resposta vazia do banco nunca vira "publicado" (falha fechada)', async () => {
    const cliente = {
      rpc: () => Promise.resolve({ data: null, error: null }),
      from: () => ({ select: () => Promise.resolve({ data: [], error: null }) }),
    };
    const r = await bancoDoSupabase(cliente).publicar(pronto(1), {});
    expect(r.desfecho).toBe('fora_de_estado');
  });

  it('erro do banco sobe como exceção', async () => {
    const cliente = {
      rpc: () => Promise.resolve({ data: null, error: { message: 'permission denied' } }),
      from: () => ({ select: () => Promise.resolve({ data: [], error: null }) }),
    };
    await expect(bancoDoSupabase(cliente).paraPublicar(1)).rejects.toThrow('revisao_envios_para_publicar: permission denied');
  });
});
