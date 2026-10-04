import React, { useState } from 'react';
import { parecerEmPalavras, podePublicarEnvio, type ResultadoDaAcao } from '../../utils/publicarEnvioPeloAdmin';

// P8 — "Publicar" / "Aplicar atualização" no envio, para o admin (o dono). Funciona com qualquer parecer do revisor
// (ele só aconselha): o parecer aparece ao lado do botão e, quando NÃO é "apto", o botão pede confirmação antes de
// publicar. Sem o parecer "apto", o conteúdo vai ao ar sem o selo "Revisado por IA" (o banco decide o selo).

interface PublicarEnvioDoAdminProps {
  titulo: string;
  status: string;
  /** O veredito do revisor para o texto atual do envio, se houve. */
  veredito: 'apto' | 'nao_apto' | 'erro' | null | undefined;
  tipo: 'material' | 'questoes' | 'atualizacao';
  /** Faz a publicação (ou a aplicação) e devolve o resultado em palavras leigas. */
  onPublicar: () => Promise<ResultadoDaAcao>;
}

const TEXTOS_DO_TIPO = {
  material: { botao: 'Publicar', objeto: 'material', noAr: 'O material vai ao ar para os estudantes' },
  questoes: { botao: 'Publicar', objeto: 'lote de questões', noAr: 'As questões vão ao ar para os estudantes' },
  atualizacao: { botao: 'Aplicar atualização', objeto: 'atualização', noAr: 'O conteúdo que está no ar é trocado pelo desta atualização' },
} as const;

export const PublicarEnvioDoAdmin: React.FC<PublicarEnvioDoAdminProps> = ({ titulo, status, veredito, tipo, onPublicar }) => {
  const [confirmando, setConfirmando] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [resultado, setResultado] = useState<ResultadoDaAcao | null>(null);
  const textos = TEXTOS_DO_TIPO[tipo];
  const parecer = parecerEmPalavras(veredito, status);

  const executar = async () => {
    setConfirmando(false);
    setOcupado(true);
    setResultado(null);
    try {
      setResultado(await onPublicar());
    } finally {
      setOcupado(false);
    }
  };

  const clicou = () => {
    if (ocupado) return;
    if (veredito === 'apto') void executar();
    else setConfirmando(true);
  };

  const podePublicar = podePublicarEnvio(status);
  if (!podePublicar && !resultado) {
    if (status !== 'em_revisao') return null;
    return (
      <p data-testid="publicar-indisponivel" className="text-xs text-slate-500 dark:text-slate-400">
        O revisor está lendo este envio agora. Quando o parecer chegar, você poderá publicá-lo.
      </p>
    );
  }

  return (
    <div className="pt-1 space-y-2" data-testid="publicar-envio-do-admin">
      {podePublicar && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <button
            type="button"
            data-testid="publicar-envio"
            disabled={ocupado || confirmando}
            onClick={clicou}
            aria-label={`${textos.botao}: ${titulo}`}
            className="min-h-11 px-3 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 disabled:bg-slate-300 disabled:dark:bg-slate-700 disabled:text-slate-500 disabled:cursor-not-allowed text-white text-xs font-semibold cursor-pointer"
          >
            {ocupado ? 'Publicando…' : textos.botao}
          </button>
          <span data-testid="parecer-do-revisor" data-parecer={veredito ?? 'sem_parecer'} className="text-xs text-slate-700 dark:text-slate-300">
            Parecer do revisor: <strong>{parecer}</strong>
          </span>
        </div>
      )}
      {confirmando && (
        <div
          role="group"
          aria-label="Confirmar publicação sem parecer favorável"
          data-testid="confirmar-publicacao"
          className="p-3 rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/40 dark:border-amber-700 space-y-2"
        >
          <p className="text-xs text-amber-900 dark:text-amber-200 leading-relaxed">
            O parecer do revisor é: {parecer}. {textos.noAr}
            {tipo === 'atualizacao' ? ' e perde o selo “Revisado por IA”' : ' sem o selo “Revisado por IA”'}. O revisor só aconselha: quem decide é você.
            Publicar este {textos.objeto} mesmo assim?
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              data-testid="confirmar-publicar"
              onClick={() => void executar()}
              className="min-h-11 px-3 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold cursor-pointer"
            >
              Publicar mesmo assim
            </button>
            <button
              type="button"
              data-testid="cancelar-publicar"
              onClick={() => setConfirmando(false)}
              className="min-h-11 px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-800 dark:text-slate-200 cursor-pointer"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
      {resultado && (
        <p
          role={resultado.ok ? 'status' : 'alert'}
          data-testid="resultado-da-publicacao"
          data-ok={resultado.ok ? 'sim' : 'nao'}
          className={
            resultado.ok
              ? 'text-xs text-emerald-800 dark:text-emerald-300 leading-relaxed'
              : 'text-xs text-rose-800 dark:text-rose-300 leading-relaxed'
          }
        >
          {resultado.texto}
        </p>
      )}
    </div>
  );
};
