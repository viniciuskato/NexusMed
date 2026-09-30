import { describe, expect, it } from 'vitest';
import { resolveOpenAccessReferenceLink } from '../../src/utils/bibliographicSources';

// 45-H: DOI e link no fim de frase viram link sem a pontuação final.

describe('resolveOpenAccessReferenceLink — pontuação depois do DOI', () => {
  it('DOI no fim de frase (ponto final) vira link sem o ponto', () => {
    const r = resolveOpenAccessReferenceLink('Autor A. Título. N Engl J Med. 2020. DOI: 10.1056/NEJMoa2001017.');
    expect(r.badgeLabel).toBe('DOI');
    expect(r.url).toBe('https://doi.org/10.1056/NEJMoa2001017');
  });

  it.each([',', ';', ':', ')', '.)', '),'])('DOI seguido de "%s" perde a pontuação', (sufixo) => {
    const r = resolveOpenAccessReferenceLink(`Ver (DOI 10.1056/NEJMoa2001017${sufixo} depois`);
    expect(r.url).toBe('https://doi.org/10.1056/NEJMoa2001017');
  });

  it('parênteses que fazem parte do DOI ficam', () => {
    const r = resolveOpenAccessReferenceLink('Lancet 2020. doi:10.1016/S0140-6736(20)30183-5.');
    expect(r.url).toBe('https://doi.org/10.1016/S0140-6736(20)30183-5');
  });

  it('URL embutida no fim de frase também perde a pontuação final', () => {
    const r = resolveOpenAccessReferenceLink('Diretriz disponível em https://exemplo.org/diretriz.');
    expect(r.url).toBe('https://exemplo.org/diretriz');
  });
});
