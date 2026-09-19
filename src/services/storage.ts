import {
  Discipline,
  Theme,
  Compendium,
  Question,
  Flashcard,
  QuestionAnswerRecord,
  SimuladoSessionData,
  UserPlan,
  UserStats,
  ErrorLogItem,
  ThemeMode,
  MigrationSummary,
  UserFeedback,
  LastReadingSession,
} from '../types';
import { getOps } from './syncQueue';
import {
  INITIAL_DISCIPLINES,
  INITIAL_THEMES,
  INITIAL_COMPENDIUMS,
  INITIAL_QUESTIONS,
  INITIAL_FLASHCARDS,
} from '../data/mockData';
import { calculateNextSRS, createInitialSRS } from './srsAlgorithm';
import { onActiveUserChanged } from './syncQueue';
import { recoverLegacyLocalProgress } from './legacyRecovery';
import { isSupabaseConfigured } from '../lib/supabaseClient';
import { diaLocal } from '../utils/diaLocal';

// Conteúdo de demonstração (mockData) só existe no modo local, sem Supabase.
// Com Supabase configurado, o cache local começa vazio: nunca mostrar ao
// estudante material/questão fictícios como se fossem conteúdo real.
function demoContent<T>(items: T[]): T[] {
  return isSupabaseConfigured ? [] : items;
}

export const STORAGE_KEYS = {
  DISCIPLINES: 'synapse_disciplines_v1',
  THEMES: 'synapse_themes_v1',
  COMPENDIUMS: 'synapse_compendiums_v1',
  QUESTIONS: 'synapse_questions_v1',
  FLASHCARDS: 'synapse_flashcards_v1',
  ANSWERS: 'synapse_answers_v1',
  READING_PROGRESS: 'synapse_reading_progress_v1',
  BOOKMARKS: 'synapse_bookmarks_v1',
  NOTES: 'synapse_notes_v1',
  NOTES_BASE_VERSION: 'synapse_notes_base_version_v1',
  SIMULADOS: 'synapse_simulados_v1',
  USER_PLAN: 'synapse_user_plan_v1',
  ERROR_LOG: 'synapse_error_log_v1',
  HIGHLIGHTS: 'synapse_compendium_highlights_v1',
  THEME: 'synapse_theme_v1',
  FEEDBACK: 'synapse_feedback_v1',
  QUESTION_REACTIONS: 'synapse_question_reactions_v1',
  LAST_READING_SESSION: 'synapse_last_reading_session_v1',
};

// Current active user ID for isolated storage
let currentUserId: string | null = null;

export function setStorageUser(uid: string | null): void {
  currentUserId = uid;
  onActiveUserChanged(uid);
  if (uid) {
    // Best-effort: enfileira progresso local pré-existente ainda não confirmado no
    // servidor (ver docs/SINCRONIZACAO-CONFIAVEL.md, Etapa 5). Nunca apaga dado local.
    void recoverLegacyLocalProgress(uid);
  }
}

export function getStorageUser(): string | null {
  return currentUserId;
}

// User-isolated key generator: keeps global keys global, and prefixes personal keys with UID
function getUserKey(baseKey: string): string {
  if (!currentUserId) return baseKey;
  const suffix = baseKey.replace(/^synapse_/, '');
  return `synapse_${currentUserId}_${suffix}`;
}

// Safe LocalStorage helpers
function getItem<T>(key: string, defaultValue: T): T {
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : defaultValue;
  } catch (e) {
    console.error(`Error reading ${key} from localStorage`, e);
    return defaultValue;
  }
}

function setItem<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.error(`Error writing ${key} to localStorage`, e);
  }
}

