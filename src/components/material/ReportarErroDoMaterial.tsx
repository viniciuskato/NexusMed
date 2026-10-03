import React, { useId, useRef, useState } from 'react';
import { CheckCircle2, Flag, X } from 'lucide-react';
import {
  LIMITE_DO_TEXTO_DO_REPORTE,
  materialErrorReportsRepository,
  mensagemDeErroDoReporte,
  reportarErroDisponivel,
} from '../../repositories/MaterialErrorReportsRepository';
import { useDialogA11y } from '../../hooks/useDialogA11y';

// "Reportar erro" no leitor (44-G): qualquer usuário ativo conta o que está errado
// num material publicado, com o trecho (opcional). O reporte vai para a Área
// Editorial ("Erros reportados"). Autor, estado e o limite de 20 por dia são do
// banco; a tela só explica. Sem o servidor, o botão nem aparece.
// 44-H2: o mesmo formulário reporta erro numa questão publicada revisada por IA.

interface ReportarErroDoMaterialProps {
  materialId: string;
  materialTitle: string;
}

type Alvo = { tipo: 'material'; materialId: string; titulo: string } | { tipo: 'questao'; questionId: string; titulo: string };

const campoClass =
  'w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100';

const Formulario: React.FC<{ alvo: Alvo; onClose: () => void }> = ({ alvo, onClose }) => {
  const ehQuestao = alvo.tipo === 'questao';
  const idBase = useId();
  const titleId = `${idBase}-titulo`;
  const descricaoRef = useRef<HTMLTextAreaElement>(null);
  const dialogRef = useDialogA11y<HTMLDivElement>({ onClose, initialFocusRef: descricaoRef });
  const [descricao, setDescricao] = useState('');
  const [trecho, setTrecho] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');
  const [enviado, setEnviado] = useState(false);

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (enviando || descricao.trim().length === 0) return;
    setEnviando(true);
    setErro('');
    try {
      await materialErrorReportsRepository.report({
        ...(alvo.tipo === 'questao' ? { questionId: alvo.questionId } : { materialId: alvo.materialId }),
        description: descricao.trim(),
        excerpt: trecho.trim() || null,
      });
      setEnviado(true);
    } catch (err) {
      setErro(mensagemDeErroDoReporte(err));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-lg bg-white dark:bg-[#0F172A] rounded-2xl border border-slate-200 dark:border-[#243452] elev-2xl overflow-hidden flex flex-col max-h-[90vh]"
      >
        <div className="p-4 flex items-start justify-between gap-3 border-b border-slate-200 dark:border-[#243452]">
          <div className="min-w-0">
            <h3 id={titleId} className="text-base font-bold text-slate-900 dark:text-slate-100">
              {ehQuestao ? 'Reportar erro nesta questão' : 'Reportar erro neste material'}
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-400 break-words">{alvo.titulo}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="w-11 h-11 -mt-1 -mr-1 shrink-0 flex items-center justify-center rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 cursor-pointer"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        {enviado ? (
          <div className="p-5 space-y-4" data-testid="reporte-enviado">
            <p className="flex items-start gap-2 text-sm text-slate-800 dark:text-slate-200">
              <CheckCircle2 className="w-5 h-5 text-teal-600 dark:text-teal-400 shrink-0" aria-hidden="true" />
              <span>
                Obrigado! Recebemos o seu reporte. A equipe editorial vai conferir {ehQuestao ? 'a questão' : 'o material'}.
              </span>
            </p>
            <button
              type="button"
              onClick={onClose}
              className="min-h-11 px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold cursor-pointer"
            >
              Fechar
            </button>
          </div>
        ) : (
          <form onSubmit={enviar} className="p-4 space-y-4 overflow-y-auto">
            <div>
              <label htmlFor={`${idBase}-descricao`} className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                O que está errado? <span className="font-normal">(obrigatório)</span>
              </label>
              <textarea
                id={`${idBase}-descricao`}
                ref={descricaoRef}
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                maxLength={LIMITE_DO_TEXTO_DO_REPORTE}
                rows={4}
                required
                aria-describedby={`${idBase}-contagem`}
                className={campoClass}
              />
              <p id={`${idBase}-contagem`} className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                {descricao.length} de {LIMITE_DO_TEXTO_DO_REPORTE} caracteres
              </p>
            </div>
            <div>
              <label htmlFor={`${idBase}-trecho`} className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                {ehQuestao ? 'Trecho da questão' : 'Trecho do material'}{' '}
                <span className="font-normal">(opcional — copie e cole a frase)</span>
              </label>
              <textarea
                id={`${idBase}-trecho`}
                value={trecho}
                onChange={(e) => setTrecho(e.target.value)}
                maxLength={LIMITE_DO_TEXTO_DO_REPORTE}
                rows={2}
                className={campoClass}
              />
            </div>
            {erro && (
              <p role="alert" className="text-xs text-rose-800 dark:text-rose-300 leading-relaxed">
                {erro}
              </p>
            )}
            <div className="flex flex-wrap gap-2 justify-end">
              <button
                type="button"
                onClick={onClose}
                className="min-h-11 px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-semibold text-slate-800 dark:text-slate-200 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={enviando || descricao.trim().length === 0}
                className="min-h-11 px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 disabled:bg-slate-300 dark:disabled:bg-slate-700 text-white text-sm font-semibold cursor-pointer disabled:cursor-not-allowed"
              >
                {enviando ? 'Enviando…' : 'Enviar reporte'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export const ReportarErroDoMaterial: React.FC<ReportarErroDoMaterialProps> = ({ materialId, materialTitle }) => {
  const [aberto, setAberto] = useState(false);
  if (!reportarErroDisponivel) return null;
  return (
    <>
      <button
        type="button"
        id="btn-reportar-erro-do-material"
        onClick={() => setAberto(true)}
        className="min-h-11 sm:min-h-9 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1.5 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800"
      >
        <Flag className="w-3.5 h-3.5" aria-hidden="true" />
        <span>Reportar erro</span>
      </button>
      {aberto && (
        <Formulario alvo={{ tipo: 'material', materialId, titulo: materialTitle }} onClose={() => setAberto(false)} />
      )}
    </>
  );
};

/** 44-H2: o mesmo "Reportar erro", na questão publicada. Sem `id` fixo: há muitos cartões na tela. */
export const ReportarErroDaQuestao: React.FC<{ questionId: string; enunciado: string }> = ({ questionId, enunciado }) => {
  const [aberto, setAberto] = useState(false);
  if (!reportarErroDisponivel) return null;
  const resumo = enunciado.replace(/\s+/g, ' ').trim();
  return (
    <>
      <button
        type="button"
        data-testid="btn-reportar-erro-da-questao"
        onClick={() => setAberto(true)}
        className="min-h-11 sm:min-h-9 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1.5 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800"
      >
        <Flag className="w-3.5 h-3.5" aria-hidden="true" />
        <span>Reportar erro</span>
      </button>
      {aberto && (
        <Formulario
          alvo={{ tipo: 'questao', questionId, titulo: resumo.length > 160 ? `${resumo.slice(0, 160)}…` : resumo }}
          onClose={() => setAberto(false)}
        />
      )}
    </>
  );
};
