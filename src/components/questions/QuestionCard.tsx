import { formatToAbntCitation } from '../../utils/bibliographicSources';
import { onActivationKey } from '../../utils/keyboardActivation';
import React, { useState, useEffect, useCallback } from 'react';
import {
  CheckCircle2,
  XCircle,
  BookOpen,
  Sparkles,
  Bookmark,
  AlertCircle,
  Tag,
  EyeOff,
  ThumbsUp,
  ThumbsDown,
  ExternalLink,
} from 'lucide-react';
import { Question, QuestionAnswerRecord, QuestionReviewResult, Discipline, Theme, QuestionReactionValue, Compendium } from '../../types';
import { parseInline } from '../common/SafeMarkdown';
import { bookmarksRepository } from '../../repositories/BookmarksRepository';
import { flashcardsRepository } from '../../repositories/FlashcardsRepository';
import { answersRepository } from '../../repositories/AnswersRepository';
import { questionsRepository } from '../../repositories/QuestionsRepository';
import { questionReactionsRepository } from '../../repositories/QuestionReactionsRepository';
import { GamificationService, CELEBRATION_STREAK_LENGTH } from '../../services/gamification';
import { ContextualFeedbackPopover } from '../feedback/ContextualFeedbackPopover';

interface QuestionCardProps {
  question: Question;
  discipline?: Discipline;
  theme?: Theme;
  compendiums?: Compendium[];
  onOpenCompendium: (compendiumId?: string, sectionId?: string, originQuestionId?: string) => void;
  onAnswerRecorded?: (record: QuestionAnswerRecord) => void;
  isExamMode?: boolean;
  selectedOptionInExam?: 'A' | 'B' | 'C' | 'D' | 'E';
  onSelectOptionInExam?: (opt: 'A' | 'B' | 'C' | 'D' | 'E') => void;
  /**
   * Resposta/favorito/reação já resolvidos em lote pelo componente pai (ex.:
   * <QuestionsView>, que busca os três de uma vez para TODOS os cartões
   * visíveis). Quando presente, evita que este cartão dispare sua própria
   * consulta individual — com filtros como "Todas"/"Erros" renderizando até
   * as 393 questões de uma vez (sem paginação), 3 requisições por cartão
   * viravam centenas de requisições concorrentes pela mesma informação
   * (Prompt 10-A). Contextos que não passam esta prop (prova/simulado,
   * questão única) continuam buscando por conta própria, como antes.
   */
  hydrated?: {
    answer: QuestionAnswerRecord | null;
    bookmarked: boolean;
    reaction: QuestionReactionValue | null;
  };
}

