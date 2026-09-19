import React, { useState, useMemo, useEffect } from 'react';
import {
  BookMarked,
  BookOpen,
  Layers,
  CheckCircle2,
  AlertTriangle,
  Play,
  Filter,
  Search,
  FileEdit,
  Save,
  Brain,
  Check,
  ArrowRight,
  ExternalLink,
  ArrowLeft,
  FileDown,
} from 'lucide-react';
import {
  Question,
  Discipline,
  Theme,
  Compendium,
  QuestionAnswerRecord,
  QuestionReviewResult,
  ErrorLogItem,
} from '../../types';
import { flashcardsRepository } from '../../repositories/FlashcardsRepository';
import { answersRepository } from '../../repositories/AnswersRepository';
import { questionsRepository } from '../../repositories/QuestionsRepository';
import { errorNotebookRepository } from '../../repositories/ErrorNotebookRepository';
import { ExportCadernoModal } from './ExportCadernoModal';

interface IntegratedCadernoErrosProps {
  questions: Question[];
  disciplines: Discipline[];
  themes: Theme[];
  compendiums: Compendium[];
  onOpenCompendium: (compendiumId?: string, sectionId?: string, originQuestionId?: string) => void;
  onOpenQuestion: (questionId: string) => void;
  onStartErrorSimulado: () => void;
  onUpdate: () => void;
  onSwitchToOverview?: () => void;
}

