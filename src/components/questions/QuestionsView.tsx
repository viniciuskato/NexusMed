import React, { useState, useMemo, useEffect } from 'react';
import {
  HelpCircle,
  Search,
  Timer,
  BookOpen,
  ArrowLeft,
} from 'lucide-react';
import { Question, Discipline, Theme, QuestionAnswerRecord, QuestionReactionValue, Compendium, LastReadingSession } from '../../types';
import { bookmarksRepository } from '../../repositories/BookmarksRepository';
import { answersRepository } from '../../repositories/AnswersRepository';
import { questionReactionsRepository } from '../../repositories/QuestionReactionsRepository';
import { QuestionCard } from './QuestionCard';
import { usePersistedState } from '../../hooks/usePersistedState';
import { useScrollMemory } from '../../hooks/useScrollMemory';

interface QuestionsViewProps {
  questions: Question[];
  disciplines: Discipline[];
  themes: Theme[];
  compendiums?: Compendium[];
  onOpenCompendium: (compendiumId?: string, sectionId?: string, originQuestionId?: string) => void;
  onOpenCreateSimulado: () => void;
  filterThemeId?: string;
  focusQuestionId?: string;
  /**
   * Status inicial dos pills de filtro (ex.: 'incorrect' ao chegar vindo de
   * "Treinar Apenas Questões Erradas" no Caderno de Erros — ver App.tsx,
   * Prompt 10-A). Só define o valor INICIAL; o usuário pode trocar depois
   * normalmente. Undefined mantém o padrão 'all'.
   */
  initialStatusFilter?: 'all' | 'unanswered' | 'correct' | 'incorrect' | 'bookmarked';
  returnToCompendiumContext?: LastReadingSession | null;
  onReturnToCompendium?: () => void;
}