export const QuestionCard: React.FC<QuestionCardProps> = ({
  question,
  discipline,
  theme,
  compendiums,
  onOpenCompendium,
  onAnswerRecorded,
  isExamMode = false,
  selectedOptionInExam,
  onSelectOptionInExam,
  hydrated,
}) => {
  // Local state for study mode
  const [selectedOption, setSelectedOption] = useState<'A' | 'B' | 'C' | 'D' | 'E' | null>(
    selectedOptionInExam || null
  );
  const [isSubmitted, setIsSubmitted] = useState<boolean>(false);
  const [isBookmarked, setIsBookmarked] = useState<boolean>(false);
  const [eliminatedOptions, setEliminatedOptions] = useState<string[]>([]);
  const [errorReason, setErrorReason] = useState<QuestionAnswerRecord['errorReason']>('lacuna_teorica');
  const [, setShowErrorTagger] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  // Gabarito (quem está correta, explicação por alternativa) obtido via RPC —
  // question.options[].isCorrect/.explanation vêm sempre vazios para o
  // estudante, pois question_option_keys/question_answer_keys não têm
  // policy de SELECT direto (ver rls_policies.sql).
  const [reviewResult, setReviewResult] = useState<QuestionReviewResult | null>(null);
  const [myReaction, setMyReaction] = useState<QuestionReactionValue | null>(null);
  // Distingue "reidratado de uma tentativa já existente no servidor" de
  // "respondida agora, nesta sessão" — usado só para não confundir os dois
  // casos (ex.: nunca disparar confete/toast/XP pela hidratação) e para
  // testes automatizados conseguirem afirmar qual dos dois aconteceu.
  const [answerOrigin, setAnswerOrigin] = useState<'hydrated' | 'session' | null>(null);

  // Material da biblioteca associado
  const matchedCompendium = compendiums?.find((c) => c.id === question.compendiumRefId);
  const compendiumIdToOpen = matchedCompendium?.id || question.compendiumRefId;
  const hasValidMaterial = Boolean(
    question.compendiumRefId &&
    question.compendiumRefId.trim() !== '' &&
    (!compendiums || compendiums.length === 0 || matchedCompendium)
  );

  // Chave estável derivada de `hydrated` para a dependência do useEffect
  // abaixo. `hydrated` é um objeto NOVO a cada render do pai (`<QuestionsView>`
  // recria o literal `{ answer, bookmarked, reaction }` toda vez) — depender
  // do objeto em si reexecutaria a hidratação (inclusive a chamada de rede
  // de `getQuestionReview`) a cada tecla digitada na busca/filtro do pai.
  // Os valores primitivos abaixo só mudam quando o CONTEÚDO realmente muda.
  const hydratedKey = hydrated
    ? `${hydrated.answer?.selectedOption ?? ''}|${hydrated.answer?.isCorrect ?? ''}|${
        hydrated.answer?.timestamp ?? ''
      }|${hydrated.bookmarked}|${hydrated.reaction ?? ''}`
    : null;

  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const applyInitialState = (
      initialAnswer: QuestionAnswerRecord | null,
      bookmarked: boolean,
      reaction: QuestionReactionValue | null
    ) => {
      if (cancelled) return;
      if (!isExamMode) {
        setSelectedOption(initialAnswer?.selectedOption || selectedOptionInExam || null);
        setIsSubmitted(!!initialAnswer);
        setAnswerOrigin(initialAnswer ? 'hydrated' : null);
      }
      setIsBookmarked(bookmarked);
      setErrorReason(initialAnswer?.errorReason || 'lacuna_teorica');
      setMyReaction(reaction);
    };

    const loadReviewIfAnswered = async (initialAnswer: QuestionAnswerRecord | null) => {
      if (isExamMode || !initialAnswer) return;
      try {
        const review = await questionsRepository.getQuestionReview(question.id);
        if (!cancelled) setReviewResult(review);
      } catch {
        // Justificativa/gabarito não puderam ser recarregados agora (rede instável)
      }
    };

    setReviewResult(null);

    if (hydrated) {
      applyInitialState(hydrated.answer, hydrated.bookmarked, hydrated.reaction);
      loadReviewIfAnswered(hydrated.answer);
      return () => {
        cancelled = true;
      };
    }

    (async () => {
      const [answersResult, bookmarksResult, reactionResult] = await Promise.allSettled([
        answersRepository.getAnswers(),
        bookmarksRepository.getBookmarks(),
        questionReactionsRepository.getMyReaction(question.id),
      ]);
      if (cancelled) return;

      const answers = answersResult.status === 'fulfilled' ? answersResult.value : {};
      const bookmarks =
        bookmarksResult.status === 'fulfilled'
          ? bookmarksResult.value
          : { questions: [], compendiums: [], flashcards: [] };
      const reaction = reactionResult.status === 'fulfilled' ? reactionResult.value : null;

      const initialAnswer = answers[question.id] ?? null;
      applyInitialState(initialAnswer, bookmarks.questions.includes(question.id), reaction);
      await loadReviewIfAnswered(initialAnswer);
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [question.id, hydratedKey]);

  // Confete automático só em marcos reais: ao completar uma sequência de
  // CELEBRATION_STREAK_LENGTH respostas corretas seguidas dentro da mesma
  // disciplina. Calculado em memória a partir de `answers`, sem persistir
  // nada novo no banco.
  // Sem dependências reais: só lê repositórios (sempre busca o estado mais
  // recente no momento da chamada) e o `question.disciplineId` do parâmetro
  // do closure de `question`, que é recriada abaixo via handleConfirmAnswer
  // com a `question` corrente. Estabilizada para poder entrar honestamente
  // na lista de deps de handleConfirmAnswer.
  const checkStreakCelebration = useCallback(async () => {
    const [allAnswers, allQuestions] = await Promise.all([
      answersRepository.getAnswers(),
      questionsRepository.getQuestions(),
    ]);
    const disciplineByQuestionId = new Map(allQuestions.map((q) => [q.id, q.disciplineId]));

    const sameDisciplineAnswers = Object.values(allAnswers)
      .filter((a) => disciplineByQuestionId.get(a.questionId) === question.disciplineId)
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    let streak = 0;
    for (let i = sameDisciplineAnswers.length - 1; i >= 0; i--) {
      if (!sameDisciplineAnswers[i].isCorrect) break;
      streak++;
    }

    if (streak > 0 && streak % CELEBRATION_STREAK_LENGTH === 0) {
      GamificationService.triggerCelebration();
    }
  }, [question.disciplineId]);

  // setToastMessage é estável (setState do React); sem dependências reais.
  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  }, []);

  // Deps reais e completas: cada valor de fora do escopo que a função lê
  // (selectedOption, question, errorReason, onAnswerRecorded) mais as duas
  // funções auxiliares já estabilizadas acima. Isso garante que o atalho de
  // teclado (useEffect abaixo) sempre chame a versão com o `selectedOption`
  // e `question` atuais — nunca uma closure presa ao render em que o
  // listener foi montado.
  const handleConfirmAnswer = useCallback(async () => {
    if (!selectedOption) return;

    // isCorrect é calculado pelo servidor (RPC submit_question_attempt); o
    // valor aqui é só um placeholder ignorado pela API.
    const record: QuestionAnswerRecord = {
      questionId: question.id,
      selectedOption,
      isCorrect: false,
      timestamp: new Date().toISOString(),
      timeSpentSeconds: 45,
    };

    const review = await answersRepository.recordAnswer(record);
    const isCorrect = review.isCorrect;
    record.isCorrect = isCorrect;
    record.errorReason = isCorrect ? undefined : errorReason;
    setReviewResult(review);
    setIsSubmitted(true);
    setAnswerOrigin('session');

    if (onAnswerRecorded) onAnswerRecorded(record);

    if (!isCorrect) {
      setShowErrorTagger(true);
      // Cria automaticamente flashcard SRS relacionado ao erro do usuário para revisão periódica
      try {
        await flashcardsRepository.createFlashcardFromQuestion(question);
      } catch {
        // Falha silenciosa se já existir ou erro de rede pontual
      }
      showToast('Resposta incorreta. Questão catalogada automaticamente no seu Caderno de Erros!');
    } else {
      showToast('Resposta correta! Excelente raciocínio clínico.');
      await checkStreakCelebration();
    }
  }, [selectedOption, question, errorReason, onAnswerRecorded, showToast, checkStreakCelebration]);

  // Deps reais e completas: isSubmitted/isExamMode/onSelectOptionInExam são
  // exatamente os valores lidos pelo corpo da função.
  const handleSelectOption = useCallback(
    (letter: 'A' | 'B' | 'C' | 'D' | 'E') => {
      if (isSubmitted) return;
      if (isExamMode) {
        if (onSelectOptionInExam) onSelectOptionInExam(letter);
        return;
      }
      setSelectedOption(letter);
    },
    [isSubmitted, isExamMode, onSelectOptionInExam]
  );

  // Atalhos de teclado quando o cursor estiver sobre o card ou quando o card estiver selecionado
  useEffect(() => {
    if (isSubmitted || !isHovered) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Evita disparar atalho se o estudante estiver digitando num input/textarea
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;

      const key = e.key.toUpperCase();
      if (['A', 'B', 'C', 'D', 'E'].includes(key)) {
        const letter = key as 'A' | 'B' | 'C' | 'D' | 'E';
        // Verifica se a questão possui essa opção
        if (question.options.some((o) => o.letter === letter)) {
          e.preventDefault();
          handleSelectOption(letter);
        }
      } else if (e.key === 'Enter' && selectedOption && !isSubmitted && !isExamMode) {
        e.preventDefault();
        handleConfirmAnswer();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
    // handleConfirmAnswer e handleSelectOption agora são estáveis via
    // useCallback com suas próprias deps reais (ver definições acima), então
    // só mudam de identidade quando o que de fato usam muda — o listener é
    // remontado exatamente nesses casos, nunca a cada render, e nunca fica
    // preso a um `selectedOption`/`question` obsoletos.
  }, [isSubmitted, isHovered, selectedOption, isExamMode, question.options, handleConfirmAnswer, handleSelectOption]);

  const handleToggleReaction = async (val: 'up' | 'down') => {
    const nextVal = myReaction === val ? null : val;
    setMyReaction(nextVal);
    try {
      if (nextVal) {
        await questionReactionsRepository.setReaction(question.id, nextVal);
      } else {
        await questionReactionsRepository.removeReaction(question.id);
      }
    } catch {
      // Falha silenciosa de rede com fila resiliente
    }
  };

  const handleToggleEliminate = (e: React.MouseEvent, letter: string) => {
    e.stopPropagation();
    if (eliminatedOptions.includes(letter)) {
      setEliminatedOptions(eliminatedOptions.filter((l) => l !== letter));
    } else {
      setEliminatedOptions([...eliminatedOptions, letter]);
    }
  };

  const handleToggleBookmark = async () => {
    const bookmarked = await bookmarksRepository.toggleBookmark('questions', question.id);
    setIsBookmarked(bookmarked);
    showToast(bookmarked ? 'Questão adicionada aos seus favoritos' : 'Removida dos favoritos');
  };

  const isCorrect = isSubmitted && !!reviewResult?.isCorrect;
  const isIncorrect = isSubmitted && !!reviewResult && !isCorrect;
  const reviewByLetter: Map<string, QuestionReviewResult['options'][number]> = new Map();
  for (const o of reviewResult?.options ?? []) {
    reviewByLetter.set(o.letter, o);
  }

  return (
    // Hover apenas ativa atalhos de teclado opcionais (ver useEffect acima);
    // não é o único meio de operar o card, então não exige par de teclado.
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
    <div
      id={`question-${question.id}`}
      data-answer-origin={answerOrigin ?? 'unanswered'}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`bg-white dark:bg-[#0E1726] rounded-3xl border transition-all p-6 sm:p-8 elev-xs relative ${
        isSubmitted
          ? isCorrect
            ? 'border-emerald-400 dark:border-emerald-600 ring-2 ring-emerald-400/20 dark:ring-emerald-950/40'
            : 'border-rose-400 dark:border-rose-600 ring-2 ring-rose-400/20 dark:ring-rose-950/40'
          : 'border-slate-300/80 dark:border-[#243652]'
      }`}
    >
      {/* Toast */}
      {toastMessage && (
        <div className="absolute top-4 right-4 z-20 bg-slate-900 dark:bg-slate-800 text-white px-3 py-2 rounded-xl text-xs font-semibold elev-lg flex items-center gap-1.5 animate-in fade-in">
          <Sparkles className="w-3.5 h-3.5 text-teal-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header Info */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-4 mb-5 border-b border-slate-100 dark:border-slate-800">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold px-2.5 py-1 rounded-lg bg-teal-50 dark:bg-teal-950/60 text-teal-800 dark:text-teal-300 border border-teal-200/60 dark:border-teal-800/60">
            {discipline?.name || 'Medicina'}
          </span>
          <span className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-[#142038] text-slate-700 dark:text-slate-300">
            {theme?.name || 'Tema'}
          </span>
          <span className="text-xs font-bold px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300 border border-blue-200/60 dark:border-blue-800/60">
            {question.institution} ({question.year})
          </span>
          <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase">
            {question.difficulty}
          </span>

          {/* Vínculo com material da biblioteca */}
          {hasValidMaterial ? (
            <button
              type="button"
              onClick={() => onOpenCompendium(compendiumIdToOpen, question.compendiumSectionId, question.id)}
              className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-teal-50 dark:bg-teal-950/60 text-teal-800 dark:text-teal-300 border border-teal-200/60 dark:border-teal-800/60 hover:bg-teal-100 dark:hover:bg-teal-900/60 transition-colors inline-flex items-center gap-1.5 cursor-pointer"
              title="Abrir compêndio referenciado na biblioteca"
            >
              <BookOpen className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
              <span>Biblioteca: {matchedCompendium?.title || 'Material Vinculado'}</span>
            </button>
          ) : (
            <span
              className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-200/60 dark:border-amber-800/60 inline-flex items-center gap-1.5"
              title="Material teórico ainda pendente de catalogação na biblioteca"
            >
              <AlertCircle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
              <span>Material: Pendente</span>
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <ContextualFeedbackPopover
            questionId={question.id}
            label="Reportar erro"
            variant="pill"
          />
          <button
            onClick={handleToggleBookmark}
            className={`p-2 rounded-xl border text-xs transition-colors cursor-pointer ${
              isBookmarked
                ? 'bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-800'
                : 'bg-white dark:bg-[#142038] text-slate-500 dark:text-slate-400 border-slate-200 dark:border-[#243452] hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
            title="Favoritar questão"
          >
            <Bookmark className={`w-4 h-4 ${isBookmarked ? 'fill-rose-500' : ''}`} />
          </button>
        </div>
      </div>

      {/* Clinical Vignette & Stem */}
      <div className="space-y-4 mb-6">
        {question.clinicalVignette && (
          <div className="p-4 rounded-2xl bg-slate-50/80 dark:bg-[#142038]/80 border border-slate-200/80 dark:border-[#243452] font-serif-reading text-slate-800 dark:text-slate-200 text-sm sm:text-base leading-relaxed">
            {parseInline(question.clinicalVignette)}
          </div>
        )}
        <p className="font-bold text-slate-900 dark:text-slate-100 text-sm sm:text-base leading-snug">
          {parseInline(question.questionStem)}
        </p>
      </div>

      {/* Options List */}
      <div className="space-y-3 mb-6">
        {question.options.map((opt) => {
          const isSelected = selectedOption === opt.letter;
          const isEliminated = eliminatedOptions.includes(opt.letter);
          const reviewOpt = reviewByLetter.get(opt.letter);

          let optBg = 'bg-slate-50/90 dark:bg-[#131F35] border-slate-300/80 dark:border-[#283C5A] hover:bg-white dark:hover:bg-[#182640] hover:border-teal-500/80 dark:hover:border-teal-400 text-slate-900 dark:text-slate-100 shadow-2xs hover:shadow-xs';
          let letterBg = 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-300/80 dark:border-slate-700 font-bold shadow-2xs';

          if (isExamMode) {
            if (isSelected) {
              optBg = 'bg-teal-50/90 dark:bg-teal-950/60 border-teal-600 dark:border-teal-400 ring-2 ring-teal-600/30 text-teal-950 dark:text-teal-100 shadow-xs';
              letterBg = 'bg-teal-700 text-white font-bold border border-teal-700';
            }
          } else if (isSubmitted && reviewOpt) {
            if (reviewOpt.isCorrect) {
              optBg = 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-500 dark:border-emerald-500 ring-2 ring-emerald-500/20 text-emerald-950 dark:text-emerald-100 shadow-xs';
              letterBg = 'bg-emerald-600 text-white font-bold border border-emerald-600';
            } else if (isSelected && !reviewOpt.isCorrect) {
              optBg = 'bg-rose-50 dark:bg-rose-950/50 border-rose-500 dark:border-rose-500 ring-2 ring-rose-500/20 text-rose-950 dark:text-rose-100 shadow-xs';
              letterBg = 'bg-rose-600 text-white font-bold border border-rose-600';
            }
          } else {
            if (isSelected) {
              optBg = 'bg-teal-50/90 dark:bg-teal-950/60 border-teal-600 dark:border-teal-400 ring-2 ring-teal-600/30 text-teal-950 dark:text-teal-100 shadow-xs';
              letterBg = 'bg-teal-700 text-white font-bold border border-teal-700';
            }
          }

          return (
            <div
              key={opt.letter}
              // Não vira <button>: contém o botão "Riscar alternativa".
              role="button"
              tabIndex={0}
              aria-pressed={isSelected}
              onClick={() => handleSelectOption(opt.letter)}
              onKeyDown={onActivationKey(() => handleSelectOption(opt.letter))}
              className={`rounded-2xl border p-3.5 sm:p-4 transition-all cursor-pointer relative flex flex-col gap-2 ${optBg} ${
                isEliminated ? 'opacity-40 line-through' : ''
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 flex-1">
                  <span
                    className={`w-7 h-7 rounded-xl font-bold text-xs flex items-center justify-center shrink-0 transition-colors ${letterBg}`}
                  >
                    {opt.letter}
                  </span>
                  <span className="text-xs sm:text-sm text-slate-800 dark:text-slate-200 font-medium leading-relaxed pt-0.5">
                    {parseInline(opt.text)}
                  </span>
                </div>

                {/* Strike-through descartar button */}
                {!isSubmitted && !isExamMode && (
                  <button
                    type="button"
                    onClick={(e) => handleToggleEliminate(e, opt.letter)}
                    className="p-1 rounded-md text-slate-300 dark:text-slate-600 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-[10px] font-semibold transition-colors shrink-0 cursor-pointer"
                    title={isEliminated ? 'Restaurar alternativa' : 'Riscar alternativa'}
                  >
                    <EyeOff className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Individual Alternative Explanation (When Answered in Study Mode) */}
              {isSubmitted && !isExamMode && reviewOpt && (
                <div
                  className={`mt-2 pt-2 border-t text-xs leading-relaxed ${
                    reviewOpt.isCorrect
                      ? 'border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200 bg-emerald-100/40 dark:bg-emerald-950/40 p-2.5 rounded-xl'
                      : 'border-slate-200/80 dark:border-slate-800 text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-[#0B1220]/60 p-2.5 rounded-xl'
                  }`}
                >
                  <div className="flex items-center gap-1.5 font-bold mb-1">
                    {reviewOpt.isCorrect ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    ) : (
                      <XCircle className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                    )}
                    <span>{reviewOpt.isCorrect ? 'Por que está correta:' : 'Por que está incorreta (distrator):'}</span>
                  </div>
                  <p>{parseInline(reviewOpt.explanation)}</p>
                  {opt.mechanismReference && (
                    <p className="mt-1 text-[11px] font-mono text-slate-500 dark:text-slate-400 italic">
                      Mecanismo: {parseInline(opt.mechanismReference)}
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Action / Submit Area (Study Mode) */}
      {!isExamMode && !isSubmitted && (
        <div className="flex items-center justify-between pt-2">
          <p className="text-xs text-slate-400 dark:text-slate-500">
            {selectedOption
              ? `Alternativa (${selectedOption}) selecionada.`
              : 'Selecione uma alternativa para responder.'}
          </p>
          <button
            onClick={handleConfirmAnswer}
            disabled={!selectedOption}
            className={`px-6 py-2.5 rounded-xl text-xs font-bold transition-all elev-xs ${
              selectedOption
                ? 'bg-teal-700 hover:bg-teal-800 active:bg-teal-900 dark:bg-teal-600 dark:hover:bg-teal-500 text-white cursor-pointer shadow-sm active:scale-[0.99]'
                : 'bg-slate-200/90 dark:bg-slate-800/80 text-slate-400 dark:text-slate-500 border border-slate-300/60 dark:border-slate-700/60 cursor-not-allowed'
            }`}
          >
            Confirmar Resposta
          </button>
        </div>
      )}

      {/* --- THE INTEGRATED ACTION BANNER (O DIFERENCIAL CONECTADO) --- */}
      {isSubmitted && !isExamMode && (
        <div className="mt-6 pt-6 border-t border-slate-200 dark:border-slate-800 space-y-4">
          {/* Status summary */}
          {isCorrect ? (
            <div className="p-4 rounded-2xl bg-emerald-50/80 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 text-emerald-950 dark:text-emerald-200 flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              <div className="flex-1 space-y-1">
                <span className="text-xs font-bold block text-emerald-900 dark:text-emerald-300 uppercase tracking-wider text-[11px]">
                  Confirmação Clínica · Resposta Correta
                </span>
                <p className="text-xs leading-relaxed text-emerald-900/90 dark:text-emerald-200/90">
                  {reviewResult && parseInline(reviewResult.generalCommentary)}
                </p>
              </div>
            </div>
          ) : (
            <div className="p-4 rounded-2xl bg-rose-50/80 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 text-rose-950 dark:text-rose-200 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
              <div className="flex-1 space-y-1.5">
                <span className="text-xs font-bold block text-rose-900 dark:text-rose-300 uppercase tracking-wider text-[11px]">
                  Mecanismo Negligenciado ou Distrator Identificado
                </span>
                <p className="text-xs leading-relaxed text-rose-900/90 dark:text-rose-200/90">
                  {reviewResult && parseInline(reviewResult.generalCommentary)}
                </p>
                <div className="p-2.5 rounded-xl bg-rose-100/60 dark:bg-rose-900/40 border border-rose-200 dark:border-rose-800 text-[11px] text-rose-900 dark:text-rose-200">
                  <strong>Ponto-chave negligenciado:</strong> {reviewResult && parseInline(reviewResult.highYieldSummary)}
                </div>
              </div>
            </div>
          )}

          {/* High-Yield Summary Pearl */}
          <div className="p-3.5 rounded-2xl bg-teal-50/70 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-800/60 text-xs text-teal-950 dark:text-teal-200">
            <span className="font-bold block mb-1 flex items-center gap-1.5 text-teal-900 dark:text-teal-300">
              <Sparkles className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
              Pérola High-Yield (Resumo Prático):
            </span>
            <p className="leading-relaxed font-medium text-teal-950/90 dark:text-teal-200/90">{reviewResult && parseInline(reviewResult.highYieldSummary)}</p>
          </div>

          {/* Fontes vinculadas a esta questão - Padronizadas em ABNT NBR 6023 com link clicável */}
          {reviewResult?.references && reviewResult.references.length > 0 && (
            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-[#111827] border border-slate-200 dark:border-[#243452] text-xs space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold flex items-center gap-1.5 text-slate-700 dark:text-slate-300">
                  <BookOpen className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                  Bibliografia & Diretrizes da Questão (ABNT NBR 6023):
                </span>
                <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-teal-50 dark:bg-teal-950/50 text-teal-800 dark:text-teal-300 border border-teal-200/70 dark:border-teal-800/50">
                  Links Oficiais
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Referências científicas e diretrizes que fundamentam o gabarito. Clique para ler na íntegra na fonte original.
              </p>
              <div className="space-y-2 pt-1">
                {reviewResult.references.map((ref) => {
                  const abnt = formatToAbntCitation(ref.citationText, ref.url);
                  return (
                    <div
                      key={ref.sourceId}
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
                        className="self-end sm:self-center shrink-0 px-2.5 py-1 rounded-lg bg-teal-50 hover:bg-teal-100 dark:bg-teal-950/60 dark:hover:bg-teal-900/80 text-teal-800 dark:text-teal-300 border border-teal-200/80 dark:border-teal-800/60 font-semibold text-[11px] flex items-center gap-1.5 transition-colors cursor-pointer"
                        title="Acessar material na íntegra em nova aba"
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

          {/* Reação rápida à explicação e feedback contextual */}
          <div className="pt-2 border-t border-slate-200/80 dark:border-[#243452]/80 space-y-2">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <ContextualFeedbackPopover
                questionId={question.id}
                label="Notou erro no gabarito ou comentário?"
                variant="subtle"
              />
              <div className="flex items-center gap-2 self-end sm:self-auto">
                <span className="text-[11px] text-slate-500 dark:text-slate-400">Esta explicação te ajudou?</span>
                <button
                  type="button"
                  onClick={() => handleToggleReaction('up')}
                  className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                    myReaction === 'up'
                      ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800'
                      : 'bg-white dark:bg-[#142038] text-slate-400 dark:text-slate-500 border-slate-200 dark:border-[#243452] hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                  title="Explicação útil"
                >
                  <ThumbsUp className={`w-3.5 h-3.5 ${myReaction === 'up' ? 'fill-emerald-500' : ''}`} />
                </button>
                <button
                  type="button"
                  onClick={() => handleToggleReaction('down')}
                  className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                    myReaction === 'down'
                      ? 'bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-800'
                      : 'bg-white dark:bg-[#142038] text-slate-400 dark:text-slate-500 border-slate-200 dark:border-[#243452] hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                  title="Explicação confusa"
                >
                  <ThumbsDown className={`w-3.5 h-3.5 ${myReaction === 'down' ? 'fill-rose-500' : ''}`} />
                </button>
              </div>
            </div>

            {/* Prompt de ação rápida caso a explicação tenha recebido dislike */}
            {myReaction === 'down' && (
              <div className="p-2.5 rounded-xl bg-rose-50/90 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/60 text-xs text-rose-900 dark:text-rose-200 flex items-center justify-between gap-3 animate-in fade-in">
                <span className="text-[11px] leading-tight">
                  Identificou gabarito divergente ou erro conceitual? Avise nossa equipe em 1 clique:
                </span>
                <ContextualFeedbackPopover
                  questionId={question.id}
                  label="Reportar Erro"
                  variant="pill"
                />
              </div>
            )}
          </div>

          {/* Vínculo de Conteúdo Teórico da Biblioteca */}
          <div>
            {hasValidMaterial ? (
              <button
                type="button"
                onClick={() =>
                  onOpenCompendium(compendiumIdToOpen, question.compendiumSectionId, question.id)
                }
                className="w-full p-3 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-xs font-bold flex items-center justify-center gap-2 elev-xs transition-colors cursor-pointer"
              >
                <BookOpen className="w-4 h-4" />
                <span>
                  Revisar Conteúdo na Biblioteca: {matchedCompendium?.title || 'Abrir Compêndio'}
                </span>
              </button>
            ) : (
              <div className="w-full p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 text-amber-800 dark:text-amber-300 text-xs font-medium flex items-center justify-center gap-2">
                <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                <span>Material da Biblioteca: Pendente de Associação</span>
              </div>
            )}
          </div>

          {/* Aviso automático de catalogação quando errou */}
          {isIncorrect && (
            <div className="p-3 rounded-xl bg-rose-50/80 dark:bg-rose-950/40 border border-rose-200/80 dark:border-rose-800/60 text-xs text-rose-900 dark:text-rose-200 flex items-center gap-2.5">
              <Tag className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
              <span>
                Esta questão foi catalogada automaticamente no seu <strong>Caderno de Erros</strong> e os flashcards de revisão periódica (SRS) já foram agendados.
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
