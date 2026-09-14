import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Brain,
  ChevronRight,
  Compass,
  ExternalLink,
  Flame,
  HelpCircle,
  Layers,
  Search,
  Sparkles,
} from 'lucide-react';
import {
  Compendium,
  Discipline,
  Flashcard,
  Question,
  QuestionAnswerRecord,
  Theme,
} from '../../types';
import { readingProgressRepository } from '../../repositories/ReadingProgressRepository';
import { useScrollMemory } from '../../hooks/useScrollMemory';
import { usePersistedState } from '../../hooks/usePersistedState';
import {
  ThematicGroup,
  ThematicPack,
  buildThematicStudyData,
  findPackById,
} from '../../services/thematicPacks';

// ============================================================================
// Estudo Temático (Prompt 22-A)
//
// Esta tela ORGANIZA e navega; ela não reimplementa leitura, resolução de
// questão nem revisão SRS. Cada ação abre o componente canônico do app
// (CompendiumReader, QuestionsView, FlashcardReviewSession), já com o escopo do
// pack aplicado e com retorno explícito para cá — preservando progresso de
// leitura, respostas, caderno de erros, notas e o caminho atômico de SRS
// (`reviewFlashcard()` -> `submit_flashcard_review`) publicados no 13-B.
//
// A montagem dos packs é uma função pura (`services/thematicPacks.ts`), o que
// mantém a regra de vínculo explícito testável sem navegador.
// ============================================================================

interface ThematicStudyViewProps {
  disciplines: Discipline[];
  themes: Theme[];
  compendiums: Compendium[];
  questions: Question[];
  flashcards: Flashcard[];
  answers: Record<string, QuestionAnswerRecord>;
  loading?: boolean;
  /** Pack aberto, controlado pelo App (persistido e validado lá). */
  selectedPackId: string | null;
  onSelectPack: (packId: string | null) => void;
  /** Id salvo em sessão anterior que não existe mais nos dados atuais. */
  invalidSavedPackId?: string | null;
  onDismissInvalidPack?: () => void;
  onOpenCompendium: (compendiumId: string, sectionId?: string) => void;
  onOpenPackQuestions: (packId: string, compendiumId: string) => void;
  onOpenPackFlashcards: (packId: string, compendiumId: string) => void;
  onOpenThemeQuestions: (themeId: string) => void;
  onOpenThemeFlashcards: (themeId: string) => void;
  onOpenCustomFlashcards: () => void;
  onStartSRS: (cards: Flashcard[], packId: string) => void;
}

const cardShell =
  'bg-white dark:bg-[#0F172A] rounded-3xl border border-slate-200 dark:border-[#243452] elev-xs';

