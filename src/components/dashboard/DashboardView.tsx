import React, { useMemo, useState, useEffect } from 'react';
import {
  Flame,
  Brain,
  Target,
  Award,
  Zap,
  Star,
  Lock,
  Check,
  X,
  Play,
  Timer,
  HelpCircle,
  AlertTriangle,
  ArrowRight,
  Activity,
  ChevronRight,
  CheckCircle2,
  Stethoscope,
  RotateCcw,
  BarChart3,
  BookMarked,
} from 'lucide-react';
import {
  Discipline,
  Theme,
  Question,
  Compendium,
  Flashcard,
  QuestionAnswerRecord,
  ErrorLogItem,
} from '../../types';
import { answersRepository } from '../../repositories/AnswersRepository';
import { readingProgressRepository } from '../../repositories/ReadingProgressRepository';
import { useScrollMemory } from '../../hooks/useScrollMemory';
import { errorNotebookRepository } from '../../repositories/ErrorNotebookRepository';
import { isCardDueToday } from '../../services/srsAlgorithm';
import { useAuth } from '../../contexts/AuthContext';
import {
  GamificationService,
  Achievement,
  DailyQuest,
} from '../../services/gamification';
import { IntegratedCadernoErros } from './IntegratedCadernoErros';
import { ClinicalCognitiveProfile } from './ClinicalCognitiveProfile';
import { BancaPerformanceRadar } from './BancaPerformanceRadar';
import { DailyHandoffModal } from '../common/DailyHandoffModal';

