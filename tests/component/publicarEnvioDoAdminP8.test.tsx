import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

import type { Discipline, Theme } from '../../src/types';
import type {
  MaterialReviewView,
  MaterialSubmission,
  ResultadoDaPublicacaoDoAdmin,
  TextoDoEnvio,
} from '../../src/repositories/MaterialSubmissionsRepository';
import type { QuestionSubmission } from '../../src/repositories/QuestionSubmissionsRepository';
import { materialParaEnvio } from '../e2e/fixtures/materialParaEnvio';
import { questaoParaEnvio } from '../e2e/fixtures/questoesParaEnvio';

// P8 — o dono publica o envio com um clique, depois do parecer. A tela do admin lê o texto do envio, passa pelo mesmo
// importador de sempre e chama o banco; aqui os repositórios são simulados (as regras do banco — só admin, selo só com
// "apto", recusa sem mexer no envio — são provadas em pgTAP, e o fluxo inteiro em E2E).

const material = {
  listAll: vi.fn<() => Promise<MaterialSubmission[]>>(),
  textoParaPublicar: vi.fn<(id: string) => Promise<TextoDoEnvio>>(),
  publicarComoAdmin: vi.fn<(id: string, sha: string, m: unknown) => Promise<ResultadoDaPublicacaoDoAdmin>>(),
  aplicarAtualizacaoComoAdmin: vi.fn<(id: string, sha: string, m: unknown) => Promise<ResultadoDaPublicacaoDoAdmin>>(),
};
vi.mock('../../src/repositories/MaterialSubmissionsRepository', async () => {
  const real = await vi.importActual<typeof import('../../src/repositories/MaterialSubmissionsRepository')>(
    '../../src/repositories/MaterialSubmissionsRepository',
  );
  return { ...real, materialSubmissionsRepository: material, envioDeMaterialDisponivel: true };
});

const questoes = {
  listAll: vi.fn<() => Promise<QuestionSubmission[]>>(),
  textoParaPublicar: vi.fn<(id: string) => Promise<TextoDoEnvio>>(),
  publicarComoAdmin: vi.fn<(id: string, sha: string, q: unknown) => Promise<ResultadoDaPublicacaoDoAdmin>>(),
};
vi.mock('../../src/repositories/QuestionSubmissionsRepository', async () => {
  const real = await vi.importActual<typeof import('../../src/repositories/QuestionSubmissionsRepository')>(
    '../../src/repositories/QuestionSubmissionsRepository',
  );
  return { ...real, questionSubmissionsRepository: questoes };
});

const { EnviosDeMaterialAdmin } = await import('../../src/components/admin/EnviosDeMaterialAdmin');

const disciplinas: Discipline[] = [
  { id: 'd1', name: 'Farmacologia', code: 'F', icon: 'book', description: '', cycle: 'basico', color: '#000' },
  { id: 'd2', name: 'Pneumologia', code: 'P', icon: 'book', description: '', cycle: 'clinico', color: '#000' },
];
const temas: Theme[] = [
  { id: 't1', disciplineId: 'd1', name: 'Clínica', description: '', highYield: false, order: 1 },
  { id: 't2', disciplineId: 'd2', name: 'Espirometria', description: '', highYield: false, order: 1 },
];

function parecer(verdict: MaterialReviewView['verdict']): MaterialReviewView {
  return { id: 'r1', verdict, findingsText: 'achados', correctionBlock: null, errorKind: null, completedAt: '2026-10-03T12:00:00Z' };
}

function envioDeMaterial(over: Partial<MaterialSubmission> = {}): MaterialSubmission {
  return {
    id: 's1',
    title: 'Material do envio',
    disciplineId: 'd1',
    themeId: 't1',
    parentMaterialId: null,
    status: 'apto',
    createdAt: '2026-10-03T10:00:00.000Z',
    updatedAt: '2026-10-03T10:00:00.000Z',
    review: parecer('apto'),
    ...over,
  };
}

