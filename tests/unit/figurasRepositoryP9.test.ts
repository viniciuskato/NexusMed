import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const maybeSingle = vi.fn();
  const eq = vi.fn(() => ({ maybeSingle }));
  const select = vi.fn(() => ({ eq }));
  const insert = vi.fn();
  const from = vi.fn(() => ({ select, insert }));
  const createSignedUrl = vi.fn();
  const upload = vi.fn();
  const storageFrom = vi.fn(() => ({ createSignedUrl, upload }));
  const onAuthStateChange = vi.fn();
  return { maybeSingle, eq, select, insert, from, createSignedUrl, upload, storageFrom, onAuthStateChange };
});

vi.mock('../../src/lib/supabaseClient', () => ({
  isSupabaseConfigured: true,
  supabase: { from: mocks.from, storage: { from: mocks.storageFrom }, auth: { onAuthStateChange: mocks.onAuthStateChange } },
}));

import {
  BUCKET_DE_FIGURAS,
  enviarFigura,
  ErroDoEnvioDeImagem,
  limparCacheDeFiguras,
  urlDaFigura,
} from '../../src/repositories/FigurasRepository';

// P9 — a URL assinada da figura e o envio da imagem (contra um Supabase de mentira; a RLS é provada no pgTAP e no E2E).

const ID = '0b9f1a0e-5c2d-4e8a-9a41-3d6b7c8e9f10';
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4, 5, 6, 7, 8];

// O ouvinte é registrado uma vez, ao carregar o módulo; guarda-se a função antes de os mocks serem limpos.
const ouvinteDeAutenticacao = mocks.onAuthStateChange.mock.calls[0]?.[0] as ((evento: string) => void) | undefined;

beforeEach(() => {
  limparCacheDeFiguras();
  for (const m of Object.values(mocks)) m.mockClear();
  mocks.maybeSingle.mockResolvedValue({ data: { storage_path: `${ID}.png` }, error: null });
  mocks.createSignedUrl.mockResolvedValue({ data: { signedUrl: 'http://127.0.0.1:54321/sign/x?token=1' }, error: null });
  mocks.upload.mockResolvedValue({ data: {}, error: null });
  mocks.insert.mockResolvedValue({ error: null });
});

