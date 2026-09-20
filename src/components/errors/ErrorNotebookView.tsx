import React, { useState, useMemo, useEffect } from 'react';
import {
  BookMarked,
  BookOpen,
  Layers,
  Sparkles,
  CheckCircle2,
  Play,
  Search,
  RotateCcw,
  FileEdit,
  Save,
} from 'lucide-react';
import { Question, Discipline, Theme, QuestionAnswerRecord, QuestionReviewResult, ErrorLogItem } from '../../types';
import { parseInline } from '../common/SafeMarkdown';
import { flashcardsRepository } from '../../repositories/FlashcardsRepository';
import { answersRepository } from '../../repositories/AnswersRepository';
import { questionsRepository } from '../../repositories/QuestionsRepository';
import { errorNotebookRepository } from '../../repositories/ErrorNotebookRepository';

interface ErrorNotebookViewProps {
  questions: Question[];
  disciplines: Discipline[];
  themes: Theme[];
  onOpenCompendium: (compendiumId?: string, sectionId?: string, originQuestionId?: string) => void;
  onOpenQuestion: (questionId: string) => void;
  onStartErrorSimulado: () => void;
  onUpdate: () => void;
}

export const ErrorNotebookView: React.FC<ErrorNotebookViewProps> = ({
  questions,
  disciplines,
  themes,
  onOpenCompendium,
  onStartErrorSimulado,
  onUpdate,
}) => {
  const [selectedReason, setSelectedReason] = useState<string>('all');
  const [selectedDiscipline] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState<string>('');

  const [answers, setAnswers] = useState<Record<string, QuestionAnswerRecord>>({});
  // Gabarito por questão, obtido via RPC (question_option_keys/
  // question_answer_keys não têm policy de SELECT direto para estudante).
  const [reviews, setReviews] = useState<Record<string, QuestionReviewResult>>({});
  // Entradas do caderno de erros propriamente ditas (error_notebook), fonte
  // de verdade para `resolved` desta tela (Prompt 07-E5) — ver
  // handleToggleResolved abaixo. `answers` continua sendo a
  // fonte de "isCorrect"/qual foi a última tentativa, mas resolver um erro
  // NUNCA mais grava uma nova question_attempts; passa
  // pelo caminho confiável já publicado (errorNotebookRepository.updateErrorLog).
  const [errorLogs, setErrorLogs] = useState<ErrorLogItem[]>([]);

  const reloadAnswers = () => {
    answersRepository.getAnswers().then(setAnswers);
  };

  const reloadErrorLogs = () => {
    errorNotebookRepository.getErrorLogs().then(setErrorLogs);
  };

  useEffect(() => {
    reloadAnswers();
    reloadErrorLogs();
  }, []);

  // Mapa questionId -> entrada de error_notebook mais recente. Uma questão
  // pode ter mais de uma linha em error_notebook ao longo do tempo (cada
  // resposta incorreta gera uma nova linha, por design da categoria 1 —
  // ver AGENTS.md); `getErrorLogs()` já devolve ordenado por created_at
  // desc (SupabaseErrorNotebookRepository), então a primeira ocorrência por
  // questionId é sempre a mais recente — mesma convenção de "última que
  // vale" usada por `answersRepository.getAnswers()`.
  const errorLogsByQuestion = useMemo(() => {
    const map: Record<string, ErrorLogItem> = {};
    for (const log of errorLogs) {
      if (!map[log.questionId]) map[log.questionId] = log;
    }
    return map;
  }, [errorLogs]);

  useEffect(() => {
    const mistakeIds = Object.keys(answers).filter((qid) => !answers[qid].isCorrect && !reviews[qid]);
    if (mistakeIds.length === 0) return;
    let cancelled = false;
    Promise.all(
      mistakeIds.map((id) => questionsRepository.getQuestionReview(id).then((r) => [id, r] as const))
    ).then((pairs) => {
      if (cancelled) return;
      setReviews((prev) => {
        const next = { ...prev };
        for (const [id, r] of pairs) next[id] = r;
        return next;
      });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answers]);

  // Filter mistakes
  const mistakes = useMemo(() => {
    return (Object.values(answers) as QuestionAnswerRecord[])
      .filter((a) => !a.isCorrect)
      .map((ans) => {
        const q = questions.find((item) => item.id === ans.questionId);
        return {
          answer: ans,
          question: q,
        };
      })
      .filter((item): item is { answer: QuestionAnswerRecord; question: Question } => !!item.question)
      .filter(({ answer, question }) => {
        // Nota: itens marcados como "Dominada" (error_notebook.resolved)
        // continuam aparecendo aqui — a lista é derivada da última tentativa
        // (answers[id].isCorrect), igual antes desta correção; "resolved" só
        // controla o rótulo/estado do botão (Reabrir vs. Marcar como
        // Dominada) e o badge "Dominada", nunca esconde o item. Esconder
        // exigiria uma decisão de produto nova (o que fazer quando o
        // estudante responder errado de novo?) fora do escopo desta
        // correção — só trocar o caminho de gravação para o confiável já
        // publicado.
        if (selectedReason !== 'all' && (answer.errorReason || 'lacuna_teorica') !== selectedReason) {
          return false;
        }
        if (selectedDiscipline !== 'all' && question.disciplineId !== selectedDiscipline) {
          return false;
        }
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const matchesStem = question.questionStem.toLowerCase().includes(q);
          const matchesVignette = question.clinicalVignette.toLowerCase().includes(q);
          const matchesPearl = question.highYieldSummary.toLowerCase().includes(q);
          return matchesStem || matchesVignette || matchesPearl;
        }
        return true;
      });
  }, [answers, questions, selectedReason, selectedDiscipline, searchQuery]);

  const reasonLabels: Record<string, { label: string; color: string }> = {
    lacuna_teorica: { label: 'Lacuna Teórica', color: 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800' },
    pegadinha: { label: 'Distrator / Pegadinha', color: 'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800' },
    falta_atencao: { label: 'Falta de Atenção', color: 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800' },
    raciocinio_clinico: { label: 'Raciocínio Clínico', color: 'bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-950/60 dark:text-purple-300 dark:border-purple-800' },
    tempo_esgotado: { label: 'Tempo Esgotado', color: 'bg-slate-100 text-slate-800 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700' },
  };

  // Marcar como dominada / reabrir e salvar anotação usam o caminho
  // confiável já publicado no Prompt 07-E (errorNotebookRepository.
  // updateErrorLog -> fila syncQueue -> UPDATE de 2 colunas por id,
  // idempotente por natureza). Antes desta correção (07-E5), estes dois
  // botões chamavam answersRepository.recordAnswer — categoria 1, evento
  // IMUTÁVEL de tentativa de questão — o que gerava uma nova linha em
  // question_attempts/error_notebook a cada clique em vez de atualizar a
  // entrada existente (ver AGENTS.md, achado de smoke test do 07-E4).
  // Atualiza o estado local de `errorLogs` OTIMISTICAMENTE com o item já
  // conhecido, em vez de rechamar getErrorLogs() logo em seguida. Isso
  // importa de verdade: `updateErrorLog` grava local e enfileira o envio ao
  // Supabase em segundo plano (fire-and-forget, ver syncQueue.enqueue) —
  // reler getErrorLogs() imediatamente correria contra esse envio e, quando
  // configurado para Supabase, leria o servidor ANTES do flush terminar,
  // mostrando o estado antigo por engano (only ficaria certo depois de outro
  // gatilho de reload). Atualizar o estado com o item que ACABAMOS de gravar
  // localmente dá feedback imediato e correto, online ou offline, sem
  // esperar a rede.
  const applyErrorLogUpdate = (updated: ErrorLogItem) => {
    setErrorLogs((prev) => prev.map((l) => (l.id === updated.id ? updated : l)));
  };

  const handleToggleResolved = async (questionId: string, resolved: boolean) => {
    const log = errorLogsByQuestion[questionId];
    if (!log) return; // sem entrada em error_notebook ainda (ex.: sincronizando) — nada a atualizar
    const updated: ErrorLogItem = { ...log, resolved };
    await errorNotebookRepository.updateErrorLog(updated);
    applyErrorLogUpdate(updated);
    onUpdate();
  };

  const handleSaveNote = async (questionId: string) => {
    const log = errorLogsByQuestion[questionId];
    if (!log) return;
    const updated: ErrorLogItem = { ...log, userNotes: noteDraft.trim() };
    await errorNotebookRepository.updateErrorLog(updated);
    applyErrorLogUpdate(updated);
    setEditingNoteId(null);
    setNoteDraft('');
    onUpdate();
  };

  const handleCreateFlashcard = async (q: Question) => {
    await flashcardsRepository.createFlashcardFromQuestion(q);
    alert('Flashcard adicionado à sua rotina de repetição espaçada!');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-rose-950 via-slate-900 to-rose-900 rounded-3xl p-6 sm:p-8 text-white elev-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="max-w-2xl space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-rose-500/20 text-rose-300 text-xs font-semibold border border-rose-400/30">
            <BookMarked className="w-3.5 h-3.5" />
            <span>Caderno de Erros & Metacognição</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
            Diagnóstico e Correção de Pontos Cegos
          </h1>
          <p className="text-slate-300 text-xs sm:text-sm leading-relaxed">
            O aprendizado duradouro acontece quando você entende a causa raiz de cada erro. Mapeie se o erro foi lacuna teórica, distrator ou interpretação clínica e feche o ciclo no compêndio.
          </p>
        </div>

        <button
          onClick={onStartErrorSimulado}
          disabled={mistakes.length === 0}
          className="px-6 py-3.5 rounded-2xl bg-gradient-to-r from-rose-500 to-amber-500 hover:from-rose-400 hover:to-amber-400 text-white font-extrabold text-xs elev-lg shadow-rose-900/20 transition-all flex items-center justify-center gap-2 shrink-0"
        >
          <Play className="w-4 h-4 fill-white" />
          <span>Treinar Apenas Questões Erradas</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white dark:bg-[#0F172A] rounded-2xl border border-slate-200 dark:border-[#243452] p-4 elev-xs flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="w-full md:w-80 relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
          <input
            type="text"
            placeholder="Buscar por caso ou questão errada..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-[#243452] bg-slate-50 dark:bg-[#142038] focus:bg-white dark:focus:bg-[#1A2845] focus:outline-none focus:ring-2 focus:ring-rose-500 text-slate-900 dark:text-slate-100 placeholder:text-slate-400"
          />
        </div>

        {/* Reason Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar w-full md:w-auto pb-1 md:pb-0 text-xs">
          <button
            onClick={() => setSelectedReason('all')}
            className={`px-3 py-1.5 rounded-xl font-semibold shrink-0 transition-all cursor-pointer ${
              selectedReason === 'all'
                ? 'bg-slate-900 dark:bg-rose-600 text-white elev-xs'
                : 'bg-slate-100 dark:bg-[#142038] text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-[#1A2845]'
            }`}
          >
            Todos os Motivos ({mistakes.length})
          </button>
          {Object.entries(reasonLabels).map(([key, config]) => (
            <button
              key={key}
              onClick={() => setSelectedReason(key)}
              className={`px-3 py-1.5 rounded-xl font-semibold shrink-0 transition-all cursor-pointer ${
                selectedReason === key
                  ? 'bg-rose-700 dark:bg-rose-600 text-white elev-xs'
                  : 'bg-slate-100 dark:bg-[#142038] text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-[#1A2845]'
              }`}
            >
              {config.label}
            </button>
          ))}
        </div>
      </div>

      {/* Mistakes List */}
      {mistakes.length === 0 ? (
        <div className="bg-white dark:bg-[#0F172A] rounded-3xl border border-slate-200 dark:border-[#243452] p-12 text-center text-slate-500 dark:text-slate-400 space-y-2">
          <CheckCircle2 className="w-10 h-10 mx-auto text-emerald-500" />
          <p className="font-bold text-base text-slate-900 dark:text-slate-100">Nenhum erro registrado com estes filtros!</p>
          <p className="text-xs text-slate-400 dark:text-slate-500">
            Continue praticando questões. Quando você errar uma questão, ela será automaticamente arquivada aqui para correção.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {mistakes.map(({ answer, question }) => {
            const disc = disciplines.find((d) => d.id === question.disciplineId);
            const th = themes.find((t) => t.id === question.themeId);
            const review = reviews[question.id];
            const reviewCorrectOpt = review?.options.find((o) => o.isCorrect);
            const reviewSelectedOpt = review?.options.find((o) => o.letter === answer.selectedOption);
            const correctOpt = {
              letter: reviewCorrectOpt?.letter,
              text: question.options.find((o) => o.letter === reviewCorrectOpt?.letter)?.text,
              explanation: reviewCorrectOpt?.explanation,
            };
            const selectedOpt = {
              text: question.options.find((o) => o.letter === answer.selectedOption)?.text,
              explanation: reviewSelectedOpt?.explanation,
            };
            const reasonConfig = reasonLabels[answer.errorReason || 'lacuna_teorica'];
            const errorLog = errorLogsByQuestion[question.id];
            const isResolved = errorLog?.resolved ?? false;

            return (
              <div
                key={question.id}
                className={`bg-white dark:bg-[#0F172A] rounded-3xl border p-6 elev-xs transition-all space-y-4 ${
                  isResolved
                    ? 'border-emerald-200 dark:border-emerald-900/60'
                    : 'border-slate-200 dark:border-[#243452] hover:border-rose-300 dark:hover:border-rose-800'
                }`}
              >
                {/* Header */}
                <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-md bg-teal-50 dark:bg-teal-950/60 text-teal-800 dark:text-teal-300 border border-teal-200/60 dark:border-teal-800/60">
                      {disc?.name || 'Medicina'}
                    </span>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-slate-100 dark:bg-[#142038] text-slate-700 dark:text-slate-300">
                      {th?.name || 'Tema'}
                    </span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300">
                      {question.institution} ({question.year})
                    </span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${reasonConfig.color}`}>
                      {reasonConfig.label}
                    </span>
                    {isResolved && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-md border bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" />
                        Dominada
                      </span>
                    )}
                  </div>

                  <span className="text-xs text-slate-400 dark:text-slate-500">
                    Respondida em {new Date(answer.timestamp).toLocaleDateString('pt-BR')}
                  </span>
                </div>

                {/* Vignette and Stem */}
                <div className="text-xs sm:text-sm font-serif-reading space-y-2">
                  {question.clinicalVignette && (
                    <p className="text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-[#142038] p-3 rounded-xl border border-slate-100 dark:border-[#243452]">
                      {parseInline(question.clinicalVignette)}
                    </p>
                  )}
                  <p className="font-bold text-slate-900 dark:text-slate-100 font-sans">
                    {parseInline(question.questionStem)}
                  </p>
                </div>

                {/* Alternatives Comparison (Marked vs Correct) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 rounded-xl">
                    <span className="font-bold text-rose-900 dark:text-rose-200 block mb-1">
                      Sua Escolha (Incorreta): Alternativa {answer.selectedOption}
                    </span>
                    <p className="text-rose-800 dark:text-rose-300">{parseInline(selectedOpt.text ?? '')}</p>
                    {selectedOpt?.explanation && (
                      <p className="text-[11px] text-rose-700 dark:text-rose-400 mt-1 pt-1 border-t border-rose-200 dark:border-rose-900/60">
                        {parseInline(selectedOpt.explanation)}
                      </p>
                    )}
                  </div>

                  <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/60 rounded-xl">
                    <span className="font-bold text-emerald-900 dark:text-emerald-200 block mb-1">
                      Gabarito Oficial: Alternativa {correctOpt?.letter}
                    </span>
                    <p className="text-emerald-800 dark:text-emerald-300">{parseInline(correctOpt.text ?? '')}</p>
                    {correctOpt?.explanation && (
                      <p className="text-[11px] text-emerald-700 dark:text-emerald-400 mt-1 pt-1 border-t border-emerald-200 dark:border-emerald-900/60">
                        {parseInline(correctOpt.explanation)}
                      </p>
                    )}
                  </div>
                </div>

                {/* High-Yield Summary */}
                <div className="p-3 bg-teal-50/70 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-800 rounded-xl text-xs text-teal-950 dark:text-teal-200 flex items-start gap-2">
                  <Sparkles className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold block text-teal-900 dark:text-teal-300">Pérola de Aprendizado:</span>
                    <p className="font-medium mt-0.5 text-teal-950 dark:text-teal-200">{review && parseInline(review.highYieldSummary)}</p>
                  </div>
                </div>

                {/* Personal Notes vinculada ao erro */}
                <div className="p-3 bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/80 rounded-xl text-xs space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5 text-[11px]">
                      <FileEdit className="w-3.5 h-3.5 text-teal-600" />
                      Sua Anotação Pessoal sobre o Erro:
                    </span>
                    {editingNoteId !== question.id && (
                      <button
                        onClick={() => {
                          setEditingNoteId(question.id);
                          setNoteDraft(errorLog?.userNotes || '');
                        }}
                        disabled={!errorLog}
                        className="text-[11px] text-teal-700 hover:text-teal-800 font-semibold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        {errorLog?.userNotes ? 'Editar anotação' : '+ Adicionar anotação'}
                      </button>
                    )}
                  </div>

                  {editingNoteId === question.id ? (
                    <div className="space-y-2 pt-1">
                      <textarea
                        value={noteDraft}
                        onChange={(e) => setNoteDraft(e.target.value)}
                        placeholder="Escreva sua reflexão ou mnemônico sobre esta questão..."
                        rows={2}
                        className="w-full text-xs p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-hidden focus:ring-1 focus:ring-teal-500"
                      />
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setEditingNoteId(null)}
                          className="px-2.5 py-1 text-[11px] rounded-lg text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700"
                        >
                          Cancelar
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSaveNote(question.id)}
                          className="px-3 py-1 text-[11px] font-semibold rounded-lg bg-teal-700 hover:bg-teal-800 text-white flex items-center gap-1 cursor-pointer"
                        >
                          <Save className="w-3 h-3" />
                          Salvar
                        </button>
                      </div>
                    </div>
                  ) : errorLog?.userNotes ? (
                    <p className="text-slate-700 dark:text-slate-300 italic bg-white dark:bg-slate-900 p-2.5 rounded-lg border border-slate-200/60 dark:border-slate-700/60 leading-relaxed">
                      "{errorLog.userNotes}"
                    </p>
                  ) : (
                    <p className="text-slate-400 dark:text-slate-500 text-[11px] italic">
                      Nenhuma anotação pessoal registrada ainda para este erro.
                    </p>
                  )}
                </div>

                {/* Actions Bar */}
                <div className="pt-2 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() =>
                        onOpenCompendium(question.compendiumRefId, question.compendiumSectionId, question.id)
                      }
                      className="px-3 py-1.5 rounded-xl bg-teal-700 hover:bg-teal-800 text-white font-bold flex items-center gap-1.5 transition-colors elev-xs cursor-pointer"
                    >
                      <BookOpen className="w-3.5 h-3.5" />
                      <span>Revisar no Compêndio</span>
                    </button>

                    <button
                      onClick={() => handleCreateFlashcard(question)}
                      className="px-3 py-1.5 rounded-xl bg-slate-900 dark:bg-[#142038] hover:bg-slate-800 dark:hover:bg-[#1A2845] text-white font-bold flex items-center gap-1.5 transition-colors elev-xs cursor-pointer border border-transparent dark:border-[#243452]"
                    >
                      <Layers className="w-3.5 h-3.5 text-teal-400" />
                      <span>Gerar Flashcard SRS</span>
                    </button>
                  </div>

                  {isResolved ? (
                    <button
                      onClick={() => handleToggleResolved(question.id, false)}
                      disabled={!errorLog}
                      className="px-3 py-1.5 rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/50 font-bold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <RotateCcw className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                      <span>Reabrir</span>
                    </button>
                  ) : (
                    <button
                      onClick={() => handleToggleResolved(question.id, true)}
                      disabled={!errorLog}
                      className="px-3 py-1.5 rounded-xl border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 font-bold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                      <span>Marcar como Dominada</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