interface DashboardViewProps {
  disciplines: Discipline[];
  themes: Theme[];
  questions: Question[];
  compendiums: Compendium[];
  flashcards: Flashcard[];
  onSelectView: (view: string) => void;
  onOpenCompendium: (compendiumId: string, sectionId?: string) => void;
  onOpenQuestion: (questionId: string) => void;
  onStartSRS: () => void;
  initialTab?: 'overview' | 'errors';
  onTabChange?: (tab: 'overview' | 'errors') => void;
  onStartErrorSimulado?: () => void;
  onUpdate?: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  disciplines,
  themes,
  questions,
  compendiums,
  flashcards,
  onSelectView,
  onOpenCompendium,
  onOpenQuestion,
  onStartSRS,
  initialTab = 'overview',
  onTabChange,
  onStartErrorSimulado,
  onUpdate,
}) => {
  const { user, profile } = useAuth();
  const userName = profile?.displayName || user?.user_metadata?.display_name || 'Colega';

  const [activeTab, setActiveTab] = useState<'overview' | 'errors'>(initialTab);
  useScrollMemory(`dashboard:${activeTab}`);

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  const handleSwitchTab = (tab: 'overview' | 'errors') => {
    setActiveTab(tab);
    if (onTabChange) {
      onTabChange(tab);
    }
  };

  // Persistence data
  const [answers, setAnswers] = useState<Record<string, QuestionAnswerRecord>>({});
  const [readingProgress, setReadingProgress] = useState<
    Record<string, { readSectionIds: string[]; percent: number }>
  >({});
  const [errorLogs, setErrorLogs] = useState<ErrorLogItem[]>([]);
  const [showAchievementsModal, setShowAchievementsModal] = useState(false);
  const [showDailyHandoffModal, setShowDailyHandoffModal] = useState(false);

  const reloadData = async () => {
    const [nextAnswers, nextProgress, nextErrorLogs] = await Promise.all([
      answersRepository.getAnswers(),
      readingProgressRepository.getReadingProgress(),
      errorNotebookRepository.getErrorLogs(),
    ]);
    setAnswers(nextAnswers);
    setReadingProgress(nextProgress);
    setErrorLogs(nextErrorLogs);
    if (onUpdate) onUpdate();
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [nextAnswers, nextProgress, nextErrorLogs] = await Promise.all([
        answersRepository.getAnswers(),
        readingProgressRepository.getReadingProgress(),
        errorNotebookRepository.getErrorLogs(),
      ]);
      if (cancelled) return;
      setAnswers(nextAnswers);
      setReadingProgress(nextProgress);
      setErrorLogs(nextErrorLogs);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const answersArray: QuestionAnswerRecord[] = useMemo(() => Object.values(answers), [answers]);
  const totalAnswered = answersArray.length;
  const totalCorrect = answersArray.filter((a) => a.isCorrect).length;
  const totalErrors = totalAnswered - totalCorrect;
  const accuracy = totalAnswered > 0 ? Math.round((totalCorrect / totalAnswered) * 100) : 0;

  // Estatísticas calculadas a partir de dados sincronizados
  const stats = useMemo(
    () => GamificationService.computeRealStats(answers, flashcards, readingProgress),
    [answers, flashcards, readingProgress]
  );

  // Gamificação: Cálculo de XP, Nível e Missões Diárias
  const totalXp = useMemo(() => {
    return GamificationService.calculateXp(answers, stats, readingProgress, questions);
  }, [answers, stats, readingProgress, questions]);

  const levelInfo = useMemo(() => {
    return GamificationService.getLevelInfo(totalXp);
  }, [totalXp]);

  const dailyQuests: DailyQuest[] = useMemo(() => {
    return GamificationService.getDailyQuests(answers, stats, readingProgress);
  }, [answers, stats, readingProgress]);

  const achievements: Achievement[] = useMemo(() => {
    return GamificationService.getAchievements(answers, stats, readingProgress);
  }, [answers, stats, readingProgress]);

  const unlockedAchievementsCount = useMemo(() => {
    return achievements.filter((a) => a.unlocked).length;
  }, [achievements]);

  // Flashcards programados para hoje
  const dueCards = useMemo(() => {
    return flashcards.filter((fc) => isCardDueToday(fc));
  }, [flashcards]);

  // Desempenho pessoal detalhado por disciplina / grande área
  const disciplinePerformance = useMemo(() => {
    return disciplines.map((disc) => {
      const discQuestions = questions.filter((q) => q.disciplineId === disc.id);
      const discQuestionIds = new Set(discQuestions.map((q) => q.id));
      const answeredList = answersArray.filter((a) => discQuestionIds.has(a.questionId));
      const answeredCount = answeredList.length;
      const correctCount = answeredList.filter((a) => a.isCorrect).length;
      const errorCount = answeredCount - correctCount;
      const acc = answeredCount > 0 ? Math.round((correctCount / answeredCount) * 100) : 0;
      const coverage = discQuestions.length > 0 ? Math.round((answeredCount / discQuestions.length) * 100) : 0;

      // Status de domínio clínico
      let masteryLevel: 'alto' | 'medio' | 'baixo' | 'zerado' = 'zerado';
      if (answeredCount >= 2) {
        if (acc >= 75) masteryLevel = 'alto';
        else if (acc >= 50) masteryLevel = 'medio';
        else masteryLevel = 'baixo';
      } else if (answeredCount === 1) {
        masteryLevel = correctCount === 1 ? 'medio' : 'baixo';
      }

      return {
        discipline: disc,
        totalAvailable: discQuestions.length,
        totalAnswered: answeredCount,
        totalCorrect: correctCount,
        totalErrors: errorCount,
        accuracy: acc,
        coverage,
        masteryLevel,
      };
    });
  }, [disciplines, questions, answersArray]);

  // Radar de temas com maior incidência de erros (Vulnerabilidades)
  const criticalThemes = useMemo(() => {
    const errorCountsByTheme: Record<string, { theme: Theme; disc?: Discipline; count: number }> = {};
    for (const ans of answersArray) {
      if (!ans.isCorrect) {
        const q = questions.find((item) => item.id === ans.questionId);
        if (q && q.themeId) {
          const th = themes.find((t) => t.id === q.themeId);
          if (th) {
            if (!errorCountsByTheme[th.id]) {
              const disc = disciplines.find((d) => d.id === q.disciplineId);
              errorCountsByTheme[th.id] = { theme: th, disc, count: 0 };
            }
            errorCountsByTheme[th.id].count++;
          }
        }
      }
    }
    return Object.values(errorCountsByTheme)
      .sort((a, b) => b.count - a.count)
      .slice(0, 4);
  }, [answersArray, questions, themes, disciplines]);

  // Últimos erros cometidos pelo usuário
  const recentMistakes = useMemo(() => {
    return answersArray
      .filter((a) => !a.isCorrect)
      .slice(-4)
      .reverse();
  }, [answersArray]);

  // Ciclo de Retenção SRS do Usuário
  const srsStats = useMemo(() => {
    const total = flashcards.length;
    const due = dueCards.length;
    const reviewedToday = stats.flashcardsReviewedToday;
    const errorLinked = flashcards.filter(
      (fc) => fc.isAutoGenerated || fc.id.startsWith('err-') || fc.tags?.includes('erro')
    ).length;
    const mastered = flashcards.filter((fc) => (fc.interval || 0) >= 21).length;
    const inProgress = total - mastered;

    return {
      total,
      due,
      reviewedToday,
      errorLinked,
      mastered,
      inProgress,
    };
  }, [flashcards, dueCards, stats.flashcardsReviewedToday]);

  const handleClaimCelebration = () => {
    GamificationService.triggerCelebration();
  };

  return (
    <div className="w-full max-w-[1680px] mx-auto space-y-7 pb-12">
      {/* ── 1. Hero Pessoal de Desempenho & Nível ── */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-slate-900 to-teal-950 border border-slate-800 text-white p-6 sm:p-8 2xl:p-10 elev-xl shadow-teal-950/20">
        <div className="absolute -top-24 -right-24 w-96 h-96 bg-teal-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-80 h-80 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
          {/* Lado Esquerdo: Identidade do Aluno & Nível Gamificado */}
          <div className="space-y-4 max-w-3xl">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-teal-500/20 border border-teal-400/40 text-teal-300 text-xs font-bold tracking-wide">
                <span className="w-2 h-2 rounded-full bg-teal-400 animate-ping" />
                {levelInfo.currentLevel.badge} Nível {levelInfo.currentLevel.level} · {levelInfo.currentLevel.title}
              </span>

              <button
                type="button"
                onClick={handleClaimCelebration}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/20 border border-amber-400/40 text-amber-300 text-xs font-bold hover:bg-amber-500/30 transition-all cursor-pointer group"
                title="Clique para celebrar seu progresso!"
              >
                <Zap className="w-3.5 h-3.5 fill-amber-400 text-amber-400 group-hover:scale-110 transition-transform" />
                <span>{totalXp} XP Acumulado</span>
              </button>

              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-orange-500/20 border border-orange-400/40 text-orange-300 text-xs font-bold">
                <Flame className="w-3.5 h-3.5 fill-orange-400 text-orange-400 animate-flame" />
                <span>{stats.streakDays} dias de ofensiva</span>
              </span>
            </div>

            <div>
              <h1 className="text-2xl sm:text-3xl 2xl:text-4xl font-serif-reading font-bold tracking-tight text-white">
                Olá, <span className="bg-gradient-to-r from-teal-300 to-cyan-200 bg-clip-text text-transparent">{userName}</span>!
              </h1>
              <p className="text-slate-300 text-xs sm:text-sm 2xl:text-base leading-relaxed mt-1.5 max-w-2xl">
                Seu cockpit pessoal de estudos para Residência Médica. Acompanhe sua acurácia real, domine seus pontos fracos e mantenha a consistência diária.
              </p>
            </div>

            {/* Barra de Progresso do Nível */}
            <div className="pt-1 max-w-xl">
              <div className="flex items-center justify-between text-xs mb-1.5 font-medium">
                <span className="text-teal-300/90 flex items-center gap-1">
                  <Star className="w-3.5 h-3.5 fill-teal-400 text-teal-400" />
                  Progresso do Nível: {levelInfo.levelProgressPercent}%
                </span>
                <span className="text-slate-400">
                  {levelInfo.nextLevel
                    ? `Faltam ${levelInfo.xpNeededForNextLevel} XP para ${levelInfo.nextLevel.title}`
                    : 'Nível Máximo Atingido!'}
                </span>
              </div>
              <div className="w-full bg-slate-800/90 h-2.5 rounded-full overflow-hidden p-0.5 border border-slate-700/80">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-teal-400 via-cyan-400 to-amber-400 transition-all duration-500 elev-xs shadow-teal-400/50"
                  style={{ width: `${levelInfo.levelProgressPercent}%` }}
                />
              </div>
            </div>
          </div>

          {/* Lado Direito: Ações Rápidas Imediatas */}
          <div className="flex flex-col sm:flex-row lg:flex-col gap-2.5 shrink-0 w-full lg:w-64">
            <button
              type="button"
              onClick={() => onSelectView('questions')}
              className="px-4 py-3 rounded-2xl bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-400 hover:to-cyan-400 text-slate-950 font-black text-xs elev-lg shadow-teal-500/25 transition-all flex items-center justify-center gap-2 cursor-pointer group"
            >
              <HelpCircle className="w-4 h-4 group-hover:rotate-12 transition-transform" />
              <span>Resolver Questões (+50 XP)</span>
            </button>

            <button
              type="button"
              onClick={onStartSRS}
              className="px-4 py-3 rounded-2xl bg-slate-800/90 hover:bg-slate-750 text-slate-100 border border-slate-700/90 hover:border-teal-500/50 font-bold text-xs elev-xs transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <Brain className="w-4 h-4 text-teal-400" />
              <span>Revisar Flashcards ({dueCards.length})</span>
            </button>

            <button
              type="button"
              onClick={() => onSelectView('simulados')}
              className="px-4 py-2.5 rounded-2xl bg-slate-800/90 hover:bg-slate-750 text-slate-200 border border-slate-700/90 hover:border-teal-500/50 font-bold text-xs elev-xs transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <Timer className="w-4 h-4 text-teal-400" />
              <span>Simulados & Provas</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── Seletor de Modo de Dados Pessoais: Visão Geral vs Caderno de Erros ── */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 border-b border-slate-300 dark:border-[#243652] pb-3">
        <div className="flex items-center gap-1.5 p-1 rounded-2xl bg-slate-200/90 dark:bg-[#121D32] border border-slate-300 dark:border-[#223350] self-start shadow-2xs">
          <button
            type="button"
            onClick={() => handleSwitchTab('overview')}
            className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer flex items-center gap-2 ${
              activeTab === 'overview'
                ? 'bg-white dark:bg-[#0E1726] text-slate-900 dark:text-white shadow-xs border border-slate-300/80 dark:border-white/10'
                : 'text-slate-700 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white hover:bg-slate-100/60 dark:hover:bg-[#182640]'
            }`}
          >
            <Activity className="w-4 h-4 text-teal-600 dark:text-teal-400" />
            <span>Visão Geral & Desempenho</span>
          </button>

          <button
            type="button"
            onClick={() => handleSwitchTab('errors')}
            className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer flex items-center gap-2 ${
              activeTab === 'errors'
                ? 'bg-white dark:bg-[#0E1726] text-rose-600 dark:text-rose-400 shadow-xs border border-slate-300/80 dark:border-white/10'
                : 'text-slate-700 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white hover:bg-slate-100/60 dark:hover:bg-[#182640]'
            }`}
          >
            <BookMarked className="w-4 h-4 text-rose-500" />
            <span>Caderno de Erros & Metacognição</span>
            {errorLogs.length > 0 && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-500 text-white">
                {errorLogs.length}
              </span>
            )}
          </button>
        </div>

        <button
          type="button"
          onClick={() => setShowDailyHandoffModal(true)}
          className="px-4 py-2 rounded-2xl bg-teal-50 dark:bg-teal-950/30 border border-teal-300 dark:border-teal-800 text-teal-800 dark:text-teal-300 hover:bg-teal-100 dark:hover:bg-teal-900/40 text-xs font-bold transition-all cursor-pointer flex items-center gap-2 self-start sm:self-auto shadow-2xs"
          title="Abrir síntese diária de fechamento de estudos"
        >
          <Stethoscope className="w-4 h-4 text-teal-600 dark:text-teal-400" />
          <span>Passagem de Plantão</span>
        </button>
      </div>

      {activeTab === 'errors' ? (
        <IntegratedCadernoErros
          questions={questions}
          disciplines={disciplines}
          themes={themes}
          compendiums={compendiums}
          onOpenCompendium={onOpenCompendium}
          onOpenQuestion={onOpenQuestion}
          onStartErrorSimulado={onStartErrorSimulado || (() => onSelectView('simulados'))}
          onUpdate={reloadData}
          onSwitchToOverview={() => handleSwitchTab('overview')}
        />
      ) : (
        <>
      {/* ── 2. Card de Missão do Dia: Ação Cirúrgica Imediata ── */}
      <div className="p-5 sm:p-6 rounded-3xl bg-gradient-to-r from-teal-900/40 via-slate-900 to-indigo-950/50 border border-teal-500/30 elev-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-5 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-full bg-teal-500/5 blur-2xl pointer-events-none" />
        <div className="space-y-2 relative z-10 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-teal-500/20 text-teal-300 text-[11px] font-extrabold uppercase tracking-wider border border-teal-400/30">
              <Zap className="w-3.5 h-3.5 fill-teal-400 text-teal-400" />
              Missão Prioritária de Hoje
            </span>
            <span className="text-[11px] text-teal-200/80 font-medium">
              Recomendação baseada nas suas métricas cognitivas
            </span>
          </div>
          <h3 className="text-base sm:text-lg font-bold text-white tracking-tight">
            {dueCards.length > 0
              ? `Revisar ${dueCards.length} flashcard${dueCards.length > 1 ? 's' : ''} do ciclo de repetição espaçada`
              : errorLogs.length > 0
              ? `Reforçar ${Math.min(5, errorLogs.length)} questão(ões) pendente(s) do seu Caderno de Erros`
              : 'Consolidar acervo: Treinar 10 novas questões de alta incidência'}
          </h3>
          <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">
            {dueCards.length > 0
              ? 'A retenção de longo prazo exige consolidar os conceitos com intervalo vencido antes de avançar em novos temas teóricos.'
              : errorLogs.length > 0
              ? 'Identificamos lacunas cognitivas recentes. Revisitá-las reduz a chance de reincidência em provas oficiais da residência médica.'
              : 'Seu circuito de SRS e Caderno de Erros estão em dia! Continue avançando no banco de questões para acumular XP e dominar novas bancas.'}
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0 relative z-10 w-full sm:w-auto">
          {dueCards.length > 0 ? (
            <button
              type="button"
              onClick={onStartSRS}
              className="w-full sm:w-auto px-5 py-3 rounded-2xl bg-gradient-to-r from-teal-400 to-cyan-400 hover:from-teal-300 hover:to-cyan-300 text-slate-950 font-black text-xs elev-md shadow-teal-500/20 transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <Brain className="w-4 h-4" />
              <span>Iniciar Revisão SRS ({dueCards.length})</span>
            </button>
          ) : errorLogs.length > 0 ? (
            <button
              type="button"
              onClick={() => handleSwitchTab('errors')}
              className="w-full sm:w-auto px-5 py-3 rounded-2xl bg-gradient-to-r from-rose-500 to-amber-500 hover:from-rose-400 hover:to-amber-400 text-slate-950 font-black text-xs elev-md shadow-rose-500/20 transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Superar Erros no Caderno</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onSelectView('questions')}
              className="w-full sm:w-auto px-5 py-3 rounded-2xl bg-gradient-to-r from-teal-400 to-cyan-400 hover:from-teal-300 hover:to-cyan-300 text-slate-950 font-black text-xs elev-md shadow-teal-500/20 transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <HelpCircle className="w-4 h-4" />
              <span>Resolver Questões Agora</span>
            </button>
          )}
        </div>
      </div>

      {/* ── 3. Cards Vitais de Desempenho Pessoal (KPIs) ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Acurácia Geral */}
        <div className="p-5 rounded-3xl bg-white dark:bg-[#0F172A] border border-slate-200/90 dark:border-[#243452] elev-xs space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Acurácia Geral
            </span>
            <div className="w-8 h-8 rounded-xl bg-teal-500/10 text-teal-600 dark:text-teal-400 flex items-center justify-center border border-teal-500/20">
              <Activity className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-3xl font-black text-slate-900 dark:text-slate-100 tabular-nums">
              {totalAnswered > 0 ? `${accuracy}%` : '—'}
            </span>
            <span className="text-xs text-emerald-600 dark:text-emerald-400 font-bold">
              {totalCorrect} acertos
            </span>
          </div>
          <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-teal-500 to-emerald-500 transition-all duration-500"
              style={{ width: `${accuracy}%` }}
            />
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center justify-between">
            <span>{totalAnswered} questões respondidas</span>
            <span className="text-rose-500 font-semibold">{totalErrors} erros</span>
          </p>
        </div>

        {/* KPI 2: Sequência / Ofensiva */}
        <div className="p-5 rounded-3xl bg-white dark:bg-[#0F172A] border border-slate-200/90 dark:border-[#243452] elev-xs space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Ofensiva de Estudo
            </span>
            <div className="w-8 h-8 rounded-xl bg-orange-500/10 text-orange-500 flex items-center justify-center border border-orange-500/20">
              <Flame className="w-4 h-4 fill-orange-500" />
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-3xl font-black text-slate-900 dark:text-slate-100 tabular-nums flex items-center gap-1.5">
              {stats.streakDays}
              <span className="text-sm font-semibold text-slate-500 dark:text-slate-400">dias</span>
            </span>
            <span className="text-xs text-orange-600 dark:text-orange-400 font-bold">
              {stats.streakDays > 0 ? 'Fogo Ativo' : 'Comece Hoje'}
            </span>
          </div>
          <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-orange-400 to-amber-400 transition-all duration-500"
              style={{ width: `${Math.min(100, stats.streakDays * 20)}%` }}
            />
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            {stats.streakDays > 0
              ? 'Mantenha a rotina diária para fixar os conteúdos.'
              : 'Responda questões hoje para iniciar sua sequência!'}
          </p>
        </div>

        {/* KPI 3: Flashcards SRS Hoje */}
        <div className="p-5 rounded-3xl bg-white dark:bg-[#0F172A] border border-slate-200/90 dark:border-[#243452] elev-xs space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Revisão Espaçada (SRS)
            </span>
            <div className="w-8 h-8 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center border border-indigo-500/20">
              <Brain className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-3xl font-black text-slate-900 dark:text-slate-100 tabular-nums">
              {dueCards.length}
            </span>
            <span
              className={`text-xs font-bold ${
                dueCards.length > 0 ? 'text-indigo-600 dark:text-indigo-400' : 'text-emerald-600 dark:text-emerald-400'
              }`}
            >
              {dueCards.length > 0 ? 'Cards para hoje' : 'Circuito em dia!'}
            </span>
          </div>
          <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-500"
              style={{
                width: `${
                  flashcards.length > 0
                    ? Math.round(((flashcards.length - dueCards.length) / flashcards.length) * 100)
                    : 100
                }%`,
              }}
            />
          </div>
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-slate-500 dark:text-slate-400">Total: {flashcards.length} cards</span>
            <button
              type="button"
              onClick={onStartSRS}
              className="text-indigo-600 dark:text-indigo-400 font-bold hover:underline cursor-pointer"
            >
              {dueCards.length > 0 ? 'Revisar agora →' : 'Praticar →'}
            </button>
          </div>
        </div>

        {/* KPI 4: Caderno de Erros */}
        <div className="p-5 rounded-3xl bg-white dark:bg-[#0F172A] border border-slate-200/90 dark:border-[#243452] elev-xs space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Caderno de Erros
            </span>
            <div className="w-8 h-8 rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center border border-rose-500/20">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-3xl font-black text-slate-900 dark:text-slate-100 tabular-nums">
              {errorLogs.length}
            </span>
            <span className="text-xs text-rose-600 dark:text-rose-400 font-bold">
              Itens catalogados
            </span>
          </div>
          <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-rose-500 to-pink-500 transition-all duration-500"
              style={{
                width: `${totalAnswered > 0 ? Math.min(100, Math.round((errorLogs.length / totalAnswered) * 100)) : 0}%`,
              }}
            />
          </div>
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-slate-500 dark:text-slate-400">Reforço programado</span>
            <button
              type="button"
              onClick={() => handleSwitchTab('errors')}
              className="text-rose-600 dark:text-rose-400 font-bold hover:underline cursor-pointer"
            >
              Abrir Caderno →
            </button>
          </div>
        </div>
      </div>

      {/* ── Motor de Identidade & Perfil Cognitivo Clínico (Exclusivo NexusMed) ── */}
      <ClinicalCognitiveProfile
        answers={answers}
        questions={questions}
        errorLogs={errorLogs}
        onSelectView={onSelectView}
      />

      {/* ── Aproveitamento por Banca Examinadora ── */}
      <BancaPerformanceRadar
        questions={questions}
        answers={answers}
        onOpenQuestions={() => onSelectView('questions')}
      />

      {/* ── 3. Painel Principal Dividido: Análise Clínica + Painel Lateral Pessoal ── */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-7 items-start">
        {/* ═══ COLUNA PRINCIPAL (8 Colunas em telas largas): Desempenho & Vulnerabilidades ═══ */}
        <div className="xl:col-span-8 space-y-7">
          {/* ── Seção A: Desempenho Pessoal por Especialidade Médica (Altamente Visual) ── */}
          <div className="bg-white dark:bg-[#0F172A] rounded-3xl border border-slate-200/90 dark:border-[#243452] p-5 sm:p-6 elev-sm space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-teal-500/15 text-teal-600 dark:text-teal-400 flex items-center justify-center border border-teal-500/25">
                  <BarChart3 className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                    Desempenho por Especialidade Médica
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Acompanhamento do seu índice de acertos e cobertura de questões por grande área
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => onSelectView('questions')}
                className="inline-flex items-center gap-1.5 text-xs font-bold text-teal-600 dark:text-teal-400 hover:text-teal-700 cursor-pointer self-start sm:self-auto"
              >
                <span>Banco de Questões</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Grid Visual de Especialidades */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {disciplinePerformance.map((item) => {
                const isZero = item.totalAnswered === 0;

                return (
                  <div
                    key={item.discipline.id}
                    className="p-4 rounded-2xl border border-slate-200/80 dark:border-[#243452] bg-slate-50/50 dark:bg-[#142038]/50 hover:border-teal-400/60 dark:hover:border-teal-500/60 transition-all flex flex-col justify-between gap-3"
                  >
                    {/* Header da Especialidade */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-0.5 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <Stethoscope className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400 shrink-0" />
                          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate">
                            {item.discipline.name}
                          </h3>
                        </div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          {item.totalAnswered} de {item.totalAvailable} questões respondidas ({item.coverage}%)
                        </p>
                      </div>

                      {/* Badge de Domínio */}
                      {isZero ? (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-200/80 dark:bg-slate-800 text-slate-600 dark:text-slate-400 shrink-0">
                          Não iniciado
                        </span>
                      ) : item.masteryLevel === 'alto' ? (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 shrink-0">
                          {item.accuracy}% Acerto
                        </span>
                      ) : item.masteryLevel === 'medio' ? (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-300 dark:border-amber-800 shrink-0">
                          {item.accuracy}% Acerto
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-300 dark:border-rose-800 shrink-0">
                          {item.accuracy}% Acerto
                        </span>
                      )}
                    </div>

                    {/* Barra Segmentada Visual (Acertos x Erros x Restantes) */}
                    <div className="space-y-1">
                      <div className="w-full bg-slate-200 dark:bg-slate-800 h-2.5 rounded-full overflow-hidden flex">
                        {item.totalAnswered > 0 ? (
                          <>
                            <div
                              className="bg-emerald-500 h-full transition-all duration-500"
                              style={{ width: `${(item.totalCorrect / item.totalAnswered) * 100}%` }}
                              title={`${item.totalCorrect} acertos`}
                            />
                            <div
                              className="bg-rose-500 h-full transition-all duration-500"
                              style={{ width: `${(item.totalErrors / item.totalAnswered) * 100}%` }}
                              title={`${item.totalErrors} erros`}
                            />
                          </>
                        ) : (
                          <div className="w-full h-full bg-slate-200 dark:bg-slate-800" />
                        )}
                      </div>

                      {/* Legenda compacta */}
                      <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400 font-medium">
                        <span className="flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                          {item.totalCorrect} corretas
                        </span>
                        <span className="flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                          {item.totalErrors} erros
                        </span>
                        <span>{item.totalAvailable - item.totalAnswered} pendentes</span>
                      </div>
                    </div>

                    {/* Botão de Prática Rápida */}
                    <button
                      type="button"
                      onClick={() => onSelectView('questions')}
                      className="w-full py-1.5 px-3 rounded-xl bg-white dark:bg-[#0B1220] border border-slate-200 dark:border-[#243452] hover:border-teal-500/50 hover:bg-teal-50/50 dark:hover:bg-teal-950/20 text-slate-700 dark:text-slate-300 text-[11px] font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <span>Praticar {item.discipline.name}</span>
                      <ArrowRight className="w-3 h-3 text-teal-600 dark:text-teal-400" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Seção B: Radar de Vulnerabilidades Pessoais (Temas com Erros) ── */}
          <div className="bg-white dark:bg-[#0F172A] rounded-3xl border border-slate-200/90 dark:border-[#243452] p-5 sm:p-6 elev-sm space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-rose-500/15 text-rose-600 dark:text-rose-400 flex items-center justify-center border border-rose-500/25">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100">
                    Radar de Vulnerabilidades
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Temas com maior frequência de erro mapeados automaticamente para sua revisão
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => handleSwitchTab('errors')}
                className="text-xs font-bold text-rose-600 dark:text-rose-400 hover:underline cursor-pointer"
              >
                Ver Caderno ({errorLogs.length})
              </button>
            </div>

            {criticalThemes.length === 0 ? (
              <div className="py-8 text-center space-y-2">
                <CheckCircle2 className="w-9 h-9 mx-auto text-emerald-500" />
                <p className="text-sm font-bold text-slate-800 dark:text-slate-200">
                  Nenhuma vulnerabilidade crítica detectada!
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                  Conforme você resolve casos clínicos e simulados, qualquer erro é catalogado e mapeado aqui para direcionar seu estudo ativo.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {criticalThemes.map((item) => (
                  <div
                    key={item.theme.id}
                    className="p-3.5 rounded-2xl border border-rose-200/70 dark:border-rose-900/50 bg-rose-50/40 dark:bg-rose-950/20 flex items-start justify-between gap-3"
                  >
                    <div className="space-y-1 min-w-0">
                      <span className="text-[10px] font-extrabold uppercase tracking-wider text-rose-700 dark:text-rose-400">
                        {item.disc?.name || 'Especialidade'}
                      </span>
                      <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                        {item.theme.name}
                      </h4>
                      <p className="text-[11px] text-slate-600 dark:text-slate-400">
                        {item.count} {item.count === 1 ? 'questão errada' : 'questões erradas'}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleSwitchTab('errors')}
                      className="px-2.5 py-1 rounded-xl bg-white dark:bg-[#0B1220] border border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-[11px] font-bold hover:bg-rose-50 transition-all cursor-pointer shrink-0"
                    >
                      Revisar
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Seção C: Questões Recentes com Erro para Reforço Imediato ── */}
          {recentMistakes.length > 0 && (
            <div className="bg-white dark:bg-[#0F172A] rounded-3xl border border-slate-200/90 dark:border-[#243452] p-5 sm:p-6 elev-sm space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <RotateCcw className="w-4 h-4 text-rose-500" />
                  <h3 className="font-bold text-sm sm:text-base text-slate-900 dark:text-slate-100">
                    Refazer Questões Recentes com Erro
                  </h3>
                </div>
                <span className="text-xs text-slate-400 font-medium">Reforço Imediato</span>
              </div>

              <div className="space-y-2.5">
                {recentMistakes.map((ans, idx) => {
                  const q = questions.find((item) => item.id === ans.questionId);
                  const th = themes.find((t) => t.id === q?.themeId);
                  const disc = disciplines.find((d) => d.id === q?.disciplineId);

                  return (
                    <div
                      key={idx}
                      className="p-3.5 rounded-2xl bg-slate-50 dark:bg-[#142038] border border-slate-200/70 dark:border-[#243452] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3"
                    >
                      <div className="space-y-1 min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-md bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300">
                            {disc?.name || 'Medicina'}
                          </span>
                          <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                            {th?.name}
                          </span>
                        </div>
                        <p className="text-xs text-slate-800 dark:text-slate-200 line-clamp-1 leading-snug font-medium">
                          {q?.questionStem || 'Questão cadastrada'}
                        </p>
                      </div>

                      {q && (
                        <button
                          type="button"
                          onClick={() => onOpenQuestion(q.id)}
                          className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-teal-600 dark:hover:bg-teal-500 text-white text-[11px] font-bold transition-all cursor-pointer flex items-center gap-1.5 shrink-0 self-end sm:self-center"
                        >
                          <span>Refazer Questão</span>
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* ═══ COLUNA LATERAL (4 Colunas em telas largas): Metas, SRS & Conquistas ═══ */}
        <div className="xl:col-span-4 space-y-6">
          {/* ── Desafios Diários (Metas do Dia) ── */}
          <div className="bg-white dark:bg-[#0F172A] rounded-3xl border border-slate-200/90 dark:border-[#243452] p-5 sm:p-6 elev-sm space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-amber-500/15 text-amber-500 flex items-center justify-center border border-amber-500/25">
                  <Target className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-sm sm:text-base text-slate-900 dark:text-slate-100">
                    Desafios do Dia
                  </h3>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">
                    Metas diárias para impulsionar seu XP
                  </span>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              {dailyQuests.map((quest) => {
                const percent = Math.min(100, Math.round((quest.current / quest.target) * 100));

                return (
                  <div
                    key={quest.id}
                    className={`p-3.5 rounded-2xl border transition-all space-y-2 ${
                      quest.completed
                        ? 'bg-emerald-50/60 dark:bg-emerald-950/20 border-emerald-300 dark:border-emerald-800/80'
                        : 'bg-slate-50/80 dark:bg-[#142038]/60 border-slate-200/80 dark:border-[#243452]'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-base">{quest.icon}</span>
                        <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100">
                          {quest.title}
                        </h4>
                      </div>
                      {quest.completed ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 text-[10px] font-black">
                          <Check className="w-3 h-3 stroke-[3]" /> Concluída
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
                          +{quest.rewardXp} XP
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      {quest.description}
                    </p>

                    <div className="space-y-1 pt-1">
                      <div className="flex items-center justify-between text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                        <span>Progresso</span>
                        <span className="tabular-nums">
                          {quest.current} / {quest.target}
                        </span>
                      </div>
                      <div className="w-full bg-slate-200/80 dark:bg-slate-700/80 h-1.5 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-300 ${
                            quest.completed
                              ? 'bg-gradient-to-r from-teal-500 to-emerald-500'
                              : 'bg-gradient-to-r from-amber-400 to-orange-500'
                          }`}
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Retenção & Repetição Espaçada (SRS) Detalhada ── */}
          <div className="bg-gradient-to-br from-indigo-500/10 via-purple-500/5 to-white dark:to-[#0F172A] rounded-3xl border border-indigo-200/80 dark:border-indigo-900/60 p-5 sm:p-6 elev-sm space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 flex items-center justify-center border border-indigo-500/25">
                  <Brain className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-sm sm:text-base text-slate-900 dark:text-slate-100">
                    Circuito de Flashcards
                  </h3>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">
                    Algoritmo SM-2 de fixação biológica
                  </span>
                </div>
              </div>
              <span className="text-xs font-black text-indigo-600 dark:text-indigo-400">
                {srsStats.due} para hoje
              </span>
            </div>

            {/* Métricas do Baralho Pessoal */}
            <div className="grid grid-cols-2 gap-2.5 pt-1">
              <div className="p-3 rounded-xl bg-white/80 dark:bg-[#142038] border border-indigo-100 dark:border-indigo-950/60">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                  Dominados
                </span>
                <span className="text-lg font-black text-emerald-600 dark:text-emerald-400">
                  {srsStats.mastered}
                </span>
                <span className="text-[10px] text-slate-400 block mt-0.5">retenção a longo prazo</span>
              </div>

              <div className="p-3 rounded-xl bg-white/80 dark:bg-[#142038] border border-indigo-100 dark:border-indigo-950/60">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                  Em Consolidação
                </span>
                <span className="text-lg font-black text-indigo-600 dark:text-indigo-400">
                  {srsStats.inProgress}
                </span>
                <span className="text-[10px] text-slate-400 block mt-0.5">ciclos de repetição</span>
              </div>
            </div>

            <button
              type="button"
              onClick={onStartSRS}
              className="w-full py-2.5 rounded-xl font-bold text-xs bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white elev-md shadow-indigo-600/20 transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>{srsStats.due > 0 ? 'Iniciar Sessão de Revisão' : 'Praticar Baralho Geral'}</span>
            </button>
          </div>

          {/* ── Quadro de Conquistas & Medalhas Clínicas ── */}
          <div className="bg-white dark:bg-[#0F172A] rounded-3xl border border-slate-200/90 dark:border-[#243452] p-5 sm:p-6 elev-sm space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-amber-500/15 text-amber-500 flex items-center justify-center border border-amber-500/25">
                  <Award className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-sm sm:text-base text-slate-900 dark:text-slate-100">
                    Medalhas & Conquistas
                  </h3>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">
                    {unlockedAchievementsCount} de {achievements.length} desbloqueadas
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowAchievementsModal(true)}
                className="text-xs font-bold text-amber-600 dark:text-amber-400 hover:underline cursor-pointer"
              >
                Ver todas
              </button>
            </div>

            {/* Preview de Medalhas */}
            <div className="grid grid-cols-2 gap-2.5">
              {achievements.slice(0, 4).map((ach) => (
                <div
                  key={ach.id}
                  onClick={() => setShowAchievementsModal(true)}
                  className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                    ach.unlocked
                      ? 'bg-gradient-to-br from-amber-500/10 to-transparent border-amber-400/40 dark:border-amber-500/30'
                      : 'bg-slate-50/60 dark:bg-[#142038]/50 border-slate-200/60 dark:border-[#243452]/70 opacity-70'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xl">{ach.icon}</span>
                    {ach.unlocked ? (
                      <span className="w-4 h-4 rounded-full bg-amber-500 text-slate-950 flex items-center justify-center text-[9px] font-black">
                        ✓
                      </span>
                    ) : (
                      <Lock className="w-3.5 h-3.5 text-slate-400" />
                    )}
                  </div>
                  <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                    {ach.title}
                  </h4>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 line-clamp-1 mt-0.5">
                    {ach.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      </>
      )}

      {/* ── 4. Modal de Conquistas & Medalhas Completo ── */}
      {showAchievementsModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#0F172A] rounded-3xl border border-slate-200 dark:border-[#243452] w-full max-w-2xl max-h-[85vh] overflow-y-auto p-6 sm:p-8 elev-2xl space-y-6">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-500/20 text-amber-500 flex items-center justify-center text-xl">
                  🏆
                </div>
                <div>
                  <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
                    Quadro de Conquistas Nexus
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Complete desafios clínicos e desbloqueie medalhas exclusivas de residência
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowAchievementsModal(false)}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Lista Completa de Medalhas */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {achievements.map((ach) => (
                <div
                  key={ach.id}
                  className={`p-4 rounded-2xl border transition-all flex items-start gap-3.5 ${
                    ach.unlocked
                      ? 'bg-gradient-to-br from-amber-500/10 via-amber-500/5 to-transparent border-amber-400/40 dark:border-amber-500/40 elev-xs'
                      : 'bg-slate-50/80 dark:bg-[#142038]/60 border-slate-200/80 dark:border-[#243452] opacity-75'
                  }`}
                >
                  <div className="text-3xl shrink-0 mt-0.5">{ach.icon}</div>
                  <div className="space-y-1 flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                        {ach.title}
                      </h4>
                      {ach.unlocked ? (
                        <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 text-[10px] font-black border border-emerald-500/30">
                          Desbloqueada
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold text-slate-400 flex items-center gap-1">
                          <Lock className="w-3 h-3" /> Bloqueada
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
                      {ach.description}
                    </p>
                    <div className="pt-1 flex items-center justify-between text-[10px] font-semibold text-amber-600 dark:text-amber-400">
                      <span>Recompensa: +{ach.rewardXp} XP</span>
                      {!ach.unlocked && (
                        <span>
                          {ach.progress}/{ach.maxProgress}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setShowAchievementsModal(false);
                  handleClaimCelebration();
                }}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-500 hover:to-cyan-500 text-white font-bold text-xs elev-md transition-all cursor-pointer"
              >
                Celebrar Conquistas ✨
              </button>
            </div>
          </div>
        </div>
      )}

      <DailyHandoffModal
        isOpen={showDailyHandoffModal}
        onClose={() => setShowDailyHandoffModal(false)}
        questions={questions}
        disciplines={disciplines}
        themes={themes}
        answers={answers}
        errorLogs={errorLogs}
        streakDays={stats.streakDays}
      />
    </div>
  );
};
