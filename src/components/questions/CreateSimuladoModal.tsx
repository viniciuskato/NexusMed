import React, { useState } from 'react';
import {
  Timer,
  X,
  Check,
} from 'lucide-react';
import { Discipline, Theme, DifficultyLevel, MedicalCycle, SimuladoConfig } from '../../types';

interface CreateSimuladoModalProps {
  isOpen: boolean;
  onClose: () => void;
  disciplines: Discipline[];
  themes: Theme[];
  totalAvailableQuestions: number;
  mistakesCount: number;
  onStartSimulado: (config: SimuladoConfig) => void;
}

export const CreateSimuladoModal: React.FC<CreateSimuladoModalProps> = ({
  isOpen,
  onClose,
  disciplines,
  totalAvailableQuestions,
  mistakesCount,
  onStartSimulado,
}) => {
  const [name, setName] = useState('Simulado Personalizado');
  const [selectedDisciplines, setSelectedDisciplines] = useState<string[]>([]);
  const [selectedDifficulties] = useState<DifficultyLevel[]>([
    'facil',
    'medio',
    'dificil',
  ]);
  const [selectedCycles] = useState<MedicalCycle[]>([
    'basico',
    'clinico',
    'internato_residencia',
  ]);
  const [onlyMistakes, setOnlyMistakes] = useState(false);
  const [questionCount, setQuestionCount] = useState(5);
  const [timeLimitMinutes, setTimeLimitMinutes] = useState(15);
  const [isExamMode, setIsExamMode] = useState(true);

  if (!isOpen) return null;

  const toggleDiscipline = (id: string) => {
    if (selectedDisciplines.includes(id)) {
      setSelectedDisciplines(selectedDisciplines.filter((d) => d !== id));
    } else {
      setSelectedDisciplines([...selectedDisciplines, id]);
    }
  };

  const handleStart = () => {
    const config: SimuladoConfig = {
      id: crypto.randomUUID(),
      name: name.trim() || 'Simulado Personalizado',
      disciplineIds: selectedDisciplines,
      themeIds: [],
      difficulties: selectedDifficulties,
      cycles: selectedCycles,
      onlyMistakes,
      questionCount,
      timeLimitMinutes,
      isExamMode,
    };
    onStartSimulado(config);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="w-full max-w-2xl bg-white dark:bg-[#0F172A] rounded-3xl elev-2xl border border-slate-200 dark:border-[#243452] overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-6 bg-gradient-to-r from-teal-900 via-slate-900 to-teal-950 text-white flex items-center justify-between border-b border-teal-800/30">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-teal-500/20 text-teal-300 border border-teal-400/30">
              <Timer className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-bold">Criador de Simulados & Listas</h3>
              <p className="text-xs text-slate-300">
                Monte provas cronometradas ou listas de estudo sem pressão de tempo.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-white/10 text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6 overflow-y-auto flex-1 text-xs">
          {/* Mode Selection */}
          <div>
            <span className="font-bold text-slate-700 dark:text-slate-200 block mb-2">
              Modo de Resolução
            </span>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setIsExamMode(true)}
                className={`p-3.5 rounded-2xl border text-left transition-all ${
                  isExamMode
                    ? 'bg-slate-900 dark:bg-teal-950/80 text-white border-slate-900 dark:border-teal-500 elev-sm ring-2 ring-teal-500/40'
                    : 'bg-white dark:bg-[#142038] text-slate-700 dark:text-slate-300 border-slate-200 dark:border-[#243452] hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold">Modo Prova</span>
                  {isExamMode && <Check className="w-4 h-4 text-teal-400 shrink-0" />}
                </div>
                <p className={`text-[11px] ${isExamMode ? 'text-slate-300 dark:text-teal-200' : 'text-slate-500 dark:text-slate-400'}`}>
                  Com tempo limite cronometrado e gabarito revelado ao final.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setIsExamMode(false)}
                className={`p-3.5 rounded-2xl border text-left transition-all ${
                  !isExamMode
                    ? 'bg-teal-700 dark:bg-teal-700 text-white border-teal-700 dark:border-teal-500 elev-sm ring-2 ring-teal-500/40'
                    : 'bg-white dark:bg-[#142038] text-slate-700 dark:text-slate-300 border-slate-200 dark:border-[#243452] hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold">Modo Estudos</span>
                  {!isExamMode && <Check className="w-4 h-4 text-white shrink-0" />}
                </div>
                <p className={`text-[11px] ${!isExamMode ? 'text-teal-100' : 'text-slate-500 dark:text-slate-400'}`}>
                  Sem tempo limite; gabarito comentado a cada questão respondida.
                </p>
              </button>
            </div>
          </div>

          {/* Title */}
          <div>
            <label className="font-bold text-slate-700 dark:text-slate-200 block mb-1.5" htmlFor="createsimuladomodal-nome-da-sessao-de-1">
              Nome da Sessão de Estudo
            </label>
            <input id="createsimuladomodal-nome-da-sessao-de-1"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-[#243452] bg-white dark:bg-[#142038] text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-500 text-xs"
              placeholder="Ex: Simulado Cardiologia & Pneumo Ciclo Clínico"
            />
          </div>

          {/* Quick Filter: Caderno de Erros */}
          <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 flex items-center justify-between">
            <div>
              <span className="font-bold text-rose-950 dark:text-rose-200 block">Treinar Apenas Erros Anteriores</span>
              <p className="text-[11px] text-rose-700 dark:text-rose-300 mt-0.5">
                Você possui <strong>{mistakesCount} questões erradas</strong> registradas no seu Caderno de Erros.
              </p>
            </div>
            <button
              onClick={() => setOnlyMistakes(!onlyMistakes)}
              className={`px-3 py-1.5 rounded-xl font-bold transition-all text-xs ${
                onlyMistakes
                  ? 'bg-rose-600 text-white elev-xs'
                  : 'bg-white dark:bg-[#142038] text-rose-800 dark:text-rose-300 border border-rose-300 dark:border-rose-700'
              }`}
            >
              {onlyMistakes ? 'Filtro de Erros Ativo' : 'Ativar Filtro de Erros'}
            </button>
          </div>

          {/* Disciplines Selection */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="font-bold text-slate-700 dark:text-slate-200">Disciplinas Médicas</span>
              <button
                onClick={() =>
                  setSelectedDisciplines(
                    selectedDisciplines.length === disciplines.length
                      ? []
                      : disciplines.map((d) => d.id)
                  )
                }
                className="text-teal-700 dark:text-teal-400 hover:underline font-semibold"
              >
                {selectedDisciplines.length === disciplines.length
                  ? 'Desmarcar todas'
                  : 'Selecionar todas'}
              </button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {disciplines.map((disc) => {
                const isSelected = selectedDisciplines.includes(disc.id);
                return (
                  <button
                    key={disc.id}
                    onClick={() => toggleDiscipline(disc.id)}
                    className={`p-2.5 rounded-xl border text-left flex items-center justify-between transition-all ${
                      isSelected
                        ? 'bg-teal-50 dark:bg-teal-950/60 border-teal-600 dark:border-teal-500 text-teal-950 dark:text-teal-200 font-bold'
                        : 'bg-white dark:bg-[#142038] border-slate-200 dark:border-[#243452] text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    <span className="truncate">{disc.name}</span>
                    {isSelected && <Check className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400 shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Question Count & Time Limit (Time limit is only displayed in Prova mode) */}
          <div className={`grid gap-4 ${isExamMode ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'}`}>
            <div>
              <label className="font-bold text-slate-700 dark:text-slate-200 block mb-1.5" htmlFor="createsimuladomodal-quantidade-de-questoes-questioncount-2">
                Quantidade de Questões: <strong className="text-teal-700 dark:text-teal-400">{questionCount}</strong>
              </label>
              <input id="createsimuladomodal-quantidade-de-questoes-questioncount-2"
                type="range"
                min={2}
                max={Math.max(5, totalAvailableQuestions)}
                value={questionCount}
                onChange={(e) => setQuestionCount(parseInt(e.target.value))}
                className="w-full accent-teal-600"
              />
            </div>

            {isExamMode ? (
              <div>
                <label className="font-bold text-slate-700 dark:text-slate-200 block mb-1.5" htmlFor="createsimuladomodal-tempo-limite-timelimitminutes-minutos-3">
                  Tempo Limite: <strong className="text-teal-700 dark:text-teal-400">{timeLimitMinutes} minutos</strong>
                </label>
                <input id="createsimuladomodal-tempo-limite-timelimitminutes-minutos-3"
                  type="range"
                  min={5}
                  max={120}
                  step={5}
                  value={timeLimitMinutes}
                  onChange={(e) => setTimeLimitMinutes(parseInt(e.target.value))}
                  className="w-full accent-teal-600"
                />
              </div>
            ) : (
              <div className="p-3 rounded-xl bg-teal-50/60 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-800/60 text-teal-800 dark:text-teal-300 text-[11px] flex items-center gap-2">
                <Timer className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0" />
                <span>
                  <strong>Modo Estudos:</strong> Você terá tempo ilimitado para responder, consultar comentários e reforçar seu aprendizado.
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 dark:bg-[#0B1220] border-t border-slate-200 dark:border-[#243452] flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800 font-semibold text-xs transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleStart}
            className="px-6 py-2.5 rounded-xl bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500 text-white font-bold text-xs elev-md transition-all flex items-center gap-2"
          >
            <Timer className="w-4 h-4" />
            <span>{isExamMode ? 'Iniciar Modo Prova' : 'Iniciar Modo Estudos'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
