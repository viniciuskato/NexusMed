import React from 'react';
import { Download } from 'lucide-react';
import { flashcardsRepository } from '../../repositories/FlashcardsRepository';
import { montarArquivoAnki } from '../../utils/exportarCartoesAnki';
import { baixarArquivoDeTexto } from '../../utils/exportarMaterial';

// CORTE-1 (D-14): "Baixar meus cartões para o Anki", no menu da conta. Lê os cartões do servidor (como o resto do
// app), monta o arquivo de importação do Anki e o baixa. Sem cartões, só avisa: não baixa um arquivo vazio.
//
// O menu fecha ao clicar; o aviso não mora nele: quem usa este item recebe o texto em `onAviso` e o mostra fora do
// menu (o Header), onde continua visível depois que o menu fecha.

interface BaixarCartoesAnkiProps {
  /** Fecha o menu da conta. */
  onFechar: () => void;
  /** Resultado para o usuário: "Você não tem cartões.", "N cartões no arquivo…" ou o erro. */
  onAviso: (mensagem: string) => void;
}

export const BaixarCartoesAnki: React.FC<BaixarCartoesAnkiProps> = ({ onFechar, onAviso }) => {
  const baixar = async () => {
    onFechar();
    try {
      const cards = await flashcardsRepository.getFlashcards();
      const arquivo = montarArquivoAnki(cards);
      if (arquivo.total === 0) {
        onAviso('Você não tem cartões.');
        return;
      }
      baixarArquivoDeTexto(arquivo.nomeDoArquivo, arquivo.texto, 'text/plain;charset=utf-8');
      onAviso(`${arquivo.total === 1 ? '1 cartão' : `${arquivo.total} cartões`} no arquivo. No Anki: Arquivo, Importar.`);
    } catch {
      onAviso('Não foi possível carregar seus cartões. Tente de novo.');
    }
  };

  return (
    <button
      type="button"
      role="menuitem"
      id="btn-baixar-cartoes-anki"
      onClick={() => void baixar()}
      className="w-full text-left px-4 py-2 text-xs text-[#172033] dark:text-[#E5E7EB] hover:bg-slate-100 dark:hover:bg-[#182235] flex items-center gap-2 cursor-pointer"
    >
      <Download className="w-3.5 h-3.5 text-teal-700 dark:text-teal-400" />
      <span>Baixar meus cartões para o Anki</span>
    </button>
  );
};