export const IntegratedCadernoErros: React.FC<IntegratedCadernoErrosProps> = ({
  questions,
  disciplines,
  themes,
  compendiums,
  onOpenCompendium,
  onOpenQuestion,
  onStartErrorSimulado,
  onUpdate,
  onSwitchToOverview,
}) => {
  const [selectedReason, setSelectedReason] = useState<string>('all');
  const [selectedDiscipline, setSelectedDiscipline] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<'all' | 'pending' | 'resolved'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState<string>('');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);

  const [answers, setAnswers] = useState<Record<string, QuestionAnswerRecord>>({});
  const [reviews, setReviews] = useState<Record<string, QuestionReviewResult>>({});
  const [errorLogs, setErrorLogs] = useState<ErrorLogItem[]>([]);
  const [createdFlashcardQuestionIds, setCreatedFlashcardQuestionIds] = useState<string[]>([]);

  const reloadData = () => {
    answersRepository.getAnswers().then(setAnswers);
    errorNotebookRepository.getErrorLogs().then(setErrorLogs);
  };

  useEffect(() => {
    reloadData();
  }, []);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Mapa questionId -> entrada mais recente de error_notebook
  const errorLogsByQuestion = useMemo(() => {
    const map: Record<string, ErrorLogItem> = {};
    for (const log of errorLogs) {
      if (!map[log.questionId]) map[log.questionId] = log;
    }
    return map;
  }, [errorLogs]);

  // Carregar gabaritos para questões erradas
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
  }, [answers]);

  // Todas as questões respondidas incorretamente
  const allMistakes = useMemo(() => {
    return (Object.values(answers) as QuestionAnswerRecord[])
      .filter((a) => !a.isCorrect)
      .map((ans) => {
        const q = questions.find((item) => item.id === ans.questionId);
        return {
          answer: ans,
          question: q,
        };
      })
      .filter((item): item is { answer: QuestionAnswerRecord; question: Question } => !!item.question);
  }, [answers, questions]);

  // Filtros aplicados
  const filteredMistakes = useMemo(() => {
    return allMistakes.filter(({ answer, question }) => {
      const log = errorLogsByQuestion[question.id];
      const isResolved = log ? log.resolved : false;

      if (selectedStatus === 'pending' && isResolved) return false;
      if (selectedStatus === 'resolved' && !isResolved) return false;

      const reason = log?.errorReason || answer.errorReason || 'lacuna_teorica';
      if (selectedReason !== 'all' && reason !== selectedReason) {
        return false;
      }
      if (selectedDiscipline !== 'all' && question.disciplineId !== selectedDiscipline) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesStem = question.questionStem.toLowerCase().includes(q);
        const matchesVignette = question.clinicalVignette.toLowerCase().includes(q);
        const matchesPearl = (question.highYieldSummary || '').toLowerCase().includes(q);
        const matchesInstitution = question.institution.toLowerCase().includes(q);
        return matchesStem || matchesVignette || matchesPearl || matchesInstitution;
      }
      return true;
    });
  }, [allMistakes, errorLogsByQuestion, selectedStatus, selectedReason, selectedDiscipline, searchQuery]);

  // Métricas do Caderno
  const metrics = useMemo(() => {
    const total = allMistakes.length;
    let resolved = 0;
    let notesCount = 0;
    const reasonCounts: Record<string, number> = {
      lacuna_teorica: 0,
      pegadinha: 0,
      falta_atencao: 0,
      raciocinio_clinico: 0,
      tempo_esgotado: 0,
    };

    for (const m of allMistakes) {
      const log = errorLogsByQuestion[m.question.id];
      if (log?.resolved) resolved++;
      if (log?.userNotes && log.userNotes.trim().length > 0) notesCount++;
      const r = log?.errorReason || m.answer.errorReason || 'lacuna_teorica';
      if (reasonCounts[r] !== undefined) {
        reasonCounts[r]++;
      } else {
        reasonCounts.lacuna_teorica++;
      }
    }

    return {
      total,
      resolved,
      pending: total - resolved,
      notesCount,
      resolutionRate: total > 0 ? Math.round((resolved / total) * 100) : 0,
      reasonCounts,
    };
  }, [allMistakes, errorLogsByQuestion]);

  const reasonConfig: Record<string, { label: string; desc: string; color: string; badge: string }> = {
    lacuna_teorica: {
      label: 'Lacuna Teórica',
      desc: 'Conceito, critério ou diretriz não consolidada na memória.',
      color: 'border-amber-400 bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300',
      badge: 'bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-300 border-amber-300 dark:border-amber-800',
    },
    pegadinha: {
      label: 'Distrator / Pegadinha',
      desc: 'Alternativa formulada intencionalmente pela banca para induzir ao erro.',
      color: 'border-rose-400 bg-rose-50 dark:bg-rose-950/30 text-rose-800 dark:text-rose-300',
      badge: 'bg-rose-100 text-rose-800 dark:bg-rose-900/60 dark:text-rose-300 border-rose-300 dark:border-rose-800',
    },
    falta_atencao: {
      label: 'Falta de Atenção',
      desc: 'Leitura precipitada do enunciado ("exceto", "incorreta", valores de referência).',
      color: 'border-sky-400 bg-sky-50 dark:bg-sky-950/30 text-sky-800 dark:text-sky-300',
      badge: 'bg-sky-100 text-sky-800 dark:bg-sky-900/60 dark:text-sky-300 border-sky-300 dark:border-sky-800',
    },
    raciocinio_clinico: {
      label: 'Raciocínio Clínico',
      desc: 'Dificuldade na hierarquização diagnóstica ou timing de condutas.',
      color: 'border-purple-400 bg-purple-50 dark:bg-purple-950/30 text-purple-800 dark:text-purple-300',
      badge: 'bg-purple-100 text-purple-800 dark:bg-purple-900/60 dark:text-purple-300 border-purple-300 dark:border-purple-800',
    },
    tempo_esgotado: {
      label: 'Tempo Esgotado',
      desc: 'Pressão de tempo ou indecisão prolongada entre duas alternativas.',
      color: 'border-slate-400 bg-slate-50 dark:bg-slate-900/40 text-slate-800 dark:text-slate-300',
      badge: 'bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-300 border-slate-300 dark:border-slate-700',
    },
  };

  const applyErrorLogUpdate = (updated: ErrorLogItem) => {
    setErrorLogs((prev) => prev.map((l) => (l.id === updated.id ? updated : l)));
  };

  const handleToggleResolved = async (questionId: string, resolved: boolean) => {
    const log = errorLogsByQuestion[questionId];
    if (!log) return;
    const updated: ErrorLogItem = { ...log, resolved };
    await errorNotebookRepository.updateErrorLog(updated);
    applyErrorLogUpdate(updated);
    onUpdate();
    showToast(resolved ? 'Questão marcada como dominada!' : 'Questão reaberta no caderno de erros.');
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
    showToast('Anotação de aprendizado salva com sucesso!');
  };

  const handleCreateFlashcard = async (q: Question) => {
    await flashcardsRepository.createFlashcardFromQuestion(q);
    setCreatedFlashcardQuestionIds((prev) => [...prev, q.id]);
    onUpdate();
    showToast('Flashcard gerado com sucesso! Já agendado na sua rotina de SRS.');
  };

  return (
    <div className="space-y-6">
      {/* Toast flutuante */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 px-4 py-3 rounded-2xl bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-bold shadow-2xl flex items-center gap-2 animate-in fade-in slide-in-from-bottom-2">
          <CheckCircle2 className="w-4 h-4 text-teal-400 dark:text-teal-600 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Banner Superior do Caderno Integrado */}
      <div className="bg-gradient-to-r from-rose-950 via-slate-900 to-slate-900 rounded-3xl p-6 sm:p-8 text-white border border-rose-900/40 elev-md flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="max-w-2xl space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-rose-500/20 text-rose-300 text-xs font-semibold border border-rose-400/30">
            <BookMarked className="w-3.5 h-3.5" />
            <span>Caderno de Erros & Metacognição Integrado ao Início</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
            Diagnóstico e Correção de Falhas Clínicas
          </h1>
          <p className="text-slate-300 text-xs sm:text-sm leading-relaxed">
            Seus erros são seu maior ativo de aprendizagem. Compreenda a causa raiz de cada resposta incorreta, converta pontos cegos em flashcards de repetição e estude a teoria correspondente na Biblioteca Médica.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 w-full md:w-auto shrink-0">
          {onSwitchToOverview && (
            <button
              type="button"
              onClick={onSwitchToOverview}
              className="px-4 py-3 rounded-2xl bg-white/10 hover:bg-white/20 border border-white/20 text-white text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              title="Voltar para a Visão Geral do Dashboard"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Visão Geral</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => setIsExportModalOpen(true)}
            disabled={allMistakes.length === 0}
            className="px-4 py-3 rounded-2xl bg-white/15 hover:bg-white/25 border border-white/30 text-white text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer"
            title="Exportar dossiê para impressão ou Notion / Obsidian"
          >
            <FileDown className="w-4 h-4" />
            <span>Exportar Dossiê</span>
          </button>
          <button
            type="button"
            onClick={onStartErrorSimulado}
            disabled={allMistakes.length === 0}
            className={`px-5 py-3 rounded-2xl text-xs font-extrabold transition-all flex items-center justify-center gap-2 cursor-pointer elev-md ${
              allMistakes.length > 0
                ? 'bg-gradient-to-r from-rose-500 to-amber-500 hover:from-rose-400 hover:to-amber-400 text-white shadow-rose-900/20'
                : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
            }`}
          >
            <Play className="w-4 h-4 fill-white" />
            <span>Treinar Apenas Questões Erradas</span>
          </button>
        </div>
      </div>

      {/* ── KPIs do Caderno de Erros ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
        <div className="p-4 rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200/90 dark:border-[#243452] elev-xs space-y-1">
          <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            Total Catalogado
          </span>
          <p className="text-2xl font-black text-rose-600 dark:text-rose-400 tabular-nums">
            {metrics.total}
          </p>
          <span className="text-[11px] text-slate-500 dark:text-slate-400 block">
            {metrics.pending} pendentes de fixação
          </span>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200/90 dark:border-[#243452] elev-xs space-y-1">
          <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            Dominadas
          </span>
          <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400 tabular-nums">
            {metrics.resolved}
          </p>
          <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium block">
            {metrics.resolutionRate}% dos erros resolvidos
          </span>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200/90 dark:border-[#243452] elev-xs space-y-1">
          <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            Notas de Aprendizado
          </span>
          <p className="text-2xl font-black text-slate-900 dark:text-slate-100 tabular-nums">
            {metrics.notesCount}
          </p>
          <span className="text-[11px] text-slate-500 dark:text-slate-400 block">
            Comentários metacognitivos
          </span>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200/90 dark:border-[#243452] elev-xs space-y-1">
          <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            Conexão com Biblioteca
          </span>
          <p className="text-2xl font-black text-teal-600 dark:text-teal-400 tabular-nums">
            100%
          </p>
          <span className="text-[11px] text-teal-700 dark:text-teal-300 font-medium block">
            Links diretos e ABNT
          </span>
        </div>
      </div>

      {/* ── Diagnóstico Metacognitivo de Causas Raiz ── */}
      <div className="bg-white dark:bg-[#0F172A] rounded-3xl border border-slate-200/90 dark:border-[#243452] p-5 sm:p-6 elev-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Brain className="w-4 h-4 text-teal-600 dark:text-teal-400" />
              <span>Taxonomia Metacognitiva: Por que você errou?</span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Clique em uma causa para filtrar as questões correspondentes e agir no ponto exato.
            </p>
          </div>
          {selectedReason !== 'all' && (
            <button
              type="button"
              onClick={() => setSelectedReason('all')}
              className="text-xs text-teal-600 dark:text-teal-400 font-bold hover:underline self-start sm:self-auto cursor-pointer"
            >
              Limpar filtro de causa
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {Object.entries(reasonConfig).map(([key, config]) => {
            const count = metrics.reasonCounts[key] || 0;
            const percent = metrics.total > 0 ? Math.round((count / metrics.total) * 100) : 0;
            const isSelected = selectedReason === key;

            return (
              <button
                key={key}
                type="button"
                onClick={() => setSelectedReason(isSelected ? 'all' : key)}
                className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                  isSelected
                    ? 'ring-2 ring-teal-500 border-teal-500 bg-teal-50/50 dark:bg-teal-950/30'
                    : 'border-slate-200/80 dark:border-[#243452] bg-slate-50/50 dark:bg-[#142038]/50 hover:border-slate-300 dark:hover:border-slate-700'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
                      {config.label}
                    </span>
                    <span className="text-[11px] font-black tabular-nums text-slate-600 dark:text-slate-300">
                      {count}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight">
                    {config.desc}
                  </p>
                </div>

                <div className="mt-3 space-y-1">
                  <div className="w-full bg-slate-200 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
                    <div
                      className="bg-teal-600 dark:bg-teal-400 h-full rounded-full transition-all"
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-slate-400 dark:text-slate-500 block text-right font-semibold">
                    {percent}% dos erros
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Raio-X Prescritivo Baseado no Padrão Predominante */}
        {metrics.total > 0 && (() => {
          const sortedReasons = (Object.entries(metrics.reasonCounts) as [string, number][]).sort((a, b) => Number(b[1]) - Number(a[1]));
          const topReason = sortedReasons[0];
          if (!topReason || topReason[1] === 0) return null;

          const topKey = topReason[0];
          const topCount = Number(topReason[1]);
          const topPercent = Math.round((topCount / metrics.total) * 100);

          let prescription = {
            title: 'Prescrição de Estudo: Reforço Teórico Imediato',
            text: 'Mais de 40% das suas incorreções decorrem de conceitos ou diretrizes não consolidados. Antes de fazer novas baterias de questões, priorize os Compêndios Teóricos e revisite a fisiopatologia básica.',
            badge: 'Foco: Biblioteca & Diretrizes',
            color: 'border-amber-400/40 bg-amber-500/10 text-amber-900 dark:text-amber-200',
          };

          if (topKey === 'pegadinha') {
            prescription = {
              title: 'Prescrição de Estudo: Calibração contra Distratores',
              text: 'Seu padrão de erro aponta excelente base teórica, mas vulnerabilidade a distratores capciosos formulados pelas bancas. Adote a eliminação ativa obrigatória antes de assinalar a alternativa.',
              badge: 'Foco: Análise de Distratores',
              color: 'border-rose-400/40 bg-rose-500/10 text-rose-900 dark:text-rose-200',
            };
          } else if (topKey === 'falta_atencao') {
            prescription = {
              title: 'Prescrição de Estudo: Rastreio de Comandos Críticos',
              text: 'Erros por leitura apressada do enunciado ("exceto", "incorreta", valores limítrofes). Diminua o ritmo em 15 segundos por questão e sublinhe o comando antes das alternativas.',
              badge: 'Foco: Atenção ao Comando',
              color: 'border-sky-400/40 bg-sky-500/10 text-sky-900 dark:text-sky-200',
            };
          } else if (topKey === 'raciocinio_clinico') {
            prescription = {
              title: 'Prescrição de Estudo: Fluxogramas de Decisão Clínica',
              text: 'Dificuldade concentrada no encadeamento conduta vs diagnóstico ou no timing de exames complementares. Priorize fluxogramas e guidelines das especialidades envolvidas.',
              badge: 'Foco: Fluxogramas Clínicos',
              color: 'border-purple-400/40 bg-purple-500/10 text-purple-900 dark:text-purple-200',
            };
          } else if (topKey === 'tempo_esgotado') {
            prescription = {
              title: 'Prescrição de Estudo: Gestão de Ritmo de Prova',
              text: 'O tempo limite está comprometendo a precisão na escolha final. Treine no modo Simulado com limite cronometrado de 2 a 3 minutos por questão.',
              badge: 'Foco: Gestão de Cronômetro',
              color: 'border-slate-400/40 bg-slate-500/10 text-slate-900 dark:text-slate-200',
            };
          }

          return (
            <div className={`p-4 rounded-2xl border ${prescription.color} flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mt-4`}>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded-md bg-white/60 dark:bg-black/30 font-bold text-[10px] uppercase tracking-wider">
                    {prescription.badge}
                  </span>
                  <span className="text-xs font-bold">{prescription.title} ({topPercent}% dos seus erros)</span>
                </div>
                <p className="text-xs leading-relaxed max-w-3xl opacity-90">{prescription.text}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedReason(topKey)}
                className="px-3 py-1.5 rounded-xl bg-slate-900 dark:bg-slate-800 text-white hover:bg-slate-800 dark:hover:bg-slate-700 text-xs font-bold transition-all shrink-0 cursor-pointer self-end sm:self-auto"
              >
                Filtrar apenas {reasonConfig[topKey]?.label}
              </button>
            </div>
          );
        })()}
      </div>

      {/* ── Barra de Busca e Filtros Avançados ── */}
      <div className="bg-white dark:bg-[#0F172A] rounded-2xl border border-slate-200 dark:border-[#243452] p-4 elev-xs space-y-3">
        <div className="flex flex-col md:flex-row items-center justify-between gap-3">
          {/* Busca por caso clínico ou conceito */}
          <div className="w-full md:w-80 relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
            <input
              type="text"
              placeholder="Buscar por caso clínico, enunciado ou banca..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-[#243452] bg-slate-50 dark:bg-[#142038] focus:bg-white dark:focus:bg-[#1A2845] focus:outline-none focus:ring-2 focus:ring-rose-500 text-slate-900 dark:text-slate-100 placeholder:text-slate-400"
            />
          </div>

          {/* Filtro por Especialidade Médica */}
          <div className="flex items-center gap-2 w-full md:w-auto">
            <Filter className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <select
              value={selectedDiscipline}
              onChange={(e) => setSelectedDiscipline(e.target.value)}
              aria-label="Filtrar por Especialidade Médica"
              className="w-full md:w-auto text-xs py-2 px-3 rounded-xl border border-slate-200 dark:border-[#243452] bg-slate-50 dark:bg-[#142038] text-slate-800 dark:text-slate-200 focus:outline-none cursor-pointer"
            >
              <option value="all">Todas as Especialidades</option>
              {disciplines.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>

          {/* Filtro por Status (Pendentes vs Dominadas) */}
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-[#142038] p-1 rounded-xl w-full md:w-auto justify-center">
            {[
              { id: 'all', label: `Todas (${allMistakes.length})` },
              { id: 'pending', label: `Pendentes (${metrics.pending})` },
              { id: 'resolved', label: `Dominadas (${metrics.resolved})` },
            ].map((st) => (
              <button
                key={st.id}
                type="button"
                onClick={() => setSelectedStatus(st.id as any)}
                className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                  selectedStatus === st.id
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                {st.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Lista de Questões com Erro e Conexão de Estudo ── */}
      {filteredMistakes.length === 0 ? (
        <div className="bg-white dark:bg-[#0F172A] rounded-3xl border border-slate-200 dark:border-[#243452] p-12 text-center text-slate-500 dark:text-slate-400 space-y-3 elev-xs">
          <CheckCircle2 className="w-10 h-10 mx-auto text-emerald-500" />
          <h4 className="text-base font-bold text-slate-900 dark:text-slate-100">
            Nenhuma questão encontrada com estes filtros!
          </h4>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
            {allMistakes.length === 0
              ? 'Você ainda não possui erros registrados. Resolva casos clínicos no Banco de Questões para alimentar seu diagnóstico!'
              : 'Tente limpar a busca ou selecionar outro motivo ou especialidade.'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredMistakes.map(({ answer, question }) => {
            const disc = disciplines.find((d) => d.id === question.disciplineId);
            const th = themes.find((t) => t.id === question.themeId);
            const comp = compendiums.find((c) => c.id === question.compendiumRefId);
            const compId = comp?.id || question.compendiumRefId;
            const log = errorLogsByQuestion[question.id];
            const reasonKey = log?.errorReason || answer.errorReason || 'lacuna_teorica';
            const reason = reasonConfig[reasonKey] || reasonConfig.lacuna_teorica;
            const isResolved = log ? log.resolved : false;
            const userNote = log?.userNotes || '';
            const isEditingThis = editingNoteId === question.id;
            const review = reviews[question.id];
            const hasFlashcardCreated = createdFlashcardQuestionIds.includes(question.id);

            return (
              <div
                key={question.id}
                className={`bg-white dark:bg-[#0F172A] rounded-3xl border p-5 sm:p-6 transition-all elev-xs space-y-4 ${
                  isResolved
                    ? 'border-emerald-200/80 dark:border-emerald-900/60 bg-emerald-50/10 dark:bg-emerald-950/10'
                    : 'border-slate-200/90 dark:border-[#243452] hover:border-rose-300 dark:hover:border-rose-900/60'
                }`}
              >
                {/* Cabeçalho da Questão */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[10px] font-black uppercase px-2.5 py-0.5 rounded-md bg-teal-50 text-teal-800 dark:bg-teal-950/60 dark:text-teal-300 border border-teal-200/60 dark:border-teal-800/60">
                      {disc?.name || 'Medicina'}
                    </span>
                    <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                      {th?.name}
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-mono">
                      {question.institution} {question.year}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Badge de Diagnóstico de Erro */}
                    <span
                      className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${reason.badge}`}
                    >
                      {reason.label}
                    </span>

                    {/* Badge de Dominada */}
                    {isResolved ? (
                      <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 flex items-center gap-1">
                        <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                        <span>Dominada</span>
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-rose-100 text-rose-800 dark:bg-rose-950/80 dark:text-rose-300 border border-rose-300 dark:border-rose-800">
                        Pendente
                      </span>
                    )}
                  </div>
                </div>

                {/* Caso Clínico & Enunciado */}
                <div className="space-y-2">
                  {question.clinicalVignette && (
                    <p className="text-xs text-slate-600 dark:text-slate-300 italic leading-relaxed bg-slate-50 dark:bg-[#142038] p-3 rounded-xl border border-slate-100 dark:border-slate-800">
                      {question.clinicalVignette}
                    </p>
                  )}
                  <h4 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100 font-serif-reading leading-snug">
                    {question.questionStem}
                  </h4>
                </div>

                {/* Resumo Clínico & Pérola de Gabarito */}
                <div className="p-3.5 rounded-2xl bg-rose-50/70 dark:bg-rose-950/20 border border-rose-200/70 dark:border-rose-900/50 space-y-2 text-xs">
                  <div className="flex items-center gap-1.5 font-bold text-rose-900 dark:text-rose-300">
                    <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
                    <span>Mecanismo Negligenciado & Distrator</span>
                  </div>
                  <p className="text-slate-800 dark:text-slate-200 leading-relaxed font-medium">
                    {review?.generalCommentary || question.generalCommentary || 'Revise o mecanismo fisiopatológico ou os critérios diagnósticos desta diretriz.'}
                  </p>
                  {(review?.highYieldSummary || question.highYieldSummary) && (
                    <div className="p-2.5 rounded-xl bg-white/80 dark:bg-[#0B1220]/80 border border-rose-200/50 dark:border-rose-900/40 text-[11px] text-slate-800 dark:text-slate-200">
                      <strong className="text-teal-700 dark:text-teal-400">Ponto-chave da diretriz: </strong>
                      {review?.highYieldSummary || question.highYieldSummary}
                    </div>
                  )}
                </div>

                {/* Anotação Metacognitiva do Estudante */}
                <div className="p-3 rounded-2xl bg-slate-50 dark:bg-[#142038] border border-slate-200/80 dark:border-[#243452] space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                      <FileEdit className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                      <span>Minhas Anotações de Aprendizado</span>
                    </span>
                    {!isEditingThis && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingNoteId(question.id);
                          setNoteDraft(userNote);
                        }}
                        className="text-[11px] font-bold text-teal-600 dark:text-teal-400 hover:underline cursor-pointer"
                      >
                        {userNote ? 'Editar nota' : '+ Adicionar reflexão'}
                      </button>
                    )}
                  </div>

                  {isEditingThis ? (
                    <div className="space-y-2 pt-1">
                      <textarea
                        value={noteDraft}
                        onChange={(e) => setNoteDraft(e.target.value)}
                        placeholder="Ex: Confundi os critérios de Duke menores com achados normais do sopro... Lembrar que hemocultura positiva é maior."
                        rows={2}
                        className="w-full p-2.5 text-xs rounded-xl border border-slate-200 dark:border-[#243452] bg-white dark:bg-[#0F172A] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-500 placeholder:text-slate-400"
                      />
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingNoteId(null);
                            setNoteDraft('');
                          }}
                          className="px-3 py-1 text-xs text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 cursor-pointer"
                        >
                          Cancelar
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSaveNote(question.id)}
                          className="px-3 py-1 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1"
                        >
                          <Save className="w-3 h-3" />
                          <span>Salvar Reflexão</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-600 dark:text-slate-400 italic">
                      {userNote || 'Nenhuma reflexão registrada ainda. Anote por que errou para fixar na memória.'}
                    </p>
                  )}
                </div>

                {/* ── BARRA DE AÇÕES CONECTADAS (BIBLIOTECA, FLASHCARDS, REFAZER) ── */}
                <div className="pt-2 flex flex-wrap items-center justify-between gap-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    {/* Ação 1: Estudar Teoria na Biblioteca */}
                    {compId && (
                      <button
                        type="button"
                        onClick={() =>
                          onOpenCompendium(compId, question.compendiumSectionId, question.id)
                        }
                        className="px-3.5 py-2 rounded-xl bg-teal-50 dark:bg-teal-950/50 hover:bg-teal-100 dark:hover:bg-teal-900/60 text-teal-800 dark:text-teal-300 border border-teal-200 dark:border-teal-800 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
                        title="Abrir compêndio teórico correspondente na Biblioteca com referências ABNT"
                      >
                        <BookOpen className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                        <span>Estudar Teoria na Biblioteca</span>
                        <ExternalLink className="w-3 h-3 opacity-60" />
                      </button>
                    )}

                    {/* Ação 2: Criar / Praticar Flashcard deste Erro */}
                    <button
                      type="button"
                      onClick={() => handleCreateFlashcard(question)}
                      disabled={hasFlashcardCreated}
                      className={`px-3 py-2 rounded-xl border text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                        hasFlashcardCreated
                          ? 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/50 dark:text-indigo-300 dark:border-indigo-800'
                          : 'bg-white dark:bg-[#142038] hover:bg-indigo-50 dark:hover:bg-indigo-950/40 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-[#243452] hover:border-indigo-300'
                      }`}
                    >
                      <Layers className="w-3.5 h-3.5 text-indigo-500" />
                      <span>
                        {hasFlashcardCreated ? 'Flashcard no SRS ✓' : 'Criar Flashcard deste Erro'}
                      </span>
                    </button>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-auto">
                    {/* Ação 3: Marcar como Dominada ou Reabrir */}
                    <button
                      type="button"
                      onClick={() => handleToggleResolved(question.id, !isResolved)}
                      className={`px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 border ${
                        isResolved
                          ? 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700 hover:bg-slate-200'
                          : 'bg-emerald-600 hover:bg-emerald-700 text-white border-transparent shadow-xs'
                      }`}
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>{isResolved ? 'Reabrir Erro' : 'Marcar como Dominada'}</span>
                    </button>

                    {/* Ação 4: Refazer Questão */}
                    <button
                      type="button"
                      onClick={() => onOpenQuestion(question.id)}
                      className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-teal-600 dark:hover:bg-teal-500 text-white text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
                    >
                      <span>Refazer Questão</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal de Exportação do Dossiê de Reta Final */}
      <ExportCadernoModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        mistakes={allMistakes}
        errorLogs={errorLogsByQuestion}
        disciplines={disciplines}
      />
    </div>
  );
};
