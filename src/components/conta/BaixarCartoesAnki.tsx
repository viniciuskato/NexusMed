import React, { useState } from 'react';
import { Download } from 'lucide-react';
import { flashcardsRepository } from '../../repositories/FlashcardsRepository';
import { montarArquivoAnki } from '../../utils/exportarCartoesAnki';
import { baixarArquivoDeTexto } from '../../utils/exportarMaterial';

// CORTE-1 (D-14): "Baixar meus cartões para o Anki", no menu da conta. Lê os cartões do servidor (como o resto do
// app), monta o arquivo de importação do Anki e o baixa. Sem cartões, só avisa: não baixa um arquivo vazio.

type Estado =
  | { tipo: 'ocioso' }
  | { tipo: 'baixando' }
  | { tipo: 'vazio' }
  | { tipo: 'pronto'; total: number }
  | { tipo: 'erro' };

const MENSAGEM: Record<Exclude<Estado['tipo'], 'ocioso' | 'baixando' | 'pronto'>, string> = {
  vazio: 'Você não tem cartões.',
  erro: 'Não foi possível carregar seus cartões. Tente de novo.',
};

export const BaixarCartoesAnki: React.FC = () => {
  const [estado, setEstado] = useState<Estado>({ tipo: 'ocioso' });

  const baixar = async () => {
    if (estado.tipo === 'baixando') return;
    setEstado({ tipo: 'baixando' });
    try {
      const cards = await flashcardsRepository.getFlashcards();
      const arquivo = montarArquivoAnki(cards);
      if (arquivo.total === 0) {
        setEstado({ tipo: 'vazio' });
        return;
      }
      baixarArquivoDeTexto(arquivo.nomeDoArquivo, arquivo.texto, 'text/plain;charset=utf-8');
      setEstado({ tipo: 'pronto', total: arquivo.total });
    } catch {
      setEstado({ tipo: 'erro' });
    }
  };

  const aviso =
    estado.tipo === 'vazio' || estado.tipo === 'erro'
      ? MENSAGEM[estado.tipo]
      : estado.tipo === 'pronto'
      ? `${estado.total === 1 ? '1 cartão' : `${estado.total} cartões`} no arquivo. No Anki: Arquivo, Importar.`
      : '';

  return (
    <>
      <button
        type="button"
        role="menuitem"
        id="btn-baixar-cartoes-anki"
        disabled={estado.tipo === 'baixando'}
        onClick={() => void baixar()}
        className="w-full text-left px-4 py-2 text-xs text-[#172033] dark:text-[#E5E7EB] hover:bg-slate-100 dark:hover:bg-[#182235] flex items-center gap-2 cursor-pointer disabled:opacity-60 disabled:cursor-wait"
      >
        <Download className="w-3.5 h-3.5 text-teal-700 dark:text-teal-400" />
        <span>Baixar meus cartões para o Anki</span>
      </button>
      <p role="status" className="px-4 pb-1 text-[11px] text-[#64748B] dark:text-[#94A3B8] empty:hidden">
        {aviso}
      </p>
    </>
  );
};
