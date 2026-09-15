import React, { useMemo, useState } from 'react';
import {
  GraduationCap,
  Award,
  AlertTriangle,
  TrendingUp,
  ArrowRight,
  Filter,
  CheckCircle2,
  ChevronRight,
} from 'lucide-react';
import { Question, QuestionAnswerRecord } from '../../types';

interface BancaPerformanceRadarProps {
  questions: Question[];
  answers: Record<string, QuestionAnswerRecord>;
  onSelectBanca?: (banca: string) => void;
  onOpenQuestions: () => void;
}

export const BancaPerformanceRadar: React.FC<BancaPerformanceRadarProps> = ({
  questions,
  answers,
  onSelectBanca,
  onOpenQuestions,
}) => {
  const [selectedBanca, setSelectedBanca] = useState<string | null>(null);

  const bancaStats = useMemo(() => {
    const questionsMap = new Map(questions.map((q) => [q.id, q]));
    const groups: Record<
      string,
      {
        name: string;
        totalAvailable: number;
        totalAnswered: number;
        correct: number;
        wrong: number;
      }
    > = {};

    // Mapeia todas as bancas disponíveis
    for (const q of questions) {
      const b = (q.institution || 'Outras').trim();
      if (!groups[b]) {
        groups[b] = {
          name: b,
          totalAvailable: 0,
          totalAnswered: 0,
          correct: 0,
          wrong: 0,
        };
      }
      groups[b].totalAvailable++;
    }

    // Computa respostas
    for (const a of Object.values(answers)) {
      const q = questionsMap.get(a.questionId);
      if (q) {
        const b = (q.institution || 'Outras').trim();
        if (groups[b]) {
          groups[b].totalAnswered++;
          if (a.isCorrect) {
            groups[b].correct++;
          } else {
            groups[b].wrong++;
          }
        }
      }
    }

    const list = Object.values(groups).map((item) => {
      const accuracy =
        item.totalAnswered > 0 ? Math.round((item.correct / item.totalAnswered) * 100) : 0;
      const coverage = Math.round((item.totalAnswered / Math.max(1, item.totalAvailable)) * 100);
      return {
        ...item,
        accuracy,
        coverage,
      };
    });

    // Ordena pelas com mais questões respondidas, depois pelo total disponível
    list.sort((a, b) => b.totalAnswered - a.totalAnswered || b.totalAvailable - a.totalAvailable);

    // Destaques (requer pelo menos 2 questões respondidas)
    const tested = list.filter((i) => i.totalAnswered >= 2);
    let bestBanca = null;
    let worstBanca = null;

    if (tested.length > 0) {
      const sortedByAcc = [...tested].sort((a, b) => b.accuracy - a.accuracy);
      bestBanca = sortedByAcc[0];
      if (sortedByAcc.length > 1) {
        worstBanca = sortedByAcc[sortedByAcc.length - 1];
      }
    }

    return {
      list: list.slice(0, 6), // Top 6 bancas principais
      bestBanca,
      worstBanca,
      totalBancasCount: list.length,
    };
  }, [questions, answers]);

  return (
    <div className="bg-white dark:bg-[#0F172A] rounded-3xl border border-slate-200/90 dark:border-[#243452] p-5 sm:p-6 elev-sm space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 flex items-center justify-center border border-indigo-500/25">
            <GraduationCap className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              Aproveitamento por Banca Examinadora
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Taxa de assertividade e perfil de resolução por instituição de residência
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onOpenQuestions}
          className="inline-flex items-center gap-1.5 text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 cursor-pointer self-start sm:self-auto"
        >
          <span>Filtrar por Banca</span>
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Destaques de Prova (Melhor Afinidade vs Atenção Redobrada) */}
      {(bancaStats.bestBanca || bancaStats.worstBanca) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {bancaStats.bestBanca && (
            <div className="p-3.5 rounded-2xl bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/50 flex items-center justify-between gap-3">
              <div className="space-y-0.5">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-800 dark:text-emerald-300 flex items-center gap-1">
                  <Award className="w-3.5 h-3.5 text-emerald-600" />
                  Maior Afinidade de Banca
                </span>
                <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                  {bancaStats.bestBanca.name}
                </h4>
                <p className="text-[11px] text-slate-600 dark:text-slate-300">
                  {bancaStats.bestBanca.correct} acertos em {bancaStats.bestBanca.totalAnswered} questões
                </p>
              </div>
              <span className="text-xl font-black text-emerald-700 dark:text-emerald-400 tabular-nums">
                {bancaStats.bestBanca.accuracy}%
              </span>
            </div>
          )}

          {bancaStats.worstBanca && bancaStats.worstBanca.name !== bancaStats.bestBanca?.name && (
            <div className="p-3.5 rounded-2xl bg-rose-50/60 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/50 flex items-center justify-between gap-3">
              <div className="space-y-0.5">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-rose-800 dark:text-rose-300 flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                  Ponto de Atenção da Banca
                </span>
                <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                  {bancaStats.worstBanca.name}
                </h4>
                <p className="text-[11px] text-slate-600 dark:text-slate-300">
                  {bancaStats.worstBanca.wrong} erros em {bancaStats.worstBanca.totalAnswered} questões
                </p>
              </div>
              <span className="text-xl font-black text-rose-700 dark:text-rose-400 tabular-nums">
                {bancaStats.worstBanca.accuracy}%
              </span>
            </div>
          )}
        </div>
      )}

      {/* Grid de Bancas com Barras de Assertividade */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
        {bancaStats.list.map((banca) => {
          const isZero = banca.totalAnswered === 0;

          return (
            <div
              key={banca.name}
              className="p-3.5 rounded-2xl border border-slate-200/80 dark:border-[#243452] bg-slate-50/50 dark:bg-[#142038]/40 flex flex-col justify-between gap-2.5"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100">
                    {banca.name}
                  </h4>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400">
                    {banca.totalAnswered} de {banca.totalAvailable} resolvidas
                  </p>
                </div>

                {isZero ? (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-200/80 dark:bg-slate-800 text-slate-500">
                    Sem dados
                  </span>
                ) : (
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                      banca.accuracy >= 75
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800'
                        : banca.accuracy >= 55
                        ? 'bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800'
                        : 'bg-rose-50 text-rose-700 border-rose-300 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800'
                    }`}
                  >
                    {banca.accuracy}% Acerto
                  </span>
                )}
              </div>

              {/* Barra de Progresso */}
              <div className="space-y-1">
                <div className="w-full bg-slate-200 dark:bg-slate-800 h-2 rounded-full overflow-hidden flex">
                  {banca.totalAnswered > 0 ? (
                    <>
                      <div
                        className="bg-emerald-500 h-full"
                        style={{ width: `${(banca.correct / banca.totalAnswered) * 100}%` }}
                      />
                      <div
                        className="bg-rose-500 h-full"
                        style={{ width: `${(banca.wrong / banca.totalAnswered) * 100}%` }}
                      />
                    </>
                  ) : (
                    <div className="w-full h-full bg-slate-200 dark:bg-slate-800" />
                  )}
                </div>
                <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400">
                  <span>{banca.correct} acertos</span>
                  <span>{banca.wrong} erros</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
