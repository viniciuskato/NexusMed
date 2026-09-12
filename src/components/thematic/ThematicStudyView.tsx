import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  Compass,
  Search,
  BookOpen,
  HelpCircle,
  Layers,
  Sparkles,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  Flame,
  Brain,
  ExternalLink,
  ChevronRight,
  Bookmark,
  Check,
  RotateCcw,
} from 'lucide-react';
import {
  Discipline,
  Theme,
  Compendium,
  Question,
  Flashcard,
  QuestionAnswerRecord,
} from '../../types';
import { readingProgressRepository } from '../../repositories/ReadingProgressRepository';
import { isCardDueToday } from '../../services/srsAlgorithm';
import { useScrollMemory } from '../../hooks/useScrollMemory';
import { QuestionCard } from '../questions/QuestionCard';

export interface ThematicPack {
  id: string;
  sourceType: 'compendium' | 'theme' | 'orphan';
  compendiumId?: string;
  compendium?: Compendium;
  themeId?: string;
  theme?: Theme;
  disciplineId: string;
  disciplineName: string;
  title: string;
  subtitle?: string;
  moduleNumber?: number;
  highYield?: boolean;
  questions: Question[];
  flashcards: Flashcard[];
  readPercent: number;
  readSectionIds: string[];
  answeredCount: number;
  correctCount: number;
  accuracyPercent: number;
  dueCards: Flashcard[];
  masteredCards: Flashcard[];
  isCompleted: boolean;
  isUnstarted: boolean;
}

interface ThematicStudyViewProps {
  disciplines: Discipline[];
  themes: Theme[];
  compendiums: Compendium[];
  questions: Question[];
  flashcards: Flashcard[];
  answers: Record<string, QuestionAnswerRecord>;
  loading?: boolean;
  onOpenCompendium: (compendiumId: string, sectionId?: string) => void;
  onOpenQuestionsForTheme: (themeId: string, compendiumId?: string) => void;
  onOpenFlashcardsForTheme: (themeId: string, compendiumId?: string) => void;
  onStartSRS?: (cards: Flashcard[]) => void;
  onAnswerRecorded?: (record: QuestionAnswerRecord) => void;
  onUpdate?: () => void;
}

