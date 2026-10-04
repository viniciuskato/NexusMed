import { describe, it, expect } from 'vitest';
import {
  caminhoDaFigura,
  destinoDaFigura,
  eLinhaDeFigura,
  lerBlocoDeFigura,
  lerFigura,
  LIMITE_DA_IMAGEM_BYTES,
  montarTrechoDaFigura,
  motivoDaImagemRecusada,
  tipoPelosBytes,
} from '../../src/utils/figuraDoMaterial';
import { splitReaderBlocks } from '../../src/utils/markdownBlocks';

// P9 — o bloco de figura do padrão v3: uma única leitura (`lerFigura`), usada pelo leitor e pela checagem.

const ID = '0b9f1a0e-5c2d-4e8a-9a41-3d6b7c8e9f10';
const BLOCO = [
  `![Curva fluxo-volume com obstrução](figura:${ID})`,
  '**Figura 2.** Curva fluxo-volume normal e obstrutiva.',
  'Fonte: Diretriz GOLD, 2024.',
].join('\n');

describe('lerFigura', () => {
  it('lê imagem, legenda e fonte do bloco de três linhas', () => {
    const f = lerBlocoDeFigura(BLOCO);
    expect(f).toEqual({
      alt: 'Curva fluxo-volume com obstrução',
      destino: { tipo: 'figura', id: ID },
      legenda: '**Figura 2.** Curva fluxo-volume normal e obstrutiva.',
      fonte: 'Diretriz GOLD, 2024.',
      mostrar: '',
      linhas: 3,
    });
  });

  it('aceita legenda em mais de uma linha e o rótulo "Fonte:" em negrito', () => {
    const f = lerFigura([`![a](figura:${ID})`, '**Figura 1.** Primeira parte', 'e a segunda.', '**Fonte:** OMS, 2023.']);
    expect(f?.legenda).toBe('**Figura 1.** Primeira parte e a segunda.');
    expect(f?.fonte).toBe('OMS, 2023.');
  });

  it('a fonte pode ser uma citação da lista de referências', () => {
    const f = lerFigura([`![a](figura:${ID})`, '**Figura 1.** Legenda.', 'Fonte: [3](#ref-3)']);
    expect(f?.fonte).toBe('[3](#ref-3)');
  });

  it('para depois da fonte: o texto colado nela não é legenda', () => {
    const f = lerFigura([`![a](figura:${ID})`, 'Legenda.', 'Fonte: X.', 'Parágrafo seguinte.']);
    expect(f?.linhas).toBe(3);
    expect(f?.legenda).toBe('Legenda.');
  });

  it('a figura pendente leva a instrução "Mostrar:" e não tem identificador', () => {
    const f = lerFigura([
      '![Fluxograma de tratamento](figura:PENDENTE)',
      '**Figura 3.** Escolha do tratamento inicial.',
      'Fonte: sugerida — GOLD 2024, figura 3.1.',
      'Mostrar: fluxograma com os grupos A, B e E e a conduta de cada um.',
    ]);
    expect(f?.destino).toEqual({ tipo: 'pendente' });
    expect(f?.mostrar).toBe('fluxograma com os grupos A, B e E e a conduta de cada um.');
    expect(f?.linhas).toBe(4);
  });

  it('falta de legenda, de fonte ou de texto alternativo aparece como campo vazio', () => {
    expect(lerFigura([`![](figura:${ID})`, 'L.', 'Fonte: X.'])?.alt).toBe('');
    expect(lerFigura([`![a](figura:${ID})`, 'Fonte: X.'])?.legenda).toBe('');
    expect(lerFigura([`![a](figura:${ID})`, 'L.'])?.fonte).toBe('');
  });

  it('só a primeira linha sozinha abre figura; texto antes ou depois da imagem na linha não', () => {
    expect(lerFigura([`Texto ![a](figura:${ID})`])).toBeNull();
    expect(lerFigura([`![a](figura:${ID}) e mais texto`])).toBeNull();
    expect(lerFigura(['Parágrafo comum.'])).toBeNull();
    expect(lerFigura([])).toBeNull();
    expect(eLinhaDeFigura(`  ![a](figura:${ID})  `)).toBe(true);
    expect(eLinhaDeFigura('[a](figura:x)')).toBe(false);
  });
});

describe('destinoDaFigura: só o identificador do próprio site vale', () => {
  it('aceita o UUID minúsculo e a marca PENDENTE', () => {
    expect(destinoDaFigura(`figura:${ID}`)).toEqual({ tipo: 'figura', id: ID });
    expect(destinoDaFigura('figura:PENDENTE')).toEqual({ tipo: 'pendente' });
  });

  it.each([
    'https://exemplo.com/a.png',
    'http://127.0.0.1/a.png',
    '//exemplo.com/a.png',
    'javascript:alert(1)',
    'data:image/png;base64,AAAA',
    '/imagens/a.png',
    'a.png',
    'figura:pendente',
    'figura:123',
    `figura:${ID.toUpperCase()}`,
    `figura:${ID}/../../x`,
    `figura:${ID} `.replace(/ $/, 'x'),
    'figura:',
    '',
    ` figura:${ID}`,
    `figura:${ID} `,
    `figura:${ID}\t`,
    ' figura:PENDENTE',
    'figura:PENDENTE ',
  ])('recusa "%s"', (destino) => {
    expect(destinoDaFigura(destino).tipo).toBe('invalido');
  });
});

