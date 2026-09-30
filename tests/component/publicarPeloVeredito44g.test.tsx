import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

import type { Compendium, Discipline, Theme } from '../../src/types';
import type { MaterialSubmission, SituacaoDaRevisao } from '../../src/repositories/MaterialSubmissionsRepository';
import type { ReporteDeErro } from '../../src/repositories/MaterialErrorReportsRepository';

// 44-G — o que a pessoa vê depois que o servidor publica pelo veredito da IA:
// o selo "revisado por IA", o botão "Reportar erro", "Meus envios" com o link do
// material publicado e a aba "Erros reportados" da Área Editorial. Os
// repositórios são simulados; as regras do banco (RLS, limite diário) são
// provadas em pgTAP.

const selo = { getSeal: vi.fn<(id: string) => Promise<'ia' | 'ia_e_pessoa' | null>>() };
vi.mock('../../src/repositories/MaterialSealRepository', () => ({ materialSealRepository: selo }));

const reportes = {
  report: vi.fn<(i: { materialId: string; description: string; excerpt: string | null }) => Promise<void>>(),
  listAll: vi.fn<() => Promise<ReporteDeErro[]>>(),
  resolve: vi.fn<(id: string) => Promise<void>>(),
};
vi.mock('../../src/repositories/MaterialErrorReportsRepository', async () => {
  const real = await vi.importActual<typeof import('../../src/repositories/MaterialErrorReportsRepository')>(
    '../../src/repositories/MaterialErrorReportsRepository',
  );
  return { ...real, materialErrorReportsRepository: reportes, reportarErroDisponivel: true };
});

const envios = {
  listMine: vi.fn<() => Promise<MaterialSubmission[]>>(),
  listAll: vi.fn<() => Promise<MaterialSubmission[]>>(),
  submit: vi.fn(),
  replaceText: vi.fn(),
  retry: vi.fn(),
  situacaoDaRevisao: vi.fn<() => Promise<SituacaoDaRevisao | null>>(),
};
vi.mock('../../src/repositories/MaterialSubmissionsRepository', async () => {
  const real = await vi.importActual<typeof import('../../src/repositories/MaterialSubmissionsRepository')>(
    '../../src/repositories/MaterialSubmissionsRepository',
  );
  return { ...real, materialSubmissionsRepository: envios, envioDeMaterialDisponivel: true };
});

const { SeloDeRevisao } = await import('../../src/components/material/SeloDeRevisao');
const { ReportarErroDoMaterial } = await import('../../src/components/material/ReportarErroDoMaterial');
const { ListaDeEnvios } = await import('../../src/components/material/ListaDeEnvios');
const { EnviarMaterialView } = await import('../../src/components/material/EnviarMaterialView');
const { ErrosReportadosAdmin } = await import('../../src/components/admin/ErrosReportadosAdmin');

const disc: Discipline = { id: 'd1', name: 'Farmacologia', code: 'F', icon: 'book', description: '', cycle: 'basico', color: '#000' };
const tema: Theme = { id: 't1', disciplineId: 'd1', name: 'Clínica', description: '', highYield: false, order: 1 };

function envio(over: Partial<MaterialSubmission> = {}): MaterialSubmission {
  return {
    id: 's1',
    title: 'Envio de exemplo',
    disciplineId: 'd1',
    themeId: 't1',
    parentMaterialId: null,
    status: 'aguardando_revisao',
    createdAt: '2026-09-29T15:30:00.000Z',
    updatedAt: '2026-09-29T15:30:00.000Z',
    ...over,
  };
}

function reporte(over: Partial<ReporteDeErro> = {}): ReporteDeErro {
  return {
    id: 'r1',
    materialId: 'm1',
    materialTitle: 'Material com erro',
    description: 'A dose citada está errada.',
    excerpt: null,
    status: 'aberto',
    createdAt: '2026-09-30T10:00:00.000Z',
    resolvedAt: null,
    reporter: { id: 'u1', name: 'Ana', email: 'ana@exemplo.com' },
    ...over,
  };
}