describe('urlDaFigura', () => {
  it('lê o caminho na tabela e assina o arquivo do bucket privado por 1 h', async () => {
    expect(await urlDaFigura(ID)).toBe('http://127.0.0.1:54321/sign/x?token=1');
    expect(mocks.from).toHaveBeenCalledWith('material_figures');
    expect(mocks.eq).toHaveBeenCalledWith('id', ID);
    expect(mocks.storageFrom).toHaveBeenCalledWith(BUCKET_DE_FIGURAS);
    expect(mocks.createSignedUrl).toHaveBeenCalledWith(`${ID}.png`, 3600);
  });

  it('guarda a URL: a segunda leitura não vai ao servidor; pedidos simultâneos viram um só', async () => {
    const [a, b] = await Promise.all([urlDaFigura(ID), urlDaFigura(ID)]);
    expect(a).toBe(b);
    await urlDaFigura(ID);
    expect(mocks.createSignedUrl).toHaveBeenCalledTimes(1);
  });

  it('entrar ou sair da conta esquece as URLs guardadas (outra pessoa no mesmo navegador não herda a URL)', async () => {
    expect(ouvinteDeAutenticacao).toBeTypeOf('function');
    await urlDaFigura(ID);
    await urlDaFigura(ID);
    expect(mocks.createSignedUrl).toHaveBeenCalledTimes(1);
    ouvinteDeAutenticacao!('TOKEN_REFRESHED');
    await urlDaFigura(ID);
    expect(mocks.createSignedUrl).toHaveBeenCalledTimes(1);
    ouvinteDeAutenticacao!('SIGNED_OUT');
    await urlDaFigura(ID);
    expect(mocks.createSignedUrl).toHaveBeenCalledTimes(2);
    ouvinteDeAutenticacao!('SIGNED_IN');
    await urlDaFigura(ID);
    expect(mocks.createSignedUrl).toHaveBeenCalledTimes(3);
  });

  it('identificador malformado nem chega ao servidor', async () => {
    for (const id of ['123', `${ID.toUpperCase()}`, `${ID}/../x`, 'PENDENTE', '']) {
      expect(await urlDaFigura(id)).toBeNull();
    }
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('sem acesso (a RLS não devolve a linha), erro ao assinar ou falha de rede: nulo, nunca lança', async () => {
    mocks.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    expect(await urlDaFigura(ID)).toBeNull();
    mocks.maybeSingle.mockResolvedValueOnce({ data: { storage_path: `${ID}.png` }, error: null });
    mocks.createSignedUrl.mockResolvedValueOnce({ data: null, error: { message: 'Object not found' } });
    expect(await urlDaFigura(ID)).toBeNull();
    mocks.maybeSingle.mockRejectedValueOnce(new Error('rede'));
    expect(await urlDaFigura(ID)).toBeNull();
    // Nenhuma dessas respostas ficou guardada.
    expect(await urlDaFigura(ID)).toBe('http://127.0.0.1:54321/sign/x?token=1');
  });
});

describe('enviarFigura', () => {
  const imagem = (bytes: number[], tipo = 'image/png', nome = 'a.png') => new File([new Uint8Array(bytes)], nome, { type: tipo });

  it('sobe <id>.png sem sobrescrever e registra a figura com o SHA-256 do arquivo', async () => {
    const enviada = await enviarFigura(imagem(PNG));
    expect(enviada.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(enviada.storagePath).toBe(`${enviada.id}.png`);
    expect(mocks.storageFrom).toHaveBeenCalledWith(BUCKET_DE_FIGURAS);
    expect(mocks.upload).toHaveBeenCalledWith(`${enviada.id}.png`, expect.anything(), { contentType: 'image/png', upsert: false });
    const esperado = createHash('sha256').update(Uint8Array.from(PNG)).digest('hex');
    expect(mocks.insert).toHaveBeenCalledWith({
      id: enviada.id,
      storage_path: `${enviada.id}.png`,
      mime_type: 'image/png',
      byte_size: PNG.length,
      sha256: esperado,
    });
    expect(enviada.sha256).toBe(esperado);
    // O arquivo vai antes da linha: a linha só existe se o arquivo subiu.
    expect(mocks.upload.mock.invocationCallOrder[0]).toBeLessThan(mocks.insert.mock.invocationCallOrder[0]);
  });

  it('JPEG e WebP ganham a extensão do tipo', async () => {
    const jpg = await enviarFigura(imagem([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0, 1, 2, 3], 'image/jpeg', 'a.jpeg'));
    expect(jpg.storagePath).toBe(`${jpg.id}.jpg`);
    const webp = await enviarFigura(imagem([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50, 0, 0], 'image/webp', 'a.webp'));
    expect(webp.storagePath).toBe(`${webp.id}.webp`);
  });

  it('recusa sem tocar o servidor: tipo que não é imagem aceita, conteúdo que não bate com o tipo, arquivo vazio', async () => {
    await expect(enviarFigura(imagem([1, 2, 3], 'image/svg+xml', 'a.svg'))).rejects.toBeInstanceOf(ErroDoEnvioDeImagem);
    // Diz ser PNG, mas os bytes são de um texto (ex.: um SVG renomeado).
    await expect(enviarFigura(imagem(Array.from(new TextEncoder().encode('<svg onload=alert(1)></svg>')), 'image/png'))).rejects.toThrow(
      /não é uma imagem PNG, JPEG ou WebP válida/,
    );
    // Diz ser JPEG, mas é PNG.
    await expect(enviarFigura(imagem(PNG, 'image/jpeg', 'a.jpg'))).rejects.toBeInstanceOf(ErroDoEnvioDeImagem);
    await expect(enviarFigura(imagem([], 'image/png'))).rejects.toThrow(/vazio/);
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it('falha do Storage ou do registro vira erro em palavras leigas, e sem arquivo não há registro', async () => {
    mocks.upload.mockResolvedValueOnce({ data: null, error: { message: 'new row violates row-level security policy' } });
    await expect(enviarFigura(imagem(PNG))).rejects.toThrow(/Não foi possível enviar a imagem/);
    expect(mocks.insert).not.toHaveBeenCalled();
    mocks.insert.mockResolvedValueOnce({ error: { message: 'duplicate key' } });
    await expect(enviarFigura(imagem(PNG))).rejects.toThrow(/não foi registrada/);
  });
});
