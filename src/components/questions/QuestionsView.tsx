import React, { useState, useMemo, useEffect } from 'react';
import {
  HelpCircle,
  Search,
  Timer,
  BookOpen,
  ArrowLeft,
  Layers,
  Play,
  Filter,
} from 'lucide-react';
import {
  Question,
  Discipline,
  Theme,
  QuestionAnswerRecord,
  QuestionReactionValue,
  Compendium,
  LastReadingSession,
} from '../../types';
import { bookmarksRepository } from '../../repositories/BookmarksRepository';
import { answersRepository } from '../../repositories/AnswersRepository';
import { questionReactionsRepository } from '../../repositories/QuestionReactionsRepository';
import { QuestionCard } from './QuestionCard';
import { usePersistedState } from '../../hooks/usePersistedState';
import { useScrollMemory } from '../../hooks/useScrollMemory';

interface QuestionsViewProps {
  questions: Question[];
  disciplines: Discipline[];
  themes: Theme[];
  compendiums?: Compendium[];
  onOpenCompendium: (compendiumId?: string, sectionId?: string, originQuestionId?: string) => void;
  onOpenCreateSimulado: () => void;
  filterThemeId?: string;
  focusQuestionId?: string;
  /**
   * Status inicial dos pills de filtro (ex.: 'incorrect' ao chegar vindo de
   * "Treinar Apenas Questões Erradas" no Caderno de Erros — ver App.tsx,
   * Prompt 10-A). Só define o valor INICIAL; o usuário pode trocar depois
   * normalmente. Undefined mantém o padrão 'all'.
   */
  initialStatusFilter?: 'all' | 'unanswered' | 'correct' | 'incorrect' | 'bookmarked';
  returnToCompendiumContext?: LastReadingSession | null;
  onReturnToCompendium?: () => void;
}

interface QuestionPack {
  id: string;
  compendiumId?: string;
  compendium?: Compendium;
  themeId: string;
  themeName: string;
  disciplineId: string;
  disciplineName: string;
  title: string;
  subtitle?: string;
  moduleNumber?: number;
  questions: Question[];
  answeredCount: number;
  correctCount: number;
  accuracyPercent: number;
}

