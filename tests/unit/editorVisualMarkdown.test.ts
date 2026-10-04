import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  avaliarTextoParaEditorVisual,
  docParaTexto,
  documentoEhFiel,
  textoEhSeguroParaEditorVisual,
  textoParaDoc,
  type DocumentoVisual,
  type NoVisual,
} from '../../src/utils/editorVisualMarkdown';
import { parseCompendiumMarkdownText } from '../../src/utils/compendiumMarkdownImport';
import type { Discipline, Theme } from '../../src/types';
import { CORPUS_NAO_SEGURO, CORPUS_SEGURO } from './helpers/corpusEditorVisual';

// ED-1 — conversão texto ⇄ documento do editor visual. A regra: o que sai do editor é o Markdown de hoje, byte a byte, e
// o que o editor não sabe representar é "não seguro" (não é alterado, não abre).

describe('editor visual — ida e volta sem perda (texto → editor → texto)', () => {
  for (const grupo of CORPUS_SEGURO) {
    describe(grupo.construcao, () => {
      grupo.textos.forEach((texto, i) => {
        it(`caso ${i + 1}: devolve o texto byte a byte idêntico`, () => {
          const avaliacao = avaliarTextoParaEditorVisual(texto);
          if (!avaliacao.seguro) throw new Error(`não seguro: ${avaliacao.motivo}`);
          expect(docParaTexto(avaliacao.documento)).toBe(texto);
          expect(textoEhSeguroParaEditorVisual(texto)).toBe(true);
          expect(documentoEhFiel(avaliacao.documento)).toBe(true);
        });
      });
    });
  }

  it('o corpus cobre todas as construções do aceite (contagem de casos por construção)', () => {
    const contagem = Object.fromEntries(CORPUS_SEGURO.map((g) => [g.construcao, g.textos.length]));
    // Linha de contagem que o RETORNO reproduz.
    console.info('casos por construção:', JSON.stringify(contagem));
    for (const construcao of [
      'parágrafo',
      'quebra simples dentro do parágrafo',
      'negrito',
      'itálico com asterisco',
      'negrito com itálico aninhado',
      'código inline',
      'link',
      'citação inline [N](#ref-N) e citações coladas',
      'expoente (^)',
      'lista com marcador',
      'lista numerada',
      'item de lista com linha de continuação',
      'tabela',
      'fórmula de exibição em linha própria',
      'caixa Cuidado',
      'caixa Raciocínio',
      'caixa Não confundir',
      'caixa Atualização',
      'caixa Aprofundar',
      'caixa Essencial',
      'citação comum com >',
      'bloco figura:<uuid> com legenda e Fonte:',
    ]) {
      expect(contagem[construcao], construcao).toBeGreaterThanOrEqual(2);
    }
  });
});