export const StorageService = {
  // --- Active User Management ---
  setActiveUser(uid: string | null): void {
    setStorageUser(uid);
  },
  getActiveUser(): string | null {
    return getStorageUser();
  },

  /**
   * Chamado no logout. Remove os caches globais de conteúdo (podem conter
   * gabarito/rascunho gravados por uma sessão de admin) e a cópia local dos
   * dados pessoais que o Supabase já guarda — para que a próxima pessoa no
   * mesmo navegador não os veja pelo devtools. Nunca remove o que só existe
   * localmente (destaques, última leitura, plano, tema). Se a fila de
   * sincronização ainda tiver operações pendentes, nada pessoal é removido:
   * apagar agora perderia progresso não enviado.
   * Retorna true se os dados pessoais foram removidos.
   */
  clearLocalDataOnLogout(uid: string | null): boolean {
    for (const key of [STORAGE_KEYS.DISCIPLINES, STORAGE_KEYS.THEMES, STORAGE_KEYS.COMPENDIUMS, STORAGE_KEYS.QUESTIONS]) {
      localStorage.removeItem(key);
    }
    if (!uid) return true;
    if (getOps(uid).length > 0) {
      console.warn('[storage] logout com operações de sincronização pendentes — dados locais do usuário mantidos.');
      return false;
    }
    const serverBacked = [
      STORAGE_KEYS.FLASHCARDS,
      STORAGE_KEYS.ANSWERS,
      STORAGE_KEYS.ERROR_LOG,
      STORAGE_KEYS.READING_PROGRESS,
      STORAGE_KEYS.BOOKMARKS,
      STORAGE_KEYS.NOTES,
      STORAGE_KEYS.NOTES_BASE_VERSION,
      STORAGE_KEYS.FEEDBACK,
      STORAGE_KEYS.QUESTION_REACTIONS,
      STORAGE_KEYS.SIMULADOS,
    ];
    for (const baseKey of serverBacked) {
      localStorage.removeItem(`synapse_${uid}_${baseKey.replace(/^synapse_/, '')}`);
    }
    return true;
  },

  // --- Content Loaders (Globais / Compartilhados) ---
  getDisciplines(): Discipline[] {
    return getItem<Discipline[]>(STORAGE_KEYS.DISCIPLINES, demoContent(INITIAL_DISCIPLINES));
  },
  saveDisciplines(disciplines: Discipline[]): void {
    setItem(STORAGE_KEYS.DISCIPLINES, disciplines);
  },

  getThemes(): Theme[] {
    return getItem<Theme[]>(STORAGE_KEYS.THEMES, demoContent(INITIAL_THEMES));
  },
  saveThemes(themes: Theme[]): void {
    setItem(STORAGE_KEYS.THEMES, themes);
  },

  getCompendiums(): Compendium[] {
    return getItem<Compendium[]>(STORAGE_KEYS.COMPENDIUMS, demoContent(INITIAL_COMPENDIUMS));
  },
  saveCompendiums(compendiums: Compendium[]): void {
    setItem(STORAGE_KEYS.COMPENDIUMS, compendiums);
  },
  saveCompendium(compendium: Compendium): void {
    const all = this.getCompendiums();
    const idx = all.findIndex((c) => c.id === compendium.id);
    if (idx >= 0) {
      all[idx] = compendium;
    } else {
      all.unshift(compendium);
    }
    this.saveCompendiums(all);
  },
  deleteCompendium(id: string): void {
    const all = this.getCompendiums().filter((c) => c.id !== id);
    this.saveCompendiums(all);
  },

  getQuestions(): Question[] {
    return getItem<Question[]>(STORAGE_KEYS.QUESTIONS, demoContent(INITIAL_QUESTIONS));
  },
  saveQuestions(questions: Question[]): void {
    setItem(STORAGE_KEYS.QUESTIONS, questions);
  },
  saveQuestion(question: Question): void {
    const all = this.getQuestions();
    const idx = all.findIndex((q) => q.id === question.id);
    if (idx >= 0) {
      all[idx] = question;
    } else {
      all.unshift(question);
    }
    this.saveQuestions(all);
  },
  deleteQuestion(id: string): void {
    const all = this.getQuestions().filter((q) => q.id !== id);
    this.saveQuestions(all);
  },

  // --- Flashcards (Isolados por UID; cards de demonstração só no modo local) ---
  getFlashcards(): Flashcard[] {
    const key = getUserKey(STORAGE_KEYS.FLASHCARDS);
    if (!isSupabaseConfigured && currentUserId && localStorage.getItem(key) === null) {
      setItem(key, INITIAL_FLASHCARDS);
    }
    const cards = getItem<Flashcard[]>(key, demoContent(INITIAL_FLASHCARDS));
    return cards.map((c) => ({
      ...c,
      srs: c.srs || createInitialSRS(),
    }));
  },
  saveFlashcards(flashcards: Flashcard[]): void {
    setItem(getUserKey(STORAGE_KEYS.FLASHCARDS), flashcards);
  },
  saveFlashcard(flashcard: Flashcard): Flashcard {
    const all = this.getFlashcards();
    const idx = all.findIndex((f) => f.id === flashcard.id);
    if (idx >= 0) {
      all[idx] = flashcard;
    } else {
      all.unshift(flashcard);
    }
    this.saveFlashcards(all);
    return flashcard;
  },
  deleteFlashcard(id: string): void {
    const all = this.getFlashcards().filter((f) => f.id !== id);
    this.saveFlashcards(all);
  },
  getDueFlashcards(): Flashcard[] {
    const now = new Date();
    return this.getFlashcards().filter((c) => {
      if (!c.srs || !c.srs.nextDueDate) return true;
      const dueDate = new Date(c.srs.nextDueDate);
      return isNaN(dueDate.getTime()) || dueDate <= now || c.srs.state === 'new';
    });
  },
  updateFlashcardSRS(cardId: string, srs: any): void {
    const all = this.getFlashcards();
    const idx = all.findIndex((f) => f.id === cardId);
    if (idx >= 0) {
      all[idx] = { ...all[idx], srs };
      this.saveFlashcards(all);
    }
  },

  createFlashcardFromQuestion(question: Question): Flashcard {
    const template = question.flashcardTemplate || {
      front: `[${question.institution} ${question.year}] ${question.questionStem.slice(0, 180)}...`,
      back: `Resposta Correta:\n${question.options.find((o) => o.isCorrect)?.text || ''}\n\nExplicação:\n${question.highYieldSummary}`,
      mechanismNote: question.highYieldSummary,
    };

    const newCard: Flashcard = {
      id: crypto.randomUUID(),
      disciplineId: question.disciplineId,
      themeId: question.themeId,
      compendiumRefId: question.compendiumRefId,
      questionOriginId: question.id,
      front: template.front,
      back: template.back,
      mechanismHighlight: template.mechanismNote,
      tags: [...question.tags, 'Gerado de Questão'],
      difficulty: question.difficulty,
      isCustom: true,
      srs: createInitialSRS(),
    };

    this.saveFlashcard(newCard);
    return newCard;
  },

  reviewFlashcard(cardId: string, rating: 1 | 2 | 3 | 4): Flashcard | null {
    const cards = this.getFlashcards();
    const idx = cards.findIndex((c) => c.id === cardId);
    if (idx < 0) return null;

    const updatedSRS = calculateNextSRS(cards[idx].srs, rating);
    cards[idx] = {
      ...cards[idx],
      srs: updatedSRS,
    };
    this.saveFlashcards(cards);
    return cards[idx];
  },

  // --- Answers & Error Logging (Isolados por UID) ---
  getAnswers(): Record<string, QuestionAnswerRecord> {
    return getItem<Record<string, QuestionAnswerRecord>>(getUserKey(STORAGE_KEYS.ANSWERS), {});
  },
  recordAnswer(record: QuestionAnswerRecord): void {
    const answers = this.getAnswers();
    answers[record.questionId] = record;
    setItem(getUserKey(STORAGE_KEYS.ANSWERS), answers);

    if (!record.isCorrect) {
      const errorLogs = this.getErrorLogs();
      const existingIdx = errorLogs.findIndex((e) => e.questionId === record.questionId);
      const questions = this.getQuestions();
      const q = questions.find((item) => item.id === record.questionId);
      const correctOpt = q?.options.find((o) => o.isCorrect)?.letter || 'A';

      const errorItem: ErrorLogItem = {
        id: `err-${Date.now()}`,
        questionId: record.questionId,
        timestamp: record.timestamp,
        selectedOption: record.selectedOption,
        correctOption: correctOpt,
        errorReason: record.errorReason || 'lacuna_teorica',
        userNotes: record.userNotes || '',
        resolved: false,
      };

      if (existingIdx >= 0) {
        errorLogs[existingIdx] = errorItem;
      } else {
        errorLogs.unshift(errorItem);
      }
      setItem(getUserKey(STORAGE_KEYS.ERROR_LOG), errorLogs);
    }
  },

  getErrorLogs(): ErrorLogItem[] {
    return getItem<ErrorLogItem[]>(getUserKey(STORAGE_KEYS.ERROR_LOG), []);
  },
  updateErrorLog(errorItem: ErrorLogItem): void {
    const logs = this.getErrorLogs();
    const idx = logs.findIndex((e) => e.id === errorItem.id || e.questionId === errorItem.questionId);
    if (idx >= 0) {
      logs[idx] = errorItem;
      setItem(getUserKey(STORAGE_KEYS.ERROR_LOG), logs);
    }
  },

  // --- Reading Progress (Isolado por UID) ---
  getReadingProgress(): Record<string, { readSectionIds: string[]; percent: number }> {
    return getItem(getUserKey(STORAGE_KEYS.READING_PROGRESS), {});
  },
  toggleSectionRead(compendiumId: string, sectionId: string, totalSections: number): number {
    const progress = this.getReadingProgress();
    const compProgress = progress[compendiumId] || { readSectionIds: [], percent: 0 };
    const idx = compProgress.readSectionIds.indexOf(sectionId);
    if (idx >= 0) {
      compProgress.readSectionIds.splice(idx, 1);
    } else {
      compProgress.readSectionIds.push(sectionId);
    }
    compProgress.percent = Math.round((compProgress.readSectionIds.length / Math.max(1, totalSections)) * 100);
    progress[compendiumId] = compProgress;
    setItem(getUserKey(STORAGE_KEYS.READING_PROGRESS), progress);
    return compProgress.percent;
  },

  // --- Last Reading Session (Isolado por UID) ---
  getLastReadingSession(): LastReadingSession | null {
    return getItem<LastReadingSession | null>(getUserKey(STORAGE_KEYS.LAST_READING_SESSION), null);
  },
  saveLastReadingSession(session: LastReadingSession | null): void {
    if (!session) {
      localStorage.removeItem(getUserKey(STORAGE_KEYS.LAST_READING_SESSION));
    } else {
      setItem(getUserKey(STORAGE_KEYS.LAST_READING_SESSION), session);
    }
  },

  // --- Bookmarks (Isolado por UID) ---
  getBookmarks(): {
    questions: string[];
    compendiums: string[];
    flashcards: string[];
  } {
    return getItem(getUserKey(STORAGE_KEYS.BOOKMARKS), {
      questions: [],
      compendiums: [],
      flashcards: [],
    });
  },
  toggleBookmark(type: 'questions' | 'compendiums' | 'flashcards', id: string): boolean {
    const bookmarks = this.getBookmarks();
    const list = bookmarks[type];
    const idx = list.indexOf(id);
    let isBookmarked = false;
    if (idx >= 0) {
      list.splice(idx, 1);
      isBookmarked = false;
    } else {
      list.push(id);
      isBookmarked = true;
    }
    setItem(getUserKey(STORAGE_KEYS.BOOKMARKS), bookmarks);
    return isBookmarked;
  },

  // --- Notes (Isolado por UID) ---
  getNotes(): Record<string, string> {
    return getItem<Record<string, string>>(getUserKey(STORAGE_KEYS.NOTES), {});
  },
  saveNote(targetId: string, noteText: string): void {
    const notes = this.getNotes();
    notes[targetId] = noteText;
    setItem(getUserKey(STORAGE_KEYS.NOTES), notes);
  },
  // "Base version" que este dispositivo conheceu da nota no servidor
  // (updated_at da última leitura/gravação bem-sucedida) — usada para
  // detectar conflito real (outro dispositivo editou a mesma nota desde a
  // última vez que este dispositivo a viu) sem construir um editor
  // colaborativo. Nunca é a fonte de verdade do texto, só de "o que eu já vi".
  getNoteBaseVersion(targetId: string): string | null {
    const map = getItem<Record<string, string>>(getUserKey(STORAGE_KEYS.NOTES_BASE_VERSION), {});
    return map[targetId] ?? null;
  },
  setNoteBaseVersion(targetId: string, updatedAt: string): void {
    const map = getItem<Record<string, string>>(getUserKey(STORAGE_KEYS.NOTES_BASE_VERSION), {});
    map[targetId] = updatedAt;
    setItem(getUserKey(STORAGE_KEYS.NOTES_BASE_VERSION), map);
  },

  // --- Highlights (Isolado por UID) ---
  getHighlights(): Record<string, Array<{ text: string; color: string; timestamp: string }>> {
    return getItem(getUserKey(STORAGE_KEYS.HIGHLIGHTS), {});
  },
  addHighlight(compendiumId: string, text: string, color = 'amber'): void {
    const highlights = this.getHighlights();
    const list = highlights[compendiumId] || [];
    list.push({ text, color, timestamp: new Date().toISOString() });
    highlights[compendiumId] = list;
    setItem(getUserKey(STORAGE_KEYS.HIGHLIGHTS), highlights);
  },

  // --- Feedback dos Participantes (Isolado por UID no namespace do usuário) ---
  getFeedbacks(): UserFeedback[] {
    return getItem<UserFeedback[]>(getUserKey(STORAGE_KEYS.FEEDBACK), []);
  },
  saveFeedback(feedback: UserFeedback): void {
    const list = this.getFeedbacks();
    list.unshift(feedback);
    setItem(getUserKey(STORAGE_KEYS.FEEDBACK), list);
  },

  // --- Reação rápida 👍/👎 por questão (Isolado por UID) ---
  getQuestionReactions(): Record<string, 'up' | 'down'> {
    return getItem<Record<string, 'up' | 'down'>>(getUserKey(STORAGE_KEYS.QUESTION_REACTIONS), {});
  },
  setQuestionReaction(questionId: string, reaction: 'up' | 'down'): void {
    const reactions = this.getQuestionReactions();
    reactions[questionId] = reaction;
    setItem(getUserKey(STORAGE_KEYS.QUESTION_REACTIONS), reactions);
  },
  removeQuestionReaction(questionId: string): void {
    const reactions = this.getQuestionReactions();
    delete reactions[questionId];
    setItem(getUserKey(STORAGE_KEYS.QUESTION_REACTIONS), reactions);
  },

  // --- Simulados Sessions (Isolado por UID) ---
  getSimulados(): SimuladoSessionData[] {
    return getItem<SimuladoSessionData[]>(getUserKey(STORAGE_KEYS.SIMULADOS), []);
  },
  saveSimuladoSession(session: SimuladoSessionData): void {
    const list = this.getSimulados();
    const idx = list.findIndex((s) => s.id === session.id);
    if (idx >= 0) {
      list[idx] = session;
    } else {
      list.unshift(session);
    }
    setItem(getUserKey(STORAGE_KEYS.SIMULADOS), list);
  },

  // --- User Profile & Plan (Isolado por UID) ---
  getUserProfile(): {
    id: string;
    name: string;
    email: string;
    cycle: 'clinico';
    plan: UserPlan;
    streakDays: number;
    avatarUrl?: string;
  } {
    const plan = this.getUserPlan();
    return {
      id: currentUserId || 'user-med-1',
      name: 'Estudante NexusMed',
      email: '',
      cycle: 'clinico',
      plan,
      streakDays: 4,
    };
  },
  updatePlan(plan: UserPlan) {
    this.setUserPlan(plan);
    return this.getUserProfile();
  },
  getUserPlan(): UserPlan {
    return getItem<UserPlan>(getUserKey(STORAGE_KEYS.USER_PLAN), 'free');
  },
  setUserPlan(plan: UserPlan): void {
    setItem(getUserKey(STORAGE_KEYS.USER_PLAN), plan);
  },

  // --- Theme Mode (Isolado por UID) ---
  getTheme(): ThemeMode {
    const saved = getItem<ThemeMode | null>(getUserKey(STORAGE_KEYS.THEME), null);
    if (saved === 'light' || saved === 'dark') return saved;
    if (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark';
    }
    return 'light';
  },
  setTheme(theme: ThemeMode): void {
    setItem(getUserKey(STORAGE_KEYS.THEME), theme);
  },

  // --- Preferências de UI genéricas (aba ativa, filtro selecionado etc.) ---
  // Isolado por UID como o resto do módulo. Chaves abertas (não cadastradas
  // em STORAGE_KEYS) porque são muitas e de baixo risco — não são dado de
  // conteúdo, só preferência de navegação. Ver usePersistedState.ts.
  getUIState<T>(key: string, defaultValue: T): T {
    return getItem<T>(getUserKey(`synapse_ui_${key}_v1`), defaultValue);
  },
  setUIState<T>(key: string, value: T): void {
    setItem(getUserKey(`synapse_ui_${key}_v1`), value);
  },

  // --- Aggregated Stats (Calculado dinamicamente em memória - sem criação de chaves extras) ---
  getStats(): UserStats {
    return this.getUserStats();
  },
  getUserStats(): UserStats {
    const answers = Object.values(this.getAnswers()) as QuestionAnswerRecord[];
    const totalAnswered = answers.length;
    const totalCorrect = answers.filter((a) => a.isCorrect).length;
    const cards = this.getFlashcards();
    const todayStr = diaLocal(new Date());
    const reviewedToday = cards.reduce((acc, c) => {
      const todayCount = (c.srs?.reviewHistory || []).filter((h) => h?.date && diaLocal(h.date) === todayStr).length;
      return acc + (todayCount > 0 ? 1 : 0);
    }, 0);

    const readingProgress = this.getReadingProgress() as Record<string, { readSectionIds: string[]; percent: number }>;
    const compendiumsReadCount = Object.values(readingProgress).filter((p) => p && p.percent >= 80).length;

    return {
      totalAnswered,
      totalCorrect,
      streakDays: totalAnswered > 0 ? 4 : 1,
      lastActiveDate: new Date().toISOString(),
      cardsReviewedToday: reviewedToday,
      compendiumsReadCount,
    };
  },

  // --- Aliases for CMS / Simulados ---
  saveCustomQuestion(question: Question): void {
    this.saveQuestion(question);
  },
  resetToDefaults(): void {
    this.resetAllData();
  },
  getSimuladoHistory(): SimuladoSessionData[] {
    return this.getSimulados();
  },

  // --- Reset to Factory Defaults ---
  resetAllData(): void {
    if (currentUserId) {
      // Limpa apenas dados do usuário ativo
      const userIsolatedKeys = [
        STORAGE_KEYS.FLASHCARDS,
        STORAGE_KEYS.ANSWERS,
        STORAGE_KEYS.READING_PROGRESS,
        STORAGE_KEYS.BOOKMARKS,
        STORAGE_KEYS.NOTES,
        STORAGE_KEYS.NOTES_BASE_VERSION,
        STORAGE_KEYS.SIMULADOS,
        STORAGE_KEYS.USER_PLAN,
        STORAGE_KEYS.ERROR_LOG,
        STORAGE_KEYS.HIGHLIGHTS,
        STORAGE_KEYS.THEME,
      ];
      userIsolatedKeys.forEach((k) => localStorage.removeItem(getUserKey(k)));
    } else {
      localStorage.clear();
    }
  },

  // --- Migration Utilities (Seguras, com validação prévia e opção de manter cópia) ---
  checkLegacyDataSummary(uid: string): MigrationSummary {
    const migrationFlagKey = `synapse_${uid}_migration_handled`;
    if (localStorage.getItem(migrationFlagKey)) {
      return {
        hasLegacyData: false,
        answersCount: 0,
        flashcardsCount: 0,
        simuladosCount: 0,
        bookmarksCount: 0,
        notesCount: 0,
        readingProgressCount: 0,
      };
    }

    const answersRaw = localStorage.getItem(STORAGE_KEYS.ANSWERS);
    let answersCount = 0;
    if (answersRaw) {
      try {
        answersCount = Object.keys(JSON.parse(answersRaw)).length;
      } catch {
        // ignore parse error
      }
    }

    const flashcardsRaw = localStorage.getItem(STORAGE_KEYS.FLASHCARDS);
    let flashcardsCount = 0;
    if (flashcardsRaw) {
      try {
        const fcList = JSON.parse(flashcardsRaw);
        flashcardsCount = Array.isArray(fcList) ? fcList.length : 0;
      } catch {
        // ignore
      }
    }

    const simuladosRaw = localStorage.getItem(STORAGE_KEYS.SIMULADOS);
    let simuladosCount = 0;
    if (simuladosRaw) {
      try {
        const sList = JSON.parse(simuladosRaw);
        simuladosCount = Array.isArray(sList) ? sList.length : 0;
      } catch {
        // ignore
      }
    }

    const bookmarksRaw = localStorage.getItem(STORAGE_KEYS.BOOKMARKS);
    let bookmarksCount = 0;
    if (bookmarksRaw) {
      try {
        const bm = JSON.parse(bookmarksRaw);
        bookmarksCount = (bm.questions?.length || 0) + (bm.compendiums?.length || 0);
      } catch {
        // ignore
      }
    }

    const notesRaw = localStorage.getItem(STORAGE_KEYS.NOTES);
    let notesCount = 0;
    if (notesRaw) {
      try {
        notesCount = Object.keys(JSON.parse(notesRaw)).length;
      } catch {
        // ignore
      }
    }

    const progressRaw = localStorage.getItem(STORAGE_KEYS.READING_PROGRESS);
    let readingProgressCount = 0;
    if (progressRaw) {
      try {
        readingProgressCount = Object.keys(JSON.parse(progressRaw)).length;
      } catch {
        // ignore
      }
    }

    const hasLegacy = answersCount > 0 || simuladosCount > 0 || bookmarksCount > 0 || notesCount > 0 || readingProgressCount > 0;

    return {
      hasLegacyData: hasLegacy,
      answersCount,
      flashcardsCount,
      simuladosCount,
      bookmarksCount,
      notesCount,
      readingProgressCount,
    };
  },

  migrateLegacyData(uid: string, keepCopy: boolean): { success: boolean; error?: string } {
    try {
      const keysToMigrate = [
        STORAGE_KEYS.FLASHCARDS,
        STORAGE_KEYS.ANSWERS,
        STORAGE_KEYS.READING_PROGRESS,
        STORAGE_KEYS.BOOKMARKS,
        STORAGE_KEYS.NOTES,
        STORAGE_KEYS.NOTES_BASE_VERSION,
        STORAGE_KEYS.SIMULADOS,
        STORAGE_KEYS.USER_PLAN,
        STORAGE_KEYS.ERROR_LOG,
        STORAGE_KEYS.HIGHLIGHTS,
        STORAGE_KEYS.THEME,
      ];

      // Passo 1: Copiar e validar cada item no namespace do usuário
      const migratedKeys: string[] = [];
      for (const legacyKey of keysToMigrate) {
        const rawValue = localStorage.getItem(legacyKey);
        if (rawValue !== null) {
          // Validar JSON
          JSON.parse(rawValue);
          const userKey = `synapse_${uid}_${legacyKey.replace(/^synapse_/, '')}`;
          localStorage.setItem(userKey, rawValue);

          // Validar que foi gravado idêntico
          const verified = localStorage.getItem(userKey);
          if (verified !== rawValue) {
            throw new Error(`Falha de integridade ao migrar ${legacyKey}`);
          }
          migratedKeys.push(legacyKey);
        }
      }

      // Passo 2: Apenas se validação for 100% bem-sucedida e o usuário NÃO optou por manter cópia
      if (!keepCopy) {
        for (const k of migratedKeys) {
          localStorage.removeItem(k);
        }
      }

      // Passo 3: Marcar migração tratada
      localStorage.setItem(`synapse_${uid}_migration_handled`, 'true');

      return { success: true };
    } catch (err: any) {
      console.error('Erro na migração de dados:', err);
      return { success: false, error: err?.message || 'Erro desconhecido' };
    }
  },

  dismissMigration(uid: string): void {
    localStorage.setItem(`synapse_${uid}_migration_handled`, 'true');
  },

  // --- Export & Import JSON for CMS / Backup ---
  exportFullData(): string {
    const bundle = {
      disciplines: this.getDisciplines(),
      themes: this.getThemes(),
      compendiums: this.getCompendiums(),
      questions: this.getQuestions(),
      flashcards: this.getFlashcards(),
      exportedAt: new Date().toISOString(),
      version: '1.0.0',
    };
    return JSON.stringify(bundle, null, 2);
  },

  importFullData(jsonStr: string): boolean {
    try {
      const data = JSON.parse(jsonStr);
      if (data.disciplines) setItem(STORAGE_KEYS.DISCIPLINES, data.disciplines);
      if (data.themes) setItem(STORAGE_KEYS.THEMES, data.themes);
      if (data.compendiums) setItem(STORAGE_KEYS.COMPENDIUMS, data.compendiums);
      if (data.questions) setItem(STORAGE_KEYS.QUESTIONS, data.questions);
      if (data.flashcards) this.saveFlashcards(data.flashcards);
      return true;
    } catch (e) {
      console.error('Failed to import database JSON', e);
      return false;
    }
  },
};