export const QuestionsView: React.FC<QuestionsViewProps> = ({
  questions,
  disciplines,
  themes,
  compendiums = [],
  onOpenCompendium,
  onOpenCreateSimulado,
  filterThemeId,
  focusQuestionId,
  initialStatusFilter,
  returnToCompendiumContext,
  onReturnToCompendium,
}) => {
  // Persisted view mode: 'packs' | 'list'
  const [viewMode, setViewMode] = usePersistedState<'packs' | 'list'>(
    'questions_view_mode',
    focusQuestionId || initialStatusFilter === 'incorrect' ? 'list' : 'packs'
  );

  const [selectedPackId, setSelectedPackId] = useState<string | null>(null);

  const [selectedDiscipline, setSelectedDiscipline] = usePersistedState<string>('questions_discipline', 'all');
  const [selectedTheme, setSelectedTheme] = usePersistedState<string>('questions_theme', filterThemeId || 'all');
  const [selectedDifficulty, setSelectedDifficulty] = usePersistedState<string>('questions_difficulty', 'all');
  const [selectedStatus, setSelectedStatus] = usePersistedState<'all' | 'unanswered' | 'correct' | 'incorrect' | 'bookmarked'>(
    'questions_status',
    initialStatusFilter || 'all'
  );
  const [searchQuery, setSearchQuery] = useState('');
  useScrollMemory('questions');

  useEffect(() => {
    if (filterThemeId) {
      setSelectedTheme(filterThemeId);
    }
  }, [filterThemeId, setSelectedTheme]);

  useEffect(() => {
    if (initialStatusFilter) {
      setSelectedStatus(initialStatusFilter);
      if (initialStatusFilter === 'incorrect') {
        setViewMode('list');
      }
    }
  }, [initialStatusFilter, setSelectedStatus, setViewMode]);

  const [answers, setAnswers] = useState<Record<string, QuestionAnswerRecord>>({});
  const [bookmarks, setBookmarks] = useState<{
    questions: string[];
    compendiums: string[];
    flashcards: string[];
  }>({ questions: [], compendiums: [], flashcards: [] });
  const [reactions, setReactions] = useState<Record<string, QuestionReactionValue>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [nextAnswers, nextBookmarks, nextReactions] = await Promise.all([
        answersRepository.getAnswers(),
        bookmarksRepository.getBookmarks(),
        questionReactionsRepository.getMyReactions(),
      ]);
      if (cancelled) return;
      setAnswers(nextAnswers);
      setBookmarks(nextBookmarks);
      setReactions(nextReactions);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Compute packs corresponding to library materials
  const packs = useMemo<QuestionPack[]>(() => {
    const compendiumPacks: QuestionPack[] = compendiums.map((c) => {
      const packQuestions = questions.filter(
        (q) => q.compendiumRefId === c.id || (!q.compendiumRefId && q.themeId === c.themeId)
      );
      const theme = themes.find((t) => t.id === c.themeId);
      const discipline = disciplines.find((d) => d.id === c.disciplineId);
      const answered = packQuestions.filter((q) => !!answers[q.id]);
      const correct = answered.filter((q) => answers[q.id]?.isCorrect);
      const accuracy = answered.length > 0 ? Math.round((correct.length / answered.length) * 100) : 0;
      return {
        id: c.id,
        compendiumId: c.id,
        compendium: c,
        themeId: c.themeId,
        themeName: theme?.name || c.themeId,
        disciplineId: c.disciplineId,
        disciplineName: discipline?.name || c.disciplineId,
        title: c.title,
        subtitle: c.subtitle,
        moduleNumber: c.moduleNumber,
        questions: packQuestions,
        answeredCount: answered.length,
        correctCount: correct.length,
        accuracyPercent: accuracy,
      };
    });

    const coveredIds = new Set(compendiumPacks.flatMap((p) => p.questions.map((q) => q.id)));
    const orphanQuestions = questions.filter((q) => !coveredIds.has(q.id));

    const orphanThemeMap = new Map<string, Question[]>();
    orphanQuestions.forEach((q) => {
      const key = q.themeId || 'unlinked';
      const list = orphanThemeMap.get(key) || [];
      list.push(q);
      orphanThemeMap.set(key, list);
    });

    const orphanPacks: QuestionPack[] = Array.from(orphanThemeMap.entries()).map(([tId, qList]) => {
      const isUnlinked = tId === 'unlinked';
      const theme = isUnlinked ? undefined : themes.find((t) => t.id === tId);
      const discipline = isUnlinked
        ? undefined
        : disciplines.find((d) => d.id === (theme?.disciplineId || qList[0]?.disciplineId));
      const answered = qList.filter((q) => !!answers[q.id]);
      const correct = answered.filter((q) => answers[q.id]?.isCorrect);
      const accuracy = answered.length > 0 ? Math.round((correct.length / answered.length) * 100) : 0;
      return {
        id: isUnlinked ? 'pack-unlinked-questions' : `pack-theme-${tId}`,
        themeId: isUnlinked ? '' : tId,
        themeName: isUnlinked ? 'Sem material associado' : (theme?.name || tId),
        disciplineId: discipline?.id || '',
        disciplineName: discipline?.name || 'Geral',
        title: isUnlinked ? 'Sem Material Associado — Questões' : `Pack: ${theme?.name || 'Tema Complementar'}`,
        subtitle: isUnlinked
          ? 'Questões complementares para prática sem compêndio direto'
          : theme?.description,
        questions: qList,
        answeredCount: answered.length,
        correctCount: correct.length,
        accuracyPercent: accuracy,
      };
    });

    return [...compendiumPacks, ...orphanPacks].filter((p) => p.questions.length > 0);
  }, [compendiums, questions, themes, disciplines, answers]);

  // Filtered packs for pack view
  const filteredPacks = useMemo(() => {
    return packs.filter((p) => {
      if (selectedDiscipline !== 'all' && p.disciplineId !== selectedDiscipline) {
        return false;
      }
      if (selectedTheme !== 'all' && p.themeId !== selectedTheme) {
        return false;
      }
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesTitle = p.title.toLowerCase().includes(query);
        const matchesSub = (p.subtitle || '').toLowerCase().includes(query);
        const matchesDiscipline = p.disciplineName.toLowerCase().includes(query);
        const matchesTheme = p.themeName.toLowerCase().includes(query);
        return matchesTitle || matchesSub || matchesDiscipline || matchesTheme;
      }
      return true;
    });
  }, [packs, selectedDiscipline, selectedTheme, searchQuery]);

  // Active selected pack
  const currentPack = useMemo(() => {
    if (!selectedPackId) return null;
    return packs.find((p) => p.id === selectedPackId) || null;
  }, [packs, selectedPackId]);

  // Questions to display (either within the active pack or global list)
  const baseQuestions = useMemo(() => {
    if (currentPack) {
      return currentPack.questions;
    }
    return questions;
  }, [currentPack, questions]);

  const filteredQuestions = useMemo(() => {
    return baseQuestions.filter((q) => {
      if (focusQuestionId && q.id === focusQuestionId) return true;

      if (!currentPack) {
        if (selectedDiscipline !== 'all' && q.disciplineId !== selectedDiscipline) {
          return false;
        }
        if (selectedTheme !== 'all' && q.themeId !== selectedTheme) {
          return false;
        }
      }

      if (selectedDifficulty !== 'all' && q.difficulty !== selectedDifficulty) {
        return false;
      }

      // Status filter
      const ans = answers[q.id];
      if (selectedStatus === 'unanswered' && ans) return false;
      if (selectedStatus === 'correct' && (!ans || !ans.isCorrect)) return false;
      if (selectedStatus === 'incorrect' && (!ans || ans.isCorrect)) return false;
      if (selectedStatus === 'bookmarked' && !bookmarks.questions.includes(q.id)) return false;

      // Search query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesStem = q.questionStem.toLowerCase().includes(query);
        const matchesVignette = q.clinicalVignette.toLowerCase().includes(query);
        const matchesInstitution = q.institution.toLowerCase().includes(query);
        const matchesTags = q.tags.some((t) => t.toLowerCase().includes(query));
        return matchesStem || matchesVignette || matchesInstitution || matchesTags;
      }

      return true;
    });
  }, [
    baseQuestions,
    currentPack,
    focusQuestionId,
    selectedDiscipline,
    selectedTheme,
    selectedDifficulty,
    selectedStatus,
    searchQuery,
    answers,
    bookmarks.questions,
  ]);

  const totalAnswered = Object.keys(answers).length;
  const mistakesCount = (Object.values(answers) as QuestionAnswerRecord[]).filter((a) => !a.isCorrect).length;

  return (
    <div className="w-full max-w-[1600px] mx-auto space-y-6">
      {/* ── Retorno ao Compêndio em Leitura ────────────────────────── */}
      {returnToCompendiumContext && onReturnToCompendium && (
        <div className="p-3 sm:px-4 sm:py-2.5 rounded-2xl bg-teal-500/10 dark:bg-teal-950/40 border border-teal-500/30 dark:border-teal-700/40 elev-xs flex items-center justify-between gap-3 animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <BookOpen className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0" />
            <div className="truncate text-xs">
              <span className="font-semibold text-slate-700 dark:text-slate-200">
                Lendo: {returnToCompendiumContext.compendiumTitle}
              </span>
              <span className="text-slate-500 dark:text-slate-400 ml-1.5 hidden sm:inline">
                ({returnToCompendiumContext.sectionTitle})
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onReturnToCompendium}
            className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs shadow-xs transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Voltar à Leitura</span>
          </button>
        </div>
      )}

      {/* ── Top Header & Mode Toggle ────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl sm:text-3xl font-serif font-bold text-slate-900 dark:text-white">
              Banco de Questões
            </h1>
            <span className="px-2.5 py-0.5 text-xs font-bold rounded-full bg-teal-100 dark:bg-teal-950 text-teal-800 dark:text-teal-300 border border-teal-200 dark:border-teal-800">
              {questions.length} questões
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-1">
            Organizadas em packs por material de estudo, com gabarito comentado e justificativas
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Mode switch: Packs vs Lista Geral */}
          <div className="inline-flex p-1 rounded-2xl bg-slate-100 dark:bg-[#142038] border border-slate-200/80 dark:border-[#243452]">
            <button
              type="button"
              onClick={() => {
                setViewMode('packs');
                setSelectedPackId(null);
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                viewMode === 'packs' && !selectedPackId
                  ? 'bg-white dark:bg-[#0B1220] text-teal-800 dark:text-teal-300 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Packs por Material</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setViewMode('list');
                setSelectedPackId(null);
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                viewMode === 'list'
                  ? 'bg-white dark:bg-[#0B1220] text-teal-800 dark:text-teal-300 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Filter className="w-3.5 h-3.5" />
              <span>Lista Geral</span>
            </button>
          </div>

          <button
            type="button"
            onClick={onOpenCreateSimulado}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-2xl bg-gradient-to-r from-teal-600 to-teal-700 hover:from-teal-700 hover:to-teal-800 text-white text-xs font-bold shadow-sm transition-all cursor-pointer"
          >
            <Timer className="w-4 h-4" />
            <span>Criar Simulado</span>
          </button>
        </div>
      </div>

      {/* ── Active Pack Details View ────────────────────────────── */}
      {selectedPackId && currentPack ? (
        <div className="space-y-6 animate-in fade-in duration-200">
          {/* Pack Header Card */}
          <div className="p-5 sm:p-6 rounded-3xl bg-white dark:bg-[#0F172A] border border-slate-200/80 dark:border-[#243452] shadow-sm space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setSelectedPackId(null)}
                className="inline-flex items-center gap-1.5 text-xs font-bold text-teal-700 dark:text-teal-400 hover:underline cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Voltar a todos os Packs</span>
              </button>

              <div className="flex items-center gap-2">
                {currentPack.compendiumId && (
                  <button
                    type="button"
                    onClick={() => onOpenCompendium(currentPack.compendiumId)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-teal-50 dark:bg-teal-950/60 border border-teal-200 dark:border-teal-800 text-teal-800 dark:text-teal-300 text-xs font-bold hover:bg-teal-100 transition-colors cursor-pointer"
                  >
                    <BookOpen className="w-3.5 h-3.5" />
                    <span>Ler Material Teórico</span>
                  </button>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-teal-100 dark:bg-teal-950 text-teal-800 dark:text-teal-300 border border-teal-200 dark:border-teal-800">
                  {currentPack.disciplineName}
                </span>
                {currentPack.moduleNumber && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                    Módulo {currentPack.moduleNumber}
                  </span>
                )}
              </div>
              <h2 className="text-xl sm:text-2xl font-serif font-bold text-slate-900 dark:text-white">
                {currentPack.title}
              </h2>
              {currentPack.subtitle && (
                <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400">
                  {currentPack.subtitle}
                </p>
              )}
            </div>

            {/* Pack Progress Stats Bar */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-[#142038]">
                <div className="text-[10px] uppercase font-bold text-slate-400">Total no Pack</div>
                <div className="text-lg font-bold text-slate-800 dark:text-slate-100">
                  {currentPack.questions.length} questões
                </div>
              </div>
              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-[#142038]">
                <div className="text-[10px] uppercase font-bold text-slate-400">Resolvidas</div>
                <div className="text-lg font-bold text-teal-700 dark:text-teal-300">
                  {currentPack.answeredCount} / {currentPack.questions.length}
                </div>
              </div>
              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-[#142038]">
                <div className="text-[10px] uppercase font-bold text-slate-400">Acertos</div>
                <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
                  {currentPack.correctCount}
                </div>
              </div>
              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-[#142038]">
                <div className="text-[10px] uppercase font-bold text-slate-400">Taxa de Acerto</div>
                <div className="text-lg font-bold text-slate-800 dark:text-slate-100">
                  {currentPack.accuracyPercent}%
                </div>
              </div>
            </div>
          </div>

          {/* Quick Filter Pills for this pack */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
            {(['all', 'unanswered', 'incorrect', 'correct', 'bookmarked'] as const).map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setSelectedStatus(st)}
                className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition-all cursor-pointer ${
                  selectedStatus === st
                    ? 'bg-teal-700 text-white shadow-xs'
                    : 'bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:border-teal-500'
                }`}
              >
                {st === 'all' && 'Todas do Pack'}
                {st === 'unanswered' && 'Não Respondidas'}
                {st === 'incorrect' && 'Erros'}
                {st === 'correct' && 'Acertadas'}
                {st === 'bookmarked' && 'Favoritas'}
              </button>
            ))}
          </div>

          {/* Questions list */}
          {filteredQuestions.length === 0 ? (
            <div className="bg-white dark:bg-[#0F172A] rounded-3xl border border-slate-200 dark:border-[#243452] p-12 text-center text-slate-500 dark:text-slate-400 space-y-2">
              <HelpCircle className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-600" />
              <p className="font-semibold text-sm text-slate-800 dark:text-slate-200">
                Nenhuma questão encontrada neste filtro do pack.
              </p>
              <button
                type="button"
                onClick={() => setSelectedStatus('all')}
                className="text-xs text-teal-700 dark:text-teal-400 font-bold hover:underline cursor-pointer"
              >
                Ver todas as questões deste pack
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              {filteredQuestions.map((q) => (
                <QuestionCard
                  key={q.id}
                  question={q}
                  discipline={disciplines.find((d) => d.id === q.disciplineId)}
                  theme={themes.find((t) => t.id === q.themeId)}
                  compendiums={compendiums}
                  onOpenCompendium={onOpenCompendium}
                  hydrated={{
                    answer: answers[q.id] ?? null,
                    bookmarked: bookmarks.questions.includes(q.id),
                    reaction: reactions[q.id] ?? null,
                  }}
                />
              ))}
            </div>
          )}
        </div>
      ) : viewMode === 'packs' ? (
        /* ── Packs Grid View ───────────────────────────────────────── */
        <div className="space-y-6">
          {/* Controls: Disciplines & Search */}
          <div className="p-4 rounded-3xl bg-white dark:bg-[#0F172A] border border-slate-200/80 dark:border-[#243452] shadow-sm flex flex-col md:flex-row gap-3 items-center justify-between">
            <div className="relative w-full md:w-80">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar pack de material..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#142038] text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-teal-500"
              />
            </div>

            <div className="flex items-center gap-2 overflow-x-auto w-full md:w-auto pb-1 md:pb-0 text-xs">
              <button
                type="button"
                onClick={() => setSelectedDiscipline('all')}
                className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition-all cursor-pointer ${
                  selectedDiscipline === 'all'
                    ? 'bg-teal-700 text-white'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                }`}
              >
                Todas as Disciplinas
              </button>
              {disciplines.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => setSelectedDiscipline(d.id)}
                  className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition-all cursor-pointer ${
                    selectedDiscipline === d.id
                      ? 'bg-teal-700 text-white'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                  }`}
                >
                  {d.name}
                </button>
              ))}
            </div>
          </div>

          {/* Overall summary stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-4 rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200/80 dark:border-[#243452]">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total de Packs</div>
              <div className="text-xl font-bold text-slate-900 dark:text-white mt-1">{packs.length} packs</div>
            </div>
            <div className="p-4 rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200/80 dark:border-[#243452]">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total de Questões</div>
              <div className="text-xl font-bold text-slate-900 dark:text-white mt-1">{questions.length} questões</div>
            </div>
            <div className="p-4 rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200/80 dark:border-[#243452]">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Resolvidas</div>
              <div className="text-xl font-bold text-teal-700 dark:text-teal-400 mt-1">{totalAnswered} feitas</div>
            </div>
            <div className="p-4 rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200/80 dark:border-[#243452]">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Caderno de Erros</div>
              <div className="text-xl font-bold text-rose-600 dark:text-rose-400 mt-1">{mistakesCount} erros</div>
            </div>
          </div>

          {/* Grid of Packs */}
          {filteredPacks.length === 0 ? (
            <div className="bg-white dark:bg-[#0F172A] rounded-3xl border border-slate-200 dark:border-[#243452] p-12 text-center text-slate-500 dark:text-slate-400 space-y-2">
              <Layers className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-600" />
              <p className="font-semibold text-sm text-slate-800 dark:text-slate-200">
                Nenhum pack encontrado para os filtros atuais.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {filteredPacks.map((pack) => {
                const completionPercent = Math.round((pack.answeredCount / pack.questions.length) * 100);
                const isCompleted = pack.answeredCount === pack.questions.length && pack.questions.length > 0;

                return (
                  <div
                    key={pack.id}
                    className="p-5 rounded-3xl bg-white dark:bg-[#0F172A] border border-slate-200/80 dark:border-[#243452] shadow-sm hover:shadow-md hover:border-teal-500/40 transition-all flex flex-col justify-between group"
                  >
                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-teal-100 dark:bg-teal-950 text-teal-800 dark:text-teal-300 border border-teal-200 dark:border-teal-800 truncate">
                          {pack.disciplineName}
                        </span>
                        {pack.moduleNumber && (
                          <span className="text-[10px] font-bold text-slate-400">
                            Módulo {pack.moduleNumber}
                          </span>
                        )}
                      </div>

                      <div>
                        <h3 className="text-base font-serif font-bold text-slate-900 dark:text-white group-hover:text-teal-700 dark:group-hover:text-teal-300 transition-colors line-clamp-2">
                          {pack.title}
                        </h3>
                        {pack.subtitle && (
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">
                            {pack.subtitle}
                          </p>
                        )}
                      </div>

                      {/* Progress bar */}
                      <div className="space-y-1.5 pt-2">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-slate-500 font-medium">
                            {pack.answeredCount} de {pack.questions.length} questões resolvidas
                          </span>
                          <span className="font-bold text-slate-700 dark:text-slate-300">
                            {completionPercent}%
                          </span>
                        </div>
                        <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                          <div
                            className={`h-full transition-all duration-300 ${
                              isCompleted
                                ? 'bg-emerald-500'
                                : pack.answeredCount > 0
                                ? 'bg-teal-600'
                                : 'bg-transparent'
                            }`}
                            style={{ width: `${completionPercent}%` }}
                          />
                        </div>
                      </div>

                      {/* Accuracy badge if answered */}
                      {pack.answeredCount > 0 && (
                        <div className="flex items-center gap-2 text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                          <span>Taxa de acerto:</span>
                          <span
                            className={`px-1.5 py-0.5 rounded-md font-bold ${
                              pack.accuracyPercent >= 80
                                ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
                                : pack.accuracyPercent >= 60
                                ? 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300'
                                : 'bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300'
                            }`}
                          >
                            {pack.accuracyPercent}% ({pack.correctCount} acertos)
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="pt-4 mt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
                      {pack.compendiumId && (
                        <button
                          type="button"
                          onClick={() => onOpenCompendium(pack.compendiumId)}
                          className="px-2.5 py-1.5 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-teal-700 dark:hover:text-teal-300 flex items-center gap-1.5 transition-colors cursor-pointer"
                        >
                          <BookOpen className="w-3.5 h-3.5" />
                          <span>Ver Teoria</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => setSelectedPackId(pack.id)}
                        className="ml-auto inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs shadow-xs transition-colors cursor-pointer"
                      >
                        <Play className="w-3 h-3 fill-current" />
                        <span>Resolver Pack</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        /* ── Standard Raw List View ────────────────────────────────── */
        <div className="space-y-6">
          {/* Filter Bar */}
          <div className="p-4 rounded-3xl bg-white dark:bg-[#0F172A] border border-slate-200/80 dark:border-[#243452] shadow-sm space-y-4">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar por caso clínico, enunciado, instituição ou tag..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#142038] text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-teal-500"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
              {(['all', 'unanswered', 'incorrect', 'correct', 'bookmarked'] as const).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setSelectedStatus(st)}
                  className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition-all cursor-pointer ${
                    selectedStatus === st
                      ? 'bg-teal-700 text-white shadow-xs'
                      : 'bg-slate-50 dark:bg-[#142038] border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:border-teal-500'
                  }`}
                >
                  {st === 'all' && 'Todas'}
                  {st === 'unanswered' && 'Não Respondidas'}
                  {st === 'incorrect' && 'Erros'}
                  {st === 'correct' && 'Acertadas'}
                  {st === 'bookmarked' && 'Favoritas'}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-2 text-xs">
              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-500">Disciplina:</span>
                <select
                  value={selectedDiscipline}
                  onChange={(e) => setSelectedDiscipline(e.target.value)}
                  className="p-1.5 rounded-lg border border-slate-200 dark:border-[#243452] bg-slate-50 dark:bg-[#142038] text-slate-800 dark:text-slate-200 font-medium focus:outline-none"
                >
                  <option value="all">Todas as Disciplinas</option>
                  {disciplines.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-500">Tema:</span>
                <select
                  value={selectedTheme}
                  onChange={(e) => setSelectedTheme(e.target.value)}
                  className="p-1.5 rounded-lg border border-slate-200 dark:border-[#243452] bg-slate-50 dark:bg-[#142038] text-slate-800 dark:text-slate-200 font-medium focus:outline-none max-w-xs truncate"
                >
                  <option value="all">Todos os Temas</option>
                  {themes
                    .filter((t) => selectedDiscipline === 'all' || t.disciplineId === selectedDiscipline)
                    .map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                </select>
              </div>

              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-500">Dificuldade:</span>
                <select
                  value={selectedDifficulty}
                  onChange={(e) => setSelectedDifficulty(e.target.value)}
                  className="p-1.5 rounded-lg border border-slate-200 dark:border-[#243452] bg-slate-50 dark:bg-[#142038] text-slate-800 dark:text-slate-200 font-medium focus:outline-none"
                >
                  <option value="all">Todas</option>
                  <option value="facil">Fácil</option>
                  <option value="medio">Média</option>
                  <option value="dificil">Difícil</option>
                </select>
              </div>
            </div>
          </div>

          {/* Results count */}
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 px-2">
            <span>
              Exibindo <strong className="text-slate-800 dark:text-slate-200">{filteredQuestions.length} questões</strong>
            </span>
            <span className="text-teal-600 dark:text-teal-400 font-semibold">
              Modo Estudo: Responda para ver justificativa completa (+35 XP)
            </span>
          </div>

          {/* Questions Stack */}
          {filteredQuestions.length === 0 ? (
            <div className="bg-white dark:bg-[#0F172A] rounded-3xl border border-slate-200 dark:border-[#243452] p-12 text-center text-slate-500 dark:text-slate-400 space-y-2">
              <HelpCircle className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-600" />
              <p className="font-semibold text-sm text-slate-800 dark:text-slate-200">
                Nenhuma questão encontrada com estes filtros.
              </p>
              <p className="text-xs text-slate-400 dark:text-slate-500">
                Tente ajustar a disciplina ou o status selecionado.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {filteredQuestions.map((q) => (
                <QuestionCard
                  key={q.id}
                  question={q}
                  discipline={disciplines.find((d) => d.id === q.disciplineId)}
                  theme={themes.find((t) => t.id === q.themeId)}
                  compendiums={compendiums}
                  onOpenCompendium={onOpenCompendium}
                  hydrated={{
                    answer: answers[q.id] ?? null,
                    bookmarked: bookmarks.questions.includes(q.id),
                    reaction: reactions[q.id] ?? null,
                  }}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
