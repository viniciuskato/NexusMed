import React, { useState, useMemo, useEffect } from 'react';
import {
  Layers,
  Search,
  Plus,
  Play,
  Clock,
  BookOpen,
  Brain,
  Trash2,
  ArrowLeft,
  Filter,
} from 'lucide-react';
import { Flashcard, Discipline, Theme, Compendium } from '../../types';
import { isCardDueToday } from '../../services/srsAlgorithm';
import { flashcardsRepository } from '../../repositories/FlashcardsRepository';
import { usePersistedState } from '../../hooks/usePersistedState';
import { useScrollMemory } from '../../hooks/useScrollMemory';

interface FlashcardsViewProps {
  flashcards: Flashcard[];
  disciplines: Discipline[];
  themes: Theme[];
  compendiums?: Compendium[];
  onStartReview: (cardsToReview: Flashcard[]) => void;
  onOpenCreateModal: () => void;
  onOpenCompendium: (compendiumId: string) => void;
  onFlashcardUpdated: () => void;
  filterThemeId?: string;
}

interface FlashcardPack {
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
  cards: Flashcard[];
  dueCount: number;
  learningCount: number;
  masteredCount: number;
}

export const FlashcardsView: React.FC<FlashcardsViewProps> = ({
  flashcards,
  disciplines,
  themes,
  compendiums = [],
  onStartReview,
  onOpenCreateModal,
  onOpenCompendium,
  onFlashcardUpdated,
  filterThemeId,
}) => {
  // Mode toggle: 'packs' | 'list'
  const [viewMode, setViewMode] = usePersistedState<'packs' | 'list'>('flashcards_view_mode', 'packs');
  const [selectedPackId, setSelectedPackId] = useState<string | null>(null);

  const [selectedDiscipline, setSelectedDiscipline] = usePersistedState<string>('flashcards_discipline', 'all');
  const [selectedTheme, setSelectedTheme] = usePersistedState<string>('flashcards_theme', filterThemeId || 'all');
  const [selectedStatus, setSelectedStatus] = usePersistedState<'all' | 'due' | 'learning' | 'mastered'>(
    'flashcards_status',
    'all'
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [flippedCardIds, setFlippedCardIds] = useState<string[]>([]);
  useScrollMemory('flashcards');

  useEffect(() => {
    if (filterThemeId) setSelectedTheme(filterThemeId);
  }, [filterThemeId, setSelectedTheme]);

  const dueCards = useMemo(() => {
    return flashcards.filter((fc) => isCardDueToday(fc));
  }, [flashcards]);

  // Compute packs corresponding to library materials
  const packs = useMemo<FlashcardPack[]>(() => {
    const compendiumPacks: FlashcardPack[] = compendiums.map((c) => {
      const packCards = flashcards.filter(
        (fc) => fc.compendiumRefId === c.id || (!fc.compendiumRefId && fc.themeId === c.themeId)
      );
      const theme = themes.find((t) => t.id === c.themeId);
      const discipline = disciplines.find((d) => d.id === c.disciplineId);
      const due = packCards.filter((fc) => isCardDueToday(fc)).length;
      const learning = packCards.filter((fc) => fc.srs?.state === 'learning' || fc.srs?.state === 'new').length;
      const mastered = packCards.filter((fc) => fc.srs?.state === 'mastered').length;

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
        cards: packCards,
        dueCount: due,
        learningCount: learning,
        masteredCount: mastered,
      };
    });

    const coveredIds = new Set(compendiumPacks.flatMap((p) => p.cards.map((c) => c.id)));
    const orphanCards = flashcards.filter((c) => !coveredIds.has(c.id));

    const orphanThemeMap = new Map<string, Flashcard[]>();
    orphanCards.forEach((c) => {
      const key = c.isCustom ? 'custom' : (c.themeId || 'unlinked');
      const list = orphanThemeMap.get(key) || [];
      list.push(c);
      orphanThemeMap.set(key, list);
    });

    const orphanPacks: FlashcardPack[] = Array.from(orphanThemeMap.entries()).map(([tId, cList]) => {
      const isCustom = tId === 'custom';
      const isUnlinked = tId === 'unlinked';
      const theme = isCustom || isUnlinked ? undefined : themes.find((t) => t.id === tId);
      const discipline = isCustom || isUnlinked
        ? undefined
        : disciplines.find((d) => d.id === (theme?.disciplineId || cList[0]?.disciplineId));
      const due = cList.filter((fc) => isCardDueToday(fc)).length;
      const learning = cList.filter((fc) => fc.srs?.state === 'learning' || fc.srs?.state === 'new').length;
      const mastered = cList.filter((fc) => fc.srs?.state === 'mastered').length;

      return {
        id: isCustom ? 'pack-my-cards' : isUnlinked ? 'pack-unlinked-cards' : `pack-theme-${tId}`,
        themeId: isCustom || isUnlinked ? '' : tId,
        themeName: isCustom ? 'Meus Cards' : isUnlinked ? 'Sem material associado' : (theme?.name || tId),
        disciplineId: discipline?.id || '',
        disciplineName: discipline?.name || (isCustom ? 'Personalizados' : 'Geral'),
        title: isCustom
          ? 'Meus Cards Personalizados'
          : isUnlinked
          ? 'Sem Material Associado — Cards'
          : `Pack: ${theme?.name || 'Tema Complementar'}`,
        subtitle: isCustom
          ? 'Flashcards criados pelo usuário'
          : isUnlinked
          ? 'Flashcards complementares sem compêndio direto'
          : theme?.description,
        cards: cList,
        dueCount: due,
        learningCount: learning,
        masteredCount: mastered,
      };
    });

    return [...compendiumPacks, ...orphanPacks].filter((p) => p.cards.length > 0);
  }, [compendiums, flashcards, themes, disciplines]);

  // Filtered packs
  const filteredPacks = useMemo(() => {
    return packs.filter((p) => {
      if (selectedDiscipline !== 'all' && p.disciplineId !== selectedDiscipline) {
        return false;
      }
      if (selectedTheme !== 'all' && p.themeId !== selectedTheme) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesTitle = p.title.toLowerCase().includes(q);
        const matchesSub = (p.subtitle || '').toLowerCase().includes(q);
        const matchesDisc = p.disciplineName.toLowerCase().includes(q);
        const matchesTheme = p.themeName.toLowerCase().includes(q);
        return matchesTitle || matchesSub || matchesDisc || matchesTheme;
      }
      return true;
    });
  }, [packs, selectedDiscipline, selectedTheme, searchQuery]);

  // Active selected pack
  const currentPack = useMemo(() => {
    if (!selectedPackId) return null;
    return packs.find((p) => p.id === selectedPackId) || null;
  }, [packs, selectedPackId]);

  // Base cards
  const baseCards = useMemo(() => {
    if (currentPack) return currentPack.cards;
    return flashcards;
  }, [currentPack, flashcards]);

  const filteredCards = useMemo(() => {
    return baseCards.filter((fc) => {
      if (!currentPack) {
        if (selectedDiscipline !== 'all' && fc.disciplineId !== selectedDiscipline) {
          return false;
        }
        if (selectedTheme !== 'all' && fc.themeId !== selectedTheme) {
          return false;
        }
      }
      if (selectedStatus === 'due' && !isCardDueToday(fc)) {
        return false;
      }
      if (selectedStatus === 'learning' && fc.srs?.state !== 'learning' && fc.srs?.state !== 'new') {
        return false;
      }
      if (selectedStatus === 'mastered' && fc.srs?.state !== 'mastered') {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesFront = fc.front.toLowerCase().includes(q);
        const matchesBack = fc.back.toLowerCase().includes(q);
        const matchesMech = (fc.mechanismHighlight || '').toLowerCase().includes(q);
        return matchesFront || matchesBack || matchesMech;
      }
      return true;
    });
  }, [baseCards, currentPack, selectedDiscipline, selectedTheme, selectedStatus, searchQuery]);

  const toggleFlip = (id: string) => {
    if (flippedCardIds.includes(id)) {
      setFlippedCardIds(flippedCardIds.filter((cid) => cid !== id));
    } else {
      setFlippedCardIds([...flippedCardIds, id]);
    }
  };

  const handleDeleteCard = async (cardId: string) => {
    await flashcardsRepository.deleteFlashcard(cardId);
    onFlashcardUpdated();
  };

  return (
    <div className="w-full max-w-[1600px] mx-auto space-y-6">
      {/* Top Banner Header */}
      <div className="bg-gradient-to-r from-teal-900 via-slate-900 to-emerald-950 rounded-3xl p-6 sm:p-8 text-white elev-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="max-w-2xl space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-teal-500/20 text-teal-300 text-xs font-semibold border border-teal-400/30">
            <Brain className="w-3.5 h-3.5" />
            <span>Repetição Espaçada Inteligente (SRS)</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
            Packs de Flashcards por Material
          </h1>
          <p className="text-slate-300 text-xs sm:text-sm leading-relaxed">
            Organizados conforme os materiais teóricos da biblioteca. Memorize critérios e farmacodinâmica com algoritmo de repetição espaçada.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 shrink-0 w-full sm:w-auto">
          <button
            type="button"
            onClick={() => onStartReview(dueCards.length > 0 ? dueCards : flashcards)}
            disabled={flashcards.length === 0}
            className="px-6 py-3.5 rounded-2xl bg-gradient-to-r from-teal-400 to-emerald-400 hover:from-teal-300 hover:to-emerald-300 text-slate-950 font-extrabold text-xs elev-lg shadow-teal-500/20 transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            <Play className="w-4 h-4 fill-slate-950" />
            <span>
              {dueCards.length > 0
                ? `Revisar ${dueCards.length} Cards Pendentes Hoje`
                : 'Revisar Todos os Cards'}
            </span>
          </button>

          <button
            type="button"
            onClick={onOpenCreateModal}
            className="px-4 py-3.5 rounded-2xl bg-white/10 hover:bg-white/20 border border-white/20 text-white font-bold text-xs transition-colors flex items-center justify-center gap-2 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Criar Flashcard</span>
          </button>
        </div>
      </div>

      {/* Mode Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="inline-flex p-1 rounded-2xl bg-slate-100 dark:bg-[#142038] border border-slate-200/80 dark:border-[#243452] w-fit">
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
            <span>Lista Geral de Cards</span>
          </button>
        </div>

        <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-3">
          <span>Total: <strong className="text-slate-800 dark:text-slate-200">{flashcards.length} cards</strong></span>
          <span className="text-amber-600 dark:text-amber-400 font-semibold">
            {dueCards.length} para revisão hoje
          </span>
        </div>
      </div>

      {/* ── Active Pack Details View ────────────────────────────── */}
      {selectedPackId && currentPack ? (
        <div className="space-y-6 animate-in fade-in duration-200">
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
                    onClick={() => onOpenCompendium(currentPack.compendiumId!)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-teal-50 dark:bg-teal-950/60 border border-teal-200 dark:border-teal-800 text-teal-800 dark:text-teal-300 text-xs font-bold hover:bg-teal-100 transition-colors cursor-pointer"
                  >
                    <BookOpen className="w-3.5 h-3.5" />
                    <span>Ler Material Teórico</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    const cardsToReview = currentPack.cards.filter((c) => isCardDueToday(c));
                    onStartReview(cardsToReview.length > 0 ? cardsToReview : currentPack.cards);
                  }}
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold shadow-xs transition-colors cursor-pointer"
                >
                  <Play className="w-3 h-3 fill-current" />
                  <span>
                    {currentPack.dueCount > 0
                      ? `Revisar ${currentPack.dueCount} Pendentes`
                      : 'Revisar Todos do Pack'}
                  </span>
                </button>
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

            {/* Pack stats breakdown */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-[#142038]">
                <div className="text-[10px] uppercase font-bold text-slate-400">Total de Cards</div>
                <div className="text-lg font-bold text-slate-800 dark:text-slate-100">
                  {currentPack.cards.length}
                </div>
              </div>
              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-[#142038]">
                <div className="text-[10px] uppercase font-bold text-slate-400">Revisar Hoje</div>
                <div className="text-lg font-bold text-amber-600 dark:text-amber-400">
                  {currentPack.dueCount}
                </div>
              </div>
              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-[#142038]">
                <div className="text-[10px] uppercase font-bold text-slate-400">Em Aprendizado</div>
                <div className="text-lg font-bold text-teal-700 dark:text-teal-300">
                  {currentPack.learningCount}
                </div>
              </div>
              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-[#142038]">
                <div className="text-[10px] uppercase font-bold text-slate-400">Dominados</div>
                <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
                  {currentPack.masteredCount}
                </div>
              </div>
            </div>
          </div>

          {/* Filter pills for pack */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
            {[
              { id: 'all', label: `Todos (${currentPack.cards.length})` },
              { id: 'due', label: `Pendentes Hoje (${currentPack.dueCount})` },
              { id: 'learning', label: `Em Aprendizado (${currentPack.learningCount})` },
              { id: 'mastered', label: `Dominados (${currentPack.masteredCount})` },
            ].map((st) => (
              <button
                key={st.id}
                type="button"
                onClick={() => setSelectedStatus(st.id as 'all' | 'due' | 'learning' | 'mastered')}
                className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition-all cursor-pointer ${
                  selectedStatus === st.id
                    ? 'bg-teal-700 text-white shadow-xs'
                    : 'bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:border-teal-500'
                }`}
              >
                {st.label}
              </button>
            ))}
          </div>

          {/* Cards Grid */}
          {filteredCards.length === 0 ? (
            <div className="bg-white dark:bg-[#0F172A] rounded-3xl border border-slate-200 dark:border-[#243452] p-12 text-center text-slate-500 dark:text-slate-400 space-y-2">
              <Layers className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-600" />
              <p className="font-semibold text-sm">Nenhum card encontrado com este filtro no pack.</p>
              <button
                type="button"
                onClick={() => setSelectedStatus('all')}
                className="text-xs text-teal-700 dark:text-teal-400 font-bold hover:underline cursor-pointer"
              >
                Ver todos os cards do pack
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredCards.map((card) => {
                const isFlipped = flippedCardIds.includes(card.id);
                const isDue = isCardDueToday(card);
                return (
                  <div
                    key={card.id}
                    onClick={() => toggleFlip(card.id)}
                    className={`bg-white dark:bg-[#0F172A] rounded-3xl border transition-all p-5 elev-xs flex flex-col justify-between cursor-pointer group select-none min-h-[220px] ${
                      isFlipped
                        ? 'border-teal-300 dark:border-teal-600 bg-teal-50/20 dark:bg-teal-950/30 ring-1 ring-teal-400/20'
                        : 'border-slate-200 dark:border-[#243452] hover:border-teal-200 dark:hover:border-teal-600 hover:elev-md'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-teal-50 dark:bg-teal-950/60 text-teal-800 dark:text-teal-300 border border-teal-200/60 dark:border-teal-800/60">
                          {currentPack.disciplineName}
                        </span>
                        <div className="flex items-center gap-1">
                          {isDue && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
                              Revisar Hoje
                            </span>
                          )}
                          {card.isCustom && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteCard(card.id);
                              }}
                              className="p-1 text-slate-300 dark:text-slate-600 hover:text-rose-500 dark:hover:text-rose-400 transition-colors"
                              title="Excluir card personalizado"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="text-xs font-serif-reading mt-2">
                        {!isFlipped ? (
                          <div>
                            <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block mb-1">
                              Pergunta / Conceito:
                            </span>
                            <p className="font-bold text-slate-900 dark:text-slate-100 leading-snug">
                              {card.front}
                            </p>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <span className="text-[10px] font-bold text-teal-700 dark:text-teal-400 uppercase tracking-wider block mb-1">
                              Resposta & Mecanismo:
                            </span>
                            <p className="text-slate-800 dark:text-slate-200 leading-relaxed font-medium">
                              {card.back}
                            </p>
                            {card.mechanismHighlight && (
                              <div className="p-2 bg-teal-50 dark:bg-teal-950/60 rounded-xl text-[11px] text-teal-900 dark:text-teal-200 border border-teal-200/60 dark:border-teal-800/60">
                                <strong>Destaque:</strong> {card.mechanismHighlight}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px] text-slate-400 dark:text-slate-500">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        <span>Intervalo: {card.srs?.intervalDays ?? 0}d</span>
                      </span>
                      <span className="text-teal-700 dark:text-teal-400 font-semibold group-hover:underline">
                        {isFlipped ? 'Voltar à pergunta' : 'Virar para ver resposta'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : viewMode === 'packs' ? (
        /* ── Packs Grid View ───────────────────────────────────────── */
        <div className="space-y-6">
          {/* Controls */}
          <div className="p-4 rounded-3xl bg-white dark:bg-[#0F172A] border border-slate-200/80 dark:border-[#243452] shadow-sm flex flex-col md:flex-row gap-3 items-center justify-between">
            <div className="relative w-full md:w-80">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar pack de flashcards..."
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

          {/* Grid of Packs */}
          {filteredPacks.length === 0 ? (
            <div className="bg-white dark:bg-[#0F172A] rounded-3xl border border-slate-200 dark:border-[#243452] p-12 text-center text-slate-500 dark:text-slate-400 space-y-2">
              <Layers className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-600" />
              <p className="font-semibold text-sm text-slate-800 dark:text-slate-200">
                Nenhum pack de flashcards encontrado para os filtros atuais.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {filteredPacks.map((pack) => {
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
                        {pack.dueCount > 0 ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300">
                            {pack.dueCount} hoje
                          </span>
                        ) : (
                          <span className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                            Em dia
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

                      {/* Mini stats */}
                      <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400">
                        <span>{pack.cards.length} flashcards</span>
                        <div className="flex items-center gap-2">
                          <span className="text-teal-700 dark:text-teal-400 font-semibold">
                            {pack.learningCount} ativos
                          </span>
                          <span>•</span>
                          <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                            {pack.masteredCount} dominados
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="pt-4 mt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedPackId(pack.id)}
                        className="px-2.5 py-1.5 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-teal-700 dark:hover:text-teal-300 flex items-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <Layers className="w-3.5 h-3.5" />
                        <span>Ver Cards ({pack.cards.length})</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          const due = pack.cards.filter((c) => isCardDueToday(c));
                          onStartReview(due.length > 0 ? due : pack.cards);
                        }}
                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs shadow-xs transition-colors cursor-pointer"
                      >
                        <Play className="w-3 h-3 fill-current" />
                        <span>Revisar Pack</span>
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
          <div className="bg-white dark:bg-[#0F172A] rounded-2xl border border-slate-200 dark:border-[#243452] p-4 elev-xs flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="w-full md:w-80 relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <input
                type="text"
                placeholder="Pesquisar por conceito, droga, mecanismo..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-[#243452] bg-slate-50 dark:bg-[#142038] focus:bg-white dark:focus:bg-[#1A2845] focus:outline-none focus:ring-2 focus:ring-teal-500 text-slate-900 dark:text-slate-100 placeholder:text-slate-400"
              />
            </div>

            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar w-full md:w-auto pb-1 md:pb-0 text-xs">
              {[
                { id: 'all', label: `Todos (${flashcards.length})` },
                { id: 'due', label: `Pendentes Hoje (${dueCards.length})` },
                {
                  id: 'learning',
                  label: `Em Aprendizado (${
                    flashcards.filter((c) => c.srs?.state === 'learning' || c.srs?.state === 'new').length
                  })`,
                },
                {
                  id: 'mastered',
                  label: `Dominados (${
                    flashcards.filter((c) => c.srs?.state === 'mastered').length
                  })`,
                },
              ].map((st) => (
                <button
                  key={st.id}
                  type="button"
                  onClick={() => setSelectedStatus(st.id as 'all' | 'due' | 'learning' | 'mastered')}
                  className={`px-3 py-1.5 rounded-xl font-semibold shrink-0 transition-all cursor-pointer ${
                    selectedStatus === st.id
                      ? 'bg-slate-900 dark:bg-teal-600 text-white elev-xs'
                      : 'bg-slate-100 dark:bg-[#142038] text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-[#1A2845]'
                  }`}
                >
                  {st.label}
                </button>
              ))}
            </div>
          </div>

          {filteredCards.length === 0 ? (
            <div className="bg-white dark:bg-[#0F172A] rounded-3xl border border-slate-200 dark:border-[#243452] p-12 text-center text-slate-500 dark:text-slate-400 space-y-2">
              <Layers className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-600" />
              <p className="font-semibold text-sm">Nenhum flashcard encontrado com estes filtros.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredCards.map((card) => {
                const isFlipped = flippedCardIds.includes(card.id);
                const disc = disciplines.find((d) => d.id === card.disciplineId);
                const isDue = isCardDueToday(card);
                const matchingComp = compendiums.find(
                  (c) => c.id === card.compendiumRefId || c.themeId === card.themeId || c.disciplineId === card.disciplineId
                );
                const compendiumId = card.compendiumRefId || matchingComp?.id;

                return (
                  <div
                    key={card.id}
                    onClick={() => toggleFlip(card.id)}
                    className={`bg-white dark:bg-[#0F172A] rounded-3xl border transition-all p-5 elev-xs flex flex-col justify-between cursor-pointer group select-none min-h-[220px] ${
                      isFlipped
                        ? 'border-teal-300 dark:border-teal-600 bg-teal-50/20 dark:bg-teal-950/30 ring-1 ring-teal-400/20'
                        : 'border-slate-200 dark:border-[#243452] hover:border-teal-200 dark:hover:border-teal-600 hover:elev-md'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-teal-50 dark:bg-teal-950/60 text-teal-800 dark:text-teal-300 border border-teal-200/60 dark:border-teal-800/60">
                          {disc?.name || 'Medicina'}
                        </span>
                        <div className="flex items-center gap-1">
                          {isDue && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
                              Revisar Hoje
                            </span>
                          )}
                          {card.isCustom && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteCard(card.id);
                              }}
                              className="p-1 text-slate-300 dark:text-slate-600 hover:text-rose-500 dark:hover:text-rose-400 transition-colors"
                              title="Excluir card personalizado"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="text-xs font-serif-reading mt-2">
                        {!isFlipped ? (
                          <div>
                            <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block mb-1">
                              Pergunta / Conceito:
                            </span>
                            <p className="font-bold text-slate-900 dark:text-slate-100 leading-snug">
                              {card.front}
                            </p>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <span className="text-[10px] font-bold text-teal-700 dark:text-teal-400 uppercase tracking-wider block mb-1">
                              Resposta & Mecanismo:
                            </span>
                            <p className="text-slate-800 dark:text-slate-200 leading-relaxed font-medium">
                              {card.back}
                            </p>
                            {card.mechanismHighlight && (
                              <div className="p-2 bg-teal-50 dark:bg-teal-950/60 rounded-xl text-[11px] text-teal-900 dark:text-teal-200 border border-teal-200/60 dark:border-teal-800/60">
                                <strong>Destaque:</strong> {card.mechanismHighlight}
                              </div>
                            )}
                            {compendiumId && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onOpenCompendium(compendiumId);
                                }}
                                className="mt-2.5 w-full p-2 rounded-xl bg-teal-50 hover:bg-teal-100 dark:bg-teal-950/60 dark:hover:bg-teal-900/80 text-teal-800 dark:text-teal-300 border border-teal-200/80 dark:border-teal-800/60 text-[11px] font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                              >
                                <BookOpen className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                                <span>Ver Teoria na Biblioteca</span>
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px] text-slate-400 dark:text-slate-500">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        <span>Intervalo: {card.srs?.intervalDays ?? 0}d</span>
                      </span>
                      <span className="text-teal-700 dark:text-teal-400 font-semibold group-hover:underline">
                        {isFlipped ? 'Voltar à pergunta' : 'Virar para ver resposta'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
