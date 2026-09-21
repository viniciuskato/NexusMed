import React, { useRef, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { Discipline, Theme } from '../../types';
import { materialsRepository } from '../../repositories/MaterialsRepository';
import { getErrorMessage } from '../../utils/errorMessage';
import { useDialogA11y } from '../../hooks/useDialogA11y';

interface CreateThemeModalProps {
  disciplines: Discipline[];
  themes: Theme[];
  defaultDisciplineId?: string;
  onClose: () => void;
  onCreated: (theme: Theme) => void;
}

// ============================================================================
// Antes desta missão, o catálogo de temas só podia crescer por `insert` SQL
// direto (ver docs/diretoria/registro.md, precedente "Distúrbio Acidobásico"
// em Nefrologia) — não existia nenhum caminho de UI para `saveThemes`. A RLS
// (`themes_admin_write`, migration 20260903120100) já liberava escrita para
// admin ativo; faltava só a tela.
// ============================================================================

export const CreateThemeModal: React.FC<CreateThemeModalProps> = ({
  disciplines,
  themes,
  defaultDisciplineId,
  onClose,
  onCreated,
}) => {
  const [disciplineId, setDisciplineId] = useState(defaultDisciplineId || disciplines[0]?.id || '');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [highYield, setHighYield] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useDialogA11y<HTMLDivElement>({ onClose, initialFocusRef: nameInputRef });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName || !disciplineId || saving) return;

    const duplicate = themes.find(
      (t) => t.disciplineId === disciplineId && t.name.trim().toLowerCase() === trimmedName.toLowerCase()
    );
    if (duplicate) {
      setError(`Já existe um tema "${duplicate.name}" nesta disciplina — use-o em vez de criar outro.`);
      return;
    }

    setSaving(true);
    setError(null);
    const themesInDiscipline = themes.filter((t) => t.disciplineId === disciplineId);
    const nextOrder = themesInDiscipline.length > 0 ? Math.max(...themesInDiscipline.map((t) => t.order)) + 1 : 1;
    const newTheme: Theme = {
      id: crypto.randomUUID(),
      disciplineId,
      name: trimmedName,
      description: description.trim(),
      highYield,
      order: nextOrder,
    };

    try {
      await materialsRepository.saveThemes([...themes, newTheme]);
      onCreated(newTheme);
    } catch (err) {
      console.error('[CreateThemeModal] falha ao criar tema:', err);
      setError(getErrorMessage(err));
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-start sm:items-center justify-center p-3 sm:p-4 overflow-y-auto bg-slate-900/60 backdrop-blur-xs animate-in fade-in"
      aria-hidden="false"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-labelledby="create-theme-title"
        aria-modal="true"
        data-testid="create-theme-modal"
        className="w-full max-w-md my-4 sm:my-8 bg-white dark:bg-[#0F172A] rounded-2xl border-2 border-teal-500/50 dark:border-teal-500/60 p-6 elev-md space-y-4 text-xs animate-in fade-in"
      >
        <div className="flex items-center justify-between border-b border-stone-200 dark:border-[#243452] pb-3">
          <div className="flex items-center gap-2">
            <Plus className="w-4 h-4 text-teal-600 dark:text-teal-400" />
            <h3 id="create-theme-title" className="font-serif-reading text-lg font-bold text-stone-900 dark:text-slate-100">
              Novo tema
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

        <p className="text-stone-600 dark:text-slate-400">
          Tema é uma categoria ampla e fixa do currículo, reaproveitada por vários conteúdos da
          mesma disciplina — não um resumo deste material específico. Confirme que nenhum tema
          existente já cobre o assunto antes de criar um novo.
        </p>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="font-bold text-stone-700 dark:text-slate-300 block mb-1" htmlFor="create-theme-disciplina">
              Disciplina
            </label>
            <select
              id="create-theme-disciplina"
              value={disciplineId}
              onChange={(e) => setDisciplineId(e.target.value)}
              className="w-full p-2.5 rounded-lg border border-stone-200 dark:border-[#243452] bg-stone-50 dark:bg-[#142038] text-stone-900 dark:text-slate-100"
            >
              {disciplines.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="font-bold text-stone-700 dark:text-slate-300 block mb-1" htmlFor="create-theme-nome">
              Nome do tema
            </label>
            <input
              id="create-theme-nome"
              ref={nameInputRef}
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Endocardite Infecciosa"
              className="w-full p-2.5 rounded-lg border border-stone-200 dark:border-[#243452] bg-stone-50 dark:bg-[#142038] text-stone-900 dark:text-slate-100"
            />
          </div>

          <div>
            <label className="font-bold text-stone-700 dark:text-slate-300 block mb-1" htmlFor="create-theme-descricao">
              Descrição (opcional)
            </label>
            <textarea
              id="create-theme-descricao"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Resumo curto do que esse tema cobre"
              className="w-full p-2.5 rounded-lg border border-stone-200 dark:border-[#243452] bg-stone-50 dark:bg-[#142038] text-stone-900 dark:text-slate-100"
            />
          </div>

          <label className="flex items-center gap-2 cursor-pointer text-stone-700 dark:text-slate-300">
            <input
              type="checkbox"
              checked={highYield}
              onChange={(e) => setHighYield(e.target.checked)}
              className="rounded"
            />
            Alta relevância (high-yield)
          </label>

          {error && (
            <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t border-stone-200 dark:border-[#243452]">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-stone-200 dark:border-[#243452] text-stone-600 dark:text-slate-300 hover:bg-stone-100 dark:hover:bg-[#142038] font-bold transition-all cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!name.trim() || !disciplineId || saving}
              className="px-4 py-2 rounded-lg bg-teal-700 hover:bg-teal-800 text-white dark:bg-teal-600 dark:hover:bg-teal-500 font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              {saving ? 'Criando...' : 'Criar tema'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateThemeModal;
