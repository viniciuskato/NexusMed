import { describe, it, expect } from 'vitest';
import { revisaoQueValeParaOTexto } from '../../src/repositories/MaterialSubmissionsRepository';
import { revisaoQueValeParaOTextoEOsMateriais } from '../../src/repositories/QuestionSubmissionsRepository';

// 44-B (achados dos revisores da 44-H3) — qual revisão o autor vê ao lado do envio:
// a mesma regra do servidor. Só a revisão CONCLUÍDA mais recente do texto vale, e ela precisa
// ser a do lugar (material) ou dos materiais (questões) de agora.

const HASH = 'hash-do-texto';
const LUGAR = { discipline_id: 'd1', theme_id: 't1', parent_material_id: null };

const revisao = (over: Record<string, unknown> = {}) => ({
  id: 'r1',
  status: 'concluida',
  verdict: 'apto' as const,
  findings_text: null,
  correction_block: null,
  error_kind: null,
  content_sha256: HASH,
  completed_at: '2026-10-01T12:00:00.000Z',
  created_at: '2026-10-01T11:00:00.000Z',
  ...LUGAR,
  ...over,
});

describe('material: só a revisão do texto E do lugar atuais', () => {
  const envio = (reviews: Array<ReturnType<typeof revisao>>, lugar: Record<string, unknown> = LUGAR) => ({
    status: 'apto',
    content_sha256: HASH,
    ...LUGAR,
    ...lugar,
    reviews,
  });

  it('a revisão do lugar de agora aparece', () => {
    expect(revisaoQueValeParaOTexto(envio([revisao()]))?.id).toBe('r1');
  });

  it('o lugar mudou depois da revisão: nenhuma revisão aparece (não é o veredito de hoje)', () => {
    expect(revisaoQueValeParaOTexto(envio([revisao()], { theme_id: 't2' }))).toBeNull();
    expect(revisaoQueValeParaOTexto(envio([revisao()], { parent_material_id: 'm9' }))).toBeNull();
    expect(revisaoQueValeParaOTexto(envio([revisao()], { discipline_id: 'd2' }))).toBeNull();
  });

  it('a concluída mais recente do texto é de outro lugar: a antiga, do lugar de agora, não volta a valer', () => {
    const antigaDoLugar = revisao({ id: 'antiga', completed_at: '2026-10-01T10:00:00.000Z' });
    const novaDeOutroLugar = revisao({ id: 'nova', completed_at: '2026-10-01T13:00:00.000Z', theme_id: 't2', verdict: 'nao_apto' });
    expect(revisaoQueValeParaOTexto(envio([antigaDoLugar, novaDeOutroLugar]))).toBeNull();
  });

  it('a concluída mais recente é do lugar de agora: vale, mesmo havendo uma antiga de outro lugar', () => {
    const antigaDeOutroLugar = revisao({ id: 'antiga', completed_at: '2026-10-01T10:00:00.000Z', theme_id: 't2' });
    const nova = revisao({ id: 'nova', completed_at: '2026-10-01T13:00:00.000Z' });
    expect(revisaoQueValeParaOTexto(envio([antigaDeOutroLugar, nova]))?.id).toBe('nova');
  });

  it('uma revisão de erro de outro lugar não aparece; a de erro do lugar de agora aparece quando é a única', () => {
    const erroDeOutroLugar = revisao({ id: 'erro-fora', status: 'erro', verdict: 'erro', theme_id: 't2' });
    expect(revisaoQueValeParaOTexto({ ...envio([erroDeOutroLugar]), status: 'erro' })).toBeNull();
    const erroDoLugar = revisao({ id: 'erro-aqui', status: 'erro', verdict: 'erro' });
    expect(revisaoQueValeParaOTexto({ ...envio([erroDoLugar]), status: 'erro' })?.id).toBe('erro-aqui');
  });

  it('sem o lugar na linha (listas antigas), o lugar não é conferido', () => {
    expect(
      revisaoQueValeParaOTexto({ status: 'apto', content_sha256: HASH, reviews: [revisao({ theme_id: 'qualquer' })] })?.id,
    ).toBe('r1');
  });

  it('envio na fila continua sem revisão à mostra', () => {
    expect(revisaoQueValeParaOTexto({ ...envio([revisao()]), status: 'aguardando_revisao' })).toBeNull();
  });
});

describe('questões: "mais recente" é só entre as revisões concluídas (como no servidor)', () => {
  const linha = (reviews: Array<ReturnType<typeof revisao> & { material_ids: string[] }>, materialIds = ['m1']) => ({
    status: 'apto',
    content_sha256: HASH,
    material_ids: materialIds,
    reviews,
  });
  const rq = (over: Record<string, unknown> = {}) => ({ ...revisao(), material_ids: ['m1'], ...over }) as ReturnType<typeof revisao> & { material_ids: string[] };

  it('uma revisão de erro mais nova, de outros materiais, não tira a vez da concluída dos materiais de agora', () => {
    const concluida = rq({ id: 'ok', completed_at: '2026-10-01T10:00:00.000Z' });
    const erroNovo = rq({ id: 'erro', status: 'erro', verdict: 'erro', completed_at: '2026-10-01T14:00:00.000Z', material_ids: ['m9'] });
    expect(revisaoQueValeParaOTextoEOsMateriais(linha([concluida, erroNovo]))?.id).toBe('ok');
  });

  it('a concluída mais recente é de outros materiais: nenhuma vale', () => {
    const antiga = rq({ id: 'antiga', completed_at: '2026-10-01T10:00:00.000Z' });
    const nova = rq({ id: 'nova', completed_at: '2026-10-01T14:00:00.000Z', material_ids: ['m9'] });
    expect(revisaoQueValeParaOTextoEOsMateriais(linha([antiga, nova]))).toBeNull();
  });

  it('sem nenhuma concluída, a de erro dos materiais de agora é a que a pessoa vê', () => {
    const erro = rq({ id: 'erro', status: 'erro', verdict: 'erro' });
    expect(revisaoQueValeParaOTextoEOsMateriais({ ...linha([erro]), status: 'erro' })?.id).toBe('erro');
  });
});
