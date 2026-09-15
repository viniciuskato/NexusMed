import React, { useState, useMemo } from 'react';
import {
  ClipboardCheck,
  CheckCircle2,
  AlertTriangle,
  Flame,
  Brain,
  Copy,
  Check,
  X,
  Sparkles,
  Stethoscope,
  Moon,
} from 'lucide-react';
import { Question, QuestionAnswerRecord, ErrorLogItem, Discipline, Theme } from '../../types';
import { useAuth } from '../../contexts/AuthContext';

interface DailyHandoffModalProps {
  isOpen: boolean;
  onClose: () => void;
  questions: Question[];
  disciplines: Discipline[];
  themes: Theme[];
  answers: Record<string, QuestionAnswerRecord>;
  errorLogs: ErrorLogItem[];
  streakDays: number;
}

export const DailyHandoffModal: React.FC<DailyHandoffModalProps> = ({
  isOpen,
  onClose,
  questions,
  disciplines,
  themes,
  answers,
  errorLogs,
  streakDays,
}) => {
  const { profile, user } = useAuth();
  const [copied, setCopied] = useState(false);
  const [concluded, setConcluded] = useState(false);

  const studentName =
    profile?.displayName || user?.user_metadata?.display_name || 'Colega Médico';

  // Cálculos do dia atual (hoje)
  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const todayStats = useMemo(() => {
    const questionsMap = new Map(questions.map((q) => [q.id, q]));
    const themesMap = new Map(themes.map((t) => [t.id, t.name]));
    const disciplinesMap = new Map(disciplines.map((d) => [d.id, d.name]));

    const todayAnswers = Object.values(answers).filter((a) => {
      if (!a.answeredAt) return false;
      return a.answeredAt.slice(0, 10) === todayStr;
    });

    const totalToday = todayAnswers.length;
    const correctToday = todayAnswers.filter((a) => a.isCorrect).length;
    const wrongToday = totalToday - correctToday;
    const accuracyToday = totalToday > 0 ? Math.round((correctToday / totalToday) * 100) : 0;

    // Temas dos erros de hoje
    const errorThemeCounts: Record<string, number> = {};
    for (const a of todayAnswers) {
      if (!a.isCorrect) {
        const q = questionsMap.get(a.questionId);
        if (q) {
          const tName = themesMap.get(q.themeId) || disciplinesMap.get(q.disciplineId) || 'Medicina Geral';
          errorThemeCounts[tName] = (errorThemeCounts[tName] || 0) + 1;
        }
      }
    }

    const criticalPoints = Object.entries(errorThemeCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([name, count]) => ({ name, count }));

    return {
      totalToday,
      correctToday,
      wrongToday,
      accuracyToday,
      criticalPoints,
    };
  }, [answers, questions, disciplines, themes, todayStr]);

  if (!isOpen) return null;

  const generateReportText = () => {
    const dateFormatted = new Date().toLocaleDateString('pt-BR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });

    let report = `📋 PASSAGEM DE PLANTÃO — NEXUSMED\n`;
    report += `Data: ${dateFormatted}\n`;
    report += `Médico: ${studentName} | Ofensiva: ${streakDays} dias\n\n`;
    report += `── 1. SITUAÇÃO CLÍNICA DO DIA (S) ──\n`;
    report += `• Questões resolvidas hoje: ${todayStats.totalToday}\n`;
    report += `• Acurácia do plantão: ${todayStats.accuracyToday}% (${todayStats.correctToday} acertos, ${todayStats.wrongToday} erros)\n\n`;

    report += `── 2. PONTOS DE ALERTA & VULNERABILIDADE (A) ──\n`;
    if (todayStats.criticalPoints.length > 0) {
      todayStats.criticalPoints.forEach((p) => {
        report += `• ${p.name}: ${p.count} erro(s) mapeado(s)\n`;
      });
    } else {
      report += `• Sem intercorrências graves. Alta precisão diagnóstica mantida hoje.\n`;
    }

    report += `\n── 3. CONDUTA RECOMENDADA PARA AMANHÃ (R) ──\n`;
    if (todayStats.criticalPoints.length > 0) {
      report += `• Revisar diretrizes e flashcards de ${todayStats.criticalPoints[0].name}.\n`;
    } else {
      report += `• Manter ciclo ativo de SRS e avançar em novo bloco temático.\n`;
    }

    report += `\n"Plantão concluído com foco e método. Descanso merecido!"\n`;
    return report;
  };

  const handleCopyReport = async () => {
    const text = generateReportText();
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    }
  };

  const handleConclude = () => {
    setConcluded(true);
    setTimeout(() => {
      setConcluded(false);
      onClose();
    }, 1800);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
      <div className="bg-white dark:bg-[#0E1726] rounded-3xl border border-slate-300 dark:border-[#243452] shadow-2xl max-w-xl w-full overflow-hidden text-slate-900 dark:text-slate-100 flex flex-col max-h-[90vh]">
        {/* Header com identidade de Passagem de Plantão */}
        <div className="p-6 bg-gradient-to-r from-teal-900/40 via-slate-900 to-indigo-950/50 border-b border-teal-500/20 text-white flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-teal-500/20 text-teal-300 border border-teal-400/30 flex items-center justify-center">
              <Stethoscope className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-extrabold uppercase tracking-widest text-teal-400">
                  Ritual de Fechamento Diário
                </span>
                <span className="px-2 py-0.5 rounded-full bg-teal-500/20 text-teal-300 text-[10px] font-bold">
                  {streakDays}d Streak
                </span>
              </div>
              <h3 className="text-lg font-bold tracking-tight">Passagem de Plantão</h3>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white cursor-pointer transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Corpo do Plantão */}
        <div className="p-6 overflow-y-auto space-y-5 text-xs">
          {concluded ? (
            <div className="py-12 text-center space-y-3 animate-in zoom-in-95">
              <div className="w-14 h-14 rounded-full bg-teal-500/15 text-teal-600 dark:text-teal-400 border border-teal-500/30 flex items-center justify-center mx-auto">
                <Moon className="w-7 h-7" />
              </div>
              <h4 className="text-base font-bold">Plantão Concluído com Sucesso!</h4>
              <p className="text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
                Excelente compromisso hoje, {studentName}. Descanse a mente para que a consolidação sináptica ocorra durante o sono.
              </p>
            </div>
          ) : (
            <>
              {/* Resumo dos Indicadores de Hoje */}
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800">
                  <span className="text-[10px] font-bold text-slate-500 uppercase block">
                    Questões Hoje
                  </span>
                  <span className="text-xl font-black text-slate-900 dark:text-white tabular-nums">
                    {todayStats.totalToday}
                  </span>
                </div>

                <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800">
                  <span className="text-[10px] font-bold text-slate-500 uppercase block">
                    Acurácia Hoje
                  </span>
                  <span className="text-xl font-black text-teal-600 dark:text-teal-400 tabular-nums">
                    {todayStats.totalToday > 0 ? `${todayStats.accuracyToday}%` : '—'}
                  </span>
                </div>

                <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800">
                  <span className="text-[10px] font-bold text-slate-500 uppercase block">
                    Erros Catalogados
                  </span>
                  <span className="text-xl font-black text-rose-600 dark:text-rose-400 tabular-nums">
                    {todayStats.wrongToday}
                  </span>
                </div>
              </div>

              {/* Alertas de Plantão para a próxima sessão */}
              <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-slate-800 dark:text-slate-200 space-y-2">
                <div className="flex items-center gap-1.5 text-amber-700 dark:text-amber-400 font-bold uppercase tracking-wider text-[11px]">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>Pontos de Atenção Para o Próximo Plantão</span>
                </div>

                {todayStats.criticalPoints.length > 0 ? (
                  <ul className="space-y-1.5 pl-1">
                    {todayStats.criticalPoints.map((item, idx) => (
                      <li key={idx} className="flex items-center justify-between text-xs">
                        <span>• {item.name}</span>
                        <span className="font-bold text-rose-600 dark:text-rose-400">
                          {item.count} erro(s) hoje
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-slate-600 dark:text-slate-300">
                    Nenhuma vulnerabilidade reincidente hoje. Continue monitorando temas de alta incidência nas próximas sessões.
                  </p>
                )}
              </div>

              {/* Prévia do Handoff Clínico Estruturado (SBAR) */}
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/30 border border-slate-200 dark:border-slate-800 space-y-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                  Prévia da Síntese SBAR
                </span>
                <div className="text-[11px] font-mono text-slate-600 dark:text-slate-300 whitespace-pre-line leading-relaxed max-h-36 overflow-y-auto pr-1">
                  {generateReportText()}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Rodapé de Ações */}
        {!concluded && (
          <div className="p-4 sm:p-5 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40 flex flex-col sm:flex-row items-center justify-between gap-3">
            <button
              type="button"
              onClick={handleCopyReport}
              className="w-full sm:w-auto px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-500" />
                  <span className="text-emerald-600 dark:text-emerald-400">Relatório Copiado!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-slate-400" />
                  <span>Copiar Síntese</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleConclude}
              className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-teal-700 hover:bg-teal-800 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer elev-xs"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Encerrar Plantão de Hoje</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
