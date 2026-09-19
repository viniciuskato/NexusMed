import React, { useState } from 'react';
import { Layers, X } from 'lucide-react';
import { Discipline, Theme, Flashcard } from '../../types';
import { flashcardsRepository } from '../../repositories/FlashcardsRepository';

interface CreateFlashcardModalProps {
  isOpen: boolean;
  onClose: () => void;
  disciplines: Discipline[];
  themes: Theme[];
  onFlashcardCreated: (card: Flashcard) => void;
}

export const CreateFlashcardModal: React.FC<CreateFlashcardModalProps> = ({
  isOpen,
  onClose,
  disciplines,
  themes,
  onFlashcardCreated,
}) => {
  const [disciplineId, setDisciplineId] = useState(disciplines[0]?.id || '');
  const [themeId, setThemeId] = useState('');
  const [front, setFront] = useState('');
  const [back, setBack] = useState('');
  const [mechanismHighlight, setMechanismHighlight] = useState('');
  const [difficulty] = useState<'facil' | 'medio' | 'dificil'>('medio');

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!front.trim() || !back.trim()) return;

    const disc = disciplines.find((d) => d.id === disciplineId);
    const th = themes.find((t) => t.id === themeId);

    const newCard: Flashcard = {
      id: crypto.randomUUID(),
      disciplineId,
      themeId: themeId || (themes.find((t) => t.disciplineId === disciplineId)?.id || 'general'),
      front: front.trim(),
      back: back.trim(),
      mechanismHighlight: mechanismHighlight.trim(),
      tags: [disc?.name || 'Medicina', th?.name || 'Geral', 'Custom'],
      difficulty,
      isCustom: true,
      srs: {
        intervalDays: 1,
        repetitionCount: 0,
        easeFactor: 2.5,
        nextDueDate: new Date().toISOString(),
        state: 'new',
        reviewHistory: [],
      },
    };

    const saved = await flashcardsRepository.saveFlashcard(newCard);
    onFlashcardCreated(saved);
    onClose();
  };

  const filteredThemes = themes.filter((t) => !disciplineId || t.disciplineId === disciplineId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="w-full max-w-xl bg-white dark:bg-[#0F172A] rounded-3xl elev-2xl border border-slate-200 dark:border-[#243452] overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-6 bg-gradient-to-r from-teal-900 to-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-teal-500/20 text-teal-300 border border-teal-400/30">
              <Layers className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-bold">Novo Flashcard SRS</h3>
              <p className="text-xs text-slate-300">
                Adicione um cartão com o algoritmo de repetição espaçada SM-2.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-white/10 text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto flex-1 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1" htmlFor="createflashcardmodal-disciplina-1">Disciplina</label>
              <select id="createflashcardmodal-disciplina-1"
                value={disciplineId}
                onChange={(e) => {
                  setDisciplineId(e.target.value);
                  setThemeId('');
                }}
                className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-[#243452] bg-slate-50 dark:bg-[#142038] focus:bg-white dark:focus:bg-[#1A2845] focus:outline-none focus:ring-2 focus:ring-teal-500 text-slate-900 dark:text-slate-100"
              >
                {disciplines.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1" htmlFor="createflashcardmodal-tema-capitulo-2">Tema / Capítulo</label>
              <select id="createflashcardmodal-tema-capitulo-2"
                value={themeId}
                onChange={(e) => setThemeId(e.target.value)}
                className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-[#243452] bg-slate-50 dark:bg-[#142038] focus:bg-white dark:focus:bg-[#1A2845] focus:outline-none focus:ring-2 focus:ring-teal-500 text-slate-900 dark:text-slate-100"
              >
                <option value="">Selecione o tema</option>
                {filteredThemes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1" htmlFor="createflashcardmodal-frente-do-card-pergunta-3">
              Frente do Card (Pergunta / Conceito / Caso Breve)
            </label>
            <textarea id="createflashcardmodal-frente-do-card-pergunta-3"
              required
              rows={3}
              value={front}
              onChange={(e) => setFront(e.target.value)}
              placeholder="Ex: Qual a tríade clássica do infarto de ventrículo direito e qual medicamento está contraindicado?"
              className="w-full p-3 rounded-xl border border-slate-200 dark:border-[#243452] bg-slate-50 dark:bg-[#142038] focus:bg-white dark:focus:bg-[#1A2845] focus:outline-none focus:ring-2 focus:ring-teal-500 text-slate-900 dark:text-slate-100 placeholder:text-slate-400"
            />
          </div>

          <div>
            <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1" htmlFor="createflashcardmodal-verso-do-card-resposta-4">
              Verso do Card (Resposta Direta / Resumo)
            </label>
            <textarea id="createflashcardmodal-verso-do-card-resposta-4"
              required
              rows={3}
              value={back}
              onChange={(e) => setBack(e.target.value)}
              placeholder="Ex: Tríade: Hipotensão + Turgência jugular + Pulmões limpos. Contraindicado: Nitratos e diuréticos (depende da pré-carga)."
              className="w-full p-3 rounded-xl border border-slate-200 dark:border-[#243452] bg-slate-50 dark:bg-[#142038] focus:bg-white dark:focus:bg-[#1A2845] focus:outline-none focus:ring-2 focus:ring-teal-500 text-slate-900 dark:text-slate-100 placeholder:text-slate-400"
            />
          </div>

          <div>
            <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1" htmlFor="createflashcardmodal-destaque-do-mecanismo-mnemonico-5">
              Destaque do Mecanismo / Mnemônico (Opcional)
            </label>
            <input id="createflashcardmodal-destaque-do-mecanismo-mnemonico-5"
              type="text"
              value={mechanismHighlight}
              onChange={(e) => setMechanismHighlight(e.target.value)}
              placeholder="Ex: VD depende de pré-carga; vasodilatação abrupta causa choque cardiogênico."
              className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-[#243452] bg-slate-50 dark:bg-[#142038] focus:bg-white dark:focus:bg-[#1A2845] focus:outline-none focus:ring-2 focus:ring-teal-500 text-slate-900 dark:text-slate-100 placeholder:text-slate-400"
            />
          </div>

          {/* Footer */}
          <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 font-semibold cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-6 py-2.5 rounded-xl bg-teal-700 hover:bg-teal-800 text-white font-bold elev-md transition-all cursor-pointer"
            >
              Criar Flashcard
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