export const ThematicStudyView: React.FC<ThematicStudyViewProps> = ({
  disciplines,
  themes,
  compendiums,
  questions,
  flashcards,
  answers,
  loading = false,
  onOpenCompendium,
  onOpenQuestionsForTheme,
  onOpenFlashcardsForTheme,
  onStartSRS,
  onAnswerRecorded,
  onUpdate,
}) => {
  useScrollMemory('thematic_study');

  // Selected pack state com persistência para reload seguro
  const [selectedPackId, setSelectedPackId] = useState<string | null>(() => {
    try {
      return localStorage.getItem('nexusmed_thematic_pack_id');
    } catch {
      return null;
    }
  });

  // Salva ou remove o pack selecionado no localStorage
  useEffect(() => {
    try {
      if (selectedPackId) {
        localStorage.setItem('nexusmed_thematic_pack_id', selectedPackId);
      } else {
        localStorage.removeItem('nexusmed_thematic_pack_id');
      }
    } catch {
      // Ignora erro de storage
    }
  }, [selectedPackId]);

  // Aba ativa dentro do pack selecionado
  const [activePackTab, setActivePackTab] = useState<'overview' | 'reading' | 'questions' | 'flashcards'>('overview');

  // Filtros da listagem de packs
  const [selectedDiscipline, setSelectedDiscipline] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'due' | 'unstarted' | 'completed'>('all');

  // Progresso de leitura em tempo real
  const [readingProgress, setReadingProgress] = useState<
    Record<string, { readSectionIds: string[]; percent: number }>
  >({});

  // Flipped card IDs para visualização interna de flashcards
  const [flippedCardIds, setFlippedCardIds] = useState<string[]>([]);

  // Filtros internos da aba de questões do pack
  const [questionFilterStatus, setQuestionFilterStatus] = useState<'all' | 'unanswered' | 'incorrect' | 'correct'>('all');

  // Filtros internos da aba de flashcards do pack
  const [flashcardFilterStatus, setFlashcardFilterStatus] = useState<'all' | 'due' | 'learning' | 'mastered'>('all');

  // Carrega o progresso de leitura
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const progress = await readingProgressRepository.getReadingProgress();
        if (!cancelled) setReadingProgress(progress);
      } catch {
        // Fallback gracioso
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Construção determinística dos packs a partir dos dados reais
  const packs = useMemo<ThematicPack[]>(() => {
    // 1. Packs baseados em compêndios (materiais da biblioteca)
    const compendiumPacks: ThematicPack[] = compendiums.map((c) => {
      const theme = themes.find((t) => t.id === c.themeId);
      const discipline = disciplines.find((d) => d.id === c.disciplineId);

      // Questões vinculadas ao material ou ao tema correspondente
      const packQuestions = questions.filter(
        (q) => q.compendiumRefId === c.id || (!q.compendiumRefId && q.themeId === c.themeId)
      );

      // Flashcards vinculados ao material ou ao tema correspondente
      const packFlashcards = flashcards.filter(
        (f) => f.compendiumRefId === c.id || (!f.compendiumRefId && f.themeId === c.themeId)
      );

      const prog = readingProgress[c.id] || { readSectionIds: [], percent: 0 };
      const readPercent = prog.percent || 0;
      const readSectionIds = prog.readSectionIds || [];

      const answered = packQuestions.filter((q) => !!answers[q.id]);
      const correct = answered.filter((q) => answers[q.id]?.isCorrect);
      const accuracy = answered.length > 0 ? Math.round((correct.length / answered.length) * 100) : 0;

      const due = packFlashcards.filter((fc) => isCardDueToday(fc));
      const mastered = packFlashcards.filter((fc) => fc.srs?.state === 'mastered');

      const isCompleted =
        readPercent >= 100 &&
        (packQuestions.length === 0 || answered.length === packQuestions.length) &&
        (packFlashcards.length === 0 || mastered.length === packFlashcards.length);

      const isUnstarted =
        readPercent === 0 &&
        answered.length === 0 &&
        packFlashcards.every((card) => !card.srs?.lastReviewedDate);

      return {
        id: c.id,
        sourceType: 'compendium',
        compendiumId: c.id,
        compendium: c,
        themeId: c.themeId,
        theme,
        disciplineId: c.disciplineId,
        disciplineName: discipline?.name || 'Clínica Geral',
        title: c.title,
        subtitle: c.subtitle || theme?.description,
        moduleNumber: c.moduleNumber,
        highYield: theme?.highYield,
        questions: packQuestions,
        flashcards: packFlashcards,
        readPercent,
        readSectionIds,
        answeredCount: answered.length,
        correctCount: correct.length,
        accuracyPercent: accuracy,
        dueCards: due,
        masteredCards: mastered,
        isCompleted,
        isUnstarted,
      };
    });

    // 2. Temas que não possuem compêndio associado mas têm conteúdo
    const coveredThemeIds = new Set(compendiums.map((c) => c.themeId));
    const orphanThemes = themes.filter((t) => !coveredThemeIds.has(t.id));

    const themePacks: ThematicPack[] = orphanThemes.map((theme) => {
      const discipline = disciplines.find((d) => d.id === theme.disciplineId);
      const packQuestions = questions.filter((q) => q.themeId === theme.id);
      const packFlashcards = flashcards.filter((f) => f.themeId === theme.id);

      const answered = packQuestions.filter((q) => !!answers[q.id]);
      const correct = answered.filter((q) => answers[q.id]?.isCorrect);
      const accuracy = answered.length > 0 ? Math.round((correct.length / answered.length) * 100) : 0;

      const due = packFlashcards.filter((fc) => isCardDueToday(fc));
      const mastered = packFlashcards.filter((fc) => fc.srs?.state === 'mastered');

      const isCompleted =
        (packQuestions.length === 0 || answered.length === packQuestions.length) &&
        (packFlashcards.length === 0 || mastered.length === packFlashcards.length);

      const isUnstarted =
        answered.length === 0 && packFlashcards.every((card) => !card.srs?.lastReviewedDate);

      return {
        id: `theme-${theme.id}`,
        sourceType: 'theme',
        themeId: theme.id,
        theme,
        disciplineId: theme.disciplineId,
        disciplineName: discipline?.name || 'Clínica Médica',
        title: theme.name,
        subtitle: theme.description,
        highYield: theme.highYield,
        questions: packQuestions,
        flashcards: packFlashcards,
        readPercent: 0,
        readSectionIds: [],
        answeredCount: answered.length,
        correctCount: correct.length,
        accuracyPercent: accuracy,
        dueCards: due,
        masteredCards: mastered,
        isCompleted,
        isUnstarted,
      };
    });

    // 3. Questões e cards sem material e sem tema
    const allPackQuestionIds = new Set([
      ...compendiumPacks.flatMap((p) => p.questions.map((q) => q.id)),
      ...themePacks.flatMap((p) => p.questions.map((q) => q.id)),
    ]);
    const unlinkedQuestions = questions.filter((q) => !allPackQuestionIds.has(q.id));

    const allPackCardIds = new Set([
      ...compendiumPacks.flatMap((p) => p.flashcards.map((c) => c.id)),
      ...themePacks.flatMap((p) => p.flashcards.map((c) => c.id)),
    ]);
    const unlinkedCards = flashcards.filter((c) => !allPackCardIds.has(c.id));

    const unlinkedPacks: ThematicPack[] = [];

    if (unlinkedQuestions.length > 0) {
      const answered = unlinkedQuestions.filter((q) => !!answers[q.id]);
      const correct = answered.filter((q) => answers[q.id]?.isCorrect);
      const accuracy = answered.length > 0 ? Math.round((correct.length / answered.length) * 100) : 0;
      unlinkedPacks.push({
        id: 'pack-unlinked-questions',
        sourceType: 'orphan',
        disciplineId: 'general',
        disciplineName: 'Geral',
        title: 'Sem Material Associado — Questões',
        subtitle: 'Questões complementares disponíveis para prática sem compêndio direto.',
        questions: unlinkedQuestions,
        flashcards: [],
        readPercent: 0,
        readSectionIds: [],
        answeredCount: answered.length,
        correctCount: correct.length,
        accuracyPercent: accuracy,
        dueCards: [],
        masteredCards: [],
        isCompleted: answered.length === unlinkedQuestions.length,
        isUnstarted: answered.length === 0,
      });
    }

    if (unlinkedCards.length > 0) {
      const due = unlinkedCards.filter((fc) => isCardDueToday(fc));
      const mastered = unlinkedCards.filter((fc) => fc.srs?.state === 'mastered');
      unlinkedPacks.push({
        id: 'pack-unlinked-cards',
        sourceType: 'orphan',
        disciplineId: 'general',
        disciplineName: 'Geral',
        title: 'Meus Cards — Sem Material Associado',
        subtitle: 'Cards personalizados criados pelo usuário ou avulsos.',
        questions: [],
        flashcards: unlinkedCards,
        readPercent: 0,
        readSectionIds: [],
        answeredCount: 0,
        correctCount: 0,
        accuracyPercent: 0,
        dueCards: due,
        masteredCards: mastered,
        isCompleted: mastered.length === unlinkedCards.length,
        isUnstarted: unlinkedCards.every((card) => !card.srs?.lastReviewedDate),
      });
    }

    return [...compendiumPacks, ...themePacks, ...unlinkedPacks];
  }, [compendiums, themes, disciplines, questions, flashcards, answers, readingProgress]);

  // Pack atualmente selecionado
  const currentPack = useMemo(() => {
    if (!selectedPackId) return null;
    return packs.find((p) => p.id === selectedPackId) || null;
  }, [packs, selectedPackId]);

  // Alternar leitura de seção diretamente no pack
  const handleToggleSectionRead = useCallback(
    async (compendiumId: string, sectionId: string) => {
      try {
        const comp = compendiums.find((c) => c.id === compendiumId);
        const total = comp?.sections?.length || 1;
        const newPercent = await readingProgressRepository.toggleSectionRead(compendiumId, sectionId, total);
        const latestProgress = await readingProgressRepository.getReadingProgress();
        setReadingProgress((prev) => ({
          ...prev,
          [compendiumId]: latestProgress[compendiumId] || {
            readSectionIds: (prev[compendiumId]?.readSectionIds || []).includes(sectionId)
              ? (prev[compendiumId]?.readSectionIds || []).filter((id) => id !== sectionId)
              : [...(prev[compendiumId]?.readSectionIds || []), sectionId],
            percent: newPercent,
          },
        }));
        if (onUpdate) onUpdate();
      } catch {
        // Fallback
      }
    },
    [compendiums, onUpdate]
  );

  // Filtragem da listagem de packs
  const filteredPacks = useMemo(() => {
    return packs.filter((pack) => {
      if (selectedDiscipline !== 'all' && pack.disciplineId !== selectedDiscipline) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesTitle = pack.title.toLowerCase().includes(q);
        const matchesSub = (pack.subtitle || '').toLowerCase().includes(q);
        const matchesDisc = pack.disciplineName.toLowerCase().includes(q);
        const matchesModule = pack.moduleNumber ? `módulo ${pack.moduleNumber}`.includes(q) : false;
        if (!matchesTitle && !matchesSub && !matchesDisc && !matchesModule) {
          return false;
        }
      }
      if (filterMode === 'due' && pack.dueCards.length === 0) {
        return false;
      }
      if (filterMode === 'unstarted' && !pack.isUnstarted) {
        return false;
      }
      if (filterMode === 'completed' && !pack.isCompleted) {
        return false;
      }
      return true;
    });
  }, [packs, selectedDiscipline, searchQuery, filterMode]);

  // Estatísticas agregadas
  const totalPacksCount = packs.length;
  const completedPacksCount = packs.filter((p) => p.isCompleted).length;
  const totalDueCards = packs.reduce((acc, p) => acc + p.dueCards.length, 0);

  // Manipulador de flip dos flashcards
  const toggleFlip = (id: string) => {
    setFlippedCardIds((prev) =>
      prev.includes(id) ? prev.filter((cid) => cid !== id) : [...prev, id]
    );
  };

  // Se estiver carregando inicialmente e não tiver dados, mostra tela de carregamento útil
  if (loading && packs.length === 0) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-40 rounded-3xl bg-slate-100 dark:bg-slate-800" />
        <div className="h-16 rounded-2xl bg-slate-100 dark:bg-slate-800" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="h-48 rounded-2xl bg-slate-100 dark:bg-slate-800" />
          <div className="h-48 rounded-2xl bg-slate-100 dark:bg-slate-800" />
        </div>
      </div>
    );
  }

  // =========================================================================
  // VISÃO DETALHADA DO PACK (Quando um pack está aberto)
  // =========================================================================
  if (currentPack) {
    const comp = currentPack.compendium;
    const packQuestions = currentPack.questions;
    const packFlashcards = currentPack.flashcards;

    // Questões filtradas por status dentro do pack
    const filteredPackQuestions = packQuestions.filter((q) => {
      const ans = answers[q.id];
      if (questionFilterStatus === 'unanswered') return !ans;
      if (questionFilterStatus === 'incorrect') return !!ans && !ans.isCorrect;
      if (questionFilterStatus === 'correct') return !!ans && ans.isCorrect;
      return true;
    });

    // Flashcards filtrados dentro do pack
    const filteredPackFlashcards = packFlashcards.filter((fc) => {
      if (flashcardFilterStatus === 'due') return isCardDueToday(fc);
      if (flashcardFilterStatus === 'learning') return fc.srs?.state === 'learning' || fc.srs?.state === 'new';
      if (flashcardFilterStatus === 'mastered') return fc.srs?.state === 'mastered';
      return true;
    });

    return (
      <div className="space-y-6">
        {/* Barra superior de retorno */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setSelectedPackId(null)}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 hover:text-teal-600 dark:hover:text-teal-400 text-xs font-semibold transition-colors cursor-pointer elev-xs"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Voltar para Lista de Packs</span>
          </button>

          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-teal-50 dark:bg-teal-950/60 text-teal-800 dark:text-teal-300 border border-teal-200/60 dark:border-teal-800/60">
              {currentPack.disciplineName}
            </span>
            {currentPack.moduleNumber && (
              <span className="text-[11px] font-mono font-bold px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                Módulo {currentPack.moduleNumber}
              </span>
            )}
            {currentPack.highYield && (
              <span className="text-[11px] font-bold px-2 py-1 rounded-lg bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200/60 dark:border-amber-800/60 flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-amber-500" />
                Alto Rendimento
              </span>
            )}
          </div>
        </div>

        {/* Header do Pack Integrado */}
        <div className="bg-gradient-to-r from-teal-950 via-slate-900 to-slate-950 rounded-3xl p-6 sm:p-8 text-white border border-teal-800/30 elev-sm space-y-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs text-teal-400 font-semibold uppercase tracking-wider">
              <Compass className="w-3.5 h-3.5" />
              <span>Pack de Estudo Temático Integrado</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight font-serif-reading">
              {currentPack.title}
            </h1>
            {currentPack.subtitle && (
              <p className="text-slate-300 text-xs sm:text-sm leading-relaxed max-w-4xl">
                {currentPack.subtitle}
              </p>
            )}
          </div>

          {/* Progresso Integrado nos 3 Pilares */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-white/10">
            <div className="p-3.5 rounded-2xl bg-white/10 backdrop-blur-md border border-white/10 flex items-center justify-between">
              <div>
                <span className="text-[10px] uppercase font-bold text-teal-300 tracking-wider block">
                  1. Leitura Teórica
                </span>
                <span className="text-lg font-extrabold tabular-nums">
                  {currentPack.readPercent}%
                </span>
                <span className="text-[10px] text-slate-300 block">
                  {comp?.sections ? `${currentPack.readSectionIds.length}/${comp.sections.length} seções lidas` : 'Sem compêndio'}
                </span>
              </div>
              <BookOpen className="w-7 h-7 text-teal-400 opacity-60" />
            </div>

            <div className="p-3.5 rounded-2xl bg-white/10 backdrop-blur-md border border-white/10 flex items-center justify-between">
              <div>
                <span className="text-[10px] uppercase font-bold text-teal-300 tracking-wider block">
                  2. Questões
                </span>
                <span className="text-lg font-extrabold tabular-nums">
                  {currentPack.answeredCount}/{packQuestions.length}
                </span>
                <span className="text-[10px] text-slate-300 block">
                  {packQuestions.length > 0 ? `${currentPack.accuracyPercent}% de acerto` : 'Nenhuma questão'}
                </span>
              </div>
              <HelpCircle className="w-7 h-7 text-teal-400 opacity-60" />
            </div>

            <div className="p-3.5 rounded-2xl bg-white/10 backdrop-blur-md border border-white/10 flex items-center justify-between">
              <div>
                <span className="text-[10px] uppercase font-bold text-teal-300 tracking-wider block">
                  3. Flashcards SRS
                </span>
                <span className="text-lg font-extrabold tabular-nums">
                  {packFlashcards.length} cards
                </span>
                <span className="text-[10px] text-slate-300 block">
                  {currentPack.dueCards.length > 0 ? (
                    <span className="text-amber-300 font-bold">{currentPack.dueCards.length} pendentes hoje</span>
                  ) : (
                    <span>{currentPack.masteredCards.length} dominados</span>
                  )}
                </span>
              </div>
              <Layers className="w-7 h-7 text-teal-400 opacity-60" />
            </div>
          </div>
        </div>

        {/* Navegação por Abas do Pack */}
        <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-2 overflow-x-auto no-scrollbar">
          <button
            type="button"
            onClick={() => setActivePackTab('overview')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 shrink-0 ${
              activePackTab === 'overview'
                ? 'bg-slate-900 dark:bg-teal-600 text-white elev-xs'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#142038]'
            }`}
          >
            <Compass className="w-3.5 h-3.5" />
            <span>Visão Geral</span>
          </button>

          <button
            type="button"
            onClick={() => setActivePackTab('reading')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 shrink-0 ${
              activePackTab === 'reading'
                ? 'bg-slate-900 dark:bg-teal-600 text-white elev-xs'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#142038]'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>Leitura ({comp?.sections?.length || 0})</span>
            {currentPack.readPercent > 0 && (
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-teal-500/20 text-teal-300">
                {currentPack.readPercent}%
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActivePackTab('questions')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 shrink-0 ${
              activePackTab === 'questions'
                ? 'bg-slate-900 dark:bg-teal-600 text-white elev-xs'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#142038]'
            }`}
          >
            <HelpCircle className="w-3.5 h-3.5" />
            <span>Questões ({packQuestions.length})</span>
            {currentPack.answeredCount > 0 && (
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-teal-500/20 text-teal-300">
                {currentPack.answeredCount}/{packQuestions.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActivePackTab('flashcards')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 shrink-0 ${
              activePackTab === 'flashcards'
                ? 'bg-slate-900 dark:bg-teal-600 text-white elev-xs'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#142038]'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Flashcards ({packFlashcards.length})</span>
            {currentPack.dueCards.length > 0 && (
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-amber-500 text-slate-950 font-bold">
                {currentPack.dueCards.length} hoje
              </span>
            )}
          </button>
        </div>

        {/* CONTEÚDO DA ABA: VISÃO GERAL */}
        {activePackTab === 'overview' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {/* Card 1: Leitura Teórica */}
              <div className="bg-white dark:bg-[#0F172A] rounded-3xl border border-slate-200 dark:border-[#243452] p-6 elev-xs flex flex-col justify-between gap-4">
                <div className="space-y-3">
                  <div className="w-10 h-10 rounded-2xl bg-teal-50 dark:bg-teal-950/60 text-teal-600 dark:text-teal-400 flex items-center justify-center">
                    <BookOpen className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                      1. Fisiopatologia e Leitura
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      {comp
                        ? `${comp.sections.length} seções clínicas • ${comp.estimatedReadTimeMinutes} min de leitura estimada.`
                        : 'Compêndio teórico em preparação editorial.'}
                    </p>
                  </div>
                  {comp && (
                    <div className="space-y-1 pt-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-500 dark:text-slate-400">Progresso</span>
                        <span className="font-bold text-teal-700 dark:text-teal-300">{currentPack.readPercent}%</span>
                      </div>
                      <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                        <div
                          className="h-full bg-teal-500 rounded-full transition-all duration-300"
                          style={{ width: `${currentPack.readPercent}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>

                <div className="space-y-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setActivePackTab('reading')}
                    className="w-full py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-teal-600 dark:hover:bg-teal-700 text-white text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
                  >
                    <span>{currentPack.readPercent > 0 ? 'Continuar Leitura' : 'Iniciar Leitura'}</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>

                  {comp && (
                    <button
                      type="button"
                      onClick={() => onOpenCompendium(comp.id)}
                      className="w-full py-2 px-3 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60 text-xs font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <span>Abrir no Leitor Tela Cheia</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Card 2: Questões Comentadas */}
              <div className="bg-white dark:bg-[#0F172A] rounded-3xl border border-slate-200 dark:border-[#243452] p-6 elev-xs flex flex-col justify-between gap-4">
                <div className="space-y-3">
                  <div className="w-10 h-10 rounded-2xl bg-teal-50 dark:bg-teal-950/60 text-teal-600 dark:text-teal-400 flex items-center justify-center">
                    <HelpCircle className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                      2. Pack de Questões
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      {packQuestions.length > 0
                        ? `${packQuestions.length} questões reais de residência comentadas com gabarito fundamentado.`
                        : 'Novas questões deste tema em catalogação.'}
                    </p>
                  </div>
                  {packQuestions.length > 0 && (
                    <div className="space-y-1 pt-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-500 dark:text-slate-400">
                          {currentPack.answeredCount} respondidas
                        </span>
                        <span className="font-bold text-slate-900 dark:text-white">
                          {currentPack.accuracyPercent}% de acerto
                        </span>
                      </div>
                      <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                        <div
                          className="h-full bg-teal-500 rounded-full transition-all duration-300"
                          style={{
                            width: `${(currentPack.answeredCount / packQuestions.length) * 100}%`,
                          }}
                        />
                      </div>
                    </div>
                  )}
                </div>

                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => setActivePackTab('questions')}
                    disabled={packQuestions.length === 0}
                    className={`w-full py-2.5 px-4 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer ${
                      packQuestions.length > 0
                        ? 'bg-slate-900 hover:bg-slate-800 dark:bg-teal-600 dark:hover:bg-teal-700 text-white'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-400 cursor-not-allowed'
                    }`}
                  >
                    <span>Praticar Questões ({packQuestions.length})</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Card 3: Flashcards SRS */}
              <div className="bg-white dark:bg-[#0F172A] rounded-3xl border border-slate-200 dark:border-[#243452] p-6 elev-xs flex flex-col justify-between gap-4">
                <div className="space-y-3">
                  <div className="w-10 h-10 rounded-2xl bg-teal-50 dark:bg-teal-950/60 text-teal-600 dark:text-teal-400 flex items-center justify-center">
                    <Layers className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                      3. Deck de Flashcards SRS
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      {packFlashcards.length > 0
                        ? `${packFlashcards.length} cartões com algoritmo de repetição espaçada SM-2.`
                        : 'Cards temáticos em preparação editorial.'}
                    </p>
                  </div>
                  {packFlashcards.length > 0 && (
                    <div className="space-y-1 pt-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-500 dark:text-slate-400">
                          {currentPack.dueCards.length > 0 ? (
                            <span className="text-amber-600 dark:text-amber-400 font-bold flex items-center gap-1">
                              <Flame className="w-3.5 h-3.5" />
                              {currentPack.dueCards.length} para hoje
                            </span>
                          ) : (
                            <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                              Em dia
                            </span>
                          )}
                        </span>
                        <span className="font-bold text-slate-900 dark:text-white">
                          {currentPack.masteredCards.length} dominados
                        </span>
                      </div>
                      <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                        <div
                          className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                          style={{
                            width: `${(currentPack.masteredCards.length / packFlashcards.length) * 100}%`,
                          }}
                        />
                      </div>
                    </div>
                  )}
                </div>

                <div className="space-y-2 pt-2">
                  {currentPack.dueCards.length > 0 && onStartSRS ? (
                    <button
                      type="button"
                      onClick={() => onStartSRS(currentPack.dueCards)}
                      className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 text-xs font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer"
                    >
                      <Brain className="w-4 h-4" />
                      <span>Revisar Cards Hoje ({currentPack.dueCards.length})</span>
                    </button>
                  ) : null}

                  <button
                    type="button"
                    onClick={() => setActivePackTab('flashcards')}
                    disabled={packFlashcards.length === 0}
                    className={`w-full py-2.5 px-4 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer ${
                      packFlashcards.length > 0
                        ? 'bg-slate-900 hover:bg-slate-800 dark:bg-teal-600 dark:hover:bg-teal-700 text-white'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-400 cursor-not-allowed'
                    }`}
                  >
                    <span>Ver Flashcards ({packFlashcards.length})</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* Referências e Metadados do Compêndio */}
            {comp && comp.references && comp.references.length > 0 && (
              <div className="bg-white dark:bg-[#0F172A] rounded-3xl border border-slate-200 dark:border-[#243452] p-6 elev-xs space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <Bookmark className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                  <span>Fontes Curadas & Evidências Clínicas</span>
                </h4>
                <ul className="space-y-1.5 text-xs text-slate-600 dark:text-slate-300">
                  {comp.references.map((ref, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <span className="text-teal-600 dark:text-teal-400 font-bold">•</span>
                      <span>{ref}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* CONTEÚDO DA ABA: LEITURA INTEGRADA */}
        {activePackTab === 'reading' && (
          <div className="space-y-6">
            {comp ? (
              <div className="space-y-4">
                <div className="bg-white dark:bg-[#0F172A] rounded-2xl border border-slate-200 dark:border-[#243452] p-4 flex items-center justify-between gap-3 elev-xs">
                  <div>
                    <span className="text-xs text-slate-500 dark:text-slate-400 block">
                      Progresso de leitura deste material:
                    </span>
                    <span className="font-bold text-sm text-teal-800 dark:text-teal-300">
                      {currentPack.readSectionIds.length} de {comp.sections.length} seções lidas ({currentPack.readPercent}%)
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => onOpenCompendium(comp.id)}
                    className="px-3.5 py-2 rounded-xl bg-teal-50 dark:bg-teal-950/60 hover:bg-teal-100 dark:hover:bg-teal-900 border border-teal-200 dark:border-teal-800 text-teal-800 dark:text-teal-300 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <span>Modo Leitor Imersivo</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Seções do Compêndio com Marcação de Lida */}
                <div className="space-y-4">
                  {comp.sections.map((section, idx) => {
                    const isRead = currentPack.readSectionIds.includes(section.id);
                    return (
                      <div
                        key={section.id}
                        className={`bg-white dark:bg-[#0F172A] rounded-3xl border transition-all p-6 elev-xs space-y-4 ${
                          isRead
                            ? 'border-teal-200 dark:border-teal-900/60'
                            : 'border-slate-200 dark:border-[#243452]'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-4 pb-3 border-b border-slate-100 dark:border-slate-800">
                          <div className="space-y-1">
                            <span className="text-[10px] font-bold text-teal-600 dark:text-teal-400 uppercase tracking-wider">
                              Seção {idx + 1} de {comp.sections.length}
                            </span>
                            <h3 className="text-base sm:text-lg font-bold font-serif-reading text-slate-900 dark:text-white">
                              {section.title}
                            </h3>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleToggleSectionRead(comp.id, section.id)}
                            className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                              isRead
                                ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-200 border border-emerald-300 dark:border-emerald-700'
                                : 'bg-slate-100 dark:bg-[#142038] text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-[#1A2845]'
                            }`}
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>{isRead ? 'Lido' : 'Marcar como Lido'}</span>
                          </button>
                        </div>

                        <div className="prose prose-sm dark:prose-invert max-w-none text-xs sm:text-sm text-slate-700 dark:text-slate-300 leading-relaxed font-serif-reading whitespace-pre-line">
                          {section.content}
                        </div>

                        {section.highYieldTakeaway && (
                          <div className="p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/50 text-amber-900 dark:text-amber-200 text-xs flex items-start gap-2.5">
                            <Sparkles className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                            <div>
                              <strong className="font-bold block text-amber-950 dark:text-amber-100">
                                Ponto Crítico de Residência:
                              </strong>
                              <span>{section.highYieldTakeaway}</span>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="bg-white dark:bg-[#0F172A] rounded-3xl border border-slate-200 dark:border-[#243452] p-12 text-center text-slate-500 dark:text-slate-400 space-y-3">
                <BookOpen className="w-10 h-10 mx-auto text-slate-300 dark:text-slate-600" />
                <p className="font-semibold text-sm text-slate-800 dark:text-slate-200">
                  Compêndio teórico em preparação editorial para este tema.
                </p>
                <p className="text-xs text-slate-400 dark:text-slate-500 max-w-md mx-auto">
                  Você já pode praticar o pack de questões de residência e o deck de flashcards SRS nas abas acima sem perder o foco.
                </p>
                <button
                  type="button"
                  onClick={() => setActivePackTab('questions')}
                  className="mt-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-semibold cursor-pointer"
                >
                  Ir para as Questões do Pack
                </button>
              </div>
            )}
          </div>
        )}

        {/* CONTEÚDO DA ABA: QUESTÕES DO PACK */}
        {activePackTab === 'questions' && (
          <div className="space-y-6">
            {packQuestions.length > 0 ? (
              <div className="space-y-4">
                {/* Filtros rápidos de status */}
                <div className="flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-[#0F172A] rounded-2xl border border-slate-200 dark:border-[#243452] p-3 elev-xs">
                  <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar text-xs">
                    {[
                      { id: 'all' as const, label: `Todas (${packQuestions.length})` },
                      { id: 'unanswered' as const, label: `Não Respondidas (${packQuestions.length - currentPack.answeredCount})` },
                      { id: 'incorrect' as const, label: `Erros (${currentPack.answeredCount - currentPack.correctCount})` },
                      { id: 'correct' as const, label: `Acertos (${currentPack.correctCount})` },
                    ].map((st) => (
                      <button
                        key={st.id}
                        type="button"
                        onClick={() => setQuestionFilterStatus(st.id)}
                        className={`px-3 py-1.5 rounded-xl font-semibold shrink-0 transition-all cursor-pointer ${
                          questionFilterStatus === st.id
                            ? 'bg-slate-900 dark:bg-teal-600 text-white elev-xs'
                            : 'bg-slate-100 dark:bg-[#142038] text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-[#1A2845]'
                        }`}
                      >
                        {st.label}
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="text-xs text-slate-500 font-medium hidden sm:inline">
                      {filteredPackQuestions.length} questões exibidas
                    </span>
                    {currentPack.themeId && (
                      <button
                        type="button"
                        onClick={() => onOpenQuestionsForTheme(currentPack.themeId!)}
                        className="text-xs font-semibold text-teal-600 dark:text-teal-400 hover:underline flex items-center gap-1 cursor-pointer"
                      >
                        <span>Banco Geral</span>
                        <ExternalLink className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Lista de Questões com QuestionCard */}
                <div className="space-y-5">
                  {filteredPackQuestions.map((q) => (
                    <QuestionCard
                      key={q.id}
                      question={q}
                      discipline={disciplines.find((d) => d.id === q.disciplineId)}
                      theme={themes.find((t) => t.id === q.themeId)}
                      compendiums={compendiums}
                      onOpenCompendium={onOpenCompendium}
                      onAnswerRecorded={(rec) => {
                        if (onAnswerRecorded) onAnswerRecorded(rec);
                        if (onUpdate) onUpdate();
                      }}
                    />
                  ))}
                </div>
              </div>
            ) : (
              <div className="bg-white dark:bg-[#0F172A] rounded-3xl border border-slate-200 dark:border-[#243452] p-12 text-center text-slate-500 dark:text-slate-400 space-y-3">
                <HelpCircle className="w-10 h-10 mx-auto text-slate-300 dark:text-slate-600" />
                <p className="font-semibold text-sm text-slate-800 dark:text-slate-200">
                  Nenhuma questão vinculada a este material no momento.
                </p>
                <p className="text-xs text-slate-400 dark:text-slate-500 max-w-md mx-auto">
                  As questões de residência para este tema estão sendo catalogadas. Você pode acessar todo o acervo geral em Recursos &gt; Questões.
                </p>
              </div>
            )}
          </div>
        )}

        {/* CONTEÚDO DA ABA: FLASHCARDS DO PACK */}
        {activePackTab === 'flashcards' && (
          <div className="space-y-6">
            {packFlashcards.length > 0 ? (
              <div className="space-y-4">
                {/* Header de Ação dos Flashcards */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white dark:bg-[#0F172A] rounded-2xl border border-slate-200 dark:border-[#243452] p-4 elev-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-xs text-slate-900 dark:text-white">
                      {packFlashcards.length} cards no pack
                    </span>
                    {currentPack.dueCards.length > 0 && (
                      <span className="px-2 py-0.5 rounded-md bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 font-bold text-[11px] flex items-center gap-1">
                        <Flame className="w-3 h-3 text-amber-500" />
                        {currentPack.dueCards.length} pendentes hoje
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {onStartSRS && (
                      <button
                        type="button"
                        onClick={() => onStartSRS(packFlashcards)}
                        className="px-4 py-2 bg-gradient-to-r from-teal-600 to-teal-700 hover:from-teal-500 hover:to-teal-600 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-xs"
                      >
                        <Brain className="w-3.5 h-3.5" />
                        <span>Iniciar Sessão SRS</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Filtros de Status dos Cards */}
                <div className="flex flex-wrap items-center justify-between gap-3 pb-1">
                  <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar text-xs">
                    {[
                      { id: 'all' as const, label: `Todos (${packFlashcards.length})` },
                      { id: 'due' as const, label: `A Revisar Hoje (${currentPack.dueCards.length})` },
                      { id: 'learning' as const, label: 'Em Aprendizado' },
                      { id: 'mastered' as const, label: `Dominados (${currentPack.masteredCards.length})` },
                    ].map((st) => (
                      <button
                        key={st.id}
                        type="button"
                        onClick={() => setFlashcardFilterStatus(st.id)}
                        className={`px-3 py-1.5 rounded-xl font-semibold shrink-0 transition-all cursor-pointer ${
                          flashcardFilterStatus === st.id
                            ? 'bg-slate-900 dark:bg-teal-600 text-white elev-xs'
                            : 'bg-slate-100 dark:bg-[#142038] text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-[#1A2845]'
                        }`}
                      >
                        {st.label}
                      </button>
                    ))}
                  </div>

                  {currentPack.themeId && (
                    <button
                      type="button"
                      onClick={() => onOpenFlashcardsForTheme(currentPack.themeId!)}
                      className="text-xs font-semibold text-teal-600 dark:text-teal-400 hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <span>Deck Geral</span>
                      <ExternalLink className="w-3 h-3" />
                    </button>
                  )}
                </div>

                {/* Grid Interativo de Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {filteredPackFlashcards.map((card) => {
                    const isFlipped = flippedCardIds.includes(card.id);
                    const isDue = isCardDueToday(card);
                    return (
                      <button
                        key={card.id}
                        type="button"
                        onClick={() => toggleFlip(card.id)}
                        className="w-full text-left bg-white dark:bg-[#0F172A] rounded-3xl border border-slate-200 dark:border-[#243452] p-5 elev-xs transition-all hover:border-teal-400 dark:hover:border-teal-600 cursor-pointer flex flex-col justify-between min-h-[220px]"
                      >
                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                              {isFlipped ? 'Verso (Resposta & Mecanismo)' : 'Frente (Pergunta)'}
                            </span>
                            {isDue ? (
                              <span className="px-2 py-0.5 rounded-md bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 font-bold text-[10px] flex items-center gap-1">
                                <Flame className="w-3 h-3 text-amber-500" />
                                Revisão Pendente
                              </span>
                            ) : card.srs?.state === 'mastered' ? (
                              <span className="px-2 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 font-bold text-[10px] flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                                Dominado
                              </span>
                            ) : null}
                          </div>

                          <div className="font-serif-reading text-sm sm:text-base text-slate-900 dark:text-slate-100 leading-relaxed font-semibold pt-1">
                            {isFlipped ? card.back : card.front}
                          </div>

                          {isFlipped && card.mechanismHighlight && (
                            <div className="mt-3 p-3 rounded-xl bg-teal-50 dark:bg-teal-950/40 border border-teal-200/80 dark:border-teal-800/40 text-teal-900 dark:text-teal-200 text-xs">
                              <strong className="font-bold block text-[11px] uppercase tracking-wider text-teal-800 dark:text-teal-300 mb-0.5">
                                Mecanismo Patológico:
                              </strong>
                              <span>{card.mechanismHighlight}</span>
                            </div>
                          )}
                        </div>

                        <div className="pt-4 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
                          <span className="flex items-center gap-1 text-[11px]">
                            <RotateCcw className="w-3 h-3" />
                            Clique para virar
                          </span>
                          <span className="text-[10px] font-mono">
                            Intervalo: {card.srs?.intervalDays || 0}d
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="bg-white dark:bg-[#0F172A] rounded-3xl border border-slate-200 dark:border-[#243452] p-12 text-center text-slate-500 dark:text-slate-400 space-y-3">
                <Layers className="w-10 h-10 mx-auto text-slate-300 dark:text-slate-600" />
                <p className="font-semibold text-sm text-slate-800 dark:text-slate-200">
                  Nenhum flashcard vinculado a este tema no momento.
                </p>
                <p className="text-xs text-slate-400 dark:text-slate-500 max-w-md mx-auto">
                  Você pode criar novos flashcards ou praticar outros decks disponíveis em Recursos &gt; Cards.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // =========================================================================
  // LISTA GERAL DE PACKS DE ESTUDO TEMÁTICO
  // =========================================================================
  return (
    <div className="space-y-6">
      {/* Hero Header do Estudo Temático */}
      <div className="bg-gradient-to-r from-teal-900 via-slate-900 to-slate-950 rounded-3xl p-6 sm:p-8 text-white elev-sm flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 border border-teal-800/30">
        <div className="max-w-2xl space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-teal-500/20 text-teal-300 text-xs font-semibold border border-teal-400/30">
            <Compass className="w-3.5 h-3.5 text-teal-400" />
            <span>Trilha Integrada de Aprendizado</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
            Estudo Temático Coordenado
          </h1>
          <p className="text-slate-300 text-xs sm:text-sm leading-relaxed">
            Cada tema clínico reúne seu compêndio fisiopatológico de leitura, o pack de questões comentadas de residência e o deck de flashcards SRS. Estude a teoria, resolva as questões e fixe os pontos críticos sem trocar de contexto.
          </p>
        </div>

        {/* Métricas rápidas */}
        <div className="flex flex-wrap sm:flex-nowrap items-center gap-2.5 sm:gap-3 w-full lg:w-auto shrink-0">
          <div className="flex-1 sm:flex-initial px-4 py-3 rounded-2xl bg-white/10 backdrop-blur-md border border-white/10 text-center">
            <span className="text-[10px] uppercase font-bold text-teal-300 tracking-wider block">
              Packs
            </span>
            <span className="text-lg sm:text-xl font-extrabold tabular-nums">
              {completedPacksCount}/{totalPacksCount}
            </span>
            <span className="text-[10px] text-slate-300 block">completos</span>
          </div>

          <div className="flex-1 sm:flex-initial px-4 py-3 rounded-2xl bg-white/10 backdrop-blur-md border border-white/10 text-center">
            <span className="text-[10px] uppercase font-bold text-amber-300 tracking-wider block">
              Cards Hoje
            </span>
            <span className="text-lg sm:text-xl font-extrabold text-amber-400 tabular-nums">
              {totalDueCards}
            </span>
            <span className="text-[10px] text-slate-300 block">a revisar</span>
          </div>
        </div>
      </div>

      {/* Barra de Filtros e Busca */}
      <div className="bg-white dark:bg-[#0F172A] rounded-2xl border border-slate-200 dark:border-[#243452] p-4 elev-xs space-y-3">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          {/* Campo de Busca */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Pesquisar tema, patologia, droga ou disciplina..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 text-xs rounded-xl border border-slate-200 dark:border-[#243452] bg-slate-50 dark:bg-[#142038] focus:bg-white dark:focus:bg-[#1A2845] focus:outline-none focus:ring-2 focus:ring-teal-500 text-slate-900 dark:text-slate-100 placeholder:text-slate-400"
            />
          </div>

          {/* Filtros de Status */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1 md:pb-0 text-xs">
            {[
              { id: 'all', label: 'Todos os Packs' },
              { id: 'due', label: `Cards Hoje (${totalDueCards})` },
              { id: 'unstarted', label: 'Não Iniciados' },
              { id: 'completed', label: 'Concluídos' },
            ].map((st) => (
              <button
                key={st.id}
                type="button"
                onClick={() => setFilterMode(st.id as 'all' | 'due' | 'unstarted' | 'completed')}
                className={`px-3 py-1.5 rounded-xl font-semibold shrink-0 transition-all cursor-pointer ${
                  filterMode === st.id
                    ? 'bg-slate-900 dark:bg-teal-600 text-white elev-xs'
                    : 'bg-slate-100 dark:bg-[#142038] text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-[#1A2845]'
                }`}
              >
                {st.label}
              </button>
            ))}
          </div>
        </div>

        {/* Pílulas de Disciplina */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
          <button
            type="button"
            onClick={() => setSelectedDiscipline('all')}
            className={`px-3 py-1 rounded-lg text-xs font-semibold shrink-0 transition-colors cursor-pointer ${
              selectedDiscipline === 'all'
                ? 'bg-teal-100 dark:bg-teal-950 text-teal-900 dark:text-teal-200 border border-teal-300 dark:border-teal-700'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-[#142038]'
            }`}
          >
            Todas as Disciplinas ({packs.length})
          </button>
          {disciplines.map((disc) => {
            const discPacksCount = packs.filter((p) => p.disciplineId === disc.id).length;
            if (discPacksCount === 0) return null;
            return (
              <button
                key={disc.id}
                type="button"
                onClick={() => setSelectedDiscipline(disc.id)}
                className={`px-3 py-1 rounded-lg text-xs font-semibold shrink-0 transition-colors cursor-pointer flex items-center gap-1.5 ${
                  selectedDiscipline === disc.id
                    ? 'bg-teal-100 dark:bg-teal-950 text-teal-900 dark:text-teal-200 border border-teal-300 dark:border-teal-700'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-[#142038]'
                }`}
              >
                <span>{disc.name}</span>
                <span className="text-[10px] opacity-75">({discPacksCount})</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Lista de Cards dos Packs */}
      {filteredPacks.length === 0 ? (
        <div className="bg-white dark:bg-[#0F172A] rounded-3xl border border-slate-200 dark:border-[#243452] p-12 text-center text-slate-500 dark:text-slate-400 space-y-2">
          <AlertCircle className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-600" />
          <p className="font-semibold text-sm text-slate-800 dark:text-slate-200">
            Nenhum pack encontrado com estes filtros.
          </p>
          <p className="text-xs text-slate-400 dark:text-slate-500">
            Ajuste os termos de busca ou selecione outra disciplina.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
          {filteredPacks.map((pack) => {
            return (
              <div
                key={pack.id}
                className="bg-white dark:bg-[#0F172A] rounded-3xl border border-slate-200 dark:border-[#243452] p-5 sm:p-6 elev-xs transition-all hover:border-teal-400 dark:hover:border-teal-600 flex flex-col justify-between gap-4"
              >
                <div className="space-y-3">
                  {/* Tags e Badges */}
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-teal-50 dark:bg-teal-950/60 text-teal-800 dark:text-teal-300 border border-teal-200/60 dark:border-teal-800/60">
                      {pack.disciplineName}
                    </span>
                    {pack.moduleNumber && (
                      <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                        Módulo {pack.moduleNumber}
                      </span>
                    )}
                    {pack.highYield && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200/60 dark:border-amber-800/60 flex items-center gap-1">
                        <Sparkles className="w-3 h-3 text-amber-500" />
                        Alto Rendimento
                      </span>
                    )}
                    {pack.isCompleted && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                        Concluído
                      </span>
                    )}
                  </div>

                  {/* Título e Descrição */}
                  <div>
                    <h3 className="font-serif-reading text-lg font-bold text-slate-900 dark:text-slate-100 leading-snug">
                      {pack.title}
                    </h3>
                    {pack.subtitle && (
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2 leading-relaxed">
                        {pack.subtitle}
                      </p>
                    )}
                  </div>

                  {/* Os 3 Pilares em Miniatura */}
                  <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-100 dark:border-slate-800/80 text-center">
                    <div className="p-2 rounded-xl bg-slate-50 dark:bg-[#142038]">
                      <span className="text-[9px] uppercase font-bold text-slate-400 block">Leitura</span>
                      <span className="text-xs font-extrabold text-teal-800 dark:text-teal-300">
                        {pack.readPercent}%
                      </span>
                    </div>

                    <div className="p-2 rounded-xl bg-slate-50 dark:bg-[#142038]">
                      <span className="text-[9px] uppercase font-bold text-slate-400 block">Questões</span>
                      <span className="text-xs font-extrabold text-slate-800 dark:text-slate-200">
                        {pack.answeredCount}/{pack.questions.length}
                      </span>
                    </div>

                    <div className="p-2 rounded-xl bg-slate-50 dark:bg-[#142038]">
                      <span className="text-[9px] uppercase font-bold text-slate-400 block">Flashcards</span>
                      <span className="text-xs font-extrabold text-slate-800 dark:text-slate-200">
                        {pack.dueCards.length > 0 ? (
                          <span className="text-amber-600 dark:text-amber-400 font-bold">{pack.dueCards.length} hoje</span>
                        ) : (
                          `${pack.flashcards.length}`
                        )}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Botão de Ação para Abrir o Pack */}
                <button
                  type="button"
                  onClick={() => {
                    setSelectedPackId(pack.id);
                    setActivePackTab('overview');
                  }}
                  className="w-full py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-teal-600 dark:hover:bg-teal-700 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer elev-xs"
                >
                  <span>{pack.isUnstarted ? 'Começar Pack' : 'Continuar Pack'}</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