export const QuestionsView: React.FC<QuestionsViewProps> = ({
  questions,
  disciplines,
  themes,
  compendiums,
  onOpenCompendium,
  onOpenCreateSimulado,
  filterThemeId,
  focusQuestionId,
  initialStatusFilter,
  returnToCompendiumContext,
  onReturnToCompendium,
}) => {
  // Persistido para sobreviver à troca de seção do app (App.tsx desmonta
  // QuestionsView ao navegar pra outra view). filterThemeId/initialStatusFilter
  // são contexto explícito de navegação (ex. veio de "Treinar questões
  // erradas") e têm prioridade sobre o filtro lembrado — ver efeitos abaixo.
  const [selectedDiscipline, setSelectedDiscipline] = usePersistedState<string>('questions_discipline', 'all');
  const [selectedTheme, setSelectedTheme] = usePersistedState<string>('questions_theme', filterThemeId || 'all');
  const [selectedDifficulty, setSelectedDifficulty] = usePersistedState<string>('questions_difficulty', 'all');
  const [selectedStatus, setSelectedStatus] = usePersistedState<'all' | 'unanswered' | 'correct' | 'incorrect' | 'bookmarked'>(
    'questions_status',
    initialStatusFilter || 'all'
  );
  const [searchQuery, setSearchQuery] = useState('');
  useScrollMemory('questions');

  useEffect(() => {
    if (filterThemeId) setSelectedTheme(filterThemeId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterThemeId]);

  useEffect(() => {
    if (initialStatusFilter) setSelectedStatus(initialStatusFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialStatusFilter]);

  const [answers, setAnswers] = useState<Record<string, QuestionAnswerRecord>>({});
  const [bookmarks, setBookmarks] = useState<{
    questions: string[];
    compendiums: string[];
    flashcards: string[];
  }>({ questions: [], compendiums: [], flashcards: [] });
  // Reações (👍/👎) de TODAS as questões do usuário, buscadas uma única vez
  // aqui (Prompt 10-A) — antes, cada <QuestionCard> pedia a própria reação
  // individualmente ao montar, o que com os filtros "Todas"/"Erros" (até 393
  // cartões simultâneos, sem paginação) virava centenas de requisições
  // concorrentes pela mesma informação que cabe numa única consulta.
  const [reactions, setReactions] = useState<Record<string, QuestionReactionValue>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [nextAnswers, nextBookmarks, nextReactions] = await Promise.all([
        answersRepository.getAnswers(),
        bookmarksRepository.getBookmarks(),
        questionReactionsRepository.getMyReactions(),
      ]);
      if (cancelled) return;
      setAnswers(nextAnswers);
      setBookmarks(nextBookmarks);
      setReactions(nextReactions);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // If focusQuestionId exists, locate it
  const filteredQuestions = useMemo(() => {
    return questions.filter((q) => {
      if (focusQuestionId && q.id === focusQuestionId) return true;

      if (selectedDiscipline !== 'all' && q.disciplineId !== selectedDiscipline) {
        return false;
      }
      if (selectedTheme !== 'all' && q.themeId !== selectedTheme) {
        return false;
      }
      if (selectedDifficulty !== 'all' && q.difficulty !== selectedDifficulty) {
        return false;
      }

      // Status filter
      const ans = answers[q.id];
      if (selectedStatus === 'unanswered' && ans) return false;
      if (selectedStatus === 'correct' && (!ans || !ans.isCorrect)) return false;
      if (selectedStatus === 'incorrect' && (!ans || ans.isCorrect)) return false;
      if (selectedStatus === 'bookmarked' && !bookmarks.questions.includes(q.id)) return false;

      // Search query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesStem = q.questionStem.toLowerCase().includes(query);
        const matchesVignette = q.clinicalVignette.toLowerCase().includes(query);
        const matchesInstitution = q.institution.toLowerCase().includes(query);
        const matchesTags = q.tags.some((t) => t.toLowerCase().includes(query));
        return matchesStem || matchesVignette || matchesInstitution || matchesTags;
      }

      return true;
    });
  }, [
    questions,
    selectedDiscipline,
    selectedTheme,
    selectedDifficulty,
    selectedStatus,
    searchQuery,
    answers,
    bookmarks,
    focusQuestionId,
  ]);

  const mistakesCount = (Object.values(answers) as QuestionAnswerRecord[]).filter((a) => !a.isCorrect).length;

  return (
    <div className="w-full max-w-[1600px] mx-auto space-y-6">
      {/* ── Retorno ao Compêndio em Leitura ────────────────────────── */}
      {returnToCompendiumContext && onReturnToCompendium && (
        <div className="p-3 sm:px-4 sm:py-2.5 rounded-2xl bg-teal-500/10 dark:bg-teal-950/40 border border-teal-500/30 dark:border-teal-700/40 elev-xs flex items-center justify-between gap-3 animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <BookOpen className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0" />
            <div className="truncate text-xs">
              <span className="font-bold text-slate-900 dark:text-slate-100">Leitura em andamento:</span>{' '}
              <span className="text-teal-700 dark:text-teal-300 font-medium">
                {returnToCompendiumContext.compendiumTitle}
                {returnToCompendiumContext.sectionTitle && ` · ${returnToCompendiumContext.sectionTitle}`}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onReturnToCompendium}
            className="px-3 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shrink-0"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Voltar à Leitura</span>
            <span className="sm:hidden">Voltar</span>
          </button>
        </div>
      )}

      {/* Top Header */}
      <div className="bg-gradient-to-r from-slate-950 via-teal-950 to-slate-900 rounded-3xl p-5 sm:p-6 text-white elev-sm border border-teal-900/40 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-teal-500/20 text-teal-300 text-[11px] font-semibold border border-teal-400/30">
            <HelpCircle className="w-3.5 h-3.5" />
            <span>+35 XP por acerto · Justificativa comentada</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight">
            Banco de Questões Médicas
          </h1>
          <p className="text-slate-300 text-xs max-w-xl leading-relaxed">
            Treino deliberado com análise detalhada de distratores, classificação de erros e correlação teórica.
          </p>
        </div>

        <button
          onClick={onOpenCreateSimulado}
          className="px-4 py-2.5 rounded-2xl bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-400 hover:to-cyan-400 text-slate-950 font-extrabold text-xs elev-md shadow-teal-500/20 transition-all flex items-center gap-2 shrink-0 cursor-pointer"
        >
          <Timer className="w-4 h-4" />
          <span>Criar Simulado Personalizado</span>
        </button>
      </div>

      {/* Multi-Filter Bar */}
      <div className="bg-white dark:bg-[#0F172A] rounded-3xl border border-slate-200 dark:border-[#243452] p-5 elev-xs space-y-4">
        {/* Top filter row: Search & Status Pills */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="w-full md:w-96 relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
            <input
              type="text"
              placeholder="Pesquisar por vinheta clínica, banca (USP, ENARE)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-[#243452] bg-slate-50 dark:bg-[#142038] focus:bg-white dark:focus:bg-[#1A2845] focus:outline-none focus:ring-2 focus:ring-teal-500 text-slate-900 dark:text-slate-100 placeholder:text-slate-400"
            />
          </div>

          {/* Status buttons */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar w-full md:w-auto text-xs pb-1 md:pb-0">
            {[
              { id: 'all', label: 'Todas as Questões' },
              { id: 'unanswered', label: 'Não Respondidas' },
              { id: 'incorrect', label: `Erros (${mistakesCount})` },
              { id: 'correct', label: 'Acertadas' },
              { id: 'bookmarked', label: 'Favoritas' },
            ].map((st) => (
              <button
                key={st.id}
                onClick={() => setSelectedStatus(st.id as any)}
                className={`px-3 py-1.5 rounded-xl font-semibold shrink-0 transition-all cursor-pointer ${
                  selectedStatus === st.id
                    ? 'bg-gradient-to-r from-teal-600 to-cyan-600 text-white elev-xs'
                    : 'bg-slate-100 dark:bg-[#142038] text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-[#1A2845]'
                }`}
              >
                {st.label}
              </button>
            ))}
          </div>
        </div>

        {/* Bottom filter row: Discipline, Theme, Difficulty */}
        <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs">
          {/* Discipline Select */}
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-500 dark:text-slate-400">Disciplina:</span>
            <select
              value={selectedDiscipline}
              onChange={(e) => {
                setSelectedDiscipline(e.target.value);
                setSelectedTheme('all');
              }}
              className="p-1.5 rounded-lg border border-slate-200 dark:border-[#243452] bg-slate-50 dark:bg-[#142038] text-slate-800 dark:text-slate-200 font-medium focus:outline-none"
            >
              <option value="all">Todas</option>
              {disciplines.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>

          {/* Theme Select */}
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-500 dark:text-slate-400">Tema:</span>
            <select
              value={selectedTheme}
              onChange={(e) => setSelectedTheme(e.target.value)}
              className="p-1.5 rounded-lg border border-slate-200 dark:border-[#243452] bg-slate-50 dark:bg-[#142038] text-slate-800 dark:text-slate-200 font-medium focus:outline-none max-w-xs truncate"
            >
              <option value="all">Todos os Temas</option>
              {themes
                .filter((t) => selectedDiscipline === 'all' || t.disciplineId === selectedDiscipline)
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
            </select>
          </div>

          {/* Difficulty Select */}
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-500 dark:text-slate-400">Dificuldade:</span>
            <select
              value={selectedDifficulty}
              onChange={(e) => setSelectedDifficulty(e.target.value)}
              className="p-1.5 rounded-lg border border-slate-200 dark:border-[#243452] bg-slate-50 dark:bg-[#142038] text-slate-800 dark:text-slate-200 font-medium focus:outline-none"
            >
              <option value="all">Todas</option>
              <option value="facil">Fácil</option>
              <option value="medio">Média</option>
              <option value="dificil">Difícil</option>
            </select>
          </div>

          {/* Reset Filters button */}
          {(selectedDiscipline !== 'all' ||
            selectedTheme !== 'all' ||
            selectedDifficulty !== 'all' ||
            selectedStatus !== 'all' ||
            searchQuery) && (
            <button
              onClick={() => {
                setSelectedDiscipline('all');
                setSelectedTheme('all');
                setSelectedDifficulty('all');
                setSelectedStatus('all');
                setSearchQuery('');
              }}
              className="text-teal-700 hover:underline font-semibold ml-auto"
            >
              Limpar Filtros
            </button>
          )}
        </div>
      </div>

      {/* Results Header Count */}
      <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 px-2">
        <span>
          Exibindo <strong className="text-slate-800 dark:text-slate-200">{filteredQuestions.length} questões</strong>
        </span>
        <span className="text-teal-600 dark:text-teal-400 font-semibold">
          Modo Estudo: Responda para ver a justificativa por alternativa (+35 XP)
        </span>
      </div>

      {/* Questions Stack */}
      {filteredQuestions.length === 0 ? (
        <div className="bg-white dark:bg-[#0F172A] rounded-3xl border border-slate-200 dark:border-[#243452] p-12 text-center text-slate-500 dark:text-slate-400 space-y-2">
          <HelpCircle className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-600" />
          <p className="font-semibold text-sm text-slate-800 dark:text-slate-200">
            Nenhuma questão encontrada com estes filtros.
          </p>
          <p className="text-xs text-slate-400 dark:text-slate-500">
            Tente ajustar a disciplina ou status selecionado.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {filteredQuestions.map((q) => (
            <QuestionCard
              key={q.id}
              question={q}
              discipline={disciplines.find((d) => d.id === q.disciplineId)}
              theme={themes.find((t) => t.id === q.themeId)}
              compendiums={compendiums}
              onOpenCompendium={onOpenCompendium}
              hydrated={{
                answer: answers[q.id] ?? null,
                bookmarked: bookmarks.questions.includes(q.id),
                reaction: reactions[q.id] ?? null,
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
};
