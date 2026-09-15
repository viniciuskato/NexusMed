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
} from 'lucide-react';
import { Flashcard, Discipline, Theme, Compendium } from '../../types';
import { isCardDueToday } from '../../services/srsAlgorithm';
import { SCOPE_CUSTOM, SCOPE_UNLINKED } from '../../services/thematicPacks';
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
  /**
   * Escopo de material (Prompt 22-A): id de compêndio (cards editoriais que o
   * referenciam explicitamente), `SCOPE_UNLINKED` (cards editoriais sem material
   * declarado) ou `SCOPE_CUSTOM` (os cards criados pelo próprio usuário). Vem da
   * navegação do Estudo Temático e não é persistido.
   */
  filterCompendiumId?: string;
  /** Presente quando se chegou aqui pelo Estudo Temático. */
  onReturnToThematicStudy?: () => void;
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
  filterCompendiumId,
  onReturnToThematicStudy,
}) => {
  // Persistido para sobreviver à troca de seção do app (App.tsx desmonta
  // FlashcardsView ao navegar pra outra view). filterThemeId é contexto
  // explícito de navegação e tem prioridade sobre o filtro lembrado.
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterThemeId]);

  // Recorte de navegação (pack do Estudo Temático). É a base de TUDO nesta
  // visita — contagens, botão de revisão e listagem — para que o que a tela
  // afirma ("X cards pendentes") seja verdade dentro do escopo mostrado.
  const scopedCards = useMemo(() => {
    if (!filterCompendiumId) return flashcards;
    return flashcards.filter((fc) => {
      if (filterCompendiumId === SCOPE_CUSTOM) return Boolean(fc.isCustom);
      if (fc.isCustom) return false;
      const ref = (fc.compendiumRefId ?? '').trim();
      if (filterCompendiumId === SCOPE_UNLINKED) return ref === '';
      return ref === filterCompendiumId;
    });
  }, [flashcards, filterCompendiumId]);

  const dueCards = useMemo(() => {
    return scopedCards.filter((fc) => isCardDueToday(fc));
  }, [scopedCards]);

  const filteredCards = useMemo(() => {
    return scopedCards.filter((fc) => {
      if (selectedDiscipline !== 'all' && fc.disciplineId !== selectedDiscipline) {
        return false;
      }
      if (selectedTheme !== 'all' && fc.themeId !== selectedTheme) {
        return false;
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
  }, [scopedCards, selectedDiscipline, selectedTheme, selectedStatus, searchQuery]);

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

  // Group stats by discipline
  const disciplineStats = useMemo(() => {
    return disciplines.map((disc) => {
      const discCards = scopedCards.filter((c) => c.disciplineId === disc.id);
      const discDue = discCards.filter((c) => isCardDueToday(c));
      return {
        discipline: disc,
        total: discCards.length,
        due: discDue.length,
      };
    });
  }, [disciplines, scopedCards]);

  return (
    <div className="space-y-6">
      {onReturnToThematicStudy && (
        <div
          id="flashcards-return-to-pack"
          className="p-3 sm:px-4 sm:py-2.5 rounded-2xl bg-slate-900/5 dark:bg-teal-950/40 border border-slate-300 dark:border-teal-800/50 elev-xs flex items-center justify-between gap-3"
        >
          <p className="text-xs text-slate-700 dark:text-slate-200 min-w-0">
            <span className="font-bold">Escopo do Estudo Temático:</span>{' '}
            {filterCompendiumId === SCOPE_CUSTOM
              ? 'seus cards personalizados'
              : filterCompendiumId === SCOPE_UNLINKED
              ? 'cards do tema sem material associado'
              : 'cards que referenciam o material do pack'}
            .
          </p>
          <button
            type="button"
            onClick={onReturnToThematicStudy}
            className="px-3 py-1.5 rounded-xl bg-slate-900 dark:bg-teal-600 hover:bg-slate-800 dark:hover:bg-teal-700 text-white text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shrink-0"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Voltar ao Estudo Temático</span>
          </button>
        </div>
      )}
      {/* View Header */}
      <div className="bg-gradient-to-r from-teal-900 via-slate-900 to-emerald-950 rounded-3xl p-6 sm:p-8 text-white elev-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="max-w-2xl space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-teal-500/20 text-teal-300 text-xs font-semibold border border-teal-400/30">
            <Brain className="w-3.5 h-3.5" />
            <span>Repetição Espaçada Inteligente (SRS)</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
            Flashcards com Algoritmo SM-2 Baseado em Evidências
          </h1>
          <p className="text-slate-300 text-xs sm:text-sm leading-relaxed">
            Memorize diretrizes, critérios diagnósticos e farmacodinâmica de forma duradoura. Cada cartão traz o mecanismo fisiopatológico resumido e link direto para o compêndio.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 shrink-0 w-full sm:w-auto">
          <button
            onClick={() => onStartReview(dueCards.length > 0 ? dueCards : flashcards)}
            disabled={flashcards.length === 0}
            className="px-6 py-3.5 rounded-2xl bg-gradient-to-r from-teal-400 to-emerald-400 hover:from-teal-300 hover:to-emerald-300 text-slate-950 font-extrabold text-xs elev-lg shadow-teal-500/20 transition-all flex items-center justify-center gap-2"
          >
            <Play className="w-4 h-4 fill-slate-950" />
            <span>
              {dueCards.length > 0
                ? `Revisar ${dueCards.length} Cards Pendentes Hoje`
                : 'Revisar Todos os Cards'}
            </span>
          </button>

          <button
            onClick={onOpenCreateModal}
            className="px-4 py-3.5 rounded-2xl bg-white/10 hover:bg-white/20 border border-white/20 text-white font-bold text-xs transition-colors flex items-center justify-center gap-2"
          >
            <Plus className="w-4 h-4" />
            <span>Criar Flashcard</span>
          </button>
        </div>
      </div>

      {/* Discipline Decks Preview Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {disciplineStats.map(({ discipline, total, due }) => (
          <div
            key={discipline.id}
            onClick={() => {
              setSelectedDiscipline(discipline.id);
              setSelectedTheme('all');
            }}
            className={`p-4 rounded-2xl border transition-all cursor-pointer shadow-2xs ${
              selectedDiscipline === discipline.id
                ? 'bg-teal-50 dark:bg-teal-950/50 border-teal-600 dark:border-teal-400 ring-2 ring-teal-600/20'
                : 'bg-white dark:bg-[#0E1726] border-slate-300/80 dark:border-[#243652] hover:border-teal-500/60 hover:bg-slate-50 dark:hover:bg-[#142038]'
            }`}
          >
            <span className="text-[11px] font-bold text-slate-900 dark:text-slate-100 block truncate">
              {discipline.name}
            </span>
            <div className="mt-2 flex items-center justify-between text-xs">
              <span className="text-slate-600 dark:text-slate-400 font-medium">{total} cards</span>
              {due > 0 ? (
                <span className="px-1.5 py-0.5 rounded-md bg-teal-100 dark:bg-teal-950/70 text-teal-900 dark:text-teal-300 font-bold text-[10px]">
                  {due} hoje
                </span>
              ) : (
                <span className="text-emerald-700 dark:text-emerald-400 text-[10px] font-semibold">Em dia</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white dark:bg-[#0E1726] rounded-2xl border border-slate-300/80 dark:border-[#243652] p-4 elev-xs flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="w-full md:w-80 relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
          <input
            type="text"
            placeholder="Pesquisar por conceito, droga, mecanismo..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-[#263750] bg-white dark:bg-[#142038] focus:bg-white dark:focus:bg-[#1A2845] focus:outline-none focus:ring-2 focus:ring-teal-500/30 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 shadow-2xs"
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
              onClick={() => setSelectedStatus(st.id as any)}
              className={`px-3 py-1.5 rounded-xl font-semibold shrink-0 transition-all cursor-pointer ${
                selectedStatus === st.id
                  ? 'bg-slate-900 dark:bg-teal-600 text-white elev-xs font-bold'
                  : 'bg-white dark:bg-[#142038] text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-[#263750] hover:bg-slate-50 dark:hover:bg-[#1A2845] hover:border-slate-400 shadow-2xs'
              }`}
            >
              {st.label}
            </button>
          ))}
        </div>
      </div>

      {/* Flashcards List */}
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
            const th = themes.find((t) => t.id === card.themeId);
            const isDue = isCardDueToday(card);
            const matchingComp = compendiums.find(
              (c) => c.id === card.compendiumRefId || c.themeId === card.themeId || c.disciplineId === card.disciplineId
            );
            const compendiumId = card.compendiumRefId || matchingComp?.id;

            return (
              <div
                key={card.id}
                onClick={() => toggleFlip(card.id)}
                className={`bg-white dark:bg-[#0E1726] rounded-3xl border transition-all p-5 elev-xs flex flex-col justify-between cursor-pointer group select-none min-h-[220px] ${
                  isFlipped
                    ? 'border-teal-400 dark:border-teal-500 bg-teal-50/40 dark:bg-teal-950/40 ring-2 ring-teal-500/20'
                    : 'border-slate-300/80 dark:border-[#243652] hover:border-teal-500/60 dark:hover:border-teal-500 hover:elev-md'
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
  );
};