describe('editor visual — o documento tem a forma que o editor mostra', () => {
  const doc = (texto: string): DocumentoVisual => {
    const d = textoParaDoc(texto);
    if (!d) throw new Error('texto não seguro');
    return d;
  };

  it('negrito, itálico e código viram marcas; o texto não carrega os símbolos', () => {
    const [p] = doc('a **b** *c* `d`').content;
    expect(p.type).toBe('paragraph');
    expect(p.content).toEqual([
      { type: 'text', text: 'a ' },
      { type: 'text', text: 'b', marks: [{ type: 'bold' }] },
      { type: 'text', text: ' ' },
      { type: 'text', text: 'c', marks: [{ type: 'italic' }] },
      { type: 'text', text: ' ' },
      { type: 'text', text: 'd', marks: [{ type: 'code' }] },
    ]);
  });

  it('itálico dentro de negrito acumula as duas marcas', () => {
    const [p] = doc('**a *b* c**').content;
    expect(p.content?.[1]).toEqual({ type: 'text', text: 'b', marks: [{ type: 'bold' }, { type: 'italic' }] });
  });

  it('citação [N](#ref-N) é link com o número como texto; expoente guarda se leva parênteses', () => {
    const [p] = doc('x[3](#ref-3) y^2 z^(a b)').content;
    expect(p.content).toEqual([
      { type: 'text', text: 'x' },
      { type: 'text', text: '3', marks: [{ type: 'link', attrs: { href: '#ref-3' } }] },
      { type: 'text', text: ' y' },
      { type: 'text', text: '2', marks: [{ type: 'expoente', attrs: { parenteses: false } }] },
      { type: 'text', text: ' z' },
      { type: 'text', text: 'a b', marks: [{ type: 'expoente', attrs: { parenteses: true } }] },
    ]);
  });

  it('as seis caixas viram o nó "caixa" com o rótulo; a citação comum vira "blockquote"', () => {
    for (const rotulo of ['Cuidado', 'Raciocínio', 'Não confundir', 'Atualização', 'Aprofundar', 'Essencial']) {
      const [caixa] = doc(`> **${rotulo}:** texto`).content;
      expect(caixa.type).toBe('caixa');
      expect(caixa.attrs).toEqual({ rotulo });
    }
    expect(doc('> só citação').content[0].type).toBe('blockquote');
  });

  it('tabela, fórmula e figura viram bloco protegido com o texto original', () => {
    const tabela = '| A | B |\n|---|---|\n| 1 | 2 |';
    const figura = '![x](figura:PENDENTE)\n**Figura 1.** L.\nFonte: F.';
    const formula = 'TFG = 142 × x^2';
    for (const raw of [tabela, figura, formula, '> TFG = 1 [1](#ref-1)']) {
      expect(doc(raw).content).toEqual([{ type: 'blocoProtegido', attrs: { raw } }]);
    }
  });

  it('quebra simples vira um nó que guarda o separador original', () => {
    const [p] = doc('a  \n  b').content;
    expect(p.content).toEqual([
      { type: 'text', text: 'a' },
      { type: 'quebraSuave', attrs: { raw: '  \n  ' } },
      { type: 'text', text: 'b' },
    ]);
  });
});

describe('editor visual — guarda de segurança', () => {
  for (const { motivo, texto } of CORPUS_NAO_SEGURO) {
    it(`recusa (${motivo}) e não altera o texto`, () => {
      const copia = String(texto);
      const avaliacao = avaliarTextoParaEditorVisual(texto);
      expect(avaliacao.seguro).toBe(false);
      expect('documento' in avaliacao).toBe(false);
      expect(avaliacao.seguro === false && avaliacao.motivo.length > 0).toBe(true);
      expect(textoEhSeguroParaEditorVisual(texto)).toBe(false);
      expect(textoParaDoc(texto)).toBeNull();
      expect(texto).toBe(copia);
    });
  }

  it('a recusa explica o motivo em palavras (HTML, caixa antiga, lista, espaço)', () => {
    const motivo = (t: string) => {
      const a = avaliarTextoParaEditorVisual(t);
      return a.seguro ? '' : a.motivo;
    };
    expect(motivo('<b>x</b>')).toMatch(/HTML/);
    expect(motivo('> [!NOTE] x')).toMatch(/caixa antiga/);
    expect(motivo('* a\n* b')).toMatch(/marcador/);
    expect(motivo('a\n- b')).toMatch(/linha em branco/);
  });
});

describe('editor visual — modo "linha" (campos curtos com Markdown inline)', () => {
  it('ida e volta de um campo curto, sem tratar o texto como bloco', () => {
    for (const texto of ['Frase com **negrito** e [1](#ref-1).', '- parece lista mas é só um campo', '> parece citação', '# parece título', 'x^2 e `código`']) {
      const a = avaliarTextoParaEditorVisual(texto, 'linha');
      if (!a.seguro) throw new Error(a.motivo);
      expect(a.documento.content).toHaveLength(1);
      expect(a.documento.content[0].type).toBe('paragraph');
      expect(docParaTexto(a.documento, 'linha')).toBe(texto);
    }
  });

  it('recusa campo com mais de uma linha ou com HTML', () => {
    expect(textoEhSeguroParaEditorVisual('um\ndois', 'linha')).toBe(false);
    expect(textoEhSeguroParaEditorVisual('<i>x</i>', 'linha')).toBe(false);
  });
});

