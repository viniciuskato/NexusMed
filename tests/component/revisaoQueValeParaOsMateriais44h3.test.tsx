import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { Compendium, Discipline, Theme } from '../../src/types';

// 44-H3 — "Meus envios" de questões só mostra a revisão que vale para o texto E para os materiais
// ATUAIS do envio (a mais recente daquele texto, em qualquer conjunto de materiais, precisa ser a
// dos materiais de agora). Roda a tela de verdade com o repositório real de envios de questões e
// um cliente Supabase de mentira.

interface LinhaDoEnvio {
  id: string;
  title: string;
  status: string;
  created_at: string;
  updated_at: string;
  material_ids: string[];
  content_sha256: string;
  published_question_ids: string[];
  publication_note: string | null;
  reviews: Array<Record<string, unknown>>;
}

let linhas: LinhaDoEnvio[] = [];

vi.mock('../../src/lib/supabaseClient', () => {
  const consultaDe = (tabela: string) => {
    const consulta = {
      select: () => consulta,
      eq: () => consulta,
      order: () => consulta,
      range: () => Promise.resolve({ data: tabela === 'question_submissions' ? linhas : [], error: null }),
    };
    return consulta;
  };
  return {
    isSupabaseConfigured: true,
    supabase: {
      auth: { getSession: () => Promise.resolve({ data: { session: { user: { id: 'u1' } } } }) },
      from: (tabela: string) => consultaDe(tabela),
      rpc: () => Promise.resolve({ data: null, error: null }),
    },
  };
});

const { EnviarMaterialView } = await import('../../src/components/material/EnviarMaterialView');

const disc = (id: string, name: string): Discipline => ({ id, name, code: id, icon: 'book', description: '', cycle: 'basico', color: '#000' });
const tema = (id: string, disciplineId: string, name: string): Theme => ({ id, disciplineId, name, description: '', highYield: false, order: 1 });
const compendios = [{ id: 'm1', disciplineId: 'd1', themeId: 't1', title: 'M1', publicationStatus: 'published' }] as unknown as Compendium[];

const revisao = (id: string, sha: string, materiais: string[] | null, verdict: string, quando: string, achados: string) => ({
  id,
  status: 'concluida',
  verdict,
  findings_text: achados,
  correction_block: null,
  error_kind: null,
  content_sha256: sha,
  completed_at: quando,
  created_at: quando,
  material_ids: materiais,
});

const envio = (over: Partial<LinhaDoEnvio>): LinhaDoEnvio => ({
  id: 'e1',
  title: 'Lote de teste',
  status: 'nao_apto',
  created_at: '2026-09-30T10:00:00.000Z',
  updated_at: '2026-09-30T10:00:00.000Z',
  material_ids: ['m1'],
  content_sha256: 'T',
  published_question_ids: [],
  publication_note: null,
  reviews: [],
  ...over,
});

async function mostrar(l: LinhaDoEnvio[]) {
  linhas = l;
  render(<EnviarMaterialView disciplines={[disc('d1', 'D')]} themes={[tema('t1', 'd1', 'T')]} compendiums={compendios} />);
  return (await screen.findByText('Lote de teste')).closest('li') as HTMLElement;
}

beforeEach(() => {
  linhas = [];
});
afterEach(() => cleanup());

describe('44-H3 — a revisão exibida vale para o texto E os materiais atuais', () => {
  it('a revisão dos materiais de agora aparece, com os achados', async () => {
    const li = await mostrar([
      envio({ reviews: [revisao('r1', 'T', ['m1'], 'nao_apto', '2026-09-30T11:00:00.000Z', 'Achado dos materiais de agora.')] }),
    ]);
    fireEvent.click(within(li).getByText('Ver a revisão'));
    expect(li.textContent).toContain('Achado dos materiais de agora.');
  });

  it('a ordem dos materiais não importa', async () => {
    const li = await mostrar([
      envio({ material_ids: ['m1', 'm2'], reviews: [revisao('r1', 'T', ['m2', 'm1'], 'nao_apto', '2026-09-30T11:00:00.000Z', 'Vale.')] }),
    ]);
    expect(within(li).getByText('Ver a revisão')).toBeTruthy();
  });

  it('revisão do mesmo texto com OUTROS materiais não é mostrada como o veredito de hoje', async () => {
    const li = await mostrar([
      envio({ reviews: [revisao('r1', 'T', ['m2'], 'apto', '2026-09-30T11:00:00.000Z', 'Achado de outros materiais.')] }),
    ]);
    expect(within(li).queryByText('Ver a revisão')).toBeNull();
    expect(li.textContent).not.toContain('Achado de outros materiais.');
  });

  it('a mais recente do texto é a de outros materiais: a antiga dos materiais de agora também não vale', async () => {
    const li = await mostrar([
      envio({
        reviews: [
          revisao('r1', 'T', ['m1'], 'apto', '2026-09-30T11:00:00.000Z', 'Antiga, dos materiais de agora.'),
          revisao('r2', 'T', ['m2'], 'nao_apto', '2026-09-30T12:00:00.000Z', 'Mais nova, de outros materiais.'),
        ],
      }),
    ]);
    expect(within(li).queryByText('Ver a revisão')).toBeNull();
    expect(li.textContent).not.toContain('Antiga, dos materiais de agora.');
  });

  it('revisão sem os materiais registrados (não deveria existir) não é mostrada; revisão de outro texto também não', async () => {
    const li = await mostrar([
      envio({
        reviews: [
          revisao('r1', 'T', null, 'nao_apto', '2026-09-30T11:00:00.000Z', 'Sem materiais.'),
          revisao('r2', 'OUTRO', ['m1'], 'nao_apto', '2026-09-30T12:00:00.000Z', 'De outro texto.'),
        ],
      }),
    ]);
    await waitFor(() => expect(within(li).queryByText('Ver a revisão')).toBeNull());
  });
});
