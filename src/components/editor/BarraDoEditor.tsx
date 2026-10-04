import React, { useEffect, useId, useState } from 'react';
import type { Editor } from '@tiptap/core';
import { useEditorState } from '@tiptap/react';
import { ROTULOS_DAS_CAIXAS } from '../../utils/editorVisualMarkdown';
import { alternarContainer } from './extensoes';

// Barra de botões do editor visual. Rótulos e dicas em português, para quem não programa: cada botão diz o que faz, e
// só existem os formatos que o leitor mostra.

const DICAS_DAS_CAIXAS: Record<(typeof ROTULOS_DAS_CAIXAS)[number], string> = {
  Cuidado: 'Caixa de alerta para uma simplificação, controvérsia ou ambiguidade que merece atenção',
  Raciocínio: 'Caixa que mostra o caminho de raciocínio, passo a passo',
  'Não confundir': 'Caixa para pares de termos que costumam ser trocados',
  Atualização: 'Caixa para o que mudou e desde quando',
  Aprofundar: 'Caixa para leitura além do essencial',
  Essencial: 'Caixa para o que o estudante precisa dominar',
};

interface Estado {
  negrito: boolean;
  italico: boolean;
  codigo: boolean;
  expoente: boolean;
  link: boolean;
  subtitulo: boolean;
  lista: boolean;
  listaNumerada: boolean;
  citacao: boolean;
  caixaAtiva: string | null;
  podeLista: boolean;
  podeListaNumerada: boolean;
  podeCitacao: boolean;
  podeCaixa: boolean;
}

function estadoDoEditor(editor: Editor): Estado {
  const caixa = editor.getAttributes('caixa').rotulo as string | undefined;
  return {
    negrito: editor.isActive('bold'),
    italico: editor.isActive('italic'),
    codigo: editor.isActive('code'),
    expoente: editor.isActive('expoente'),
    link: editor.isActive('link'),
    subtitulo: editor.isActive('heading', { level: 4 }),
    lista: editor.isActive('bulletList'),
    listaNumerada: editor.isActive('orderedList'),
    citacao: editor.isActive('blockquote'),
    caixaAtiva: editor.isActive('caixa') ? (caixa ?? null) : null,
    podeLista: editor.can().toggleBulletList(),
    podeListaNumerada: editor.can().toggleOrderedList(),
    podeCitacao: editor.can().command(alternarContainer('blockquote')),
    podeCaixa: editor.can().command(alternarContainer('caixa', { rotulo: ROTULOS_DAS_CAIXAS[0] })) || editor.isActive('caixa'),
  };
}

interface BotaoProps {
  rotulo: string;
  dica: string;
  ativo?: boolean;
  desabilitado?: boolean;
  aoClicar: () => void;
  children?: React.ReactNode;
}

const Botao: React.FC<BotaoProps> = ({ rotulo, dica, ativo, desabilitado, aoClicar, children }) => (
  <button
    type="button"
    className="ev-botao"
    title={dica}
    aria-label={rotulo}
    aria-pressed={ativo}
    disabled={desabilitado}
    // Mantém a seleção do texto ao clicar no botão.
    onMouseDown={(e) => e.preventDefault()}
    onClick={aoClicar}
  >
    {children ?? rotulo}
  </button>
);

