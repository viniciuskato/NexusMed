import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Timer,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BookOpen,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { Question, SimuladoConfig, Discipline, Theme, SimuladoSessionData, QuestionReviewResult, Compendium } from '../../types';
import { answersRepository } from '../../repositories/AnswersRepository';
import { simuladosRepository } from '../../repositories/SimuladosRepository';
import { getStorageUser } from '../../services/storage';
import { QuestionCard } from './QuestionCard';

// ============================================================================
// Rascunho local de respostas em andamento (Prompt 07-E)
// ============================================================================
//
// Antes desta entrega, `answers` existia só como estado do componente React —
// fechar a aba, recarregar a página ou uma queda de conexão no meio da prova
// perdia TODAS as respostas já marcadas (nada era persistido até
// `handleFinishExam`). Isso é dado real do estudante perdido silenciosamente,
// exatamente o tipo de risco que este prompt pede para eliminar.
//
// Correção aplicada: cada seleção de alternativa grava um rascunho local
// (localStorage, isolado por usuário) com as respostas já dadas; ao montar o
// componente, se existir um rascunho para este `config.id`, as respostas são
// restauradas. O rascunho é só local (nunca sincronizado — é o simulado
// COMPLETO que sincroniza via `saveSimuladoSession`, ver
// SimuladosRepository.ts) e é apagado ao finalizar a prova.
//
// Deliberadamente FORA de escopo: o cronômetro NÃO é retomado (recomeça do
// tempo total configurado a cada montagem/reload) — mudar essa semântica é
// uma decisão de experiência do modo estudo/prova que pertence ao Prompt
// 10-A, não a uma correção de persistência. Só as respostas já selecionadas
// são recuperadas.
// ============================================================================

function draftKey(simuladoId: string): string | null {
  const uid = getStorageUser();
  if (!uid) return null;
  return `synapse_${uid}_simulado_draft_${simuladoId}`;
}

function loadDraftAnswers(simuladoId: string): Record<string, string> {
  const key = draftKey(simuladoId);
  if (!key) return {};
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    return {};
  }
}

function saveDraftAnswers(simuladoId: string, answers: Record<string, string>): void {
  const key = draftKey(simuladoId);
  if (!key) return;
  try {
    localStorage.setItem(key, JSON.stringify(answers));
  } catch {
    // localStorage indisponível/cheio — a resposta ainda está no estado do
    // componente; só a proteção contra reload é que fica indisponível.
  }
}

function clearDraftAnswers(simuladoId: string): void {
  const key = draftKey(simuladoId);
  if (!key) return;
  try {
    localStorage.removeItem(key);
  } catch {
    // Rascunho é só cache local best-effort — falha ao limpar não deve
    // interromper o fim do simulado.
  }
}

interface SimuladoSessionProps {
  config: SimuladoConfig;
  questions: Question[];
  /**
   * Quantas questões elegíveis existiam (após filtros, antes do corte por
   * quantidade) e quantas foram pedidas na configuração — usado só para
   * avisar o usuário quando o banco tem menos questões elegíveis do que o
   * pedido (Prompt 07-E5). Opcionais para não quebrar chamadores antigos.
   */
  eligibleCount?: number;
  requestedCount?: number;
  disciplines: Discipline[];
  themes: Theme[];
  compendiums?: Compendium[];
  onFinishSession: () => void;
  onOpenCompendium: (compendiumId?: string, sectionId?: string, originQuestionId?: string) => void;
}

