import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  Search,
  X,
  BookOpen,
  HelpCircle,
  Layers,
  ChevronRight,
} from 'lucide-react';
import { Discipline, Question, Flashcard } from '../types';
import { useDialogA11y } from '../hooks/useDialogA11y';
import { parseInline } from './common/SafeMarkdown';
import { HighlightedText } from './common/HighlightedText';
import { searchMaterials, type MaterialSearchResult } from '../repositories/MaterialSearchRepository';

interface GlobalSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  disciplines: Discipline[];
  questions: Question[];
  flashcards: Flashcard[];
  onNavigateToCompendium: (compendiumId: string, sectionId?: string) => void;
  onNavigateToQuestion: (questionId: string) => void;
  onNavigateToFlashcards: (filterTag?: string) => void;
}

// Espera entre a última tecla e a ida ao banco.
const SEARCH_DEBOUNCE_MS = 250;

interface MaterialSearchState {
  /** Consulta + filtros a que este resultado responde. */
  key: string;
  results: MaterialSearchResult[];
  failed: boolean;
}

const STATUS_BADGE: Partial<Record<MaterialSearchResult['status'], string>> = {
  draft: 'Rascunho',
  archived: 'Arquivado',
};

export const GlobalSearchModal: React.FC<GlobalSearchModalProps> = ({
  isOpen,
  onClose,
  disciplines,
  questions,
  flashcards,
  onNavigateToCompendium,
  onNavigateToQuestion,
  onNavigateToFlashcards,
}) => {
  const [query, setQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'compendium' | 'question' | 'card'>('all');
  const [disciplineId, setDisciplineId] = useState('');
  const [onlyUnread, setOnlyUnread] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        // Toggle search
      }
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // ── Conteúdos: busca no banco (43-D) ──────────────────────────────────────
  // Cada combinação de consulta + filtros tem uma chave; só a resposta da
  // chave mais recente entra na tela, então uma resposta atrasada de algo
  // digitado antes nunca sobrescreve a atual.
  const trimmedQuery = query.trim();
  const searchKey = trimmedQuery.length >= 2 ? JSON.stringify([trimmedQuery, disciplineId, onlyUnread]) : '';
  const latestSearchKeyRef = useRef('');
  const [materialSearch, setMaterialSearch] = useState<MaterialSearchState | null>(null);

  useEffect(() => {
    latestSearchKeyRef.current = searchKey;
    if (!isOpen || !searchKey) return;
    const timer = setTimeout(() => {
      searchMaterials(trimmedQuery, { disciplineId: disciplineId || undefined, onlyUnread }).then(
        (results) => {
          if (latestSearchKeyRef.current === searchKey) setMaterialSearch({ key: searchKey, results, failed: false });
        },
        () => {
          if (latestSearchKeyRef.current === searchKey) setMaterialSearch({ key: searchKey, results: [], failed: true });
        }
      );
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [isOpen, searchKey, trimmedQuery, disciplineId, onlyUnread]);

  const materialStatus: 'idle' | 'loading' | 'done' | 'error' = !searchKey
    ? 'idle'
    : materialSearch?.key !== searchKey
    ? 'loading'
    : materialSearch.failed
    ? 'error'
    : 'done';
  // Enquanto a próxima resposta não chega, o resultado anterior fica na tela
  // (sem piscar a cada tecla); em erro, nada antigo fica parecendo atual.
  const materialResults =
    materialStatus === 'idle' || materialStatus === 'error' || materialSearch?.failed ? [] : materialSearch?.results ?? [];

  // ── Questões e flashcards: filtro local, como antes ───────────────────────
  const results = useMemo(() => {
    if (!query.trim() || query.length < 2) return { questions: [], cards: [] };
    const q = query.toLowerCase().trim();

    const matchedQuestions = questions.filter(
      (ques) =>
        ques.clinicalVignette.toLowerCase().includes(q) ||
        ques.questionStem.toLowerCase().includes(q) ||
        ques.generalCommentary.toLowerCase().includes(q) ||
        ques.tags.some((t) => t.toLowerCase().includes(q))
    );

    const matchedCards = flashcards.filter(
      (fc) =>
        fc.front.toLowerCase().includes(q) ||
        fc.back.toLowerCase().includes(q) ||
        fc.mechanismHighlight.toLowerCase().includes(q) ||
        fc.tags.some((t) => t.toLowerCase().includes(q))
    );

    return {
      questions: matchedQuestions,
      cards: matchedCards,
    };
  }, [query, questions, flashcards]);

  // Foco inicial no campo de busca (antes era `autoFocus`); Escape, Tab preso
  // e devolução de foco ficam com o hook.
  const searchInputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useDialogA11y<HTMLDivElement>({ isOpen, onClose, initialFocusRef: searchInputRef });

  if (!isOpen) return null;

  const totalResults =
    materialResults.length +
    results.questions.length +
    results.cards.length;
  const showCompendiums = activeFilter === 'all' || activeFilter === 'compendium';

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 sm:pt-24 px-4 bg-slate-900/60 dark:bg-black/70 backdrop-blur-xs animate-in fade-in duration-150">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="global-search-title"
        className="w-full max-w-2xl bg-white dark:bg-[#0F172A] rounded-2xl elev-2xl border border-slate-200 dark:border-[#243452] overflow-hidden flex flex-col max-h-[80vh] shadow-2xl"
      >
        <h2 id="global-search-title" className="sr-only">
          Busca global
        </h2>
        {/* Search Input Bar */}
        <div className="flex items-center px-4 py-3.5 border-b border-slate-200 dark:border-[#243452] gap-3 bg-white dark:bg-[#0F172A]">
          <Search className="w-5 h-5 text-teal-600 dark:text-teal-400 shrink-0" />
          <input
            ref={searchInputRef}
            id="global-search-input"
            type="text"
            aria-label="Pesquisar no acervo"
            placeholder="Pesquisar mecanismo, doença, droga (ex: sepse, ICFEr, noradrenalina, GINA)..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 text-sm sm:text-base text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none bg-transparent"
          />
          {query && (
            <button
              type="button"
              aria-label="Limpar busca"
              onClick={() => setQuery('')}
              className="p-1 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#142038] cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="text-[11px] font-semibold px-2 py-1 rounded-md bg-slate-100 dark:bg-[#142038] text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-[#1A2845] border border-slate-200/80 dark:border-[#243452] cursor-pointer"
          >
            ESC
          </button>
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 px-4 py-2 border-b border-slate-100 dark:border-[#243452] bg-slate-50/70 dark:bg-[#0B1220]/70 text-xs overflow-x-auto no-scrollbar">
          <button
            type="button"
            onClick={() => setActiveFilter('all')}
            className={`px-2.5 py-1 rounded-lg font-semibold transition-colors cursor-pointer ${
              activeFilter === 'all'
                ? 'bg-slate-900 dark:bg-teal-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200/70 dark:hover:bg-[#142038]'
            }`}
          >
            Tudo ({totalResults})
          </button>
          <button
            type="button"
            onClick={() => setActiveFilter('compendium')}
            className={`px-2.5 py-1 rounded-lg font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
              activeFilter === 'compendium'
                ? 'bg-teal-700 dark:bg-teal-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200/70 dark:hover:bg-[#142038]'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>Conteúdos ({materialResults.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveFilter('question')}
            className={`px-2.5 py-1 rounded-lg font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
              activeFilter === 'question'
                ? 'bg-teal-700 dark:bg-teal-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200/70 dark:hover:bg-[#142038]'
            }`}
          >
            <HelpCircle className="w-3.5 h-3.5" />
            <span>Questões ({results.questions.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveFilter('card')}
            className={`px-2.5 py-1 rounded-lg font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
              activeFilter === 'card'
                ? 'bg-teal-700 dark:bg-teal-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200/70 dark:hover:bg-[#142038]'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Flashcards ({results.cards.length})</span>
          </button>
        </div>

        {/* Filtros dos conteúdos */}
        {showCompendiums && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2 border-b border-slate-100 dark:border-[#243452] text-xs text-slate-600 dark:text-slate-400">
            <select
              aria-label="Filtrar por disciplina"
              value={disciplineId}
              onChange={(e) => setDisciplineId(e.target.value)}
              className="max-w-[60%] rounded-lg border border-slate-200 dark:border-[#243452] bg-white dark:bg-[#142038] text-slate-700 dark:text-slate-200 px-2 py-1 cursor-pointer"
            >
              <option value="">Todas as disciplinas</option>
              {disciplines.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={onlyUnread}
                onChange={(e) => setOnlyUnread(e.target.checked)}
                className="accent-teal-600 cursor-pointer"
              />
              Só o que ainda não li
            </label>
          </div>
        )}

        {/* Results List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-4">
          {!query.trim() ? (
            <div className="py-12 text-center text-slate-400 dark:text-slate-500 space-y-2">
              <Search className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-600" />
              <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
                Digite pelo menos 2 letras para pesquisar no acervo médico completo.
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Várias palavras em qualquer ordem; acento não importa. Use aspas para uma frase exata.
              </p>
              <div className="flex justify-center flex-wrap gap-2 pt-2 text-xs text-slate-500 dark:text-slate-400">
                <span>Sugestões clínicas:</span>
                <button type="button" onClick={() => setQuery('ICFEr')} className="underline text-teal-600 dark:text-teal-400 hover:text-teal-700 font-medium cursor-pointer">ICFEr</button>
                <button type="button" onClick={() => setQuery('Sepse')} className="underline text-teal-600 dark:text-teal-400 hover:text-teal-700 font-medium cursor-pointer">Sepse</button>
                <button type="button" onClick={() => setQuery('Asma')} className="underline text-teal-600 dark:text-teal-400 hover:text-teal-700 font-medium cursor-pointer">Asma</button>
                <button type="button" onClick={() => setQuery('PBE')} className="underline text-teal-600 dark:text-teal-400 hover:text-teal-700 font-medium cursor-pointer">PBE</button>
              </div>
            </div>
          ) : totalResults === 0 && materialStatus !== 'loading' && materialStatus !== 'error' ? (
            <div className="py-12 text-center text-slate-500 dark:text-slate-400">
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                Nenhum resultado encontrado para "{query}".
              </p>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                Tente pesquisar por palavras-chave clínicas, diretrizes ou nomes de fármacos.
              </p>
            </div>
          ) : (
            <>
              {/* Compendiums Match */}
              {showCompendiums && (materialResults.length > 0 || materialStatus === 'loading' || materialStatus === 'error') && (
                <div>
                  <div className="px-2 py-1 text-[11px] font-bold uppercase tracking-wider text-teal-700 dark:text-teal-400 flex items-center gap-1.5">
                    <BookOpen className="w-3.5 h-3.5" />
                    <span>Conteúdos Teóricos & Diretrizes</span>
                    {materialStatus === 'loading' && (
                      <span role="status" className="ml-auto normal-case tracking-normal font-medium text-slate-400 dark:text-slate-500">
                        Buscando…
                      </span>
                    )}
                  </div>
                  {materialStatus === 'error' ? (
                    <p role="alert" className="px-2 py-2 text-xs text-rose-700 dark:text-rose-300">
                      Não foi possível buscar os conteúdos agora. Verifique a conexão e tente de novo.
                    </p>
                  ) : (
                    <div className="space-y-1.5 mt-1">
                      {materialResults.map((item) => (
                        <button
                          type="button"
                          key={item.materialId}
                          onClick={() => {
                            onNavigateToCompendium(item.materialId, item.sectionId ?? undefined);
                            onClose();
                          }}
                          className="w-full text-left p-2.5 rounded-xl border border-slate-200/80 dark:border-[#243452] bg-white dark:bg-[#142038] hover:border-teal-300 dark:hover:border-teal-500 hover:bg-teal-50/50 dark:hover:bg-teal-950/30 transition-all flex items-center justify-between gap-2 group cursor-pointer"
                        >
                          <div className="space-y-0.5 min-w-0">
                            {item.treePath.length > 0 && (
                              <p className="text-[10px] text-slate-400 dark:text-slate-500 truncate">
                                {item.treePath.join(' › ')}
                              </p>
                            )}
                            <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100 group-hover:text-teal-800 dark:group-hover:text-teal-300">
                              <HighlightedText text={item.titleMarked} />
                              {STATUS_BADGE[item.status] && (
                                <span className="ml-1.5 align-middle text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                                  {STATUS_BADGE[item.status]}
                                </span>
                              )}
                            </h4>
                            {item.sectionTitleMarked && (
                              <p className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                                §&nbsp;<HighlightedText text={item.sectionTitleMarked} />
                              </p>
                            )}
                            {item.snippet && (
                              <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-3">
                                <HighlightedText text={item.snippet} />
                              </p>
                            )}
                            <span className="text-[10px] text-teal-600 dark:text-teal-400 font-medium">
                              {item.estimatedReadTimeMinutes} min de leitura
                            </span>
                          </div>
                          <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-teal-600 dark:group-hover:text-teal-400 shrink-0" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Questions Match */}
              {(activeFilter === 'all' || activeFilter === 'question') && results.questions.length > 0 && (
                <div>
                  <div className="px-2 py-1 text-[11px] font-bold uppercase tracking-wider text-blue-700 dark:text-blue-400 flex items-center gap-1.5">
                    <HelpCircle className="w-3.5 h-3.5" />
                    <span>Banco de Questões Comentadas</span>
                  </div>
                  <div className="space-y-1.5 mt-1">
                    {results.questions.map((qItem) => (
                      <button
                        type="button"
                        key={qItem.id}
                        onClick={() => {
                          onNavigateToQuestion(qItem.id);
                          onClose();
                        }}
                        className="w-full text-left p-2.5 rounded-xl border border-slate-200/80 dark:border-[#243452] bg-white dark:bg-[#142038] hover:border-blue-300 dark:hover:border-blue-500 hover:bg-blue-50/50 dark:hover:bg-blue-950/30 transition-all flex items-center justify-between group cursor-pointer"
                      >
                        <div className="space-y-0.5 max-w-[85%]">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-blue-100 dark:bg-blue-950/80 text-blue-800 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                              {qItem.institution} {qItem.year}
                            </span>
                            <span className="text-[10px] text-slate-400 dark:text-slate-400 uppercase font-semibold">
                              Dificuldade: {qItem.difficulty}
                            </span>
                          </div>
                          <p className="text-xs text-slate-800 dark:text-slate-200 font-medium line-clamp-2">
                            {parseInline(qItem.questionStem)}
                          </p>
                          <p className="text-[10px] text-slate-500 dark:text-slate-400 line-clamp-1">
                            {parseInline(qItem.highYieldSummary)}
                          </p>
                        </div>
                        <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-blue-600 dark:group-hover:text-blue-400 shrink-0" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Flashcards Match */}
              {(activeFilter === 'all' || activeFilter === 'card') && results.cards.length > 0 && (
                <div>
                  <div className="px-2 py-1 text-[11px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5" />
                    <span>Flashcards de Repetição Espaçada</span>
                  </div>
                  <div className="space-y-1.5 mt-1">
                    {results.cards.map((fc) => (
                      <button
                        type="button"
                        key={fc.id}
                        onClick={() => {
                          onNavigateToFlashcards(fc.tags[0]);
                          onClose();
                        }}
                        className="w-full text-left p-2.5 rounded-xl border border-slate-200/80 dark:border-[#243452] bg-white dark:bg-[#142038] hover:border-emerald-300 dark:hover:border-emerald-500 hover:bg-emerald-50/50 dark:hover:bg-emerald-950/30 transition-all flex items-center justify-between group cursor-pointer"
                      >
                        <div className="space-y-0.5 max-w-[85%]">
                          <p className="text-xs font-semibold text-slate-900 dark:text-slate-100 line-clamp-1">
                            {fc.front}
                          </p>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-1">
                            {parseInline(fc.mechanismHighlight || fc.back)}
                          </p>
                          <div className="flex gap-1 flex-wrap">
                            {fc.tags.map((t) => (
                              <span key={t} className="text-[9px] px-1 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded">
                                #{t}
                              </span>
                            ))}
                          </div>
                        </div>
                        <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 shrink-0" />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer info */}
        <div className="p-3 bg-slate-50 dark:bg-[#0B1220] border-t border-slate-100 dark:border-[#243452] flex items-center justify-between text-xs text-slate-400 dark:text-slate-500">
          <span>Pressione <kbd className="px-1 py-0.5 bg-white dark:bg-[#142038] border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded font-mono text-[10px]">ESC</kbd> para fechar</span>
          <span className="text-teal-700 dark:text-teal-400 font-medium">Pesquisa unificada em 3 bases de conhecimento</span>
        </div>
      </div>
    </div>
  );
};