function envioDeQuestoes(over: Partial<QuestionSubmission> = {}): QuestionSubmission {
  return {
    kind: 'questoes',
    id: 'q1',
    title: 'Lote de questões',
    status: 'apto',
    createdAt: '2026-10-03T09:00:00.000Z',
    updatedAt: '2026-10-03T09:00:00.000Z',
    materialIds: [],
    review: parecer('apto'),
    ...over,
  };
}

const TEXTO = materialParaEnvio({ titulo: 'Material do envio' });

async function abrir(lista: { materiais?: MaterialSubmission[]; questoes?: QuestionSubmission[] }, extras: { onConteudoPublicado?: () => void } = {}) {
  material.listAll.mockResolvedValue(lista.materiais ?? []);
  questoes.listAll.mockResolvedValue(lista.questoes ?? []);
  render(<EnviosDeMaterialAdmin disciplines={disciplinas} themes={temas} {...extras} />);
  await screen.findByTestId('parecer-do-revisor');
}

beforeEach(() => {
  material.listAll.mockReset();
  material.textoParaPublicar.mockReset().mockResolvedValue({ contentMd: TEXTO, contentSha256: 'sha-do-texto' });
  material.publicarComoAdmin.mockReset().mockResolvedValue({ resultado: 'publicado', material_id: 'm1' });
  material.aplicarAtualizacaoComoAdmin.mockReset().mockResolvedValue({ resultado: 'aplicado', material_id: 'm1' });
  questoes.listAll.mockReset();
  questoes.textoParaPublicar.mockReset().mockResolvedValue({ contentMd: questaoParaEnvio(1), contentSha256: 'sha-das-questoes' });
  questoes.publicarComoAdmin.mockReset().mockResolvedValue({ resultado: 'publicado', question_ids: ['a', 'b'] });
});
afterEach(() => cleanup());

