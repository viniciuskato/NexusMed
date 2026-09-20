import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  Search,
  X,
  BookOpen,
  HelpCircle,
  Layers,
  ChevronRight,
} from 'lucide-react';
import { Compendium, Question, Flashcard } from '../types';
import { useDialogA11y } from '../hooks/useDialogA11y';
import { parseInline } from './common/SafeMarkdown';

interface GlobalSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  compendiums: Compendium[];
  questions: Question[];
  flashcards: Flashcard[];
  onNavigateToCompendium: (compendiumId: string, sectionId?: string) => void;
  onNavigateToQuestion: (questionId: string) => void;
  onNavigateToFlashcards: (filterTag?: string) => void;
}

export const GlobalSearchModal: React.FC<GlobalSearchModalProps> = ({
  isOpen,
  onClose,
  compendiums,
  questions,
  flashcards,
  onNavigateToCompendium,
  onNavigateToQuestion,
  onNavigateToFlashcards,
}) => {
  const [query, setQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'compendium' | 'question' | 'card'>('all');

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

  const results = useMemo(() => {
    if (!query.trim() || query.length < 2) return { compendiums: [], questions: [], cards: [] };
    const q = query.toLowerCase().trim();

    const matchedCompendiums = compendiums.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        c.subtitle.toLowerCase().includes(q) ||
        c.sections.some((s) => s.title.toLowerCase().includes(q) || s.content.toLowerCase().includes(q))
    );

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
      compendiums: matchedCompendiums,
      questions: matchedQuestions,
      cards: matchedCards,
    };
  }, [query, compendiums, questions, flashcards]);

  // Foco inicial no campo de busca (antes era `autoFocus`); Escape, Tab preso
  // e devolução de foco ficam com o hook.
  const searchInputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useDialogA11y<HTMLDivElement>({ isOpen, onClose, initialFocusRef: searchInputRef });

  if (!isOpen) return null;

  const totalResults =
    results.compendiums.length +
    results.questions.length +
    results.cards.length;

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
            type="text"
            placeholder="Pesquisar mecanismo, doença, droga (ex: sepse, ICFEr, noradrenalina, GINA)..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 text-sm sm:text-base text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none bg-transparent"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="p-1 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#142038] cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={onClose}
            className="text-[11px] font-semibold px-2 py-1 rounded-md bg-slate-100 dark:bg-[#142038] text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-[#1A2845] border border-slate-200/80 dark:border-[#243452] cursor-pointer"
          >
            ESC
          </button>
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 px-4 py-2 border-b border-slate-100 dark:border-[#243452] bg-slate-50/70 dark:bg-[#0B1220]/70 text-xs overflow-x-auto no-scrollbar">
          <button
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
            onClick={() => setActiveFilter('compendium')}
            className={`px-2.5 py-1 rounded-lg font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
              activeFilter === 'compendium'
                ? 'bg-teal-700 dark:bg-teal-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200/70 dark:hover:bg-[#142038]'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>Conteúdos ({results.compendiums.length})</span>
          </button>
          <button
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

        {/* Results List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-4">
          {!query.trim() ? (
            <div className="py-12 text-center text-slate-400 dark:text-slate-500 space-y-2">
              <Search className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-600" />
              <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
                Digite pelo menos 2 letras para pesquisar no acervo médico completo.
              </p>
              <div className="flex justify-center flex-wrap gap-2 pt-2 text-xs text-slate-500 dark:text-slate-400">
                <span>Sugestões clínicas:</span>
                <button onClick={() => setQuery('ICFEr')} className="underline text-teal-600 dark:text-teal-400 hover:text-teal-700 font-medium cursor-pointer">ICFEr</button>
                <button onClick={() => setQuery('Sepse')} className="underline text-teal-600 dark:text-teal-400 hover:text-teal-700 font-medium cursor-pointer">Sepse</button>
                <button onClick={() => setQuery('Asma')} className="underline text-teal-600 dark:text-teal-400 hover:text-teal-700 font-medium cursor-pointer">Asma</button>
                <button onClick={() => setQuery('PBE')} className="underline text-teal-600 dark:text-teal-400 hover:text-teal-700 font-medium cursor-pointer">PBE</button>
              </div>
            </div>
          ) : totalResults === 0 ? (
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
              {(activeFilter === 'all' || activeFilter === 'compendium') && results.compendiums.length > 0 && (
                <div>
                  <div className="px-2 py-1 text-[11px] font-bold uppercase tracking-wider text-teal-700 dark:text-teal-400 flex items-center gap-1.5">
                    <BookOpen className="w-3.5 h-3.5" />
                    <span>Conteúdos Teóricos & Diretrizes</span>
                  </div>
                  <div className="space-y-1.5 mt-1">
                    {results.compendiums.map((comp) => (
                      <button
                        key={comp.id}
                        onClick={() => {
                          onNavigateToCompendium(comp.id);
                          onClose();
                        }}
                        className="w-full text-left p-2.5 rounded-xl border border-slate-200/80 dark:border-[#243452] bg-white dark:bg-[#142038] hover:border-teal-300 dark:hover:border-teal-500 hover:bg-teal-50/50 dark:hover:bg-teal-950/30 transition-all flex items-center justify-between group cursor-pointer"
                      >
                        <div className="space-y-0.5">
                          <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100 group-hover:text-teal-800 dark:group-hover:text-teal-300">
                            {comp.title}
                          </h4>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-1">{comp.subtitle}</p>
                          <span className="text-[10px] text-teal-600 dark:text-teal-400 font-medium">
                            {comp.sections.length} seções • {comp.estimatedReadTimeMinutes} min de leitura
                          </span>
                        </div>
                        <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-teal-600 dark:group-hover:text-teal-400 shrink-0" />
                      </button>
                    ))}
                  </div>
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
                            {qItem.questionStem}
                          </p>
                          <p className="text-[10px] text-slate-500 dark:text-slate-400 line-clamp-1">
                            {qItem.highYieldSummary}
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
