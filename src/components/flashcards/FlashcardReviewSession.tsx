import React, { useState, useEffect, useCallback } from 'react';
import {
  ArrowLeft,
  RotateCcw,
  Sparkles,
  BookOpen,
  Award,
  ExternalLink,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { Flashcard, Discipline, Theme, Compendium } from '../../types';
import { calculateNextSRS } from '../../services/srsAlgorithm';
import { flashcardsRepository } from '../../repositories/FlashcardsRepository';
import { formatToAbntCitation } from '../../utils/bibliographicSources';

interface FlashcardReviewSessionProps {
  cards: Flashcard[];
  disciplines: Discipline[];
  themes: Theme[];
  compendiums?: Compendium[];
  onFinishSession: () => void;
  onOpenCompendium: (compendiumId: string) => void;
}

export const FlashcardReviewSession: React.FC<FlashcardReviewSessionProps> = ({
  cards,
  disciplines,
  themes,
  compendiums = [],
  onFinishSession,
  onOpenCompendium,
}) => {
  const [queue, setQueue] = useState<Flashcard[]>(cards);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [sessionCompleted, setSessionCompleted] = useState(false);
  const [reviewedCount, setReviewedCount] = useState(0);

  const currentCard = queue[currentIdx];

  const matchingCompendium = currentCard
    ? compendiums.find(
        (c) =>
          c.id === currentCard.compendiumRefId ||
          c.themeId === currentCard.themeId ||
          c.disciplineId === currentCard.disciplineId
      )
    : undefined;
  const compendiumIdToOpen = currentCard?.compendiumRefId || matchingCompendium?.id;
  const discipline = disciplines.find((d) => d.id === currentCard?.disciplineId);
  const theme = themes.find((t) => t.id === currentCard?.themeId);

  const handleRate = useCallback(
    async (rating: 1 | 2 | 3 | 4) => {
      if (!currentCard) return;

      const updatedSrs = calculateNextSRS(currentCard.srs, rating);
      const updatedCard: Flashcard = {
        ...currentCard,
        srs: updatedSrs,
      };

      await flashcardsRepository.updateFlashcardSRS(currentCard.id, updatedSrs);
      setReviewedCount((prev) => prev + 1);

      // If rating is 1 (Errei), add back to the end of the current session queue for immediate reinforcement
      if (rating === 1) {
        setQueue((prev) => [...prev, updatedCard]);
      }

      setIsFlipped(false);

      if (currentIdx + 1 < queue.length) {
        setCurrentIdx((prev) => prev + 1);
      } else {
        setSessionCompleted(true);
        try {
          confetti({
            particleCount: 80,
            spread: 70,
            origin: { y: 0.6 },
          });
        } catch {
          // Confete é só um efeito decorativo — falhar aqui não deve
          // impedir o fluxo real de revisão do flashcard.
        }
      }
    },
    [currentCard, currentIdx, queue.length]
  );

  // Keyboard navigation
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
  }, [isFlipped, handleRate, sessionCompleted]);

  const progressPercent = Math.round((currentIdx / Math.max(1, queue.length)) * 100);

  if (sessionCompleted || !currentCard) {
    return (
      <div className="max-w-2xl mx-auto py-12 px-4 text-center space-y-6">
        <div className="w-20 h-20 bg-teal-50 dark:bg-teal-950/60 border-2 border-teal-200 dark:border-teal-800 text-teal-700 dark:text-teal-300 rounded-3xl mx-auto flex items-center justify-center elev-lg animate-in zoom-in-75">
          <Award className="w-10 h-10" />
        </div>

        <div className="space-y-2">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">
            Sessão de Revisão Concluída!
          </h2>
          <p className="text-slate-600 dark:text-slate-300 text-xs sm:text-sm max-w-md mx-auto leading-relaxed">
            Você revisou <strong>{reviewedCount} cartões</strong>. O algoritmo de repetição espaçada agendou automaticamente a próxima data de cada conceito para maximizar a retenção de longo prazo.
          </p>
        </div>

        <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-3">
          <button
            onClick={onFinishSession}
            className="w-full sm:w-auto px-6 py-3 rounded-2xl bg-teal-700 hover:bg-teal-800 text-white font-bold text-xs elev-md transition-all cursor-pointer"
          >
            Voltar ao Painel de Flashcards
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-20">
      {/* Top Navigation Bar */}
      <div className="sticky top-[61px] z-20 bg-white/95 dark:bg-[#0F172A]/95 backdrop-blur-md border-b border-slate-200 dark:border-[#243452] px-4 lg:px-8 py-3 -mx-4 lg:-mx-8">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              onClick={onFinishSession}
              className="p-1.5 rounded-xl border border-slate-200 dark:border-[#243452] text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-[#142038] transition-colors cursor-pointer"
              title="Encerrar sessão"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <span className="text-[11px] font-bold text-teal-700 dark:text-teal-300 bg-teal-50 dark:bg-teal-950/60 px-2 py-0.5 rounded-md">
                {discipline?.name || 'Medicina'}
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400 ml-2">
                Card {currentIdx + 1} de {queue.length}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="w-32 sm:w-48 h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-teal-600 transition-all rounded-full"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <span className="text-xs font-mono font-bold text-teal-800 dark:text-teal-400">
              {progressPercent}%
            </span>
          </div>
        </div>
      </div>

      {/* Card Arena */}
      <div className="max-w-2xl mx-auto px-4 pt-4">
        {/* Flashcard Box */}
        <div
          onClick={() => setIsFlipped(!isFlipped)}
          className={`min-h-[340px] sm:min-h-[380px] bg-white dark:bg-[#0F172A] rounded-3xl border transition-all cursor-pointer p-8 sm:p-10 elev-sm flex flex-col justify-between relative group select-none ${
            isFlipped
              ? 'border-teal-300 dark:border-teal-600 ring-2 ring-teal-50 dark:ring-teal-950/40 elev-md'
              : 'border-slate-200 dark:border-[#243452] hover:border-slate-300 dark:hover:border-slate-600'
          }`}
        >
          {/* Top metadata */}
          <div className="flex items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                {isFlipped ? 'VERSO / RESPOSTA' : 'FRENTE / CONCEITO'}
              </span>
              {theme && (
                <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-[#142038] px-2 py-0.5 rounded-md">
                  {theme.name}
                </span>
              )}
            </div>

            <span className="text-[11px] text-slate-400 dark:text-slate-500 flex items-center gap-1">
              <RotateCcw className="w-3 h-3" />
              <span>Clique ou Espaço para virar</span>
            </span>
          </div>

          {/* Central content */}
          <div className="py-6 text-center space-y-4">
            {!isFlipped ? (
              <h3 className="text-lg sm:text-2xl font-bold text-slate-900 dark:text-slate-100 leading-snug tracking-tight font-serif-reading">
                {currentCard.front}
              </h3>
            ) : (
              <div className="space-y-4 animate-in fade-in zoom-in-95">
                <div className="text-base sm:text-xl font-bold text-slate-900 dark:text-slate-100 leading-relaxed font-serif-reading whitespace-pre-line text-left">
                  {currentCard.back}
                </div>

                {/* Mechanism Highlight */}
                {currentCard.mechanismHighlight && (
                  <div className="p-3.5 rounded-2xl bg-teal-50/80 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-800 text-left text-xs text-teal-950 dark:text-teal-200">
                    <span className="font-bold flex items-center gap-1.5 text-teal-800 dark:text-teal-300 mb-1">
                      <Sparkles className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                      Mecanismo Fisiopatológico / Mnemônico:
                    </span>
                    <p className="leading-relaxed font-medium">
                      {currentCard.mechanismHighlight}
                    </p>
                  </div>
                )}

                {/* Vínculo com a Biblioteca Médica */}
                {compendiumIdToOpen && (
                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenCompendium(compendiumIdToOpen);
                      }}
                      className="w-full p-2.5 rounded-xl bg-teal-50 dark:bg-teal-950/60 hover:bg-teal-100 dark:hover:bg-teal-900/80 text-teal-800 dark:text-teal-300 border border-teal-200/80 dark:border-teal-800/60 font-semibold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer"
                    >
                      <BookOpen className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                      <span>
                        Estudar Teoria na Biblioteca{matchingCompendium ? `: ${matchingCompendium.title}` : ''}
                      </span>
                    </button>
                  </div>
                )}

                {/* Bibliografia Padronizada em ABNT NBR 6023 */}
                {currentCard.bibliographicSources && currentCard.bibliographicSources.length > 0 && (
                  <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 text-xs text-left space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <strong className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300">
                        <BookOpen className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                        Bibliografia & Diretrizes Oficiais (ABNT NBR 6023):
                      </strong>
                      <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-teal-50 dark:bg-teal-950/50 text-teal-800 dark:text-teal-300 border border-teal-200/70 dark:border-teal-800/50">
                        Links Diretos
                      </span>
                    </div>
                    <div className="space-y-2 pt-1">
                      {currentCard.bibliographicSources.map((source) => {
                        const abnt = formatToAbntCitation(source.citationText, source.url);
                        return (
                          <div
                            key={source.sourceId}
                            className="p-3 rounded-xl bg-white dark:bg-[#0F172A] border border-slate-200/80 dark:border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs shadow-2xs"
                          >
                            <div className="min-w-0 flex-1 space-y-0.5">
                              <p className="font-bold text-[11px] text-slate-900 dark:text-slate-100 uppercase tracking-wide">
                                {abnt.author}
                              </p>
                              <p className="font-medium text-slate-700 dark:text-slate-300">
                                {abnt.title}.
                              </p>
                              <p className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">
                                {abnt.publicationDetails}
                              </p>
                            </div>
                            <a
                              href={abnt.accessUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(event) => event.stopPropagation()}
                              className="self-end sm:self-center shrink-0 px-2.5 py-1 rounded-lg bg-teal-50 hover:bg-teal-100 dark:bg-teal-950/60 dark:hover:bg-teal-900/80 text-teal-800 dark:text-teal-300 border border-teal-200/80 dark:border-teal-800/60 font-semibold text-[11px] flex items-center gap-1.5 transition-colors cursor-pointer"
                              title="Acessar diretriz/artigo na íntegra em nova aba"
                            >
                              <span>Acessar Fonte</span>
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Bottom Card Footer */}
          <div className="flex items-center justify-between pt-4 border-t border-slate-100 dark:border-slate-800 text-xs">
            <span className="text-slate-400 dark:text-slate-500 text-[11px]">
              Intervalo atual: {currentCard.srs.intervalDays}d • Repetições: {currentCard.srs.repetitionCount}
            </span>

            {isFlipped && compendiumIdToOpen && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenCompendium(compendiumIdToOpen);
                }}
                className="text-teal-700 dark:text-teal-400 hover:underline font-semibold flex items-center gap-1 cursor-pointer"
              >
                <BookOpen className="w-3.5 h-3.5" />
                <span>Ver na Biblioteca</span>
              </button>
            )}
          </div>
        </div>

        {/* SRS Rating Control Bar */}
        <div className="mt-6">
          {!isFlipped ? (
            <button
              onClick={() => setIsFlipped(true)}
              className="w-full py-4 rounded-2xl bg-teal-700 hover:bg-teal-800 text-white font-bold text-sm elev-md transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>Revelar Resposta</span>
              <kbd className="px-2 py-0.5 text-xs bg-white/20 rounded font-mono">Espaço</kbd>
            </button>
          ) : (
            <div className="space-y-2 animate-in fade-in">
              <span className="text-center block text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2">
                Como foi a sua recordação deste conceito?
              </span>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {/* 1: Errei */}
                <button
                  onClick={() => handleRate(1)}
                  className="p-3 rounded-2xl bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/50 border border-rose-200 dark:border-rose-800 text-rose-900 dark:text-rose-200 text-left transition-all group cursor-pointer"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-xs">1. Errei</span>
                    <kbd className="text-[10px] font-mono px-1.5 py-0.5 bg-rose-200/60 dark:bg-rose-800 rounded text-rose-800 dark:text-rose-200">
                      1
                    </kbd>
                  </div>
                  <span className="text-[10px] text-rose-600 dark:text-rose-300 block">Rever hoje (&lt;10m)</span>
                </button>

                {/* 2: Dificil */}
                <button
                  onClick={() => handleRate(2)}
                  className="p-3 rounded-2xl bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 dark:hover:bg-amber-900/50 border border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200 text-left transition-all cursor-pointer"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-xs">2. Difícil</span>
                    <kbd className="text-[10px] font-mono px-1.5 py-0.5 bg-amber-200/60 dark:bg-amber-800 rounded text-amber-800 dark:text-amber-200">
                      2
                    </kbd>
                  </div>
                  <span className="text-[10px] text-amber-600 dark:text-amber-300 block">Rever em 1 dia</span>
                </button>

                {/* 3: Bom */}
                <button
                  onClick={() => handleRate(3)}
                  className="p-3 rounded-2xl bg-blue-50 dark:bg-blue-950/40 hover:bg-blue-100 dark:hover:bg-blue-900/50 border border-blue-200 dark:border-blue-800 text-blue-900 dark:text-blue-200 text-left transition-all cursor-pointer"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-xs">3. Bom</span>
                    <kbd className="text-[10px] font-mono px-1.5 py-0.5 bg-blue-200/60 dark:bg-blue-800 rounded text-blue-800 dark:text-blue-200">
                      3
                    </kbd>
                  </div>
                  <span className="text-[10px] text-blue-600 dark:text-blue-300 block">Rever em ~3-6 dias</span>
                </button>

                {/* 4: Facil */}
                <button
                  onClick={() => handleRate(4)}
                  className="p-3 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 border border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200 text-left transition-all cursor-pointer"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-xs">4. Fácil</span>
                    <kbd className="text-[10px] font-mono px-1.5 py-0.5 bg-emerald-200/60 dark:bg-emerald-800 rounded text-emerald-800 dark:text-emerald-200">
                      4
                    </kbd>
                  </div>
                  <span className="text-[10px] text-emerald-600 dark:text-emerald-300 block">Rever em ~10+ dias</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