describe('editor visual — fidelidade do que o editor produz', () => {
  it('negrito e itálico no mesmo trecho inteiro não existe em Markdown do leitor: não é fiel', () => {
    const doc: NoVisual = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'x', marks: [{ type: 'bold' }, { type: 'italic' }] }] }],
    };
    expect(docParaTexto(doc)).toBe('***x***');
    expect(documentoEhFiel(doc)).toBe(false);
  });

  it('asterisco digitado que fecha com outro mais adiante seria lido como itálico: não é fiel', () => {
    const doc: NoVisual = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'a * b e c * d' }] }],
    };
    expect(documentoEhFiel(doc)).toBe(false);
  });

  it('parágrafos vazios no topo não geram bloco nem tornam o documento infiel', () => {
    const doc: NoVisual = { type: 'doc', content: [{ type: 'paragraph' }, { type: 'paragraph', content: [{ type: 'text', text: 'a' }] }, { type: 'paragraph' }] };
    expect(docParaTexto(doc)).toBe('a');
    expect(documentoEhFiel(doc)).toBe(true);
  });
});

// --- O padrão de conteúdos (seção 1.7) ----------------------------------------------------------------------------------

const PADRAO = path.resolve(process.cwd(), 'docs/editorial/PADRAO-NEXUSMED-CONTEUDOS.md');

function exemploDeFormato(): string {
  const doc = readFileSync(PADRAO, 'utf8');
  const m = doc.match(/## 1\.7[^\n]*\n[\s\S]*?````markdown\r?\n([\s\S]*?)\r?\n````/);
  if (!m) throw new Error('bloco de formato da seção 1.7 não encontrado no padrão');
  return m[1];
}

const disciplina: Discipline = {
  id: 'disc',
  name: 'Nome exato da disciplina no catálogo',
  code: 'X',
  icon: 'book',
  description: '',
  cycle: 'basico',
  color: '#000',
};
const tema: Theme = { id: 'tema', disciplineId: 'disc', name: 'Nome exato do tema no catálogo', description: '', highYield: false, order: 1 };

describe('editor visual — o exemplo da seção 1.7 do padrão, passado pelo importador', () => {
  const resultado = parseCompendiumMarkdownText(exemploDeFormato(), [disciplina], [tema], []);
  if (resultado.ok === false) throw new Error(resultado.errors.join('; '));

  it('cada campo com Markdown de cada seção volta byte a byte idêntico', () => {
    const verificados: Record<string, number> = { content: 0, keyTakeaways: 0, clinicalPearl: 0, warningAlert: 0 };
    for (const secao of resultado.sections) {
      // O texto da seção é o corpo (blocos); os demais campos são Markdown inline de uma linha (AGENTS.md, item 15).
      const campos: Array<[string, string, 'secao' | 'linha']> = [['content', secao.content, 'secao']];
      secao.keyTakeaways.forEach((item) => campos.push(['keyTakeaways', item, 'linha']));
      if (secao.clinicalPearl !== undefined) campos.push(['clinicalPearl', secao.clinicalPearl, 'linha']);
      if (secao.warningAlert !== undefined) campos.push(['warningAlert', secao.warningAlert, 'linha']);

      for (const [nome, texto, modo] of campos) {
        const avaliacao = avaliarTextoParaEditorVisual(texto, modo);
        if (!avaliacao.seguro) throw new Error(`${secao.title} / ${nome}: não seguro (${avaliacao.motivo})`);
        expect(docParaTexto(avaliacao.documento, modo), `${secao.title} / ${nome}`).toBe(texto);
        // O mesmo texto também passa como bloco: um campo curto é só um parágrafo.
        expect(textoEhSeguroParaEditorVisual(texto, 'secao'), `${secao.title} / ${nome} (como seção)`).toBe(true);
        verificados[nome]++;
      }
    }
    console.info('campos do padrão verificados:', JSON.stringify(verificados));
    expect(verificados.content).toBe(resultado.sections.length);
    expect(verificados.keyTakeaways).toBe(resultado.sections.reduce((n, s) => n + s.keyTakeaways.length, 0));
    expect(verificados.clinicalPearl).toBeGreaterThanOrEqual(1);
    expect(verificados.warningAlert).toBeGreaterThanOrEqual(1);
  });

  it('o texto da primeira seção tem caixas, tabela e figura — e todos viram nó do editor, sem sobra', () => {
    const doc = textoParaDoc(resultado.sections[0].content);
    expect(doc).not.toBeNull();
    const tipos = doc!.content.map((n) => n.type);
    expect(tipos).toContain('caixa');
    expect(tipos).toContain('heading');
    expect(tipos.filter((t) => t === 'blocoProtegido').length).toBeGreaterThanOrEqual(2); // tabela e figura
  });
});
