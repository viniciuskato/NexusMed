import { describe, it, expect } from 'vitest';
import { bancoDoSupabase } from '../../supabase/functions/revisar-envios/banco.ts';
import {
  RPCS_PERMITIDAS,
  SQL_DA_FILA,
  clienteDoBanco,
  dadosDaChamada,
  falhaDeConexao,
  filaTemTrabalho,
  lerLinhas,
  literalSql,
  primeiraLinha,
  sqlDaChamada,
  sqlDaLeitura,
} from '../../scripts/revisor-local/banco-cli.ts';

// D-12 — a ponte do revisor local com o banco: só as funções `revisao_*` da lista fechada, só com
// os parâmetros e tipos certos, e nenhuma escrita direta em tabela. Nada aqui toca banco nenhum.

const U1 = '11111111-1111-4111-8111-111111111111';
const U2 = '22222222-2222-4222-8222-222222222222';

describe('literalSql', () => {
  it('escreve cada tipo com o cast certo', () => {
    expect(literalSql(5, 'int')).toBe('5::int');
    expect(literalSql(true, 'boolean')).toBe('true');
    expect(literalSql(U1, 'uuid')).toBe(`'${U1}'::uuid`);
    expect(literalSql([U1, U2], 'uuid[]')).toBe(`array['${U1}', '${U2}']::uuid[]`);
    expect(literalSql([], 'uuid[]')).toBe(`'{}'::uuid[]`);
    expect(literalSql(null, 'text')).toBe('null::text');
    expect(literalSql(undefined, 'jsonb')).toBe('null::jsonb');
  });

  it('dobra aspas e protege a barra invertida (texto de envio pode ter os dois)', () => {
    expect(literalSql("it's", 'text')).toBe(`'it''s'::text`);
    expect(literalSql('a\\b', 'text')).toBe(`E'a\\\\b'::text`);
    expect(literalSql("a\\'b", 'text')).toBe(`E'a\\\\''b'::text`);
    expect(literalSql('com\u0000nulo', 'text')).toBe(`'comnulo'::text`);
  });

  it('manda o jsonb como texto JSON entre aspas, sem escapar nada além do necessário', () => {
    expect(literalSql({ t: "d'água", n: [1, 2] }, 'jsonb')).toBe(`'{"t":"d''água","n":[1,2]}'::jsonb`);
    expect(literalSql([['a']], 'jsonb')).toBe(`'[["a"]]'::jsonb`);
  });

  it('recusa valor do tipo errado, antes de qualquer comando', () => {
    expect(() => literalSql('5', 'int')).toThrow();
    expect(() => literalSql(1.5, 'int')).toThrow();
    expect(() => literalSql('x', 'boolean')).toThrow();
    expect(() => literalSql(3, 'text')).toThrow();
    expect(() => literalSql("'; drop table x; --", 'uuid')).toThrow();
    expect(() => literalSql([U1, 'nao-e-uuid'], 'uuid[]')).toThrow();
    expect(() => literalSql(U1, 'uuid[]')).toThrow();
  });
});

describe('sqlDaChamada', () => {
  it('chama só pelo nome, com argumentos nomeados, no formato do retorno', () => {
    expect(sqlDaChamada('revisao_pendentes')).toBe('select to_jsonb(t) as r from public.revisao_pendentes() as t');
    expect(sqlDaChamada('revisao_reservar_envios', { p_max: 1 })).toBe(
      'select to_jsonb(t) as r from public.revisao_reservar_envios(p_max => 1::int) as t',
    );
    expect(sqlDaChamada('revisao_tentar_travar', { p_seconds: 240 })).toBe(
      'select to_jsonb(public.revisao_tentar_travar(p_seconds => 240::int)) as r',
    );
    expect(sqlDaChamada('revisao_destravar', { p_token: U1 })).toBe(`select public.revisao_destravar(p_token => '${U1}'::uuid) is null as r`);
  });

  it('argumento indefinido some (vale o padrão da função)', () => {
    expect(sqlDaChamada('revisao_reservar_envios', { p_max: undefined })).toBe(
      'select to_jsonb(t) as r from public.revisao_reservar_envios() as t',
    );
  });

  it('recusa função fora da lista, parâmetro desconhecido e escrita direta', () => {
    expect(() => sqlDaChamada('revisao_pausar', {})).toThrow(/fora da lista/);
    expect(() => sqlDaChamada('revisao_publicar_envio', {})).toThrow(/fora da lista/);
    expect(() => sqlDaChamada('delete_everything', {})).toThrow(/fora da lista/);
    expect(() => sqlDaChamada('revisao_liberar; drop table x', {})).toThrow(/fora da lista/);
    expect(() => sqlDaChamada('revisao_reservar_envios', { p_max: 1, p_extra: 2 })).toThrow(/desconhecido/);
  });

  it('só funções revisao_* do schema public estão na lista', () => {
    for (const nome of Object.keys(RPCS_PERMITIDAS)) expect(nome).toMatch(/^revisao_[a-z_]+$/);
    // Nenhuma instrução de escrita sai de nenhuma chamada: só select.
    for (const nome of Object.keys(RPCS_PERMITIDAS)) {
      expect(sqlDaChamada(nome, {})).toMatch(/^select /);
    }
  });
});

