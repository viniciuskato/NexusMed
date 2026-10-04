import React from 'react';
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const { enviarFigura, ErroDoEnvioDeImagemFalso } = vi.hoisted(() => ({
  enviarFigura: vi.fn(),
  ErroDoEnvioDeImagemFalso: class extends Error {},
}));
vi.mock('../../src/repositories/FigurasRepository', () => ({
  enviarFigura,
  ErroDoEnvioDeImagem: ErroDoEnvioDeImagemFalso,
}));
const copiarTexto = vi.hoisted(() => vi.fn());
vi.mock('../../src/utils/areaDeTransferencia', () => ({ copiarTexto }));

import { EnviarImagemDoMaterial } from '../../src/components/material/EnviarImagemDoMaterial';
import { lerBlocoDeFigura } from '../../src/utils/figuraDoMaterial';

// P9 — "Enviar imagem": o admin sobe a imagem e recebe o trecho pronto para colar no .md.

const ID = '0b9f1a0e-5c2d-4e8a-9a41-3d6b7c8e9f10';
const arquivo = (nome: string, tipo: string, bytes = 2048) => new File([new Uint8Array(bytes)], nome, { type: tipo });

function escolher(file: File) {
  fireEvent.change(screen.getByTestId('imagem-arquivo'), { target: { files: [file] } });
}
function preencher(alt = 'Curva fluxo-volume', legenda = 'Curva normal e obstrutiva.', fonte = 'Diretriz GOLD, 2024.') {
  fireEvent.change(screen.getByTestId('imagem-alt'), { target: { value: alt } });
  fireEvent.change(screen.getByTestId('imagem-legenda'), { target: { value: legenda } });
  fireEvent.change(screen.getByTestId('imagem-fonte'), { target: { value: fonte } });
}

