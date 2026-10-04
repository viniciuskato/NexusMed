import React from 'react';
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const urlDaFigura = vi.hoisted(() => vi.fn());
vi.mock('../../src/repositories/FigurasRepository', () => ({ urlDaFigura }));

import { SafeMarkdown } from '../../src/components/common/SafeMarkdown';

/** O <img> de verdade (o aviso "Carregando" também tem role="img", para leitor de tela). */
async function esperarImagem(container: HTMLElement): Promise<HTMLImageElement> {
  return waitFor(() => {
    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    return img as HTMLImageElement;
  });
}

// P9 — o leitor mostra figura com legenda e fonte, só a do Storage do próprio site (pelo identificador); endereço
// externo, `javascript:`, `data:` e HTML cru nunca viram imagem nem elemento.

const ID = '0b9f1a0e-5c2d-4e8a-9a41-3d6b7c8e9f10';
const URL_ASSINADA = 'http://127.0.0.1:54321/storage/v1/object/sign/material-figures/x.png?token=t';

const bloco = (destino: string, alt = 'Curva fluxo-volume') =>
  [`![${alt}](${destino})`, '**Figura 2.** Curva fluxo-volume normal e obstrutiva.', 'Fonte: Diretriz GOLD, 2024 [3](#ref-3).'].join('\n');

beforeEach(() => {
  urlDaFigura.mockReset();
  urlDaFigura.mockResolvedValue(URL_ASSINADA);
});
afterEach(() => cleanup());

describe('SafeMarkdown — figura do material', () => {
  it('mostra <figure> com <img>, legenda e fonte (a citação da fonte vira link para a referência)', async () => {
    const { container } = render(<SafeMarkdown content={`Texto antes.\n\n${bloco(`figura:${ID}`)}\n\nTexto depois.`} />);

    const img = await esperarImagem(container);
    expect(img.getAttribute('alt')).toBe('Curva fluxo-volume');
    expect(img.getAttribute('src')).toBe(URL_ASSINADA);
    expect(urlDaFigura).toHaveBeenCalledWith(ID);

    const figure = container.querySelector('figure');
    expect(figure).not.toBeNull();
    expect(figure!.querySelector('figcaption')).not.toBeNull();
    expect(screen.getByTestId('figura-legenda').textContent).toBe('Figura 2. Curva fluxo-volume normal e obstrutiva.');
    expect(screen.getByTestId('figura-legenda').querySelector('strong')?.textContent).toBe('Figura 2.');
    const fonte = screen.getByTestId('figura-fonte');
    expect(fonte.textContent).toContain('Fonte: Diretriz GOLD, 2024');
    expect(fonte.querySelector('a')?.getAttribute('href')).toBe('#ref-3');

    // O resto do texto continua sendo parágrafo comum, fora da figura.
    expect(screen.getByText('Texto antes.').closest('figure')).toBeNull();
    expect(screen.getByText('Texto depois.').closest('figure')).toBeNull();
  });

  it('figura colada num parágrafo, sem linha em branco, também vira figura', async () => {
    const { container } = render(<SafeMarkdown content={`Frase de abertura.\n${bloco(`figura:${ID}`)}\nParágrafo seguinte.`} />);
    await esperarImagem(container);
    expect(container.querySelectorAll('figure')).toHaveLength(1);
    expect(screen.getByText('Frase de abertura.').closest('figure')).toBeNull();
    expect(screen.getByText('Parágrafo seguinte.').closest('figure')).toBeNull();
  });

  it('a imagem não está disponível para a pessoa (sem acesso, ou o arquivo não existe): sem <img>, com legenda e fonte', async () => {
    urlDaFigura.mockResolvedValue(null);
    const { container } = render(<SafeMarkdown content={bloco(`figura:${ID}`)} />);
    await waitFor(() => expect(screen.getByTestId('figura-indisponivel').textContent).toContain('Imagem indisponível'));
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByTestId('figura-legenda')).toBeTruthy();
    expect(screen.getByTestId('figura-fonte')).toBeTruthy();
  });

  it('enquanto a URL não chega, mostra "Carregando"; se a imagem falhar ao carregar, volta a "indisponível"', async () => {
    let resolver: (url: string | null) => void = () => undefined;
    urlDaFigura.mockReturnValue(new Promise<string | null>((r) => (resolver = r)));
    const { container } = render(<SafeMarkdown content={bloco(`figura:${ID}`)} />);
    expect(screen.getByTestId('figura-indisponivel').textContent).toContain('Carregando');
    resolver(URL_ASSINADA);
    const img = await esperarImagem(container);
    fireEvent.error(img);
    await waitFor(() => expect(container.querySelector('img')).toBeNull());
    expect(screen.getByTestId('figura-indisponivel').textContent).toContain('Imagem indisponível');
  });

  it.each([
    ['URL externa (https)', 'https://exemplo.com/figura.png'],
    ['URL externa (http)', 'http://exemplo.com/figura.png'],
    ['URL sem protocolo', '//exemplo.com/figura.png'],
    ['javascript:', 'javascript:alert(1)'],
    ['data:', 'data:image/png;base64,iVBORw0KGgo='],
    ['caminho do próprio site', '/assets/figura.png'],
    ['identificador malformado', 'figura:123'],
    ['identificador em maiúsculas', `figura:${ID.toUpperCase()}`],
    ['figura ainda pendente', 'figura:PENDENTE'],
    ['espaço dentro dos parênteses', ` figura:${ID} `],
  ])('%s: nunca vira <img> e nunca consulta o Storage', async (_nome, destino) => {
    const { container } = render(<SafeMarkdown content={bloco(destino)} />);
    await waitFor(() => expect(screen.getByTestId('figura-indisponivel')).toBeTruthy());
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('[src]')).toBeNull();
    expect(container.querySelector('a[href^="javascript"]')).toBeNull();
    expect(urlDaFigura).not.toHaveBeenCalled();
    // A legenda e a fonte continuam na tela.
    expect(screen.getByTestId('figura-legenda')).toBeTruthy();
  });

  it('HTML cru no texto aparece como texto: nenhum <img>, <script> ou atributo de evento nasce dele', () => {
    const { container } = render(
      <SafeMarkdown content={'Texto <img src="https://exemplo.com/x.png" onerror="alert(1)"> e <script>alert(1)</script> fim.\n\n<img src=x onerror=alert(1)>'} />,
    );
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('[onerror]')).toBeNull();
    expect(container.textContent).toContain('<img src="https://exemplo.com/x.png" onerror="alert(1)">');
    expect(urlDaFigura).not.toHaveBeenCalled();
  });

  it('imagem Markdown no meio do parágrafo (fora do bloco de figura) não vira imagem', () => {
    const { container } = render(<SafeMarkdown content={`Veja ![a](https://exemplo.com/x.png) no meio e ![b](figura:${ID}) também.`} />);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('figure')).toBeNull();
    expect(urlDaFigura).not.toHaveBeenCalled();
  });

  it('o rótulo "Mostrar:" de uma figura pendente não aparece para o leitor', async () => {
    const pendente = ['![a](figura:PENDENTE)', 'Legenda.', 'Fonte: X.', 'Mostrar: um esquema com tudo.'].join('\n');
    render(<SafeMarkdown content={pendente} />);
    await waitFor(() => expect(screen.getByTestId('figura-indisponivel')).toBeTruthy());
    expect(screen.queryByText(/esquema com tudo/)).toBeNull();
  });
});

