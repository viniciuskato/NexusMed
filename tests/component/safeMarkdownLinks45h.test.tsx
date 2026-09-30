import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { SafeMarkdown, parseInline } from '../../src/components/common/SafeMarkdown';

// 45-H (AUD-32.1): link começando com "//" é de outro site (o navegador o
// resolve como "https://outro-site"), não um caminho interno.

afterEach(cleanup);

const linkDe = (markdown: string) => render(<SafeMarkdown content={markdown} />).container.querySelector('a')!;

describe('SafeMarkdown — links internos e externos', () => {
  it('"//site-externo" não é tratado como interno: não vira href e não abre na mesma aba', () => {
    const a = linkDe('Veja [aqui](//site-externo.example/pagina) agora.');
    expect(a.getAttribute('href')).toBe('#');
  });

  it('barra seguida de contrabarra (que o navegador também lê como outro site) não é interno', () => {
    const { container } = render(<>{parseInline('Veja [aqui](/\\site-externo.example) agora.')}</>);
    expect(container.querySelector('a')!.getAttribute('href')).toBe('#');
  });

  it('caminho interno com uma barra continua interno, na mesma aba', () => {
    const a = linkDe('Veja [aqui](/interno/pagina) agora.');
    expect(a.getAttribute('href')).toBe('/interno/pagina');
    expect(a.getAttribute('target')).toBeNull();
  });

  it('link https continua abrindo em nova aba com rel seguro', () => {
    const a = linkDe('Veja [aqui](https://exemplo.org/x) agora.');
    expect(a.getAttribute('href')).toBe('https://exemplo.org/x');
    expect(a.getAttribute('target')).toBe('_blank');
    expect(a.getAttribute('rel')).toContain('noopener');
  });

  it('âncora interna continua funcionando', () => {
    const a = linkDe('Veja [aqui](#secao-2) agora.');
    expect(a.getAttribute('href')).toBe('#secao-2');
  });
});