export const BarraDoEditor: React.FC<{ editor: Editor }> = ({ editor }) => {
  const estado = useEditorState({ editor, selector: ({ editor: e }) => estadoDoEditor(e) });
  const [painel, setPainel] = useState<'referencia' | 'link' | null>(null);
  const [numero, setNumero] = useState('');
  const [endereco, setEndereco] = useState('');
  const [erro, setErro] = useState('');
  const idNumero = useId();
  const idEndereco = useId();

  // O primeiro estado da barra é lido antes de o editor terminar de montar (botões de lista e caixa apareceriam
  // desligados até o primeiro clique): relê o estado quando ele fica pronto. Uma transação vazia não é uma edição.
  useEffect(() => {
    const reler = () => editor.view.dispatch(editor.state.tr);
    if (editor.isInitialized) reler();
    editor.on('create', reler);
    return () => {
      editor.off('create', reler);
    };
  }, [editor]);

  const abrir = (qual: 'referencia' | 'link') => {
    setErro('');
    setPainel((atual) => (atual === qual ? null : qual));
  };

  const inserirReferencia = (e: React.FormEvent) => {
    e.preventDefault();
    const n = numero.trim();
    if (!/^[1-9]\d{0,3}$/.test(n)) {
      setErro('Escreva o número da referência, como 3.');
      return;
    }
    editor
      .chain()
      .focus()
      .insertContent({ type: 'text', text: n, marks: [{ type: 'link', attrs: { href: `#ref-${n}` } }] })
      .run();
    setNumero('');
    setPainel(null);
  };

  const aplicarLink = (e: React.FormEvent) => {
    e.preventDefault();
    const alvo = endereco.trim();
    if (!/^https?:\/\/[^\s)]+$/i.test(alvo)) {
      setErro('Escreva o endereço completo, começando por https://, sem espaços.');
      return;
    }
    if (editor.state.selection.empty) {
      editor.chain().focus().insertContent({ type: 'text', text: alvo, marks: [{ type: 'link', attrs: { href: alvo } }] }).run();
    } else {
      editor.chain().focus().setMark('link', { href: alvo }).run();
    }
    setEndereco('');
    setPainel(null);
  };

  const tirarLink = () => {
    editor.chain().focus().extendMarkRange('link').unsetMark('link').run();
    setPainel(null);
  };

  return (
    <div className="ev-barra" role="toolbar" aria-label="Formatação do texto">
      <div className="ev-grupo" role="group" aria-label="Texto">
        <Botao rotulo="Negrito" dica="Deixa o trecho selecionado em negrito" ativo={estado.negrito} aoClicar={() => editor.chain().focus().toggleBold().run()}>
          <strong>N</strong>
        </Botao>
        <Botao rotulo="Itálico" dica="Deixa o trecho selecionado em itálico" ativo={estado.italico} aoClicar={() => editor.chain().focus().toggleItalic().run()}>
          <em>I</em>
        </Botao>
        <Botao
          rotulo="Sobrescrito"
          dica="Eleva o trecho, como o 2 de m²"
          ativo={estado.expoente}
          aoClicar={() => editor.chain().focus().toggleMark('expoente', { parenteses: true }).run()}
        >
          x²
        </Botao>
        <Botao rotulo="Código" dica="Mostra o trecho como nome técnico ou código" ativo={estado.codigo} aoClicar={() => editor.chain().focus().toggleMark('code').run()}>
          {'</>'}
        </Botao>
      </div>

      <div className="ev-grupo" role="group" aria-label="Blocos">
        <Botao
          rotulo="Subtítulo"
          dica="Transforma o parágrafo em um subtítulo dentro da seção"
          ativo={estado.subtitulo}
          aoClicar={() => editor.chain().focus().toggleHeading({ level: 4 }).run()}
        />
        <Botao
          rotulo="Lista"
          dica="Lista com marcadores"
          ativo={estado.lista}
          desabilitado={!estado.podeLista}
          aoClicar={() => editor.chain().focus().toggleBulletList().run()}
        />
        <Botao
          rotulo="Lista numerada"
          dica="Lista com números: 1, 2, 3"
          ativo={estado.listaNumerada}
          desabilitado={!estado.podeListaNumerada}
          aoClicar={() => editor.chain().focus().toggleOrderedList().run()}
        />
        <Botao
          rotulo="Citação em bloco"
          dica="Destaca o parágrafo com uma barra ao lado, como uma citação"
          ativo={estado.citacao}
          desabilitado={!estado.podeCitacao && !estado.citacao}
          aoClicar={() => editor.chain().focus().command(alternarContainer('blockquote')).run()}
        />
      </div>

      <div className="ev-grupo" role="group" aria-label="Caixas de destaque">
        {ROTULOS_DAS_CAIXAS.map((rotulo) => (
          <Botao
            key={rotulo}
            rotulo={rotulo}
            dica={DICAS_DAS_CAIXAS[rotulo]}
            ativo={estado.caixaAtiva === rotulo}
            desabilitado={!estado.podeCaixa}
            aoClicar={() => editor.chain().focus().command(alternarContainer('caixa', { rotulo })).run()}
          />
        ))}
      </div>

      <div className="ev-grupo" role="group" aria-label="Inserir">
        <Botao
          rotulo="Referência"
          dica="Insere o número de uma referência da bibliografia, como [3]"
          ativo={painel === 'referencia'}
          aoClicar={() => abrir('referencia')}
        />
        <Botao rotulo="Link" dica="Transforma o trecho selecionado em um link para um site" ativo={estado.link || painel === 'link'} aoClicar={() => abrir('link')} />
      </div>

      {painel === 'referencia' && (
        <form className="ev-painel" onSubmit={inserirReferencia}>
          <label htmlFor={idNumero}>Número da referência</label>
          <input id={idNumero} type="text" inputMode="numeric" value={numero} onChange={(e) => setNumero(e.target.value)} autoComplete="off" />
          <button type="submit" className="ev-botao">
            Inserir referência
          </button>
          {erro && <p role="alert">{erro}</p>}
        </form>
      )}

      {painel === 'link' && (
        <form className="ev-painel" onSubmit={aplicarLink}>
          <label htmlFor={idEndereco}>Endereço do link</label>
          <input id={idEndereco} type="text" inputMode="url" placeholder="https://" value={endereco} onChange={(e) => setEndereco(e.target.value)} autoComplete="off" />
          <button type="submit" className="ev-botao">
            Aplicar link
          </button>
          <button type="button" className="ev-botao" onClick={tirarLink}>
            Tirar link
          </button>
          {erro && <p role="alert">{erro}</p>}
        </form>
      )}
    </div>
  );
};