beforeEach(() => {
  selo.getSeal.mockReset().mockResolvedValue(null);
  reportes.report.mockReset().mockResolvedValue(undefined);
  reportes.listAll.mockReset().mockResolvedValue([]);
  reportes.resolve.mockReset().mockResolvedValue(undefined);
  envios.listMine.mockReset().mockResolvedValue([]);
  envios.listAll.mockReset().mockResolvedValue([]);
  envios.situacaoDaRevisao.mockReset().mockResolvedValue({ usadasHoje: 0, limitePorDia: 5, mesEsgotado: false });
});
afterEach(() => cleanup());

describe('44-G — selo "Revisado por IA" no leitor', () => {
  it('material publicado por revisão de IA: "Revisado por IA — ainda não lido por uma pessoa"', async () => {
    selo.getSeal.mockResolvedValue('ia');
    render(<SeloDeRevisao materialId="m1" />);
    const el = await screen.findByTestId('selo-de-revisao');
    expect(el.textContent).toBe('Revisado por IA — ainda não lido por uma pessoa');
    expect(el.getAttribute('data-selo')).toBe('ia');
    expect(selo.getSeal).toHaveBeenCalledWith('m1');
  });

  it('depois que uma pessoa atesta: "Revisado por IA e por uma pessoa"', async () => {
    selo.getSeal.mockResolvedValue('ia_e_pessoa');
    render(<SeloDeRevisao materialId="m1" />);
    expect((await screen.findByTestId('selo-de-revisao')).textContent).toBe('Revisado por IA e por uma pessoa');
  });

  it('material antigo (sem selo): nada é mostrado', async () => {
    render(<SeloDeRevisao materialId="m-antigo" />);
    await waitFor(() => expect(selo.getSeal).toHaveBeenCalled());
    expect(screen.queryByTestId('selo-de-revisao')).toBeNull();
  });

  it('se a consulta do selo falha, o material aparece sem selo (nunca um selo inventado)', async () => {
    selo.getSeal.mockRejectedValue(new Error('sem rede'));
    render(<SeloDeRevisao materialId="m1" />);
    await waitFor(() => expect(selo.getSeal).toHaveBeenCalled());
    expect(screen.queryByTestId('selo-de-revisao')).toBeNull();
  });

  it('ao trocar de material, o selo do anterior não fica na tela', async () => {
    selo.getSeal.mockImplementation(async (id) => (id === 'm1' ? 'ia' : null));
    const { rerender } = render(<SeloDeRevisao materialId="m1" />);
    await screen.findByTestId('selo-de-revisao');
    rerender(<SeloDeRevisao materialId="m2" />);
    expect(screen.queryByTestId('selo-de-revisao')).toBeNull();
    await waitFor(() => expect(selo.getSeal).toHaveBeenCalledWith('m2'));
    expect(screen.queryByTestId('selo-de-revisao')).toBeNull();
  });

  it('o selo é texto visível (não depende de cor nem de ícone) e o ícone é decorativo', async () => {
    selo.getSeal.mockResolvedValue('ia');
    render(<SeloDeRevisao materialId="m1" />);
    const el = await screen.findByTestId('selo-de-revisao');
    expect(el.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    expect(el.textContent?.length).toBeGreaterThan(20);
  });
});

describe('44-G — Reportar erro no leitor', () => {
  it('abre um diálogo com o campo obrigatório e o trecho opcional, e só habilita "Enviar reporte" com texto', async () => {
    render(<ReportarErroDoMaterial materialId="m1" materialTitle="Material X" />);
    fireEvent.click(screen.getByRole('button', { name: 'Reportar erro' }));
    const dialogo = await screen.findByRole('dialog');
    expect(within(dialogo).getByText('Material X')).toBeTruthy();
    const enviar = within(dialogo).getByRole('button', { name: 'Enviar reporte' }) as HTMLButtonElement;
    expect(enviar.disabled).toBe(true);
    const texto = within(dialogo).getByLabelText(/O que está errado/) as HTMLTextAreaElement;
    expect(texto.required).toBe(true);
    expect(texto.maxLength).toBe(2000);
    expect((within(dialogo).getByLabelText(/Trecho do material/) as HTMLTextAreaElement).maxLength).toBe(2000);
    fireEvent.change(texto, { target: { value: '   ' } });
    expect(enviar.disabled).toBe(true);
    fireEvent.change(texto, { target: { value: 'A dose está errada.' } });
    expect(enviar.disabled).toBe(false);
    expect(within(dialogo).getByText('19 de 2000 caracteres')).toBeTruthy();
  });

  it('envia o texto e o trecho (sem espaços nas pontas) e mostra a confirmação leiga', async () => {
    render(<ReportarErroDoMaterial materialId="m1" materialTitle="Material X" />);
    fireEvent.click(screen.getByRole('button', { name: 'Reportar erro' }));
    const dialogo = await screen.findByRole('dialog');
    fireEvent.change(within(dialogo).getByLabelText(/O que está errado/), { target: { value: '  A dose está errada.  ' } });
    fireEvent.change(within(dialogo).getByLabelText(/Trecho do material/), { target: { value: ' dose de 5 mg ' } });
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Enviar reporte' }));

    const ok = await screen.findByTestId('reporte-enviado');
    expect(ok.textContent).toContain('Obrigado! Recebemos o seu reporte.');
    expect(reportes.report).toHaveBeenCalledTimes(1);
    expect(reportes.report).toHaveBeenCalledWith({ materialId: 'm1', description: 'A dose está errada.', excerpt: 'dose de 5 mg' });
    fireEvent.click(within(ok).getByRole('button', { name: 'Fechar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('o trecho em branco vai como nulo', async () => {
    render(<ReportarErroDoMaterial materialId="m1" materialTitle="Material X" />);
    fireEvent.click(screen.getByRole('button', { name: 'Reportar erro' }));
    const dialogo = await screen.findByRole('dialog');
    fireEvent.change(within(dialogo).getByLabelText(/O que está errado/), { target: { value: 'Erro.' } });
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Enviar reporte' }));
    await screen.findByTestId('reporte-enviado');
    expect(reportes.report).toHaveBeenCalledWith({ materialId: 'm1', description: 'Erro.', excerpt: null });
  });

  it('o limite de 20 por dia do banco vira uma frase leiga e o texto digitado é mantido', async () => {
    reportes.report.mockRejectedValue({ code: 'P0001', hint: 'limite_reportes_por_dia', message: 'Você já enviou 20 reportes de erro hoje.' });
    render(<ReportarErroDoMaterial materialId="m1" materialTitle="Material X" />);
    fireEvent.click(screen.getByRole('button', { name: 'Reportar erro' }));
    const dialogo = await screen.findByRole('dialog');
    fireEvent.change(within(dialogo).getByLabelText(/O que está errado/), { target: { value: 'Erro importante.' } });
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Enviar reporte' }));
    const alerta = await within(dialogo).findByRole('alert');
    expect(alerta.textContent).toBe('Você já enviou 20 reportes de erro hoje. Tente de novo amanhã.');
    expect((within(dialogo).getByLabelText(/O que está errado/) as HTMLTextAreaElement).value).toBe('Erro importante.');
    expect(screen.queryByTestId('reporte-enviado')).toBeNull();
  });

  it('falha qualquer do servidor: mensagem leiga, sem detalhe técnico', async () => {
    reportes.report.mockRejectedValue(new Error('duplicate key value violates unique constraint "xyz"'));
    render(<ReportarErroDoMaterial materialId="m1" materialTitle="Material X" />);
    fireEvent.click(screen.getByRole('button', { name: 'Reportar erro' }));
    const dialogo = await screen.findByRole('dialog');
    fireEvent.change(within(dialogo).getByLabelText(/O que está errado/), { target: { value: 'Erro.' } });
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Enviar reporte' }));
    const alerta = await within(dialogo).findByRole('alert');
    expect(alerta.textContent).toBe('Não foi possível enviar o reporte agora. Tente de novo em instantes.');
  });

  it('Cancelar e Escape fecham o diálogo sem enviar nada', async () => {
    render(<ReportarErroDoMaterial materialId="m1" materialTitle="Material X" />);
    fireEvent.click(screen.getByRole('button', { name: 'Reportar erro' }));
    let dialogo = await screen.findByRole('dialog');
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    fireEvent.click(screen.getByRole('button', { name: 'Reportar erro' }));
    dialogo = await screen.findByRole('dialog');
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(reportes.report).not.toHaveBeenCalled();
  });
});

describe('44-G — "Meus envios": publicado com link para o material', () => {
  it('envio publicado mostra "Publicado" e o botão que abre o material', () => {
    const abrir = vi.fn();
    render(
      <ListaDeEnvios
        id="lista"
        envios={[envio({ status: 'publicado', publishedMaterialId: 'mat-77' })]}
        disciplines={[disc]}
        themes={[tema]}
        vazio="nada"
        onAbrirMaterial={abrir}
      />,
    );
    const item = document.querySelector('li[data-status="publicado"]') as HTMLElement;
    expect(within(item).getByText('Publicado')).toBeTruthy();
    expect(item.textContent).toContain('O material já está no ar para os estudantes');
    fireEvent.click(within(item).getByRole('button', { name: 'Abrir o material publicado' }));
    expect(abrir).toHaveBeenCalledWith('mat-77');
  });

  it('sem o id do material, ou em outro estado, não há link', () => {
    render(
      <ListaDeEnvios
        id="lista"
        envios={[
          envio({ id: 'a', status: 'publicado', publishedMaterialId: null }),
          envio({ id: 'b', status: 'apto' }),
          envio({ id: 'c', status: 'nao_apto', publishedMaterialId: 'mat-1' }),
        ]}
        disciplines={[disc]}
        themes={[tema]}
        vazio="nada"
        onAbrirMaterial={vi.fn()}
      />,
    );
    expect(screen.queryByTestId('abrir-material-publicado')).toBeNull();
  });

  it('envio aprovado diz que será publicado em alguns minutos (não "falta publicar")', () => {
    render(<ListaDeEnvios id="lista" envios={[envio({ status: 'apto' })]} disciplines={[disc]} themes={[tema]} vazio="nada" />);
    expect(screen.getByText('Ele será publicado em alguns minutos.', { exact: false })).toBeTruthy();
  });

  it('o recado do servidor (ex.: título repetido) aparece no envio "precisa de correção"', () => {
    render(
      <ListaDeEnvios
        id="lista"
        envios={[envio({ status: 'nao_apto', publicationNote: 'Já existe um material com o título “X”. Troque o título do arquivo e envie de novo.' })]}
        disciplines={[disc]}
        themes={[tema]}
        vazio="nada"
      />,
    );
    expect(screen.getByTestId('recado-do-servidor').textContent).toContain('Já existe um material com o título');
  });

  it('a tela "Enviar material" repassa o link: clicar abre o material publicado', async () => {
    envios.listMine.mockResolvedValue([envio({ status: 'publicado', publishedMaterialId: 'mat-9' })]);
    const abrir = vi.fn();
    render(
      <EnviarMaterialView disciplines={[disc]} themes={[tema]} compendiums={[] as Compendium[]} onAbrirMaterial={abrir} />,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Abrir o material publicado' }));
    expect(abrir).toHaveBeenCalledWith('mat-9');
  });
});

describe('44-G — aba "Erros reportados" da Área Editorial', () => {
  it('lista o material, o trecho, o texto, quem, quando e o estado; abertos primeiro', async () => {
    reportes.listAll.mockResolvedValue([
      reporte({ id: 'r-res', status: 'resolvido', resolvedAt: '2026-09-30T12:00:00.000Z', description: 'Já resolvido.' }),
      reporte({ id: 'r-ab', excerpt: 'dose de 5 mg', description: 'A dose citada está errada.', materialTitle: 'Material com erro' }),
    ]);
    render(<ErrosReportadosAdmin />);
    const itens = await waitFor(() => {
      const lis = document.querySelectorAll('#admin-erros-lista > li');
      expect(lis).toHaveLength(2);
      return Array.from(lis) as HTMLElement[];
    });
    expect(itens[0].getAttribute('data-status')).toBe('aberto');
    expect(itens[1].getAttribute('data-status')).toBe('resolvido');
    expect(itens[0].textContent).toContain('Material com erro');
    expect(itens[0].textContent).toContain('Aberto');
    expect(itens[0].textContent).toContain('por Ana');
    expect(within(itens[0]).getByTestId('reporte-texto').textContent).toBe('A dose citada está errada.');
    expect(within(itens[0]).getByTestId('reporte-trecho').textContent).toBe('dose de 5 mg');
    expect(itens[1].textContent).toContain('Resolvido');
    expect(within(itens[1]).queryByRole('button', { name: 'Marcar como resolvido' })).toBeNull();
    expect(screen.getByTestId('erros-abertos').textContent).toBe('1 aberto.');
  });

  it('o texto do usuário aparece como texto puro (HTML digitado não vira elemento)', async () => {
    reportes.listAll.mockResolvedValue([reporte({ description: '<img src=x onerror=alert(1)> **negrito**' })]);
    render(<ErrosReportadosAdmin />);
    const texto = await screen.findByTestId('reporte-texto');
    expect(texto.textContent).toBe('<img src=x onerror=alert(1)> **negrito**');
    expect(texto.querySelector('img')).toBeNull();
    expect(texto.querySelector('strong')).toBeNull();
  });

  it('"Marcar como resolvido" chama o banco e recarrega a lista', async () => {
    reportes.listAll
      .mockResolvedValueOnce([reporte()])
      .mockResolvedValue([reporte({ status: 'resolvido', resolvedAt: '2026-09-30T12:00:00.000Z' })]);
    render(<ErrosReportadosAdmin />);
    fireEvent.click(await screen.findByRole('button', { name: 'Marcar como resolvido' }));
    await waitFor(() => expect(reportes.resolve).toHaveBeenCalledWith('r1'));
    await waitFor(() => expect(document.querySelector('#admin-erros-lista > li')?.getAttribute('data-status')).toBe('resolvido'));
    expect(screen.queryByRole('button', { name: 'Marcar como resolvido' })).toBeNull();
    expect(screen.getByTestId('erros-abertos').textContent).toBe('Nenhum erro aberto.');
  });

  it('se marcar falha, o aviso aparece e o reporte continua aberto', async () => {
    reportes.listAll.mockResolvedValue([reporte()]);
    reportes.resolve.mockRejectedValue(new Error('apenas administradores ativos podem marcar um erro como resolvido'));
    render(<ErrosReportadosAdmin />);
    fireEvent.click(await screen.findByRole('button', { name: 'Marcar como resolvido' }));
    const alerta = await screen.findByRole('alert');
    expect(alerta.textContent).toContain('Não foi possível marcar como resolvido.');
    expect(document.querySelector('#admin-erros-lista > li')?.getAttribute('data-status')).toBe('aberto');
  });

  it('sem reportes, diz que nenhum foi reportado', async () => {
    render(<ErrosReportadosAdmin />);
    expect(await screen.findByText('Nenhum erro foi reportado ainda.')).toBeTruthy();
  });
});
