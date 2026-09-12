import { sourceVerificationLabel } from '../../utils/bibliographicSources';
import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  RotateCw,
  Sparkles,
  BookOpen,
  Award,
  Link2,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { Flashcard, Discipline, Theme } from '../../types';
import { flashcardsRepository } from '../../repositories/FlashcardsRepository';

interface FlashcardReviewerProps {
  cards: Flashcard[];
  disciplines: Discipline[];
  themes: Theme[];
  deckTitle: string;
  onFinish: () => void;
  onOpenCompendium: (compendiumId: string) => void;
}

export const FlashcardReviewer: React.FC<FlashcardReviewerProps> = ({
  cards,
  disciplines,
  themes,
  deckTitle,
  onFinish,
  onOpenCompendium,
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [reviewCount, setReviewCount] = useState(0);
  const [sessionCompleted, setSessionCompleted] = useState(false);

  // Keyboard shortcut listener (Space to flip, 1-4 to rate)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (sessionCompleted) return;

      if (e.code === 'Space') {
        e.preventDefault();
        setIsFlipped((prev) => !prev);
      } else if (isFlipped) {
        if (e.key === '1') handleRate(1);
        else if (e.key === '2') handleRate(2);
        else if (e.key === '3') handleRate(3);
        else if (e.key === '4') handleRate(4);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFlipped, currentIndex, sessionCompleted]);

  const currentCard = cards[currentIndex];

  const handleRate = async (rating: 1 | 2 | 3 | 4) => {
    if (!currentCard) return;

    await flashcardsRepository.reviewFlashcard(currentCard.id, rating);
    setReviewCount((prev) => prev + 1);

    if (currentIndex < cards.length - 1) {
      setIsFlipped(false);
      setCurrentIndex((prev) => prev + 1);
    } else {
      setSessionCompleted(true);
      try {
        confetti({
          particleCount: 70,
          spread: 60,
          origin: { y: 0.6 },
        });
      } catch {
        // Confete é só um efeito decorativo — falhar aqui não deve
        // impedir o fluxo real de revisão do flashcard.
      }
    }
  };

  const discipline = disciplines.find((d) => d.id === currentCard?.disciplineId);
  const theme = themes.find((t) => t.id === currentCard?.themeId);

  return (
    <div className="space-y-6 pb-20">
      {/* Top Header */}
      <div className="sticky top-[61px] z-20 bg-white/95 backdrop-blur-md border-b border-slate-200 px-4 lg:px-8 py-3 -mx-4 lg:-mx-8">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              onClick={onFinish}
              className="p-1.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100"
              title="Voltar aos Decks"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <h2 className="text-xs sm:text-sm font-bold text-slate-900">{deckTitle}</h2>
              <p className="text-[11px] text-slate-500">
                Card {Math.min(currentIndex + 1, cards.length)} de {cards.length}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[11px] text-slate-400 font-mono hidden sm:inline">
              [Espaço] Virar • [1-4] Avaliar
            </span>
          </div>
        </div>
      </div>

      {/* Main Reviewer Container */}
      <div className="max-w-3xl mx-auto space-y-6 pt-4">
        {!sessionCompleted && currentCard ? (
          <div className="space-y-6">
            {/* Flashcard Card Element */}
            <div
              onClick={() => setIsFlipped(!isFlipped)}
              className="bg-white dark:bg-[#0F172A] rounded-3xl border border-slate-200 dark:border-[#243452] p-8 sm:p-12 elev-sm hover:elev-md transition-all cursor-pointer min-h-[340px] flex flex-col justify-between relative group"
            >
              {/* Card Meta Header */}
              <div className="flex items-center justify-between gap-2 pb-4 border-b border-slate-100 dark:border-slate-800 text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-teal-800 dark:text-teal-300 bg-teal-50 dark:bg-teal-950/60 px-2.5 py-0.5 rounded-md border border-teal-200/60 dark:border-teal-800/60">
                    {discipline?.name || 'Medicina'}
                  </span>
                  <span className="font-semibold text-slate-600 dark:text-slate-300">
                    {theme?.name || 'Tema'}
                  </span>
                </div>

                <div className="flex items-center gap-2 text-slate-400 dark:text-slate-500">
                  <RotateCw className="w-3.5 h-3.5 group-hover:rotate-180 transition-transform duration-300" />
                  <span className="text-[11px] font-medium">Clique para virar</span>
                </div>
              </div>

              {/* Card Body (Front vs Back) */}
              <div className="py-8 my-auto text-center space-y-4">
                {!isFlipped ? (
                  <div className="space-y-3 animate-in fade-in duration-200">
                    <span className="text-[11px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 block">
                      FRENTE (CONCEITO / QUESTÃO)
                    </span>
                    <p className="text-lg sm:text-2xl font-bold text-slate-900 dark:text-slate-100 leading-snug">
                      {currentCard.front}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4 animate-in fade-in duration-200">
                    <span className="text-[11px] font-bold uppercase tracking-widest text-teal-600 dark:text-teal-400 block">
                      VERSO (RESPOSTA & EXPLICAÇÃO)
                    </span>
                    <p className="text-base sm:text-xl font-semibold text-slate-900 dark:text-slate-100 leading-relaxed font-serif-reading whitespace-pre-line text-left max-w-xl mx-auto">
                      {currentCard.back}
                    </p>

                    {/* Mechanism Highlight */}
                    {currentCard.mechanismHighlight && (
                      <div className="p-3.5 rounded-2xl bg-teal-50 dark:bg-teal-950/40 border border-teal-200/80 dark:border-teal-800 text-xs text-teal-950 dark:text-teal-200 font-medium text-left max-w-xl mx-auto flex items-start gap-2">
                        <Sparkles className="w-4 h-4 text-teal-700 dark:text-teal-400 shrink-0 mt-0.5" />
                        <div>
                          <strong className="block text-teal-900 dark:text-teal-300">Mecanismo-Chave:</strong>
                          <span>{currentCard.mechanismHighlight}</span>
                        </div>
                      </div>
                    )}
                    {/* Fonte bibliográfica (distinta do material de origem — ver
                        botão "Ver no Compêndio" no rodapé). Herdada da questão
                        que originou o flashcard, via question_references. Só
                        aparece quando existe vínculo estruturado real. */}
                    {currentCard.bibliographicSources && currentCard.bibliographicSources.length > 0 && (
                      <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 text-xs text-left max-w-xl mx-auto">
                        <strong className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300 mb-1">
                          <Link2 className="w-3.5 h-3.5" />
                          Bibliografia herdada da questão:
                        </strong>
                        <p className="mb-2">Referências da questão de origem; sem verificação específica deste flashcard.</p>
                        <ul className="space-y-1">
                          {currentCard.bibliographicSources.map((src) => (
                            <li key={src.sourceId} className="text-slate-500 dark:text-slate-400">
                              {src.url ? (
                                <a
                                  href={src.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className="text-teal-700 dark:text-teal-400 hover:underline"
                                >
                                  {src.citationText}
                                </a>
                              ) : (
                                <span>{src.citationText}</span>
                              )}
                              <span className="block text-[11px]">{sourceVerificationLabel(src.verificacao)}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Card Footer tags and compendium jump */}
              <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400 dark:text-slate-500">
                <div className="flex gap-1">
                  {currentCard.tags.map((t) => (
                    <span key={t} className="text-[10px] px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-md">
                      #{t}
                    </span>
                  ))}
                </div>

                {isFlipped && currentCard.compendiumRefId && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenCompendium(currentCard.compendiumRefId!);
                    }}
                    className="text-xs font-semibold text-teal-700 hover:text-teal-900 underline flex items-center gap-1"
                  >
                    <BookOpen className="w-3.5 h-3.5" />
                    <span>Ver no Compêndio</span>
                  </button>
                )}
              </div>
            </div>

            {/* SRS Rating Actions (Visible when flipped) */}
            {isFlipped ? (
              <div className="bg-white rounded-3xl border border-slate-200 p-4 elev-xs space-y-3 animate-in fade-in">
                <div className="text-center text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Como foi a sua recordação deste conceito? (Algoritmo SM-2)
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {/* Rating 1: Errei */}
                  <button
                    onClick={() => handleRate(1)}
                    className="p-3 rounded-2xl bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-900 transition-all flex flex-col items-center gap-1 group"
                  >
                    <span className="font-bold text-xs group-hover:scale-105 transition-transform">
                      1 • Errei
                    </span>
                    <span className="text-[10px] text-rose-600">Rever hoje (10 min)</span>
                  </button>

                  {/* Rating 2: Difícil */}
                  <button
                    onClick={() => handleRate(2)}
                    className="p-3 rounded-2xl bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-900 transition-all flex flex-col items-center gap-1 group"
                  >
                    <span className="font-bold text-xs group-hover:scale-105 transition-transform">
                      2 • Difícil
                    </span>
                    <span className="text-[10px] text-amber-600">Rever em 2 dias</span>
                  </button>

                  {/* Rating 3: Bom */}
                  <button
                    onClick={() => handleRate(3)}
                    className="p-3 rounded-2xl bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-900 transition-all flex flex-col items-center gap-1 group"
                  >
                    <span className="font-bold text-xs group-hover:scale-105 transition-transform">
                      3 • Bom
                    </span>
                    <span className="text-[10px] text-blue-600">Rever em 4 dias</span>
                  </button>

                  {/* Rating 4: Fácil */}
                  <button
                    onClick={() => handleRate(4)}
                    className="p-3 rounded-2xl bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-900 transition-all flex flex-col items-center gap-1 group"
                  >
                    <span className="font-bold text-xs group-hover:scale-105 transition-transform">
                      4 • Fácil
                    </span>
                    <span className="text-[10px] text-emerald-600">Rever em 7+ dias</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-center">
                <button
                  onClick={() => setIsFlipped(true)}
                  className="px-8 py-3 rounded-2xl bg-teal-600 hover:bg-teal-700 dark:bg-slate-900 dark:hover:bg-slate-800 text-white font-bold text-xs elev-md transition-all"
                >
                  Mostrar Resposta (Espaço)
                </button>
              </div>
            )}
          </div>
        ) : (
          /* Session Completed Screen */
          <div className="bg-white rounded-3xl border border-slate-200 p-8 sm:p-12 text-center space-y-6 elev-sm animate-in fade-in">
            <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto">
              <Award className="w-8 h-8" />
            </div>

            <div className="space-y-2">
              <h2 className="text-2xl font-extrabold text-slate-900">
                Sessão de Revisão Concluída!
              </h2>
              <p className="text-slate-600 text-xs sm:text-sm max-w-md mx-auto">
                Você revisou <strong>{reviewCount} flashcards</strong> hoje. O algoritmo de Repetição Espaçada (SM-2) já recalculou os intervalos ideais para fixação a longo prazo na sua memória.
              </p>
            </div>

            <div className="pt-4 flex justify-center gap-3">
              <button
                onClick={onFinish}
                className="px-6 py-2.5 bg-teal-700 hover:bg-teal-800 text-white rounded-xl text-xs font-bold elev-xs transition-colors"
              >
                Voltar aos Decks
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
