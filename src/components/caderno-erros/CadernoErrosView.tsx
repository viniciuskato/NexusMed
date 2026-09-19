import React, { useState, useEffect } from 'react';
import {
  AlertCircle,
  Layers,
  Timer,
  Sparkles,
  CheckCircle2,
} from 'lucide-react';
import { Question, Discipline, Theme, QuestionAnswerRecord, Compendium } from '../../types';
import { flashcardsRepository } from '../../repositories/FlashcardsRepository';
import { answersRepository } from '../../repositories/AnswersRepository';
import { QuestionCard } from '../questions/QuestionCard';

interface CadernoErrosViewProps {
  questions: Question[];
  disciplines: Discipline[];
  themes: Theme[];
  compendiums?: Compendium[];
  onOpenCompendium: (compendiumId?: string, sectionId?: string, originQuestionId?: string) => void;
  onOpenCreateSimulado: () => void;
}

export const CadernoErrosView: React.FC<CadernoErrosViewProps> = ({
  questions,
  disciplines,
  themes,
  compendiums,
  onOpenCompendium,
  onOpenCreateSimulado,
}) => {
  const [selectedReasonFilter, setSelectedReasonFilter] = useState<string>('all');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const [answers, setAnswers] = useState<Record<string, QuestionAnswerRecord>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const nextAnswers = await answersRepository.getAnswers();
      if (!cancelled) setAnswers(nextAnswers);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const mistakeRecords = (Object.values(answers) as QuestionAnswerRecord[]).filter((a) => !a.isCorrect);

  const mistakeQuestions = questions.filter((q) => {
    const ans = answers[q.id];
    if (!ans || ans.isCorrect) return false;
    if (selectedReasonFilter !== 'all' && ans.errorReason !== selectedReasonFilter) {
      return false;
    }
    return true;
  });

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const handleGenerateAllFlashcards = async () => {
    let createdCount = 0;
    for (const q of mistakeQuestions) {
      await flashcardsRepository.createFlashcardFromQuestion(q);
      createdCount++;
    }
    showToast(`${createdCount} flashcards adicionados à sua fila de Revisão Espaçada (SRS)!`);
  };

  const reasonStats = {
    lacuna_teorica: mistakeRecords.filter((a) => a.errorReason === 'lacuna_teorica').length,
    pegadinha: mistakeRecords.filter((a) => a.errorReason === 'pegadinha').length,
    falta_atencao: mistakeRecords.filter((a) => a.errorReason === 'falta_atencao').length,
    raciocinio_clinico: mistakeRecords.filter((a) => a.errorReason === 'raciocinio_clinico').length,
  };

  return (
    <div className="space-y-6 pb-16">
      {/* Toast */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white px-4 py-3 rounded-2xl elev-xl text-xs font-semibold flex items-center gap-2 border border-slate-800 animate-in fade-in">
          <Sparkles className="w-4 h-4 text-teal-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header Banner */}
      <div className="bg-gradient-to-r from-rose-950 via-slate-900 to-slate-950 rounded-3xl p-6 sm:p-8 text-white elev-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-6 border border-rose-900/30">
        <div className="max-w-2xl space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-rose-500/20 text-rose-300 text-xs font-semibold border border-rose-400/30">
            <AlertCircle className="w-3.5 h-3.5" />
            <span>Caderno de Erros Estruturado</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
            Transforme Erros em Pontos de Domínio Clínico
          </h1>
          <p className="text-slate-300 text-xs sm:text-sm leading-relaxed">
            Diagnostique o tipo exato do seu erro (lacuna teórica vs. distrator/pegadinha vs. raciocínio clínico). Acesse o compêndio imediatamente para revisar a fisiopatologia e adicione o flashcard ao SRS.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 shrink-0 w-full md:w-auto">
          {mistakeQuestions.length > 0 && (
            <button
              onClick={handleGenerateAllFlashcards}
              className="px-5 py-3 bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs rounded-2xl elev-md transition-colors flex items-center justify-center gap-2 cursor-pointer"
            >
              <Layers className="w-4 h-4" />
              <span>Gerar SRS para Todos</span>
            </button>
          )}

          <button
            onClick={onOpenCreateSimulado}
            className="px-5 py-3 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-2xl elev-md transition-colors flex items-center justify-center gap-2 cursor-pointer"
          >
            <Timer className="w-4 h-4" />
            <span>Simulado Só de Erros</span>
          </button>
        </div>
      </div>

      {/* Error Breakdown Pills */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { id: 'all', label: 'Todos os Erros', count: mistakeRecords.length },
          { id: 'lacuna_teorica', label: 'Lacuna Teórica', count: reasonStats.lacuna_teorica },
          { id: 'pegadinha', label: 'Pegadinha / Distrator', count: reasonStats.pegadinha },
          { id: 'falta_atencao', label: 'Falta de Atenção', count: reasonStats.falta_atencao },
        ].map((item) => {
          const isSelected = selectedReasonFilter === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setSelectedReasonFilter(item.id)}
              className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer ${
                isSelected
                  ? 'bg-slate-900 dark:bg-rose-950/80 text-white border-slate-900 dark:border-rose-700 elev-sm ring-2 ring-rose-500/30'
                  : 'bg-white dark:bg-[#0F172A] border-slate-200 dark:border-[#243452] text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              <span className="text-[11px] font-bold block mb-1">{item.label}</span>
              <span className="text-lg font-extrabold">{item.count} questões</span>
            </button>
          );
        })}
      </div>

      {/* Mistakes List */}
      {mistakeQuestions.length === 0 ? (
        <div className="bg-white dark:bg-[#0F172A] rounded-3xl border border-slate-200 dark:border-[#243452] p-12 text-center text-slate-500 dark:text-slate-400 space-y-2">
          <CheckCircle2 className="w-10 h-10 mx-auto text-emerald-500" />
          <p className="font-bold text-base text-slate-800 dark:text-slate-200">
            Nenhuma questão no caderno de erros com este filtro!
          </p>
          <p className="text-xs text-slate-400 dark:text-slate-500">
            Seus erros são registrados automaticamente sempre que você responde uma questão incorretamente no Banco de Questões ou Simulados.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 px-2">
            Mostrando <strong>{mistakeQuestions.length} questões erradas</strong> para treino deliberado:
          </div>

          {mistakeQuestions.map((q) => (
            <QuestionCard
              key={q.id}
              question={q}
              discipline={disciplines.find((d) => d.id === q.disciplineId)}
              theme={themes.find((t) => t.id === q.themeId)}
              compendiums={compendiums}
              onOpenCompendium={onOpenCompendium}
            />
          ))}
        </div>
      )}
    </div>
  );
};