describe('a lista cobre o que a ponte da Edge Function (banco.ts) chama para ACONSELHAR, e nada que publique', () => {
  /** Funções do banco.ts que o revisor local NÃO chama: publicam, aplicam, recusam publicação, ou só existem para a API de lotes. */
  const FORA = new Set([
    'revisao_pausar',
    'revisao_envios_para_publicar',
    'revisao_publicar_envio',
    'revisao_recusar_publicacao',
    'revisao_envios_de_atualizacao_para_aplicar',
    'revisao_aplicar_atualizacao',
    'revisao_envios_de_questoes_para_publicar',
    'revisao_publicar_questoes',
    'revisao_recusar_publicacao_de_questoes',
  ]);

  it('toda função e todo parâmetro que sobram em bancoDoSupabase estão na lista, com o tipo certo; as de publicar ficam recusadas', async () => {
    const chamadas: Array<{ fn: string; args: Record<string, unknown> | undefined }> = [];
    const cliente = {
      rpc: async (fn: string, args?: Record<string, unknown>) => {
        chamadas.push({ fn, args });
        return { data: null, error: null };
      },
      from: () => ({ select: () => ({ order: () => ({ range: async () => ({ data: [], error: null }) }) }) }),
    };
    const banco = bancoDoSupabase(cliente);
    const material = { title: 't' };
    const uso = { entrada: 1, saida: 2, cacheCriado: 3, cacheLido: 4, buscas: 0, leituras: 0 };
    const publicar = { submissionId: U1, reviewId: U2, texto: 'x', sha256: 'abc', disciplineId: U1, themeId: U2 };
    await banco.travar();
    await banco.destravar(U1);
    await banco.marcarIncerta([U1]);
    await banco.liberarReservasVelhas();
    await banco.pendentes();
    await banco.reservar(1);
    await banco.dadosDoEnvio([U1]);
    await banco.anexarLote([U1], 'local-1');
    await banco.liberar([U1]);
    await banco.pausar(U1, [], uso);
    await banco.paraPublicar(5);
    await banco.publicar(publicar, material);
    await banco.recusarPublicacao(publicar, 'recado');
    await banco.paraAplicarAtualizacoes(5);
    await banco.aplicarAtualizacao({ submissionId: U1, reviewId: U2, texto: 'x', sha256: 'abc', materialId: U1 }, material);
    await banco.paraPublicarQuestoes(5);
    await banco.publicarQuestoes({ submissionId: U1, reviewId: U2, texto: 'x', sha256: 'abc' }, [material]);
    await banco.recusarPublicacaoDeQuestoes({ submissionId: U1, reviewId: U2, texto: 'x', sha256: 'abc' }, 'recado');
    await banco.registrar({
      reviewId: U1, veredito: 'apto', linhaDoVeredito: 'APTO PARA ENVIAR', achados: 'a', blocoDeCorrecao: null, tipoDeErro: null,
      modelo: 'm', sistemaSha256: 'h', uso, stopReason: 'end_turn', cobravel: true,
    });

    const usadas = chamadas.filter((c) => !FORA.has(c.fn));
    for (const c of usadas) {
      expect(RPCS_PERMITIDAS[c.fn], `função ${c.fn}`).toBeDefined();
      // Não pode lançar: parâmetros conhecidos e valores do tipo certo.
      expect(() => sqlDaChamada(c.fn, c.args ?? {}), `chamada ${c.fn}`).not.toThrow();
    }
    for (const nome of FORA) {
      expect(RPCS_PERMITIDAS[nome], `${nome} não pode estar na lista`).toBeUndefined();
      expect(() => sqlDaChamada(nome, {})).toThrow(/fora da lista/);
    }
    // E a lista não guarda função que ninguém chama.
    const chamadas1 = new Set(usadas.map((c) => c.fn));
    for (const nome of Object.keys(RPCS_PERMITIDAS)) expect(chamadas1.has(nome), `lista tem ${nome} sem uso`).toBe(true);
    // Nenhuma função que publique, aplique ou recuse publicação, por nome.
    for (const nome of Object.keys(RPCS_PERMITIDAS)) expect(nome).not.toMatch(/publica|aplicar|recusar/);
  });
});

