import React, { useRef, useState } from 'react';
import { useDialogA11y } from '../../hooks/useDialogA11y';
import { FileUp, X, CheckCircle2, AlertTriangle, Upload } from 'lucide-react';
import { Compendium, Discipline, Theme } from '../../types';
import { materialsRepository } from '../../repositories/MaterialsRepository';
import { getErrorMessage } from '../../utils/errorMessage';
import {
  parseCompendiumYamlText,
  buildCompendiumFromImport,
  CompendiumImportPreview,
  CompendiumImportSection,
} from '../../utils/compendiumImport';

// ============================================================================
// Missão 42-A — "Importar material": ponte entre o arquivo .compendium.yaml
// (produzido com IA, formato de autoria) e um rascunho real no CMS, utilizável
// por quem não programa. Nenhuma etapa exige terminal, UUID ou conhecimento
// de YAML — só escolher o arquivo, conferir a pré-visualização e confirmar.
// ============================================================================

interface ImportMaterialModalProps {
  disciplines: Discipline[];
  themes: Theme[];
  compendiums: Compendium[];
  onClose: () => void;
  onImported: () => void;
}

type WizardState =
  | { step: 'pick' }
  | { step: 'error'; fileName: string; errors: string[]; technicalDetail?: string }
  | {
      step: 'preview';
      fileName: string;
      preview: CompendiumImportPreview;
      sections: CompendiumImportSection[];
      references: string[];
      tags: string[];
      overrideDisciplineId: string | null;
      overrideThemeId: string | null;
    }
  | { step: 'saving' }
  | { step: 'success'; title: string }
  | { step: 'save-error'; technicalDetail: string };

