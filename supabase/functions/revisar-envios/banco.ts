// Ponte entre o ciclo e o Supabase (44-F): cada método é uma chamada às funções
// `revisao_*` da migration 20260930120000, que só o service_role executa.
import type { Banco, Catalogo, DesfechoDaPublicacao, ParaPublicar, Pendente, Reservado, ResultadoRegistrado, Uso } from './ciclo.ts';

export interface ClienteDoBanco {
  rpc(fn: string, args?: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message: string } | null }>;
  from(tabela: string): {
    select(colunas: string): PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>;
  };
}

interface LinhaDeReserva {
  review_id: string;
  submission_id: string;
  title: string;
  content_md: string;
  content_sha256?: string;
  discipline_id: string;
  theme_id: string;
  discipline_name: string | null;
  theme_name: string | null;
  parent_title: string | null;
  continuation?: unknown[][] | null;
  attempt?: number;
}

function doReservado(l: LinhaDeReserva): Reservado {
  return {
    reviewId: l.review_id,
    submissionId: l.submission_id,
    titulo: l.title,
    texto: l.content_md,
    sha256: l.content_sha256 ?? '',
    disciplineId: l.discipline_id,
    themeId: l.theme_id,
    disciplina: l.discipline_name ?? '',
    tema: l.theme_name ?? '',
    pai: l.parent_title,
    continuacao: l.continuation ?? null,
    tentativa: l.attempt,
  };
}

interface LinhaParaPublicar {
  submission_id: string;
  review_id: string;
  content_md: string;
  content_sha256: string;
  discipline_id: string;
  theme_id: string;
}

interface LinhaPendente {
  review_id: string;
  status: 'submetida' | 'pausada' | 'incerta';
  batch_id: string | null;
  tentativa_em: string | null;
}

export function bancoDoSupabase(cliente: ClienteDoBanco): Banco {
  async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
    const { data, error } = await cliente.rpc(fn, args);
    if (error) throw new Error(`${fn}: ${error.message}`);
    return data as T;
  }
  const uso = (u: Uso) => ({
    p_input_tokens: u.entrada,
    p_output_tokens: u.saida,
    p_cache_creation_tokens: u.cacheCriado,
    p_cache_read_tokens: u.cacheLido,
    p_web_searches: u.buscas,
    p_web_fetches: u.leituras,
  });

  return {
    async travar() {
      return (await rpc<string | null>('revisao_tentar_travar', { p_seconds: 240 })) ?? null;
    },
    async destravar(token) {
      await rpc<null>('revisao_destravar', { p_token: token });
    },
    async marcarIncerta(reviewIds) {
      return (await rpc<string | null>('revisao_marcar_incerta', { p_review_ids: reviewIds })) ?? null;
    },
    async liberarReservasVelhas() {
      return (await rpc<number | null>('revisao_liberar_reservas_velhas', { p_minutes: 15 })) ?? 0;
    },
    async pendentes(): Promise<Pendente[]> {
      const linhas = (await rpc<LinhaPendente[] | null>('revisao_pendentes')) ?? [];
      return linhas.map((l) => ({ reviewId: l.review_id, status: l.status, batchId: l.batch_id, tentativaEm: l.tentativa_em }));
    },
    async reservar(max) {
      const linhas = (await rpc<LinhaDeReserva[] | null>('revisao_reservar_envios', { p_max: max })) ?? [];
      return linhas.map(doReservado);
    },
    async dadosDoEnvio(reviewIds) {
      const linhas = (await rpc<LinhaDeReserva[] | null>('revisao_dados_do_envio', { p_review_ids: reviewIds })) ?? [];
      return linhas.map(doReservado);
    },
    async catalogo(): Promise<Catalogo> {
      const d = await cliente.from('disciplines').select('id, name');
      const t = await cliente.from('themes').select('id, name, discipline_id');
      if (d.error) throw new Error(`disciplines: ${d.error.message}`);
      if (t.error) throw new Error(`themes: ${t.error.message}`);
      return {
        disciplines: ((d.data ?? []) as Array<{ id: string; name: string }>).map((x) => ({ id: x.id, name: x.name })),
        themes: ((t.data ?? []) as Array<{ id: string; name: string; discipline_id: string }>).map((x) => ({
          id: x.id,
          name: x.name,
          disciplineId: x.discipline_id,
        })),
      };
    },
    async anexarLote(reviewIds, batchId) {
      return (await rpc<number>('revisao_anexar_lote', { p_review_ids: reviewIds, p_batch_id: batchId })) ?? 0;
    },
    async liberar(reviewIds) {
      return (await rpc<number>('revisao_liberar', { p_review_ids: reviewIds })) ?? 0;
    },
    async pausar(reviewId, continuacao, u) {
      return Boolean(await rpc<boolean>('revisao_pausar', { p_review_id: reviewId, p_continuation: continuacao, ...uso(u) }));
    },
    async paraPublicar(max): Promise<ParaPublicar[]> {
      const linhas = (await rpc<LinhaParaPublicar[] | null>('revisao_envios_para_publicar', { p_max: max })) ?? [];
      return linhas.map((l) => ({
        submissionId: l.submission_id,
        reviewId: l.review_id,
        texto: l.content_md,
        sha256: l.content_sha256,
        disciplineId: l.discipline_id,
        themeId: l.theme_id,
      }));
    },
    async publicar(envio, material) {
      const r = await rpc<{ resultado: DesfechoDaPublicacao; material_id?: string } | null>('revisao_publicar_envio', {
        p_submission_id: envio.submissionId,
        p_review_id: envio.reviewId,
        p_content_sha256: envio.sha256,
        p_material: material,
      });
      return { desfecho: r?.resultado ?? 'fora_de_estado', materialId: r?.material_id ?? null };
    },
    async recusarPublicacao(envio, recado) {
      return Boolean(
        await rpc<boolean>('revisao_recusar_publicacao', {
          p_submission_id: envio.submissionId,
          p_review_id: envio.reviewId,
          p_content_sha256: envio.sha256,
          p_note: recado,
        }),
      );
    },
    async registrar(r: ResultadoRegistrado) {
      return Boolean(
        await rpc<boolean>('revisao_registrar_resultado', {
          p_review_id: r.reviewId,
          p_verdict: r.veredito,
          p_verdict_line: r.linhaDoVeredito,
          p_findings_text: r.achados,
          p_correction_block: r.blocoDeCorrecao,
          p_error_kind: r.tipoDeErro,
          p_model: r.modelo,
          p_prompt_sha256: r.sistemaSha256,
          ...uso(r.uso),
          p_stop_reason: r.stopReason,
          p_billable: r.cobravel,
        }),
      );
    },
  };
}