export const SimuladoSession: React.FC<SimuladoSessionProps> = ({
  config,
  questions,
  eligibleCount,
  requestedCount,
  disciplines,
  themes,
  compendiums,
  onFinishSession,
  onOpenCompendium,
}) => {
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>(() => loadDraftAnswers(config.id));
  const [secondsRemaining, setSecondsRemaining] = useState(config.timeLimitMinutes * 60);
  const [elapsedStudySeconds, setElapsedStudySeconds] = useState(0);
  const [isFinished, setIsFinished] = useState(false);
  const [sessionResults, setSessionResults] = useState<{
    correctCount: number;
    totalCount: number;
    scorePercent: number;
    timeSpentSeconds: number;
  } | null>(null);
  const [reviewResults, setReviewResults] = useState<Record<string, QuestionReviewResult>>({});
  // Gravação em andamento (45-A, AUD-18): desativa "Finalizar Prova" enquanto
  // grava. A ref é a trava de verdade — dois cliques, ou um clique e o fim do
  // tempo, chegam no mesmo tick, antes do re-render que desativa o botão.
  const [isSubmitting, setIsSubmitting] = useState(false);
  const finishingRef = useRef(false);
  const [finishError, setFinishError] = useState<string | null>(null);

  // Timer: só faz contagem regressiva se for Modo Prova; se for Modo Estudos,
  // conta tempo decorrido sem limite. O cronômetro só conta: quem finaliza a
  // prova quando o tempo acaba é o efeito logo abaixo.
  useEffect(() => {
    if (isFinished) return;
    if (config.isExamMode) {
      const timer = setInterval(() => {
        setSecondsRemaining((prev) => Math.max(0, prev - 1));
      }, 1000);
      return () => clearInterval(timer);
    } else {
      const timer = setInterval(() => {
        setElapsedStudySeconds((prev) => prev + 1);
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [isFinished, config.isExamMode]);

  const handleSelectAnswer = useCallback(
    (letter: string) => {
      if (isFinished) return;
      const currentQ = questions[currentIdx];
      if (!currentQ) return;
      setAnswers((prev) => {
        const next = { ...prev, [currentQ.id]: letter };
        saveDraftAnswers(config.id, next);
        return next;
      });
    },
    [isFinished, questions, currentIdx, config.id]
  );

  // Suporte a atalhos de teclado durante o simulado (A-E / 1-5 e setas)
  useEffect(() => {
    if (isFinished) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      if (
        activeEl &&
        (activeEl.tagName === 'INPUT' ||
          activeEl.tagName === 'TEXTAREA' ||
          (activeEl as HTMLElement).isContentEditable)
      ) {
        return;
      }
      if (e.key === 'ArrowRight' || e.key === 'PageDown') {
        if (currentIdx < questions.length - 1) {
          e.preventDefault();
          setCurrentIdx((prev) => prev + 1);
        }
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        if (currentIdx > 0) {
          e.preventDefault();
          setCurrentIdx((prev) => prev - 1);
        }
      } else {
        const keyUpper = e.key.toUpperCase();
        const currentOptions = questions[currentIdx]?.options;
        // Sem lista fixa de letras (A-E): uma tecla de letra única marca a
        // alternativa só se ela realmente existir nesta questão — cobre
        // questões com mais de 5 alternativas sem hardcodear o alfabeto.
        if (/^[A-Z]$/.test(keyUpper) && currentOptions?.some((o) => o.letter === keyUpper)) {
          handleSelectAnswer(keyUpper);
        } else if (/^[1-9]$/.test(e.key)) {
          // Atalho numérico marca pela POSIÇÃO real na questão (não por um
          // alfabeto A-E assumido) — funciona mesmo se a letra na posição N
          // não for a N-ésima letra do alfabeto.
          const num = parseInt(e.key, 10) - 1;
          if (currentOptions && num < currentOptions.length) {
            handleSelectAnswer(currentOptions[num].letter);
          }
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFinished, currentIdx, questions, handleSelectAnswer]);

  // Grava a prova: tentativas (o servidor corrige cada uma), nota, sessão e,
  // só depois de tudo gravado, apaga o rascunho local.
  const finishExam = useCallback(async () => {
    const totalTimeSpent = config.isExamMode
      ? config.timeLimitMinutes * 60 - secondsRemaining
      : elapsedStudySeconds;

    const sessionAnswersRecord: SimuladoSessionData['answers'] = {};
    // isCorrect é calculado pelo servidor (RPC submit_question_attempt);
    // o valor aqui é só um placeholder ignorado pela API.
    const pendingRecordings: Promise<[string, QuestionReviewResult]>[] = [];

    questions.forEach((q) => {
      const selected = answers[q.id];
      if (!selected) return;

      sessionAnswersRecord[q.id] = {
        selectedOption: selected,
        timeSpent: Math.round(totalTimeSpent / Math.max(1, questions.length)),
      };
      pendingRecordings.push(
        answersRepository
          .recordAnswer({
            questionId: q.id,
            selectedOption: selected,
            isCorrect: false,
            timestamp: new Date().toISOString(),
            timeSpentSeconds: 45,
          })
          .then((review) => [q.id, review] as [string, QuestionReviewResult])
      );
    });

    const recordedReviews = await Promise.all(pendingRecordings);
    const newReviewResults: Record<string, QuestionReviewResult> = {};
    let correct = 0;
    for (const [questionId, review] of recordedReviews) {
      newReviewResults[questionId] = review;
      if (review.isCorrect) correct += 1;
    }
    setReviewResults(newReviewResults);

    const scorePct = Math.round((correct / Math.max(1, questions.length)) * 100);

    const sessionData: SimuladoSessionData = {
      id: config.id,
      config,
      questionIds: questions.map((q) => q.id),
      answers: sessionAnswersRecord,
      startedAt: new Date(Date.now() - totalTimeSpent * 1000).toISOString(),
      completedAt: new Date().toISOString(),
      score: scorePct,
      totalTimeSeconds: totalTimeSpent,
    };

    await simuladosRepository.saveSimuladoSession(sessionData);
    clearDraftAnswers(config.id);

    setSessionResults({
      correctCount: correct,
      totalCount: questions.length,
      scorePercent: scorePct,
      timeSpentSeconds: totalTimeSpent,
    });
    setIsFinished(true);

    if (scorePct >= 70) {
      try {
        confetti({
          particleCount: 80,
          spread: 70,
          origin: { y: 0.6 },
        });
      } catch {
        // Confete é só um efeito decorativo — falhar aqui não deve
        // impedir o encerramento real do simulado.
      }
    }
  
  }, [config, questions, answers, secondsRemaining, elapsedStudySeconds]);

  const handleFinishExam = useCallback(async () => {
    if (isFinished || finishingRef.current) return;
    finishingRef.current = true;
    setIsSubmitting(true);
    setFinishError(null);
    try {
      await finishExam();
    } catch {
      // Nada foi perdido: o rascunho só é apagado depois de gravar tudo. O
      // botão volta a funcionar para tentar de novo.
      setFinishError(
        'Não foi possível gravar a prova agora. Suas respostas continuam guardadas neste aparelho — tente finalizar de novo.'
      );
    } finally {
      finishingRef.current = false;
      setIsSubmitting(false);
    }
  }, [isFinished, finishExam]);

  // Fim do tempo no Modo Prova (45-A, AUD-17): a finalização roda aqui, com o
  // estado do render atual. Antes, o cronômetro chamava a versão do primeiro
  // render — respostas vazias, tempo inicial —, gravava a prova vazia com
  // nota 0 e apagava o rascunho.
  useEffect(() => {
    if (config.isExamMode && secondsRemaining === 0 && !isFinished) {
      void handleFinishExam();
    }
  }, [config.isExamMode, secondsRemaining, isFinished, handleFinishExam]);

  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remainder = secs % 60;
    return `${mins.toString().padStart(2, '0')}:${remainder.toString().padStart(2, '0')}`;
  };

  const currentQ = questions[currentIdx];
  const answeredCount = Object.keys(answers).length;

  return (
    <div className="space-y-6 pb-20">
      {/* Top Session Bar */}
      <div className="sticky top-[61px] z-20 bg-white/95 dark:bg-[#0B1220]/95 backdrop-blur-md border-b border-slate-200 dark:border-[#243452] px-4 lg:px-8 py-3 -mx-4 lg:-mx-8">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              onClick={onFinishSession}
              className="p-1.5 rounded-xl border border-slate-200 dark:border-[#243452] text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              title="Encerrar / Sair"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <h2 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100">{config.name}</h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Questão {currentIdx + 1} de {questions.length} • {answeredCount} respondidas
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Timer: Contagem regressiva no Modo Prova OU Indicador de Modo Estudos sem tempo limite */}
            {config.isExamMode ? (
              <div
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-mono font-bold text-xs ${
                  secondsRemaining < 120
                    ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 animate-pulse'
                    : 'bg-slate-100 dark:bg-[#142038] text-slate-800 dark:text-slate-200'
                }`}
              >
                <Timer className="w-4 h-4 text-teal-700 dark:text-teal-400" />
                <span>{formatTime(secondsRemaining)}</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-teal-50 dark:bg-teal-950/60 text-teal-800 dark:text-teal-300 font-semibold text-xs border border-teal-200/60 dark:border-teal-800/60">
                <BookOpen className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                <span>Modo Estudos (Sem limite de tempo)</span>
              </div>
            )}

            {!isFinished && (
              <button
                type="button"
                onClick={() => void handleFinishExam()}
                disabled={isSubmitting}
                className="px-4 py-1.5 rounded-xl bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500 text-white font-bold text-xs elev-xs transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-wait"
              >
                {isSubmitting ? 'Gravando…' : config.isExamMode ? 'Finalizar Prova' : 'Concluir Sessão'}
              </button>
            )}
          </div>
        </div>
      </div>

      {finishError && (
        <div className="max-w-6xl mx-auto px-4 lg:px-0">
          <div
            role="alert"
            className="p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-800 text-rose-900 dark:text-rose-200 text-xs font-semibold flex items-start gap-2"
          >
            <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
            <span>{finishError}</span>
          </div>
        </div>
      )}

      {/* Aviso de quantidade indisponível */}
      {typeof requestedCount === 'number' &&
        typeof eligibleCount === 'number' &&
        questions.length < requestedCount && (
          <div className="max-w-6xl mx-auto px-4 lg:px-0">
            <div className="p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200 text-xs font-semibold flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <span>
                {eligibleCount === 0
                  ? 'Nenhuma questão elegível foi encontrada para os filtros escolhidos. Ajuste os filtros do Criador de Simulados e tente novamente.'
                  : `Você pediu ${requestedCount} questões, mas só ${eligibleCount} são elegíveis para os filtros escolhidos. A sessão foi montada com as ${questions.length} disponíveis.`}
              </span>
            </div>
          </div>
        )}

      {/* Main Container */}
      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 pt-4">
        {/* Left / Navigation Palette (3 cols) */}
        <div className="lg:col-span-4 order-2 lg:order-1 space-y-4">
          {/* Questions Grid */}
          <div className="bg-white dark:bg-[#0F172A] rounded-3xl border border-slate-200 dark:border-[#243452] p-5 elev-xs">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-3">
              Matriz de Questões
            </h3>
            <div className="grid grid-cols-5 gap-2">
              {questions.map((q, idx) => {
                const isSelected = answers[q.id] !== undefined;
                const isCurrent = currentIdx === idx;
                const isCor = isFinished && !!reviewResults[q.id]?.isCorrect;
                const isWrong = isFinished && isSelected && !isCor;

                let btnClass = 'bg-slate-100 dark:bg-[#142038] text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700';
                if (isFinished) {
                  if (isCor) btnClass = 'bg-emerald-600 text-white font-bold';
                  else if (isWrong) btnClass = 'bg-rose-600 text-white font-bold';
                  else btnClass = 'bg-slate-200 dark:bg-slate-800 text-slate-400 dark:text-slate-500';
                } else {
                  if (isCurrent) btnClass = 'bg-teal-800 text-white font-bold ring-2 ring-teal-400';
                  else if (isSelected) btnClass = 'bg-teal-100 dark:bg-teal-950/60 text-teal-900 dark:text-teal-200 font-bold border border-teal-300 dark:border-teal-700';
                }

                return (
                  <button
                    key={q.id}
                    onClick={() => setCurrentIdx(idx)}
                    className={`h-10 rounded-xl text-xs font-bold flex items-center justify-center transition-all cursor-pointer ${btnClass}`}
                  >
                    {idx + 1}
                  </button>
                );
              })}
            </div>

            <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px] text-slate-400 dark:text-slate-500">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-teal-600" /> Respondida
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-slate-200 dark:bg-slate-700" /> Pendente
              </span>
            </div>
          </div>

          {/* If finished: Final Score Card */}
          {isFinished && sessionResults && (
            <div className="bg-gradient-to-br from-slate-900 via-teal-950 to-slate-900 text-white rounded-3xl p-6 elev-md space-y-4 border border-teal-800/30">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-teal-400 uppercase tracking-wider">
                  Resultado do Simulado
                </span>
                <span className="text-xs text-slate-300">
                  {Math.floor(sessionResults.timeSpentSeconds / 60)} min gastos
                </span>
              </div>

              <div className="text-center py-2">
                <span className="text-4xl font-extrabold text-white">
                  {sessionResults.scorePercent}%
                </span>
                <p className="text-xs text-slate-300 mt-1">
                  Você acertou {sessionResults.correctCount} de {sessionResults.totalCount} questões
                </p>
              </div>

              <div className="pt-3 border-t border-white/10 space-y-2 text-xs">
                <p className="text-slate-300">
                  Todas as questões erradas foram enviadas para o seu <strong>Caderno de Erros</strong> e ganharam flashcards recomendados para revisão espaçada.
                </p>
                <button
                  onClick={onFinishSession}
                  className="w-full py-2.5 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold transition-colors cursor-pointer"
                >
                  Voltar ao Painel Geral
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Right / Question Detail (8 cols) */}
        <div className="lg:col-span-8 order-1 lg:order-2 space-y-6">
          {currentQ ? (
            <QuestionCard
              question={currentQ}
              discipline={disciplines.find((d) => d.id === currentQ.disciplineId)}
              theme={themes.find((t) => t.id === currentQ.themeId)}
              compendiums={compendiums}
              onOpenCompendium={onOpenCompendium}
              isExamMode={!isFinished && config.isExamMode}
              selectedOptionInExam={answers[currentQ.id]}
              onSelectOptionInExam={handleSelectAnswer}
            />
          ) : (
            <div className="p-8 text-center bg-white dark:bg-[#0F172A] rounded-3xl border border-slate-200 dark:border-[#243452] text-slate-600 dark:text-slate-400">
              Nenhuma questão selecionada.
            </div>
          )}

          {/* Navigation Prev / Next Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
            <button
              onClick={() => setCurrentIdx((prev) => Math.max(0, prev - 1))}
              disabled={currentIdx === 0}
              className={`w-full sm:w-auto px-4 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 border transition-colors cursor-pointer ${
                currentIdx === 0
                  ? 'bg-slate-100 dark:bg-slate-800/60 text-slate-400 dark:text-slate-500 border-slate-200 dark:border-[#243452] cursor-not-allowed'
                  : 'bg-white dark:bg-[#0F172A] text-slate-700 dark:text-slate-300 border-slate-300 dark:border-[#243452] hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Questão Anterior</span>
            </button>

            <div className="hidden sm:inline-flex items-center gap-1.5 text-[11px] text-slate-400 dark:text-slate-500 font-medium">
              <span>Marcar:</span>
              <kbd className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-[#142038] border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 font-mono text-[10px]">A-Z / 1-9</kbd>
              <span className="text-slate-300 dark:text-slate-600">·</span>
              <span>Navegar:</span>
              <kbd className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-[#142038] border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 font-mono text-[10px]">←/→</kbd>
            </div>

            <button
              onClick={() => setCurrentIdx((prev) => Math.min(questions.length - 1, prev + 1))}
              disabled={currentIdx === questions.length - 1}
              className={`w-full sm:w-auto px-4 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 border transition-colors cursor-pointer ${
                currentIdx === questions.length - 1
                  ? 'bg-slate-100 dark:bg-slate-800/60 text-slate-400 dark:text-slate-500 border-slate-200 dark:border-[#243452] cursor-not-allowed'
                  : 'bg-teal-700 dark:bg-teal-600 text-white border-teal-700 dark:border-teal-600 hover:bg-teal-800 dark:hover:bg-teal-500'
              }`}
            >
              <span>Próxima Questão</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
