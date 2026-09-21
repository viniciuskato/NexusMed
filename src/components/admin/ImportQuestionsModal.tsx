import React, { useRef, useState } from 'react';
import { useDialogA11y } from '../../hooks/useDialogA11y';
import { FileUp, X, CheckCircle2, AlertTriangle, Upload } from 'lucide-react';
import { Discipline, Theme } from '../../types';
import { questionsRepository } from '../../repositories/QuestionsRepository';
import { getErrorMessage } from '../../utils/errorMessage';
import {
  parseQuestionsMarkdownText,
  buildQuestionFromImportRow,
  QuestionImportPreview,
} from '../../utils/questionsImport';

// ============================================================================
// "Importar questões" — equivalente de ImportMaterialModal para o banco de
// questões comentadas (antes desta missão não existia NENHUM import de
// arquivo aqui, só o formulário "Nova Questão", ver
// docs/editorial/PADRAO-NEXUSMED-QUESTOES.md). Diferença estrutural: um
// arquivo de conteúdo é UMA entidade com pré-visualização única; um arquivo
// de questões é um LOTE de entidades independentes, então a pré-visualização
// aqui é uma LISTA — cada linha resolve disciplina/tema e é confirmada (ou
// reportada como falha) por conta própria, nunca tudo-ou-nada por arquivo.
// ============================================================================

interface ImportQuestionsModalProps {
  disciplines: Discipline[];
  themes: Theme[];
  onClose: () => void;
  onImported: () => void;
}

interface RowState {
  preview: QuestionImportPreview;
  overrideDisciplineId: string | null;
  overrideThemeId: string | null;
}

type WizardState =
  | { step: 'pick' }
  | { step: 'error'; fileName: string; errors: string[] }
  | { step: 'preview'; fileName: string; rows: RowState[] }
  | { step: 'saving' }
  | { step: 'done'; successCount: number; attempted: number; failures: string[] };

function isRowReady(row: RowState): boolean {
  return row.preview.blockingErrors.length === 0 && !!row.overrideDisciplineId && !!row.overrideThemeId;
}