beforeEach(() => {
  enviarFigura.mockReset();
  copiarTexto.mockReset();
  copiarTexto.mockResolvedValue(true);
  enviarFigura.mockResolvedValue({ id: ID, storagePath: `${ID}.png`, mimeType: 'image/png', byteSize: 2048, sha256: 'a'.repeat(64) });
  // jsdom não tem URL.createObjectURL.
  URL.createObjectURL = vi.fn(() => 'blob:previa');
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => cleanup());

describe('Enviar imagem (P9)', () => {
  it('sem imagem e sem os três campos, "Enviar imagem" fica desabilitado', () => {
    render(<EnviarImagemDoMaterial />);
    const botao = screen.getByTestId('imagem-enviar') as HTMLButtonElement;
    expect(botao.disabled).toBe(true);
    escolher(arquivo('a.png', 'image/png'));
    expect(botao.disabled).toBe(true);
    expect(screen.getByText('Preencha o texto alternativo, a legenda e a fonte.')).toBeTruthy();
    preencher();
    expect(botao.disabled).toBe(false);
  });

  it('recusa na hora o que não é PNG, JPEG ou WebP e o que passa de 10 MB, sem chamar o servidor', () => {
    render(<EnviarImagemDoMaterial />);
    preencher();
    escolher(arquivo('a.svg', 'image/svg+xml'));
    expect(screen.getByTestId('imagem-aviso').textContent).toMatch(/PNG, JPEG ou WebP/);
    expect((screen.getByTestId('imagem-enviar') as HTMLButtonElement).disabled).toBe(true);
    escolher(arquivo('grande.png', 'image/png', 10 * 1024 * 1024 + 1));
    expect(screen.getByTestId('imagem-aviso').textContent).toMatch(/passa de 10 MB/);
    expect((screen.getByTestId('imagem-enviar') as HTMLButtonElement).disabled).toBe(true);
    expect(enviarFigura).not.toHaveBeenCalled();
    escolher(arquivo('ok.webp', 'image/webp'));
    expect(screen.queryByTestId('imagem-aviso')).toBeNull();
    expect((screen.getByTestId('imagem-enviar') as HTMLButtonElement).disabled).toBe(false);
  });

  it('envia o arquivo e mostra o trecho pronto: bloco de três linhas, com o identificador e o número', async () => {
    render(<EnviarImagemDoMaterial />);
    const file = arquivo('curva.png', 'image/png');
    escolher(file);
    preencher();
    fireEvent.change(screen.getByTestId('imagem-numero'), { target: { value: '2' } });
    fireEvent.click(screen.getByTestId('imagem-enviar'));

    const trecho = (await screen.findByTestId('imagem-trecho')) as HTMLTextAreaElement;
    expect(enviarFigura).toHaveBeenCalledTimes(1);
    expect(enviarFigura).toHaveBeenCalledWith(file);
    expect(trecho.value.split('\n')).toEqual([
      `![Curva fluxo-volume](figura:${ID})`,
      '**Figura 2.** Curva normal e obstrutiva.',
      'Fonte: Diretriz GOLD, 2024.',
    ]);
    // É o bloco que o leitor e a checagem do padrão entendem.
    expect(lerBlocoDeFigura(trecho.value)).toMatchObject({ destino: { tipo: 'figura', id: ID }, fonte: 'Diretriz GOLD, 2024.' });
    expect(screen.queryByTestId('imagem-enviar')).toBeNull();
  });

  it('o trecho acompanha o que o admin corrige depois do envio (a imagem enviada é a mesma)', async () => {
    render(<EnviarImagemDoMaterial />);
    escolher(arquivo('curva.png', 'image/png'));
    preencher();
    fireEvent.click(screen.getByTestId('imagem-enviar'));
    await screen.findByTestId('imagem-trecho');
    fireEvent.change(screen.getByTestId('imagem-legenda'), { target: { value: 'Legenda corrigida.' } });
    expect((screen.getByTestId('imagem-trecho') as HTMLTextAreaElement).value).toContain('**Figura.** Legenda corrigida.');
    expect(enviarFigura).toHaveBeenCalledTimes(1);
  });

  it('copia o trecho e só o identificador', async () => {
    render(<EnviarImagemDoMaterial />);
    escolher(arquivo('curva.png', 'image/png'));
    preencher();
    fireEvent.click(screen.getByTestId('imagem-enviar'));
    await screen.findByTestId('imagem-trecho');

    fireEvent.click(screen.getByTestId('imagem-copiar-trecho'));
    await waitFor(() => expect(screen.getByTestId('imagem-copiar-trecho').textContent).toContain('Trecho copiado'));
    expect(copiarTexto).toHaveBeenCalledWith(`![Curva fluxo-volume](figura:${ID})\n**Figura.** Curva normal e obstrutiva.\nFonte: Diretriz GOLD, 2024.`);

    fireEvent.click(screen.getByTestId('imagem-copiar-id'));
    await waitFor(() => expect(screen.getByTestId('imagem-copiar-id').textContent).toContain('Identificador copiado'));
    expect(copiarTexto).toHaveBeenLastCalledWith(`figura:${ID}`);
  });

  it('erro do envio aparece em palavras leigas e nenhum trecho é mostrado', async () => {
    enviarFigura.mockRejectedValue(new ErroDoEnvioDeImagemFalso('Não foi possível enviar a imagem. Confira a conexão e se você é administrador, e tente de novo.'));
    render(<EnviarImagemDoMaterial />);
    escolher(arquivo('curva.png', 'image/png'));
    preencher();
    fireEvent.click(screen.getByTestId('imagem-enviar'));
    expect((await screen.findByTestId('imagem-erro')).textContent).toContain('Não foi possível enviar a imagem');
    expect(screen.queryByTestId('imagem-trecho')).toBeNull();
    // Dá para tentar de novo.
    expect((screen.getByTestId('imagem-enviar') as HTMLButtonElement).disabled).toBe(false);
  });

  it('"Enviar outra imagem" limpa os campos e sugere o número seguinte', async () => {
    render(<EnviarImagemDoMaterial />);
    escolher(arquivo('curva.png', 'image/png'));
    preencher();
    fireEvent.change(screen.getByTestId('imagem-numero'), { target: { value: '2' } });
    fireEvent.click(screen.getByTestId('imagem-enviar'));
    await screen.findByTestId('imagem-trecho');
    fireEvent.click(screen.getByTestId('imagem-outra'));
    expect(screen.queryByTestId('imagem-trecho')).toBeNull();
    expect((screen.getByTestId('imagem-alt') as HTMLInputElement).value).toBe('');
    expect((screen.getByTestId('imagem-numero') as HTMLInputElement).value).toBe('3');
    expect(screen.getByTestId('imagem-enviar')).toBeTruthy();
  });
});