export const ImportMaterialModal: React.FC<ImportMaterialModalProps> = ({
  disciplines,
  themes,
  compendiums,
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
    const result = parseCompendiumYamlText(text, disciplines, themes, compendiums);

    if (result.ok === false) {
      setState({ step: 'error', fileName: file.name, errors: result.errors, technicalDetail: result.technicalDetail });
      return;
    }

    setState({
      step: 'preview',
      fileName: file.name,
      preview: result.preview,
      sections: result.sections,
      references: result.references,
      tags: result.tags,
      overrideDisciplineId: result.preview.disciplineId,
      overrideThemeId: result.preview.themeId,
    });
  };

  const handleConfirm = async () => {
    if (state.step !== 'preview') return;
    const disciplineId = state.overrideDisciplineId;
    const themeId = state.overrideThemeId;
    if (!disciplineId || !themeId) return;
    if (state.preview.isDuplicate) return;

    setState({ step: 'saving' });
    try {
      const compendium = buildCompendiumFromImport(
        state.preview,
        state.sections,
        state.references,
        state.tags,
        disciplineId,
        themeId
      );
      await materialsRepository.importCompendiumDraft(compendium);
      onImported();
      setState({ step: 'success', title: state.preview.title });
    } catch (err) {
      console.error('[ImportMaterialModal] falha ao salvar rascunho importado:', err);
      setState({ step: 'save-error', technicalDetail: getErrorMessage(err) });
    }
  };

  const availableThemesForOverride =
    state.step === 'preview'
      ? themes.filter((t) => !state.overrideDisciplineId || t.disciplineId === state.overrideDisciplineId)
      : [];

  return (
    // AS1-B3.2: o modal precisa da mesma camada de sobreposição usada pelos
    // demais diálogos do app (ver FeedbackModal.tsx) — sem um wrapper `fixed
    // inset-0` com z-index próprio, ele renderizava no fluxo normal da
    // página e ficava atrás de controles flutuantes fixos (dock de
    // navegação inferior, z-40), que passavam a encobrir parte do conteúdo
    // (quadro de campos ausentes) durante a pré-visualização de importação.
    <div
      className="fixed inset-0 z-[60] flex items-start sm:items-center justify-center p-3 sm:p-4 overflow-y-auto bg-slate-900/60 backdrop-blur-xs animate-in fade-in"
      aria-hidden="false"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-labelledby="import-material-title"
        aria-modal="true"
        data-testid="import-material-modal"
        className="w-full max-w-2xl my-4 sm:my-8 bg-white dark:bg-[#0F172A] rounded-2xl border-2 border-teal-500/50 dark:border-teal-500/60 p-6 sm:p-8 elev-md space-y-6 text-xs animate-in fade-in"
      >
      <div className="flex items-center justify-between border-b border-stone-200 dark:border-[#243452] pb-3">
        <div className="flex items-center gap-2">
          <FileUp className="w-4 h-4 text-teal-600 dark:text-teal-400" />
          <h3 id="import-material-title" className="font-serif-reading text-lg font-bold text-stone-900 dark:text-slate-100">
            Importar material
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
            Selecione o arquivo do compêndio (formato <code>.yaml</code>). O sistema vai conferir o
            conteúdo e mostrar uma pré-visualização antes de criar qualquer coisa — nada é gravado
            até você confirmar.
          </p>
          <label
            htmlFor="import-material-file-input"
            className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-stone-300 dark:border-[#243452] rounded-xl py-10 cursor-pointer hover:border-teal-500 hover:bg-teal-50/40 dark:hover:bg-teal-950/20 transition-colors"
          >
            <Upload className="w-6 h-6 text-teal-600 dark:text-teal-400" />
            <span className="font-bold text-stone-700 dark:text-slate-300">Selecionar arquivo</span>
            <span className="text-stone-400">.yaml ou .yml</span>
          </label>
          <input
            id="import-material-file-input"
            ref={fileInputRef}
            type="file"
            accept=".yaml,.yml"
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
              {state.technicalDetail && (
                <details className="text-stone-500 dark:text-slate-500">
                  <summary className="cursor-pointer">Detalhes técnicos</summary>
                  <p className="mt-1 font-mono text-[10px] break-all">{state.technicalDetail}</p>
                </details>
              )}
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
        <div className="space-y-5">
          <div className="p-3 rounded-lg bg-sky-50 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-900 text-sky-800 dark:text-sky-300">
            Isto vai criar apenas um <strong>rascunho</strong>. Ele fica pendente de revisão — a
            publicação para os estudantes continua sendo uma etapa manual e separada.
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <span className="font-bold text-stone-700 dark:text-slate-300 block mb-1">Título</span>
              <p className="text-stone-900 dark:text-slate-100">{state.preview.title}</p>
            </div>
            <div>
              <span className="font-bold text-stone-700 dark:text-slate-300 block mb-1">Subtítulo</span>
              <p className="text-stone-900 dark:text-slate-100">{state.preview.subtitle || '—'}</p>
            </div>
            <div>
              <span className="font-bold text-stone-700 dark:text-slate-300 block mb-1">Disciplina</span>
              {state.overrideDisciplineId ? (
                <p className="text-stone-900 dark:text-slate-100">
                  {disciplines.find((d) => d.id === state.overrideDisciplineId)?.name ?? state.preview.disciplineName}
                </p>
              ) : (
                <select
                  value=""
                  onChange={(e) =>
                    setState({ ...state, overrideDisciplineId: e.target.value, overrideThemeId: null })
                  }
                  className="w-full p-2 rounded-lg border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/30 text-stone-900 dark:text-slate-100 text-xs"
                >
                  <option value="" disabled>
                    "{state.preview.disciplineName}" não encontrada — selecione uma
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
              <span className="font-bold text-stone-700 dark:text-slate-300 block mb-1">Tema</span>
              {state.overrideThemeId ? (
                <p className="text-stone-900 dark:text-slate-100">
                  {themes.find((t) => t.id === state.overrideThemeId)?.name ?? state.preview.themeName}
                </p>
              ) : (
                <select
                  value=""
                  onChange={(e) => setState({ ...state, overrideThemeId: e.target.value })}
                  disabled={!state.overrideDisciplineId}
                  className="w-full p-2 rounded-lg border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/30 text-stone-900 dark:text-slate-100 text-xs disabled:opacity-50"
                >
                  <option value="" disabled>
                    "{state.preview.themeName}" não encontrado — selecione um
                  </option>
                  {availableThemesForOverride.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <div>
              <span className="font-bold text-stone-700 dark:text-slate-300 block mb-1">Seções</span>
              <p data-testid="import-preview-sections-count" className="text-stone-900 dark:text-slate-100">
                {state.preview.sectionsCount}
              </p>
            </div>
            <div>
              <span className="font-bold text-stone-700 dark:text-slate-300 block mb-1">Referências</span>
              <p data-testid="import-preview-references-count" className="text-stone-900 dark:text-slate-100">
                {state.preview.referencesCount}
              </p>
            </div>
            <div className="sm:col-span-2">
              <span className="font-bold text-stone-700 dark:text-slate-300 block mb-1">Tags</span>
              <p className="text-stone-900 dark:text-slate-100">
                {state.preview.tags.length > 0 ? state.preview.tags.join(', ') : '—'}
              </p>
            </div>
          </div>

          {state.preview.missingFields.length > 0 && (
            <div
              data-testid="import-missing-fields-panel"
              className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900"
            >
              <p className="font-bold text-amber-800 dark:text-amber-300 mb-1">
                Campos ausentes ou que não puderam ser importados:
              </p>
              <ul className="list-disc list-inside text-amber-800 dark:text-amber-300 space-y-0.5">
                {state.preview.missingFields.map((f, i) => (
                  <li key={i}>{f}</li>
                ))}
              </ul>
            </div>
          )}

          {state.preview.isDuplicate && (
            <div className="flex items-start gap-3 p-4 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900">
              <AlertTriangle className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
              <p className="text-rose-700 dark:text-rose-300">
                Já existe um material com o título "{state.preview.duplicateOfTitle}". Para evitar
                duplicar conteúdo, esta importação está bloqueada. Se a intenção é atualizar o
                material existente, edite-o diretamente na lista de compêndios.
              </p>
            </div>
          )}

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
              disabled={!state.overrideDisciplineId || !state.overrideThemeId || state.preview.isDuplicate}
              className="px-4 py-2 rounded-lg bg-teal-700 hover:bg-teal-800 text-white dark:bg-teal-600 dark:hover:bg-teal-500 text-xs font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              Salvar rascunho
            </button>
          </div>
        </div>
      )}

      {state.step === 'saving' && (
        <p className="text-stone-600 dark:text-slate-400">Salvando rascunho...</p>
      )}

      {state.step === 'success' && (
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
            <p className="text-emerald-800 dark:text-emerald-300">
              Rascunho de "{state.title}" criado com sucesso. Ele está pendente de revisão — a
              publicação continua sendo uma ação manual separada.
            </p>
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

      {state.step === 'save-error' && (
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-4 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900">
            <AlertTriangle className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
            <div className="space-y-2">
              <p className="text-rose-700 dark:text-rose-300">
                Não foi possível salvar o rascunho agora. Verifique sua conexão e tente novamente.
              </p>
              <details className="text-stone-500 dark:text-slate-500">
                <summary className="cursor-pointer">Detalhes técnicos</summary>
                <p className="mt-1 font-mono text-[10px] break-all">{state.technicalDetail}</p>
              </details>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setState({ step: 'pick' })}
              className="px-4 py-2 rounded-lg border border-stone-200 dark:border-[#243452] text-stone-600 dark:text-slate-300 hover:bg-stone-100 dark:hover:bg-[#142038] text-xs font-bold transition-all cursor-pointer"
            >
              Tentar novamente
            </button>
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

export default ImportMaterialModal;