export const ThematicStudyView: React.FC<ThematicStudyViewProps> = ({
  disciplines,
  themes,
  compendiums,
  questions,
  flashcards,
  answers,
  loading = false,
  selectedPackId,
  onSelectPack,
  invalidSavedPackId,
  onDismissInvalidPack,
  onOpenCompendium,
  onOpenPackQuestions,
  onOpenPackFlashcards,
  onOpenThemeQuestions,
  onOpenThemeFlashcards,
  onOpenCustomFlashcards,
  onStartSRS,
}) => {
  useScrollMemory('thematic_study');

  const [selectedDiscipline, setSelectedDiscipline] = usePersistedState<string>(
    'thematic_discipline',
    'all'
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [readingProgress, setReadingProgress] = useState<
    Record<string, { readSectionIds: string[]; percent: number }>
  >({});
  const [progressError, setProgressError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const progress = await readingProgressRepository.getReadingProgress();
        if (!cancelled) {
          setReadingProgress(progress);
          setProgressError(false);
        }
      } catch {
        // A tela continua utilizável sem o progresso de leitura; o aviso abaixo
        // deixa explícito que a porcentagem exibida pode estar incompleta, em
        // vez de mostrar 0% como se fosse um fato.
        if (!cancelled) setProgressError(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const data = useMemo(
    () =>
      buildThematicStudyData({
        disciplines,
        themes,
        compendiums,
        questions,
        flashcards,
        answers,
        readingProgress,
      }),
    [disciplines, themes, compendiums, questions, flashcards, answers, readingProgress]
  );

  const currentPack = findPackById(data, selectedPackId);

  const filteredGroups = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const matches = (group: ThematicGroup, pack?: ThematicPack) => {
      if (!query) return true;
      const haystack = [
        group.themeName,
        group.disciplineName,
        pack?.compendium.title ?? '',
        pack?.compendium.subtitle ?? '',
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(query);
    };

    return data.groups
      .filter((group) => selectedDiscipline === 'all' || group.disciplineId === selectedDiscipline)
      .map((group) => ({
        ...group,
        packs: group.packs.filter((pack) => matches(group, pack)),
      }))
      .filter(
        (group) =>
          group.packs.length > 0 ||
          ((group.looseQuestions.length > 0 || group.looseFlashcards.length > 0) && matches(group))
      );
  }, [data.groups, selectedDiscipline, searchQuery]);

  // ── Estado de carregamento ────────────────────────────────────────────────
  if (loading && compendiums.length === 0) {
    return (
      <div id="thematic-study-loading" className="space-y-6 animate-pulse" aria-busy="true">
        <div className="h-40 rounded-3xl bg-slate-100 dark:bg-slate-800" />
        <div className="h-16 rounded-2xl bg-slate-100 dark:bg-slate-800" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="h-48 rounded-2xl bg-slate-100 dark:bg-slate-800" />
          <div className="h-48 rounded-2xl bg-slate-100 dark:bg-slate-800" />
        </div>
      </div>
    );
  }

  // ── Visão de um pack ──────────────────────────────────────────────────────
  if (currentPack) {
    const pack = currentPack;
    const comp = pack.compendium;
    const sectionsCount = comp.sections.length;

    return (
      <div id="thematic-pack-view" data-pack-id={pack.id} className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            id="thematic-pack-back"
            onClick={() => onSelectPack(null)}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 hover:text-teal-600 dark:hover:text-teal-400 text-xs font-semibold transition-colors cursor-pointer elev-xs"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Voltar aos temas</span>
          </button>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-teal-50 dark:bg-teal-950/60 text-teal-800 dark:text-teal-300 border border-teal-200/60 dark:border-teal-800/60">
              {pack.disciplineName || 'Disciplina não identificada'}
            </span>
            <span className="text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
              {pack.themeName}
            </span>
            {pack.moduleNumber !== undefined && (
              <span className="text-[11px] font-mono font-bold px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                Módulo {pack.moduleNumber}
              </span>
            )}
            {pack.highYield && (
              <span className="text-[11px] font-bold px-2 py-1 rounded-lg bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200/60 dark:border-amber-800/60 flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-amber-500" />
                Alto rendimento
              </span>
            )}
          </div>
        </div>

        <div className="bg-gradient-to-r from-teal-950 via-slate-900 to-slate-950 rounded-3xl p-6 sm:p-8 text-white border border-teal-800/30 elev-sm space-y-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs text-teal-400 font-semibold uppercase tracking-wider">
              <Compass className="w-3.5 h-3.5" />
              <span>Pack de estudo por material</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight font-serif-reading">
              {comp.title}
            </h1>
            {comp.subtitle && (
              <p className="text-slate-300 text-xs sm:text-sm leading-relaxed max-w-4xl">{comp.subtitle}</p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-white/10">
            <div className="p-3.5 rounded-2xl bg-white/10 border border-white/10 flex items-center justify-between">
              <div>
                <span className="text-[10px] uppercase font-bold text-teal-300 tracking-wider block">
                  Leitura
                </span>
                <span className="text-lg font-extrabold tabular-nums">{pack.readPercent}%</span>
                <span className="text-[10px] text-slate-300 block">
                  {pack.readSectionIds.length}/{sectionsCount} seções marcadas como lidas
                </span>
              </div>
              <BookOpen className="w-7 h-7 text-teal-400 opacity-60" />
            </div>

            <div className="p-3.5 rounded-2xl bg-white/10 border border-white/10 flex items-center justify-between">
              <div>
                <span className="text-[10px] uppercase font-bold text-teal-300 tracking-wider block">
                  Questões do material
                </span>
                <span className="text-lg font-extrabold tabular-nums">
                  {pack.answeredCount}/{pack.questions.length}
                </span>
                <span className="text-[10px] text-slate-300 block">
                  {pack.answeredCount > 0
                    ? `${pack.accuracyPercent}% de acerto nas respondidas`
                    : 'Nenhuma respondida ainda'}
                </span>
              </div>
              <HelpCircle className="w-7 h-7 text-teal-400 opacity-60" />
            </div>

            <div className="p-3.5 rounded-2xl bg-white/10 border border-white/10 flex items-center justify-between">
              <div>
                <span className="text-[10px] uppercase font-bold text-teal-300 tracking-wider block">
                  Flashcards do material
                </span>
                <span className="text-lg font-extrabold tabular-nums">{pack.flashcards.length}</span>
                <span className="text-[10px] text-slate-300 block">
                  {pack.dueCards.length > 0
                    ? `${pack.dueCards.length} a revisar hoje`
                    : `${pack.masteredCards.length} dominados`}
                </span>
              </div>
              <Layers className="w-7 h-7 text-teal-400 opacity-60" />
            </div>
          </div>
        </div>

        {progressError && (
          <p
            id="thematic-progress-warning"
            className="text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 rounded-2xl p-3"
          >
            Não foi possível carregar o progresso de leitura agora. As demais informações continuam
            válidas; a porcentagem de leitura pode estar desatualizada.
          </p>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* Leitura */}
          <div className={`${cardShell} p-6 flex flex-col justify-between gap-4`}>
            <div className="space-y-3">
              <div className="w-10 h-10 rounded-2xl bg-teal-50 dark:bg-teal-950/60 text-teal-600 dark:text-teal-400 flex items-center justify-center">
                <BookOpen className="w-5 h-5" />
              </div>
              <div>
                <h2 className="font-bold text-sm text-slate-900 dark:text-white">Leitura do material</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  {sectionsCount > 0
                    ? `${sectionsCount} seções · ${comp.estimatedReadTimeMinutes} min de leitura estimada.`
                    : 'Este material ainda não tem seções carregadas.'}
                </p>
              </div>
              <div className="space-y-1 pt-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500 dark:text-slate-400">Progresso</span>
                  <span className="font-bold text-teal-700 dark:text-teal-300">{pack.readPercent}%</span>
                </div>
                <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                  <div
                    className="h-full bg-teal-500 rounded-full transition-all duration-300"
                    style={{ width: `${Math.min(100, Math.max(0, pack.readPercent))}%` }}
                  />
                </div>
              </div>
            </div>
            <button
              type="button"
              id="thematic-pack-open-reader"
              onClick={() => onOpenCompendium(comp.id)}
              className="w-full py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-teal-600 dark:hover:bg-teal-700 text-white text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <span>{pack.readPercent > 0 ? 'Continuar leitura' : 'Abrir leitor'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          {/* Questões */}
          <div className={`${cardShell} p-6 flex flex-col justify-between gap-4`}>
            <div className="space-y-3">
              <div className="w-10 h-10 rounded-2xl bg-teal-50 dark:bg-teal-950/60 text-teal-600 dark:text-teal-400 flex items-center justify-center">
                <HelpCircle className="w-5 h-5" />
              </div>
              <div>
                <h2 className="font-bold text-sm text-slate-900 dark:text-white">Questões deste material</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  {pack.questions.length > 0
                    ? `${pack.questions.length} questões que referenciam este material.`
                    : 'Nenhuma questão referencia este material.'}
                </p>
              </div>
              {pack.questions.length > 0 && (
                <div className="space-y-1 pt-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500 dark:text-slate-400">
                      {pack.answeredCount} respondidas
                    </span>
                    <span className="font-bold text-slate-900 dark:text-white">
                      {pack.correctCount} corretas
                    </span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                    <div
                      className="h-full bg-teal-500 rounded-full transition-all duration-300"
                      style={{ width: `${(pack.answeredCount / pack.questions.length) * 100}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
            <button
              type="button"
              id="thematic-pack-open-questions"
              onClick={() => onOpenPackQuestions(pack.id, comp.id)}
              disabled={pack.questions.length === 0}
              className={`w-full py-2.5 px-4 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-colors ${
                pack.questions.length > 0
                  ? 'bg-slate-900 hover:bg-slate-800 dark:bg-teal-600 dark:hover:bg-teal-700 text-white cursor-pointer'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-400 cursor-not-allowed'
              }`}
            >
              <span>Resolver questões ({pack.questions.length})</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          {/* Flashcards */}
          <div className={`${cardShell} p-6 flex flex-col justify-between gap-4`}>
            <div className="space-y-3">
              <div className="w-10 h-10 rounded-2xl bg-teal-50 dark:bg-teal-950/60 text-teal-600 dark:text-teal-400 flex items-center justify-center">
                <Layers className="w-5 h-5" />
              </div>
              <div>
                <h2 className="font-bold text-sm text-slate-900 dark:text-white">Flashcards deste material</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  {pack.flashcards.length > 0
                    ? `${pack.flashcards.length} cards que referenciam este material.`
                    : 'Nenhum card editorial referencia este material.'}
                </p>
              </div>
              {pack.flashcards.length > 0 && (
                <div className="space-y-1 pt-2 text-xs">
                  {pack.dueCards.length > 0 ? (
                    <span className="text-amber-600 dark:text-amber-400 font-bold flex items-center gap-1">
                      <Flame className="w-3.5 h-3.5" />
                      {pack.dueCards.length} a revisar hoje
                    </span>
                  ) : (
                    <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                      Nenhum card vencido hoje
                    </span>
                  )}
                </div>
              )}
            </div>
            <div className="space-y-2">
              {pack.dueCards.length > 0 && (
                <button
                  type="button"
                  id="thematic-pack-start-srs"
                  onClick={() => onStartSRS(pack.dueCards, pack.id)}
                  className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 text-xs font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  <Brain className="w-4 h-4" />
                  <span>Revisar agora ({pack.dueCards.length})</span>
                </button>
              )}
              <button
                type="button"
                id="thematic-pack-open-flashcards"
                onClick={() => onOpenPackFlashcards(pack.id, comp.id)}
                disabled={pack.flashcards.length === 0}
                className={`w-full py-2.5 px-4 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-colors ${
                  pack.flashcards.length > 0
                    ? 'bg-slate-900 hover:bg-slate-800 dark:bg-teal-600 dark:hover:bg-teal-700 text-white cursor-pointer'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-400 cursor-not-allowed'
                }`}
              >
                <span>Ver cards ({pack.flashcards.length})</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Seções do material — atalho para o leitor canônico, sem duplicar a
            renderização do conteúdo nem o controle de progresso. */}
        <div className={`${cardShell} p-6 space-y-3`}>
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Seções do material
          </h2>
          {sectionsCount === 0 ? (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Este material não tem seções carregadas.
            </p>
          ) : (
            <ul className="space-y-2">
              {comp.sections.map((section, index) => {
                const isRead = pack.readSectionIds.includes(section.id);
                return (
                  <li key={section.id}>
                    <button
                      type="button"
                      onClick={() => onOpenCompendium(comp.id, section.id)}
                      className="w-full text-left px-4 py-2.5 rounded-2xl border border-slate-200 dark:border-[#243452] hover:border-teal-400 dark:hover:border-teal-600 transition-colors cursor-pointer flex items-center justify-between gap-3"
                    >
                      <span className="min-w-0">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                          Seção {index + 1} de {sectionsCount}
                          {isRead ? ' · lida' : ''}
                        </span>
                        <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate block">
                          {section.title}
                        </span>
                      </span>
                      <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    );
  }

  // ── Lista de temas e packs ────────────────────────────────────────────────
  const hasAnyContent =
    data.groups.length > 0 ||
    data.customFlashcards.length > 0 ||
    data.invalidRefQuestions.length > 0 ||
    data.invalidRefFlashcards.length > 0 ||
    data.unthemedQuestions.length > 0 ||
    data.unthemedFlashcards.length > 0;

  return (
    <div id="thematic-study-view" className="space-y-6">
      <div className="bg-gradient-to-r from-teal-900 via-slate-900 to-slate-950 rounded-3xl p-6 sm:p-8 text-white elev-sm flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 border border-teal-800/30">
        <div className="max-w-2xl space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-teal-500/20 text-teal-300 text-xs font-semibold border border-teal-400/30">
            <Compass className="w-3.5 h-3.5 text-teal-400" />
            <span>Estudo por material</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">Estudo Temático</h1>
          <p className="text-slate-300 text-xs sm:text-sm leading-relaxed">
            Cada tema reúne um pack por material publicado. Questões e flashcards entram no pack
            apenas quando referenciam aquele material explicitamente; o restante do tema fica
            acessível em uma seção própria, sem ser repetido entre packs.
          </p>
        </div>

        <div className="flex flex-wrap sm:flex-nowrap items-center gap-2.5 sm:gap-3 w-full lg:w-auto shrink-0">
          <div className="flex-1 sm:flex-initial px-4 py-3 rounded-2xl bg-white/10 border border-white/10 text-center">
            <span className="text-[10px] uppercase font-bold text-teal-300 tracking-wider block">Packs</span>
            <span className="text-lg sm:text-xl font-extrabold tabular-nums">
              {data.totals.completedPacks}/{data.totals.packs}
            </span>
            <span className="text-[10px] text-slate-300 block">completos</span>
          </div>
          <div className="flex-1 sm:flex-initial px-4 py-3 rounded-2xl bg-white/10 border border-white/10 text-center">
            <span className="text-[10px] uppercase font-bold text-amber-300 tracking-wider block">
              Cards hoje
            </span>
            <span className="text-lg sm:text-xl font-extrabold text-amber-400 tabular-nums">
              {data.totals.dueCards}
            </span>
            <span className="text-[10px] text-slate-300 block">a revisar</span>
          </div>
        </div>
      </div>

      {invalidSavedPackId && (
        <div
          id="thematic-invalid-pack-notice"
          className="rounded-2xl border border-amber-200 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-950/40 p-4 flex items-start justify-between gap-3"
        >
          <div className="flex items-start gap-2.5 text-xs text-amber-800 dark:text-amber-200">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <p>
              O pack aberto na sessão anterior não está mais disponível nos dados atuais. A lista de
              temas foi carregada no lugar dele.
            </p>
          </div>
          {onDismissInvalidPack && (
            <button
              type="button"
              onClick={onDismissInvalidPack}
              className="text-xs font-semibold text-amber-800 dark:text-amber-200 hover:underline cursor-pointer shrink-0"
            >
              Entendi
            </button>
          )}
        </div>
      )}

      {progressError && (
        <p
          id="thematic-progress-warning"
          className="text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 rounded-2xl p-3"
        >
          Não foi possível carregar o progresso de leitura agora. As porcentagens exibidas podem
          estar desatualizadas.
        </p>
      )}

      {!hasAnyContent ? (
        <div className={`${cardShell} p-12 text-center space-y-2`}>
          <BookOpen className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-600" />
          <p className="font-semibold text-sm text-slate-800 dark:text-slate-200">
            Nenhum material, questão ou card disponível para a sua conta no momento.
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Conteúdo aparece aqui depois de publicado na Área Editorial.
          </p>
        </div>
      ) : (
        <>
          <div className={`${cardShell} p-4 space-y-3`}>
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <label htmlFor="thematic-search" className="sr-only">
                Pesquisar tema ou material
              </label>
              <input
                id="thematic-search"
                type="text"
                placeholder="Pesquisar tema, disciplina ou material..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 text-xs rounded-xl border border-slate-200 dark:border-[#243452] bg-slate-50 dark:bg-[#142038] focus:bg-white dark:focus:bg-[#1A2845] focus:outline-none focus:ring-2 focus:ring-teal-500 text-slate-900 dark:text-slate-100 placeholder:text-slate-400"
              />
            </div>

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
                Todas as disciplinas
              </button>
              {disciplines.map((discipline) => {
                const groupCount = data.groups.filter((g) => g.disciplineId === discipline.id).length;
                if (groupCount === 0) return null;
                return (
                  <button
                    key={discipline.id}
                    type="button"
                    onClick={() => setSelectedDiscipline(discipline.id)}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold shrink-0 transition-colors cursor-pointer flex items-center gap-1.5 ${
                      selectedDiscipline === discipline.id
                        ? 'bg-teal-100 dark:bg-teal-950 text-teal-900 dark:text-teal-200 border border-teal-300 dark:border-teal-700'
                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-[#142038]'
                    }`}
                  >
                    <span>{discipline.name}</span>
                    <span className="text-[10px] opacity-75">({groupCount})</span>
                  </button>
                );
              })}
            </div>
          </div>

          {filteredGroups.length === 0 ? (
            <div className={`${cardShell} p-12 text-center space-y-2`}>
              <AlertCircle className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-600" />
              <p className="font-semibold text-sm text-slate-800 dark:text-slate-200">
                Nenhum tema encontrado com estes filtros.
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Ajuste a busca ou selecione outra disciplina.
              </p>
            </div>
          ) : (
            <div className="space-y-8">
              {filteredGroups.map((group) => (
                <section
                  key={group.themeId || 'sem-tema'}
                  data-theme-id={group.themeId}
                  className="space-y-3"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div>
                      <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">
                        {group.disciplineName || 'Sem disciplina'}
                      </span>
                      <h2 className="text-lg font-bold font-serif-reading text-slate-900 dark:text-slate-100 flex items-center gap-2">
                        {group.themeName}
                        {group.highYield && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200/60 dark:border-amber-800/60 flex items-center gap-1">
                            <Sparkles className="w-3 h-3 text-amber-500" />
                            Alto rendimento
                          </span>
                        )}
                      </h2>
                    </div>
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      {group.packs.length} {group.packs.length === 1 ? 'material' : 'materiais'}
                    </span>
                  </div>

                  {group.packs.length === 0 ? (
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Nenhum material publicado neste tema.
                    </p>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
                      {group.packs.map((pack) => (
                        <div
                          key={pack.id}
                          data-pack-card-id={pack.id}
                          className={`${cardShell} p-5 sm:p-6 transition-all hover:border-teal-400 dark:hover:border-teal-600 flex flex-col justify-between gap-4`}
                        >
                          <div className="space-y-3">
                            <h3 className="font-serif-reading text-base font-bold text-slate-900 dark:text-slate-100 leading-snug">
                              {pack.compendium.title}
                            </h3>
                            {pack.compendium.subtitle && (
                              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed line-clamp-2">
                                {pack.compendium.subtitle}
                              </p>
                            )}
                            <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-100 dark:border-slate-800/80 text-center">
                              <div className="p-2 rounded-xl bg-slate-50 dark:bg-[#142038]">
                                <span className="text-[9px] uppercase font-bold text-slate-400 block">
                                  Leitura
                                </span>
                                <span className="text-xs font-extrabold text-teal-800 dark:text-teal-300">
                                  {pack.readPercent}%
                                </span>
                              </div>
                              <div className="p-2 rounded-xl bg-slate-50 dark:bg-[#142038]">
                                <span className="text-[9px] uppercase font-bold text-slate-400 block">
                                  Questões
                                </span>
                                <span className="text-xs font-extrabold text-slate-800 dark:text-slate-200">
                                  {pack.answeredCount}/{pack.questions.length}
                                </span>
                              </div>
                              <div className="p-2 rounded-xl bg-slate-50 dark:bg-[#142038]">
                                <span className="text-[9px] uppercase font-bold text-slate-400 block">
                                  Cards
                                </span>
                                <span className="text-xs font-extrabold text-slate-800 dark:text-slate-200">
                                  {pack.dueCards.length > 0 ? (
                                    <span className="text-amber-600 dark:text-amber-400">
                                      {pack.dueCards.length} hoje
                                    </span>
                                  ) : (
                                    pack.flashcards.length
                                  )}
                                </span>
                              </div>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => onSelectPack(pack.id)}
                            className="w-full py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-teal-600 dark:hover:bg-teal-700 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer elev-xs"
                          >
                            <span>{pack.isUnstarted ? 'Abrir pack' : 'Continuar pack'}</span>
                            <ChevronRight className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {(group.looseQuestions.length > 0 || group.looseFlashcards.length > 0) && (
                    <div
                      data-loose-theme-id={group.themeId}
                      className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 p-4 space-y-2"
                    >
                      <h3 className="text-xs font-bold text-slate-700 dark:text-slate-200">
                        Conteúdo do tema sem material associado
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {group.looseQuestions.length} questões e {group.looseFlashcards.length} cards
                        deste tema não indicam material de origem. Ficam listados aqui uma única vez,
                        fora dos packs.
                      </p>
                      <div className="flex flex-wrap gap-2 pt-1">
                        {group.looseQuestions.length > 0 && (
                          <button
                            type="button"
                            onClick={() => onOpenThemeQuestions(group.themeId)}
                            className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/60 cursor-pointer flex items-center gap-1.5"
                          >
                            <span>Ver questões do tema</span>
                            <ExternalLink className="w-3 h-3" />
                          </button>
                        )}
                        {group.looseFlashcards.length > 0 && (
                          <button
                            type="button"
                            onClick={() => onOpenThemeFlashcards(group.themeId)}
                            className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/60 cursor-pointer flex items-center gap-1.5"
                          >
                            <span>Ver cards do tema</span>
                            <ExternalLink className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </section>
              ))}
            </div>
          )}

          {/* Seções avulsas globais — cada conteúdo aparece em uma única delas. */}
          {data.customFlashcards.length > 0 && (
            <div id="thematic-custom-cards" className={`${cardShell} p-5 space-y-2`}>
              <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Meus Cards Personalizados
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {data.customFlashcards.length} cards criados por você. Não entram nos packs de
                material.
              </p>
              <button
                type="button"
                onClick={onOpenCustomFlashcards}
                className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/60 cursor-pointer flex items-center gap-1.5 w-fit"
              >
                <span>Abrir meus cards</span>
                <ExternalLink className="w-3 h-3" />
              </button>
            </div>
          )}

          {(data.invalidRefQuestions.length > 0 || data.invalidRefFlashcards.length > 0) && (
            <div id="thematic-invalid-refs" className={`${cardShell} p-5 space-y-1`}>
              <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Conteúdo com referência de material indisponível
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {data.invalidRefQuestions.length} questões e {data.invalidRefFlashcards.length} cards
                apontam para um material que não está disponível para a sua conta. Nenhuma associação
                foi inferida por semelhança de título ou tema.
              </p>
            </div>
          )}

          {(data.unthemedQuestions.length > 0 || data.unthemedFlashcards.length > 0) && (
            <div id="thematic-unthemed" className={`${cardShell} p-5 space-y-1`}>
              <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Conteúdo sem tema identificado
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {data.unthemedQuestions.length} questões e {data.unthemedFlashcards.length} cards não
                indicam material nem tema disponível nos dados atuais.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
};
