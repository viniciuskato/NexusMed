import { describe, it, expect } from 'vitest';
import { revisaoQueValeParaOTexto } from '../../src/repositories/MaterialSubmissionsRepository';

// 44-F, rodada 2 — qual revisão o autor vê ao lado de cada envio.

const HASH = 'hash-do-texto-atual';
const revisao = (over: Record<string, unknown> = {}) => ({
  id: 'r1',
  status: 'concluida',
  verdict: 'nao_apto' as const,
  findings_text: 'achados',
  correction_block: 'bloco',
  error_kind: null,
  content_sha256: HASH,
  completed_at: '2026-09-30T12:00:00.000Z',
  created_at: '2026-09-30T11:00:00.000Z',
  ...over,
});

describe('revisaoQueValeParaOTexto', () => {
  it('envio fora da fila com revisão do texto atual: mostra a revisão', () => {
    for (const status of ['nao_apto', 'apto', 'erro', 'publicado']) {
      expect(revisaoQueValeParaOTexto({ status, content_sha256: HASH, reviews: [revisao()] })?.verdict).toBe('nao_apto');
    }
  });

  it('depois de "Tentar de novo" (mesmo texto, envio de volta à fila), a revisão antiga do mesmo hash NÃO aparece', () => {
    expect(revisaoQueValeParaOTexto({ status: 'aguardando_revisao', content_sha256: HASH, reviews: [revisao()] })).toBeNull();
    expect(revisaoQueValeParaOTexto({ status: 'em_revisao', content_sha256: HASH, reviews: [revisao()] })).toBeNull();
  });

  it('revisão de outro texto (hash diferente) nunca aparece', () => {
    expect(revisaoQueValeParaOTexto({ status: 'nao_apto', content_sha256: HASH, reviews: [revisao({ content_sha256: 'outro' })] })).toBeNull();
  });

  it('só valem revisões terminadas, e vale a mais recente', () => {
    const r = revisaoQueValeParaOTexto({
      status: 'nao_apto',
      content_sha256: HASH,
      reviews: [
        revisao({ id: 'antiga', completed_at: '2026-09-29T10:00:00.000Z', verdict: 'erro', status: 'erro' }),
        revisao({ id: 'em-andamento', status: 'submetida', verdict: null, completed_at: null, created_at: '2026-09-30T13:00:00.000Z' }),
        revisao({ id: 'nova', completed_at: '2026-09-30T12:30:00.000Z' }),
      ],
    });
    expect(r?.id).toBe('nova');
  });

  it('sem hash do envio ou sem revisões, nada aparece', () => {
    expect(revisaoQueValeParaOTexto({ status: 'nao_apto', content_sha256: null, reviews: [revisao()] })).toBeNull();
    expect(revisaoQueValeParaOTexto({ status: 'nao_apto', content_sha256: HASH, reviews: [] })).toBeNull();
    expect(revisaoQueValeParaOTexto({ status: 'nao_apto', content_sha256: HASH })).toBeNull();
  });
});
