// Tipos públicos do editor visual de seção (ED-1). Só tipos: este arquivo não importa a biblioteca do editor em
// tempo de execução, para quem usa o editor (pelo `EditorVisualCarregavel`) não puxar a biblioteca para o pacote inicial.

import type { Editor } from '@tiptap/core';
import type { ModoDoTexto } from '../../utils/editorVisualMarkdown';

export interface InformacoesDaEdicao {
  /**
   * O texto devolvido, lido pelo leitor, dá a mesma formatação que o editor mostra? Falso quando a formatação aplicada
   * não existe em Markdown do leitor (ex.: negrito e itálico no mesmo trecho inteiro) ou quando um símbolo digitado
   * seria lido como formatação. Quem salva trata falso como "não salvar".
   */
  fiel: boolean;
}

export interface EditorVisualDeSecaoProps {
  /** O Markdown da seção, como está guardado. O editor o abre uma vez (para outro texto, troque a `key`). */
  texto: string;
  /** Chamado a cada edição com o Markdown de hoje (nunca HTML) e a informação de fidelidade. */
  onChange: (texto: string, info: InformacoesDaEdicao) => void;
  /** Chamado uma vez quando o texto não é seguro para o editor visual: nada é aberto e o texto não é tocado. */
  onNaoSeguro?: (motivo: string) => void;
  /**
   * `secao` (padrão): o texto inteiro de uma seção, com todos os blocos. `linha`: campo curto de uma linha só (Pontos-chave,
   * Pérola, Alerta), com negrito, itálico, código, link e referência, e sem blocos nem quebra de linha.
   */
  modo?: ModoDoTexto;
  /** Nome do campo para leitores de tela. */
  rotulo?: string;
  somenteLeitura?: boolean;
  /** Entrega o editor ao chamador (testes e atalhos de tela). */
  aoCriar?: (editor: Editor) => void;
}