export const ImportQuestionsModal: React.FC<ImportQuestionsModalProps> = ({
  disciplines,
  themes,
  onClose,
  onImported,
}) => {
  const [state, setState] = useState<WizardState>({ step: 'pick' });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useDialogA11y<HTMLDivElement>({ onClose });

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    const text = await file.text();
    const result = parseQuestionsMarkdownText(text, disciplines, themes);

    if (result.ok === false) {
      setState({ step: 'error', fileName: file.name, errors: result.errors });
      return;
    }

    setState({
      step: 'preview',
      fileName: file.name,
      rows: result.rows.map((preview) => ({
        preview,
        overrideDisciplineId: preview.disciplineId,
        overrideThemeId: preview.themeId,
      })),
    });
  };

  const updateRow = (index: number, patch: Partial<RowState>) => {
    if (state.step !== 'preview') return;
    const rows = state.rows.map((r, i) => (i === index ? { ...r, ...patch } : r));
    setState({ ...state, rows });
  };

  const readyCount = state.step === 'preview' ? state.rows.filter(isRowReady).length : 0;

  const handleConfirm = async () => {
    if (state.step !== 'preview') return;
    const rows = state.rows;
    setState({ step: 'saving' });

    let successCount = 0;
    const failures: string[] = [];
    for (const row of rows) {
      if (!isRowReady(row)) continue;
      try {
        const question = buildQuestionFromImportRow(row.preview, row.overrideDisciplineId, row.overrideThemeId);
        await questionsRepository.importQuestionDraft(question);
        successCount++;
      } catch (err) {
        failures.push(`Questão ${row.preview.index}: ${getErrorMessage(err)}`);
      }
    }

    if (successCount > 0) onImported();
    setState({ step: 'done', successCount, attempted: readyCount, failures });
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start sm:items-center justify-center p-3 sm:p-4 overflow-y-auto bg-slate-900/60 backdrop-blur-xs animate-in fade-in"
      aria-hidden="false"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-labelledby="import-questions-title"
        aria-modal="true"
        data-testid="import-questions-modal"
        className="w-full max-w-3xl my-4 sm:my-8 bg-white dark:bg-[#0F172A] rounded-2xl border-2 border-teal-500/50 dark:border-teal-500/60 p-6 sm:p-8 elev-md space-y-6 text-xs animate-in fade-in"
      >
        <div className="flex items-center justify-between border-b border-stone-200 dark:border-[#243452] pb-3">
          <div className="flex items-center gap-2">
            <FileUp className="w-4 h-4 text-teal-600 dark:text-teal-400" />
            <h3 id="import-questions-title" className="font-serif-reading text-lg font-bold text-stone-900 dark:text-slate-100">
              Importar questões
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-stone-400 hover:text-stone-700 dark:hover:text-slate-200 hover:bg-stone-100 dark:hover:bg-[#142038] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {state.step === 'pick' && (
          <div className="space-y-4">
            <p className="text-stone-600 dark:text-slate-400">
              Selecione um arquivo <code>.md</code> com um lote de questões — cada questão começa com um
              heading <code>## Questão N</code>. O sistema vai conferir cada uma e mostrar uma
              pré-visualização antes de criar qualquer coisa — nada é gravado até você confirmar. Cada
              questão criada nasce em <strong>rascunho</strong>: revisão/atestação e publicação continuam
              sendo etapas manuais e separadas, por questão.
            </p>
            <label
              htmlFor="import-questions-file-input"
              className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-stone-300 dark:border-[#243452] rounded-xl py-10 cursor-pointer hover:border-teal-500 hover:bg-teal-50/40 dark:hover:bg-teal-950/20 transition-colors"
            >
              <Upload className="w-6 h-6 text-teal-600 dark:text-teal-400" />
              <span className="font-bold text-stone-700 dark:text-slate-300">Selecionar arquivo</span>
              <span className="text-stone-400">.md ou .markdown</span>
            </label>
            <input
              id="import-questions-file-input"
              ref={fileInputRef}
              type="file"
              accept=".md,.markdown"
              onChange={handleFileChange}
              className="hidden"
            />
          </div>
        )}

        {state.step === 'error' && (
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-4 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900">
              <AlertTriangle className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
              <div className="space-y-2">
                <p className="font-bold text-rose-700 dark:text-rose-300">
                  Não foi possível importar "{state.fileName}".
                </p>
                <ul className="list-disc list-inside text-rose-700 dark:text-rose-300 space-y-1">
                  {state.errors.map((err, i) => (
                    <li key={i}>{err}</li>
                  ))}
                </ul>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setState({ step: 'pick' })}
                className="px-4 py-2 rounded-lg bg-teal-700 hover:bg-teal-800 text-white dark:bg-teal-600 dark:hover:bg-teal-500 text-xs font-bold transition-all cursor-pointer"
              >
                Escolher outro arquivo
              </button>
            </div>
          </div>
        )}

        {state.step === 'preview' && (
          <div className="space-y-4">
            <div className="p-3 rounded-lg bg-sky-50 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-900 text-sky-800 dark:text-sky-300">
              {state.rows.length} questão(ões) encontrada(s) em "{state.fileName}". Cada uma vira um{' '}
              <strong>rascunho</strong> independente — revise disciplina/tema onde marcado antes de
              confirmar.
            </div>

            <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-1">
              {state.rows.map((row, i) => {
                const { preview } = row;
                const blocked = preview.blockingErrors.length > 0;
                const availableThemes = themes.filter((t) => t.disciplineId === row.overrideDisciplineId);
                return (
                  <div
                    key={i}
                    data-testid={`import-questions-row-${preview.index}`}
                    className={`p-3.5 rounded-xl border space-y-2.5 ${
                      blocked
                        ? 'border-rose-300 dark:border-rose-900 bg-rose-50/60 dark:bg-rose-950/20'
                        : 'border-stone-200 dark:border-[#243452] bg-stone-50/60 dark:bg-[#0B1220]/60'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-bold text-stone-800 dark:text-slate-200">
                        Questão {preview.index}
                        <span className="font-normal text-stone-500 dark:text-slate-400">
                          {' '}
                          — {preview.questionStem ? preview.questionStem.slice(0, 90) : '(sem comando)'}
                          {preview.questionStem.length > 90 ? '…' : ''}
                        </span>
                      </p>
                      {blocked ? (
                        <span className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
                          Bloqueada
                        </span>
                      ) : isRowReady(row) ? (
                        <span className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                          Pronta
                        </span>
                      ) : (
                        <span className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                          Falta disciplina/tema
                        </span>
                      )}
                    </div>

                    {!blocked && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div>
                          <span className="font-semibold text-stone-600 dark:text-slate-400 block mb-0.5">
                            Disciplina
                          </span>
                          {row.overrideDisciplineId ? (
                            <p className="text-stone-900 dark:text-slate-100">
                              {disciplines.find((d) => d.id === row.overrideDisciplineId)?.name ?? preview.disciplineName}
                            </p>
                          ) : (
                            <select
                              value=""
                              onChange={(e) => updateRow(i, { overrideDisciplineId: e.target.value, overrideThemeId: null })}
                              className="w-full p-1.5 rounded-lg border border-rose-300 dark:border-rose-800 bg-white dark:bg-rose-950/30 text-stone-900 dark:text-slate-100 text-[11px]"
                            >
                              <option value="" disabled>
                                {preview.disciplineName ? `"${preview.disciplineName}" não encontrada` : 'selecione'}
                              </option>
                              {disciplines.map((d) => (
                                <option key={d.id} value={d.id}>
                                  {d.name}
                                </option>
                              ))}
                            </select>
                          )}
                        </div>
                        <div>
                          <span className="font-semibold text-stone-600 dark:text-slate-400 block mb-0.5">Tema</span>
                          {row.overrideThemeId ? (
                            <p className="text-stone-900 dark:text-slate-100">
                              {themes.find((t) => t.id === row.overrideThemeId)?.name ?? preview.themeName}
                            </p>
                          ) : (
                            <select
                              value=""
                              onChange={(e) => updateRow(i, { overrideThemeId: e.target.value })}
                              disabled={!row.overrideDisciplineId}
                              className="w-full p-1.5 rounded-lg border border-rose-300 dark:border-rose-800 bg-white dark:bg-rose-950/30 text-stone-900 dark:text-slate-100 text-[11px] disabled:opacity-50"
                            >
                              <option value="" disabled>
                                {preview.themeName ? `"${preview.themeName}" não encontrado` : 'selecione'}
                              </option>
                              {availableThemes.map((t) => (
                                <option key={t.id} value={t.id}>
                                  {t.name}
                                </option>
                              ))}
                            </select>
                          )}
                        </div>
                      </div>
                    )}

                    {preview.blockingErrors.length > 0 && (
                      <ul className="list-disc list-inside text-rose-700 dark:text-rose-300 space-y-0.5">
                        {preview.blockingErrors.map((e, ei) => (
                          <li key={ei}>{e}</li>
                        ))}
                      </ul>
                    )}

                    {preview.missingFields.length > 0 && (
                      <details className="text-amber-700 dark:text-amber-400">
                        <summary className="cursor-pointer font-semibold">
                          {preview.missingFields.length} campo(s) ausente(s) ou usando padrão
                        </summary>
                        <ul className="list-disc list-inside mt-1 space-y-0.5">
                          {preview.missingFields.map((f, fi) => (
                            <li key={fi}>{f}</li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-stone-200 dark:border-[#243452]">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-lg border border-stone-200 dark:border-[#243452] text-stone-600 dark:text-slate-300 hover:bg-stone-100 dark:hover:bg-[#142038] text-xs font-bold transition-all cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={readyCount === 0}
                className="px-4 py-2 rounded-lg bg-teal-700 hover:bg-teal-800 text-white dark:bg-teal-600 dark:hover:bg-teal-500 text-xs font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                Importar {readyCount} rascunho(s)
              </button>
            </div>
          </div>
        )}

        {state.step === 'saving' && <p className="text-stone-600 dark:text-slate-400">Importando questões...</p>}

        {state.step === 'done' && (
          <div className="space-y-4">
            <div
              className={`flex items-start gap-3 p-4 rounded-xl border ${
                state.failures.length === 0
                  ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900'
                  : 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900'
              }`}
            >
              {state.failures.length === 0 ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              )}
              <div className="space-y-2">
                <p
                  className={
                    state.failures.length === 0
                      ? 'text-emerald-800 dark:text-emerald-300'
                      : 'text-amber-800 dark:text-amber-300'
                  }
                >
                  {state.successCount} de {state.attempted} rascunho(s) criado(s) com sucesso. Cada um está
                  pendente de revisão — a publicação continua sendo uma ação manual separada, por questão.
                </p>
                {state.failures.length > 0 && (
                  <ul className="list-disc list-inside text-amber-800 dark:text-amber-300 space-y-0.5">
                    {state.failures.map((f, i) => (
                      <li key={i}>{f}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-lg bg-teal-700 hover:bg-teal-800 text-white dark:bg-teal-600 dark:hover:bg-teal-500 text-xs font-bold transition-all cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ImportQuestionsModal;