describe('SafeMarkdown — caixas com função (padrão v3)', () => {
  it.each([
    ['Cuidado', '> **Cuidado:** a classificação pelo laudo não é a do GOLD.'],
    ['Raciocínio', '> **Raciocínio:** pense primeiro na relação VEF1/CVF.'],
    ['Não confundir', '> **Não confundir:** asma e DPOC.'],
    ['Atualização', '> **Atualização:** o GOLD 2024 mudou o grupo E (a partir de 2023).'],
    ['Aprofundar', '> **Aprofundar:** a prova de difusão (DLCO).'],
    ['Essencial', '> **Essencial:** VEF1/CVF < 0,7 pós-broncodilatador.'],
  ])('%s vira caixa com o rótulo como título e o texto sem o rótulo repetido', (rotulo, markdown) => {
    const { container } = render(<SafeMarkdown content={`Texto.\n\n${markdown}\n\nOutro texto.`} />);
    const caixa = container.querySelector(`[data-caixa="${rotulo}"]`);
    expect(caixa).not.toBeNull();
    expect(caixa!.textContent!.startsWith(rotulo)).toBe(true);
    expect(caixa!.textContent!.slice(rotulo.length)).not.toContain(`${rotulo}:`);
    expect(container.querySelectorAll('blockquote')).toHaveLength(0);
  });

  it('o texto da caixa passa pelo leitor seguro: negrito e citação funcionam, HTML não', () => {
    const { container } = render(<SafeMarkdown content={'> **Cuidado:** use **pré-broncodilatador** [2](#ref-2) <img src=x onerror=alert(1)>'} />);
    expect(container.querySelector('[data-caixa="Cuidado"] strong')?.textContent).toBe('pré-broncodilatador');
    expect(container.querySelector('[data-caixa="Cuidado"] a')?.getAttribute('href')).toBe('#ref-2');
    expect(container.querySelector('img')).toBeNull();
  });

  it('citação comum e as caixas que já existiam continuam como estavam', () => {
    const { container } = render(<SafeMarkdown content={'> Citação comum.\n\n> **Diretriz:** conduta oficial.'} />);
    expect(container.querySelector('blockquote')?.textContent).toBe('Citação comum.');
    expect(container.querySelector('.box-gold-rule')).not.toBeNull();
  });
});
