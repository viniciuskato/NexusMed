import React from 'react';
import { SafeMarkdown, parseInline } from '../common/SafeMarkdown';
import { avaliarTextoParaEditorVisual, type ModoDoTexto } from '../../utils/editorVisualMarkdown';
import { normalizarParaEditorVisual } from '../../utils/normalizarParaEditorVisual';

// A troca para o editor visual de um texto que ele não aceita como está (ED-2): só se oferece quando o leitor mostra o
// texto proposto IGUAL ao original. "Igual" é conferido renderizando o leitor de verdade (`SafeMarkdown` para o texto
// da seção, `parseInline` para os campos de uma linha) e comparando o HTML que ele produz.

/** O HTML que o leitor produz para o texto. A renderização para HTML é baixada só aqui, quando alguém precisa dela. */
export async function htmlDoLeitor(texto: string, modo: ModoDoTexto = 'secao'): Promise<string> {
  const { renderToStaticMarkup } = await import('react-dom/server');
  return renderToStaticMarkup(modo === 'linha' ? <p>{parseInline(texto)}</p> : <SafeMarkdown content={texto} />);
}

const TAGS_DE_BLOCO = '(?:p|div|ul|ol|li|h[1-6]|blockquote|table|thead|tbody|tr|th|td)';

/**
 * O HTML como o navegador o mostra: espaço em branco repetido vale um espaço só, e o espaço colado a uma tag de bloco
 * (fim de parágrafo, começo de item) não aparece na tela. Dentro do texto corrido nada muda.
 */
export function htmlComoNaTela(html: string): string {
  return html
    .replace(/\s+/g, ' ')
    .replace(new RegExp(` ?(</?${TAGS_DE_BLOCO}\\b[^>]*>) ?`, 'g'), '$1')
    .trim();
}

/** O leitor mostra os dois textos do mesmo jeito? */
export async function leitorMostraIgual(a: string, b: string, modo: ModoDoTexto = 'secao'): Promise<boolean> {
  const [htmlA, htmlB] = await Promise.all([htmlDoLeitor(a, modo), htmlDoLeitor(b, modo)]);
  return htmlComoNaTela(htmlA) === htmlComoNaTela(htmlB);
}

/**
 * O texto que o editor visual pode abrir no lugar de `texto`, sem mudar o que o leitor mostra: o próprio texto, se o
 * editor já o aceita; uma versão normalizada, se o leitor a mostra igual; senão `null` (o texto fica no editor de texto).
 */
export async function textoParaAbrirNoEditorVisual(texto: string, modo: ModoDoTexto = 'secao'): Promise<string | null> {
  if (avaliarTextoParaEditorVisual(texto, modo).seguro) return texto;
  const proposta = normalizarParaEditorVisual(texto, modo);
  if (proposta === null) return null;
  return (await leitorMostraIgual(texto, proposta, modo)) ? proposta : null;
}
