import React, { useId, useState } from 'react';
import { NodeViewWrapper } from '@tiptap/react';
import type { NodeViewProps } from '@tiptap/react';
import { SafeMarkdown } from '../common/SafeMarkdown';
import { tipoDoBlocoProtegido } from '../../utils/editorVisualMarkdown';

/**
 * Tabela, fórmula ou figura dentro do editor visual: mostra o resultado como o leitor mostra e guarda o texto original.
 * Quem quer mexer abre "Editar texto" e muda o texto original, num campo próprio (a tabela, por exemplo, não se edita
 * célula a célula aqui). O texto só muda se a pessoa o editar.
 */
export const BlocoProtegidoView: React.FC<NodeViewProps> = ({ node, updateAttributes, editor, selected }) => {
  const raw = String(node.attrs.raw ?? '');
  const tipo = tipoDoBlocoProtegido(raw);
  const [aberto, setAberto] = useState(false);
  const idDoCampo = useId();

  return (
    <NodeViewWrapper
      className={`ev-protegido${selected ? ' ev-protegido--selecionado' : ''}`}
      data-testid="bloco-protegido"
      role="group"
      aria-label={`${tipo} (bloco protegido)`}
    >
      <div className="ev-protegido__cabecalho" contentEditable={false}>
        <span className="ev-protegido__tipo">{tipo}</span>
        {editor.isEditable && (
          <button type="button" className="ev-protegido__botao" aria-expanded={aberto} onClick={() => setAberto((v) => !v)}>
            {aberto ? 'Fechar o texto' : 'Editar texto'}
          </button>
        )}
      </div>
      <div className="ev-protegido__resultado" contentEditable={false}>
        <SafeMarkdown content={raw} />
      </div>
      {aberto && editor.isEditable && (
        <div className="ev-protegido__texto" contentEditable={false}>
          <label htmlFor={idDoCampo}>Texto original ({tipo})</label>
          <textarea
            id={idDoCampo}
            value={raw}
            rows={Math.min(12, Math.max(3, raw.split('\n').length + 1))}
            spellCheck={false}
            onChange={(e) => updateAttributes({ raw: e.target.value })}
          />
          <p className="ev-protegido__dica">
            Este trecho é escrito em texto: mantenha o formato (linhas da tabela começam e terminam com | ; a fórmula fica numa linha só, com =).
          </p>
        </div>
      )}
    </NodeViewWrapper>
  );
};