describe('leitura do catálogo e da fila', () => {
  it('lê só as colunas das tabelas do catálogo, em páginas', () => {
    expect(sqlDaLeitura('disciplines', 'id, name', 'id', 0, 999)).toBe(
      'select to_jsonb(t) as r from (select id, name from public.disciplines order by id offset 0 limit 1000) as t',
    );
    expect(sqlDaLeitura('materials', 'id, title, status', 'id', 1000, 1999)).toContain('offset 1000 limit 1000');
    expect(() => sqlDaLeitura('profiles', 'id', 'id', 0, 9)).toThrow(/fora da lista/);
    expect(() => sqlDaLeitura('materials', 'id, content_md', 'id', 0, 9)).toThrow(/coluna/);
    expect(() => sqlDaLeitura('materials', 'id', 'id; drop table x', 0, 9)).toThrow(/ordena/);
  });

  it('a consulta da fila só lê', () => {
    expect(SQL_DA_FILA).toMatch(/^select /);
    expect(SQL_DA_FILA).not.toMatch(/\b(insert|update|delete|drop|alter|truncate|grant)\b/i);
  });

  it('fila vazia quando a contagem é 0, com trabalho quando é maior', async () => {
    expect(await filaTemTrabalho(async () => [{ n: 0 }])).toBe(false);
    expect(await filaTemTrabalho(async () => [{ n: 2 }])).toBe(true);
    expect(await filaTemTrabalho(async () => [])).toBe(false);
  });
});

describe('dados e erros', () => {
  it('devolve o que o PostgREST devolveria', () => {
    expect(dadosDaChamada('revisao_pendentes', [{ r: { review_id: U1 } }, { r: { review_id: U2 } }])).toEqual([{ review_id: U1 }, { review_id: U2 }]);
    expect(dadosDaChamada('revisao_pendentes', [])).toEqual([]);
    expect(dadosDaChamada('revisao_tentar_travar', [{ r: U1 }])).toBe(U1);
    expect(dadosDaChamada('revisao_tentar_travar', [{ r: null }])).toBeNull();
    expect(dadosDaChamada('revisao_destravar', [{ r: true }])).toBeNull();
    expect(dadosDaChamada('revisao_registrar_resultado', [{ r: true }])).toBe(true);
  });

  it('lê a saída do supabase db query nos dois formatos', () => {
    expect(lerLinhas('[{"a":1}]')).toEqual([{ a: 1 }]);
    expect(lerLinhas('{"boundary":"x","rows":[{"a":1}],"warning":"w"}')).toEqual([{ a: 1 }]);
    expect(() => lerLinhas('{"x":1}')).toThrow();
    expect(() => lerLinhas('não é json')).toThrow();
  });

  it('só falha de CONEXÃO é repetida (nada rodou); erro depois do SQL enviado, nunca', () => {
    expect(falhaDeConexao('supabase db query: failed to connect to postgres: failed to connect to `host=127.0.0.1`: Connection timed out')).toBe(true);
    expect(falhaDeConexao('dial tcp 10.0.0.1:5432: connection refused')).toBe(true);
    expect(falhaDeConexao('supabase db query: failed to execute query: error: Você já tem 3 envios esperando revisão')).toBe(false);
    expect(falhaDeConexao('context deadline exceeded')).toBe(false);
    expect(falhaDeConexao('supabase db query: Command failed: timeout')).toBe(false);
  });

  it('o erro leva só a primeira linha, no máximo 200 caracteres', () => {
    expect(primeiraLinha(new Error('primeira\nsegunda com texto do envio'))).toBe('primeira');
    expect(primeiraLinha(new Error('x'.repeat(500))).length).toBe(201);
  });

  it('erro do executor vira { error } no formato do cliente, nunca exceção', async () => {
    const cliente = clienteDoBanco(async () => {
      throw new Error('boom\nlinha com conteúdo');
    });
    expect(await cliente.rpc('revisao_pendentes')).toEqual({ data: null, error: { message: 'boom' } });
    expect(await cliente.rpc('revisao_pausar', {})).toEqual({ data: null, error: { message: 'função fora da lista permitida: revisao_pausar' } });
    const leitura = await cliente.from('disciplines').select('id, name').order('id').range(0, 9);
    expect(leitura).toEqual({ data: null, error: { message: 'boom' } });
  });

  it('o cliente chama o executor com o SQL da lista e devolve os dados no formato esperado', async () => {
    const vistos: string[] = [];
    const cliente = clienteDoBanco(async (sql) => {
      vistos.push(sql);
      return sql.includes('revisao_pendentes') ? [{ r: { review_id: U1 } }] : [{ r: 7 }];
    });
    expect(await cliente.rpc('revisao_pendentes')).toEqual({ data: [{ review_id: U1 }], error: null });
    expect(await cliente.rpc('revisao_liberar', { p_review_ids: [U1] })).toEqual({ data: 7, error: null });
    expect(vistos).toHaveLength(2);
  });
});