describe('P8 — Publicar o envio pela aba Envios', () => {
  it('parecer "apto": o botão publica com um clique, sem pedir confirmação, e a lista é recarregada', async () => {
    const aoPublicar = vi.fn();
    await abrir({ materiais: [envioDeMaterial()] }, { onConteudoPublicado: aoPublicar });
    expect(screen.getByTestId('parecer-do-revisor').textContent).toContain('apto');
    fireEvent.click(screen.getByRole('button', { name: 'Publicar: Material do envio' }));
    expect(screen.queryByTestId('confirmar-publicacao')).toBeNull();
    expect((await screen.findByTestId('resultado-da-publicacao')).textContent).toBe('Material publicado.');
    // O texto passou pelo importador da tela: o banco recebe o hash do texto lido e o material já lido.
    expect(material.textoParaPublicar).toHaveBeenCalledWith('s1');
    expect(material.publicarComoAdmin).toHaveBeenCalledTimes(1);
    const [id, sha, lido] = material.publicarComoAdmin.mock.calls[0] as [string, string, { title: string; sections: unknown[]; references: string[] }];
    expect([id, sha]).toEqual(['s1', 'sha-do-texto']);
    expect(lido.title).toBe('Material do envio');
    expect(lido.sections).toHaveLength(1);
    expect(lido.references).toHaveLength(2);
    expect(material.aplicarAtualizacaoComoAdmin).not.toHaveBeenCalled();
    expect(aoPublicar).toHaveBeenCalledTimes(1);
    // A lista foi buscada de novo (o envio passa a aparecer como publicado).
    await waitFor(() => expect(material.listAll.mock.calls.length).toBeGreaterThanOrEqual(2));
  });

  it('parecer "não apto": pede confirmação mostrando o parecer; "Cancelar" não publica; "Publicar mesmo assim" publica', async () => {
    await abrir({ materiais: [envioDeMaterial({ status: 'nao_apto', review: parecer('nao_apto') })] });
    expect(screen.getByTestId('parecer-do-revisor').getAttribute('data-parecer')).toBe('nao_apto');
    fireEvent.click(screen.getByTestId('publicar-envio'));
    const confirmacao = await screen.findByTestId('confirmar-publicacao');
    expect(confirmacao.textContent).toContain('não apto');
    expect(confirmacao.textContent).toContain('sem o selo “Revisado por IA”');
    expect(material.publicarComoAdmin).not.toHaveBeenCalled();

    fireEvent.click(within(confirmacao).getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByTestId('confirmar-publicacao')).toBeNull();
    expect(material.textoParaPublicar).not.toHaveBeenCalled();
    expect(material.publicarComoAdmin).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('publicar-envio'));
    fireEvent.click(within(await screen.findByTestId('confirmar-publicacao')).getByRole('button', { name: 'Publicar mesmo assim' }));
    expect((await screen.findByTestId('resultado-da-publicacao')).textContent).toBe('Material publicado.');
    expect(material.publicarComoAdmin).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['aguardando_revisao', null, 'ainda sem parecer do revisor'],
    ['erro', parecer('erro'), 'a revisão não foi concluída'],
  ] as const)('envio "%s": o botão aparece e pede confirmação com o parecer "%s"', async (status, review, frase) => {
    await abrir({ materiais: [envioDeMaterial({ status, review })] });
    expect(screen.getByTestId('parecer-do-revisor').textContent).toContain(frase);
    fireEvent.click(screen.getByTestId('publicar-envio'));
    expect((await screen.findByTestId('confirmar-publicacao')).textContent).toContain(frase);
    expect(material.publicarComoAdmin).not.toHaveBeenCalled();
  });

  it('envio de atualização: o botão é "Aplicar atualização" e aplica pela função de atualização', async () => {
    await abrir({ materiais: [envioDeMaterial({ targetMaterialId: 'm9' })] });
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar atualização: Material do envio' }));
    expect((await screen.findByTestId('resultado-da-publicacao')).textContent).toContain('Atualização aplicada');
    expect(material.aplicarAtualizacaoComoAdmin).toHaveBeenCalledWith('s1', 'sha-do-texto', expect.objectContaining({ title: 'Material do envio' }));
    expect(material.publicarComoAdmin).not.toHaveBeenCalled();
  });

  it('envio de questões: lê o lote com o importador de questões e publica pela função de questões', async () => {
    await abrir({ questoes: [envioDeQuestoes()] });
    fireEvent.click(screen.getByRole('button', { name: 'Publicar: Lote de questões' }));
    expect((await screen.findByTestId('resultado-da-publicacao')).textContent).toBe('2 questões publicadas.');
    expect(questoes.publicarComoAdmin).toHaveBeenCalledTimes(1);
    const [id, sha, lidas] = questoes.publicarComoAdmin.mock.calls[0] as [string, string, Array<{ question_stem: string; options: unknown[] }>];
    expect([id, sha]).toEqual(['q1', 'sha-das-questoes']);
    expect(lidas).toHaveLength(1);
    expect(lidas[0].options).toHaveLength(3);
    expect(material.publicarComoAdmin).not.toHaveBeenCalled();
  });

  it('envio "em revisão": sem botão (o revisor está lendo), só o aviso; "publicado": nada a fazer', async () => {
    material.listAll.mockResolvedValue([
      envioDeMaterial({ id: 's2', title: 'Em revisão', status: 'em_revisao', review: null }),
      envioDeMaterial({ id: 's3', title: 'Já no ar', status: 'publicado', publishedMaterialId: 'm3' }),
    ]);
    questoes.listAll.mockResolvedValue([]);
    render(<EnviosDeMaterialAdmin disciplines={disciplinas} themes={temas} />);
    expect(await screen.findByTestId('publicar-indisponivel')).toBeTruthy();
    expect(screen.queryByTestId('publicar-envio')).toBeNull();
    expect(screen.queryByTestId('parecer-do-revisor')).toBeNull();
  });

  it('o banco recusa (título repetido): mostra o motivo, não recarrega a lista e o botão continua', async () => {
    material.publicarComoAdmin.mockResolvedValue({ resultado: 'recusado', motivo: 'Já existe um material com o título “X”. Troque o título.' });
    const aoPublicar = vi.fn();
    await abrir({ materiais: [envioDeMaterial()] }, { onConteudoPublicado: aoPublicar });
    const chamadasDaLista = material.listAll.mock.calls.length;
    fireEvent.click(screen.getByTestId('publicar-envio'));
    const aviso = await screen.findByTestId('resultado-da-publicacao');
    expect(aviso.textContent).toContain('Já existe um material com o título');
    expect(aviso.getAttribute('data-ok')).toBe('nao');
    expect(aoPublicar).not.toHaveBeenCalled();
    expect(material.listAll.mock.calls.length).toBe(chamadasDaLista);
    await waitFor(() => expect((screen.getByTestId('publicar-envio') as HTMLButtonElement).disabled).toBe(false));
  });

  it.each([
    [{ resultado: 'texto_mudou' }, 'mudou enquanto você publicava'],
    [{ resultado: 'fora_de_estado', estado: 'em_revisao' }, 'O revisor está lendo este envio agora'],
    [{ resultado: 'falhou' }, 'Nada foi alterado'],
  ] as Array<[ResultadoDaPublicacaoDoAdmin, string]>)('resposta %j do banco vira uma frase leiga', async (resposta, frase) => {
    material.publicarComoAdmin.mockResolvedValue(resposta);
    await abrir({ materiais: [envioDeMaterial()] });
    fireEvent.click(screen.getByTestId('publicar-envio'));
    expect((await screen.findByTestId('resultado-da-publicacao')).textContent).toContain(frase);
  });

  it('texto que o importador não aceita: nada é enviado ao banco e a tela diz por quê', async () => {
    material.textoParaPublicar.mockResolvedValue({ contentMd: '# Só um título, sem nada do padrão', contentSha256: 'x' });
    await abrir({ materiais: [envioDeMaterial()] });
    fireEvent.click(screen.getByTestId('publicar-envio'));
    const aviso = await screen.findByTestId('resultado-da-publicacao');
    expect(aviso.textContent).toContain('não pôde ser lido pelo importador');
    expect(material.publicarComoAdmin).not.toHaveBeenCalled();
  });

  it('erro de permissão ou de rede na chamada: frase leiga, sem lançar', async () => {
    material.publicarComoAdmin.mockRejectedValue({ code: '42501', message: 'acesso negado' });
    await abrir({ materiais: [envioDeMaterial()] });
    fireEvent.click(screen.getByTestId('publicar-envio'));
    expect((await screen.findByTestId('resultado-da-publicacao')).textContent).toBe('Só administradores ativos publicam envios.');
    material.publicarComoAdmin.mockRejectedValue(new Error('Failed to fetch'));
    await waitFor(() => expect((screen.getByTestId('publicar-envio') as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByTestId('publicar-envio'));
    await waitFor(() =>
      expect(screen.getByTestId('resultado-da-publicacao').textContent).toBe('Não foi possível publicar agora. Nada foi alterado; tente de novo em instantes.'),
    );
  });

  it('dois cliques seguidos não publicam duas vezes: o botão fica desligado enquanto publica', async () => {
    let terminar: (r: ResultadoDaPublicacaoDoAdmin) => void = () => undefined;
    material.publicarComoAdmin.mockImplementation(() => new Promise((resolve) => (terminar = resolve)));
    await abrir({ materiais: [envioDeMaterial()] });
    const botao = screen.getByTestId('publicar-envio') as HTMLButtonElement;
    fireEvent.click(botao);
    await waitFor(() => expect(botao.disabled).toBe(true));
    fireEvent.click(botao);
    terminar({ resultado: 'publicado', material_id: 'm1' });
    await screen.findByText('Material publicado.');
    expect(material.publicarComoAdmin).toHaveBeenCalledTimes(1);
  });
});