describe('o trecho que o botão "Enviar imagem" devolve', () => {
  it('é o bloco de três linhas que a leitura entende, sem linha em branco', () => {
    const trecho = montarTrechoDaFigura({
      id: ID,
      alt: 'Curva fluxo-volume',
      legenda: 'Curva fluxo-volume normal e obstrutiva.',
      fonte: 'Diretriz GOLD, 2024.',
      numero: 2,
    });
    expect(trecho.split('\n')).toEqual([
      `![Curva fluxo-volume](figura:${ID})`,
      '**Figura 2.** Curva fluxo-volume normal e obstrutiva.',
      'Fonte: Diretriz GOLD, 2024.',
    ]);
    expect(trecho).not.toMatch(/\n\s*\n/);
    const lida = lerBlocoDeFigura(trecho);
    expect(lida?.destino).toEqual({ tipo: 'figura', id: ID });
    expect(lida?.fonte).toBe('Diretriz GOLD, 2024.');
  });

  it('tira quebra de linha e colchete do que a pessoa digitou (nada quebra o bloco)', () => {
    const trecho = montarTrechoDaFigura({ id: ID, alt: 'a [b]\nc', legenda: 'L1\n\nL2', fonte: 'F1\nF2' });
    expect(trecho.split('\n')).toHaveLength(3);
    expect(trecho).toContain('![a b c](figura:');
    expect(trecho).toContain('**Figura.** L1 L2');
    expect(lerBlocoDeFigura(trecho)?.fonte).toBe('F1 F2');
  });
});

describe('o leitor separa a figura em bloco próprio', () => {
  it('figura colada num parágrafo, sem linha em branco, vira bloco à parte', () => {
    const blocos = splitReaderBlocks(`Frase de abertura.\n${BLOCO}`);
    expect(blocos).toEqual(['Frase de abertura.', BLOCO]);
  });

  it('parágrafo colado na linha "Fonte:" não vira legenda', () => {
    const blocos = splitReaderBlocks(`${BLOCO}\nTexto seguinte da seção.`);
    expect(blocos).toEqual([BLOCO, 'Texto seguinte da seção.']);
  });

  it('a linha "Mostrar:" fica no bloco da figura pendente', () => {
    const pendente = [`![a](figura:PENDENTE)`, 'Legenda.', 'Fonte: X.', 'Mostrar: o esquema.'].join('\n');
    expect(splitReaderBlocks(`${pendente}\nDepois.`)).toEqual([pendente, 'Depois.']);
  });
});

describe('envio da imagem: o que serve', () => {
  const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
  const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46]);
  const webp = Uint8Array.from([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50]);

  it('reconhece PNG, JPEG e WebP pelos primeiros bytes, e nada mais', () => {
    expect(tipoPelosBytes(png)).toBe('image/png');
    expect(tipoPelosBytes(jpeg)).toBe('image/jpeg');
    expect(tipoPelosBytes(webp)).toBe('image/webp');
    expect(tipoPelosBytes(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBeNull();
    expect(tipoPelosBytes(new TextEncoder().encode('%PDF-1.7'))).toBeNull();
    expect(tipoPelosBytes(new Uint8Array(0))).toBeNull();
    expect(tipoPelosBytes(Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45]))).toBeNull();
  });

  it('recusa por tipo e por tamanho (10 MiB), em palavras leigas', () => {
    expect(motivoDaImagemRecusada({ name: 'a.png', type: 'image/png', size: 1024 })).toBeNull();
    expect(motivoDaImagemRecusada({ name: 'a.png', type: 'image/png', size: LIMITE_DA_IMAGEM_BYTES })).toBeNull();
    expect(motivoDaImagemRecusada({ name: 'a.png', type: 'image/png', size: LIMITE_DA_IMAGEM_BYTES + 1 })).toMatch(/passa de 10 MB/);
    expect(motivoDaImagemRecusada({ name: 'a.svg', type: 'image/svg+xml', size: 10 })).toMatch(/PNG, JPEG ou WebP/);
    expect(motivoDaImagemRecusada({ name: 'a.gif', type: 'image/gif', size: 10 })).toMatch(/PNG, JPEG ou WebP/);
    expect(motivoDaImagemRecusada({ name: 'a.pdf', type: 'application/pdf', size: 10 })).toMatch(/PNG, JPEG ou WebP/);
    expect(motivoDaImagemRecusada({ name: 'a.png', type: 'image/png', size: 0 })).toMatch(/vazio/);
  });

  it('o caminho do arquivo é <id>.<extensão>, como a política do banco exige', () => {
    expect(caminhoDaFigura(ID, 'image/png')).toBe(`${ID}.png`);
    expect(caminhoDaFigura(ID, 'image/jpeg')).toBe(`${ID}.jpg`);
    expect(caminhoDaFigura(ID, 'image/webp')).toBe(`${ID}.webp`);
  });
});

describe('o destino é o mesmo texto que o banco procura', () => {
  it('`![alt]( figura:<id> )` com espaço nos parênteses é destino inválido (o banco só libera a imagem de `(figura:<id>)` exato)', () => {
    const f = lerFigura([`![a]( figura:${ID} )`, 'Legenda.', 'Fonte: X.']);
    expect(f?.destino).toEqual({ tipo: 'invalido', bruto: ` figura:${ID} ` });
    expect(lerFigura([`![a](figura:${ID})`, 'Legenda.', 'Fonte: X.'])?.destino).toEqual({ tipo: 'figura', id: ID });
  });

  it('o trecho do botão "Enviar imagem" tem exatamente `(figura:<id>)`, como a função do banco procura', () => {
    const trecho = montarTrechoDaFigura({ id: ID, alt: 'a', legenda: 'L', fonte: 'F' });
    expect(trecho).toContain(`(figura:${ID})`);
  });
});
