import React, { useEffect, useMemo, useRef, useState } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import { avaliarTextoParaEditorVisual, docParaTexto, documentoEhFiel, type NoVisual } from '../../utils/editorVisualMarkdown';
import { BarraDoEditor } from './BarraDoEditor';
import { criarExtensoes } from './extensoes';
import type { EditorVisualDeSecaoProps } from './tipos';
import './editorVisual.css';

// Editor visual (estilo "Word") do Markdown de uma seção do material (ED-1). Este arquivo é o único que carrega a
// biblioteca do editor; o resto do app o abre pelo `EditorVisualCarregavel` (import dinâmico). O que sai daqui é o
// Markdown de hoje — a conversão vive em `utils/editorVisualMarkdown.ts` — e texto que o editor não sabe representar
// com segurança nem chega a abrir.

interface EditorAbertoProps extends EditorVisualDeSecaoProps {
  documento: NoVisual;
}

const EditorAberto: React.FC<EditorAbertoProps> = ({ documento, onChange, modo = 'secao', rotulo, somenteLeitura, aoCriar }) => {
  const [fiel, setFiel] = useState(true);
  const aoMudar = useRef(onChange);
  useEffect(() => {
    aoMudar.current = onChange;
  }, [onChange]);

  const extensoes = useMemo(() => criarExtensoes(modo), [modo]);
  const conteudoInicial = useMemo(
    () => (documento.content && documento.content.length > 0 ? documento : { type: 'doc', content: [{ type: 'paragraph' }] }),
    [documento]
  );

  const editor = useEditor({
    extensions: extensoes,
    content: conteudoInicial,
    editable: !somenteLeitura,
    editorProps: {
      attributes: {
        class: 'ev-conteudo',
        role: 'textbox',
        'aria-multiline': modo === 'linha' ? 'false' : 'true',
        'aria-label': rotulo ?? 'Texto da seção',
      },
      // Campo de uma linha: o que se cola com vários parágrafos, itens ou quebras entra numa linha só, com os blocos
      // separados por espaço (o texto não pode ter quebra de linha). Abertura E fechamento de cada bloco viram espaço:
      // trocar só o fechamento deixava o `<p>` de abertura separando os blocos, e tudo depois do primeiro se perdia.
      ...(modo === 'linha'
        ? {
            transformPastedText: (texto: string) => texto.replace(/\s*\n+\s*/g, ' '),
            transformPastedHTML: (html: string) =>
              html.replace(/<\/?(?:p|div|ul|ol|li|h[1-6]|blockquote|pre|table|thead|tbody|tr|td|th|section|article)\b[^>]*>|<br\b[^>]*>/gi, ' '),
          }
        : {}),
    },
    onUpdate: ({ editor: e }) => {
      const doc = e.getJSON() as NoVisual;
      const ehFiel = documentoEhFiel(doc, modo);
      setFiel(ehFiel);
      aoMudar.current(docParaTexto(doc, modo), { fiel: ehFiel });
    },
  });

  useEffect(() => {
    // Sem emitir "update": trocar entre ler e editar não é uma edição do texto.
    if (editor.isEditable === !!somenteLeitura) editor.setEditable(!somenteLeitura, false);
  }, [editor, somenteLeitura]);

  useEffect(() => {
    if (aoCriar) aoCriar(editor);
  }, [editor, aoCriar]);

  return (
    <div className={modo === 'linha' ? 'ev-editor ev-editor--linha' : 'ev-editor'}>
      {!somenteLeitura && <BarraDoEditor editor={editor} modo={modo} />}
      <EditorContent editor={editor} />
      {!fiel && (
        <p className="ev-aviso" role="alert">
          Atenção: esta formatação não aparece no leitor do jeito que está aqui (por exemplo, negrito e itálico juntos no trecho inteiro, ou um
          asterisco que o leitor entenderia como formatação). Ajuste antes de salvar.
        </p>
      )}
    </div>
  );
};

export const EditorVisualDeSecao: React.FC<EditorVisualDeSecaoProps> = (props) => {
  const { texto, onNaoSeguro, modo = 'secao' } = props;
  const avaliacao = useMemo(() => avaliarTextoParaEditorVisual(texto, modo), [texto, modo]);
  const motivo = avaliacao.seguro ? null : avaliacao.motivo;

  useEffect(() => {
    if (motivo !== null) onNaoSeguro?.(motivo);
  }, [motivo, onNaoSeguro]);

  if (!avaliacao.seguro) {
    return (
      <div className="ev-aviso" role="alert" data-testid="editor-visual-nao-seguro">
        Este trecho tem uma formatação que o editor visual ainda não sabe mostrar com segurança ({avaliacao.motivo}). Para não estragar o texto, ele não foi
        aberto aqui: use o editor de texto.
      </div>
    );
  }
  return <EditorAberto {...props} documento={avaliacao.documento} />;
};

export default EditorVisualDeSecao;
