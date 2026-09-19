import confetti from 'canvas-confetti';
import { QuestionAnswerRecord, UserStats, Flashcard, Question, DifficultyLevel } from '../types';
import { diaLocal } from '../utils/diaLocal';

// XP por questão respondida, ponderado por dificuldade (fácil < médio <
// difícil). Valores de referência escolhidos para manter o total próximo
// do que a fórmula linear anterior (15 XP fixos) já rendia em média.
const DIFFICULTY_XP: Record<DifficultyLevel, number> = {
  facil: 10,
  medio: 15,
  dificil: 22,
};

// Recall correto (o aluno soube a resposta antes de ver as alternativas)
// vale mais que reconhecimento correto entre as opções.
const OPEN_RECALL_CORRECT_BONUS_XP = 15;

// Bônus fixo por preencher a autoavaliação de estratégia — igual para as 4
// opções de propósito: se variasse por opção, incentivaria o aluno a mentir
// na autoavaliação para não perder pontos.
const ANSWER_STRATEGY_BONUS_XP = 5;

// Sequência de acertos, dentro da mesma disciplina, que dispara celebração
// automática (ver QuestionCard.tsx, que calcula essa sequência on-the-fly a
// partir de `answers` no momento de decidir se dispara).
export const CELEBRATION_STREAK_LENGTH = 10;

export interface GamificationLevel {
  level: number;
  title: string;
  minXp: number;
  maxXp: number;
  color: string;
  badge: string;
}

export const LEVELS: GamificationLevel[] = [
  { level: 1, title: 'Calouro de Medicina', minXp: 0, maxXp: 250, color: '#0EA5E9', badge: '🩺' },
  { level: 2, title: 'Estudante Clínico', minXp: 250, maxXp: 650, color: '#10B981', badge: '🌱' },
  { level: 3, title: 'Interno em Ação', minXp: 650, maxXp: 1300, color: '#F59E0B', badge: '⚡' },
  { level: 4, title: 'Residente Aspirante', minXp: 1300, maxXp: 2400, color: '#8B5CF6', badge: '🔬' },
  { level: 5, title: 'Médico R1 Destaque', minXp: 2400, maxXp: 4200, color: '#EC4899', badge: '🌟' },
  { level: 6, title: 'Especialista Clínico', minXp: 4200, maxXp: 7000, color: '#6366F1', badge: '🛡️' },
  { level: 7, title: 'Chefe de Plantão Nexus', minXp: 7000, maxXp: 12000, color: '#EF4444', badge: '👑' },
];

export interface Achievement {
  id: string;
  title: string;
  description: string;
  icon: string;
  category: 'streak' | 'accuracy' | 'volume' | 'mastery';
  unlocked: boolean;
  progress: number;
  maxProgress: number;
  rewardXp: number;
}

export interface DailyQuest {
  id: string;
  title: string;
  description: string;
  icon: string;
  current: number;
  target: number;
  completed: boolean;
  rewardXp: number;
}

export class GamificationService {
  /**
   * Calcula o total de XP acumulado pelo estudante com base nas ações reais
   */
  static calculateXp(
    answers: Record<string, QuestionAnswerRecord>,
    stats: UserStats,
    readingProgress: Record<string, { readSectionIds: string[]; percent: number }>,
    questions: Question[] = []
  ): number {
    // `answers` já vem deduplicado a uma entrada por questionId (ver
    // SupabaseAnswersRepository.getAnswers()), então somar sobre
    // answersArray naturalmente conta XP uma única vez por questão, mesmo
    // que existam múltiplas tentativas no banco.
    const answersArray = Object.values(answers);
    const totalCorrect = answersArray.filter((a) => a.isCorrect).length;
    const questionById = new Map(questions.map((q) => [q.id, q]));

    let questionsXp = 0;
    for (const a of answersArray) {
      const difficulty = questionById.get(a.questionId)?.difficulty ?? 'medio';
      let xp = DIFFICULTY_XP[difficulty];
      if (a.isCorrect && a.answerMode === 'open_recall') xp += OPEN_RECALL_CORRECT_BONUS_XP;
      if (a.answerStrategy) xp += ANSWER_STRATEGY_BONUS_XP;
      questionsXp += xp;
    }

    // Seções de compêndios lidas
    const totalSectionsRead = Object.values(readingProgress).reduce(
      (sum, p) => sum + (p.readSectionIds?.length || 0),
      0
    );

    const correctBonusXp = totalCorrect * 35;
    const streakXp = (stats.streakDays || 0) * 50;
    const flashcardsXp = (stats.cardsReviewedToday || 0) * 20;
    const readingXp = totalSectionsRead * 40;

    return Math.max(0, questionsXp + correctBonusXp + streakXp + flashcardsXp + readingXp);
  }

  /**
   * Identifica o nível atual e a barra de progresso para o próximo nível
   */
  static getLevelInfo(xp: number): {
    currentLevel: GamificationLevel;
    nextLevel: GamificationLevel | null;
    levelProgressPercent: number;
    xpIntoCurrentLevel: number;
    xpNeededForNextLevel: number;
  } {
    let current = LEVELS[0];
    for (let i = LEVELS.length - 1; i >= 0; i--) {
      if (xp >= LEVELS[i].minXp) {
        current = LEVELS[i];
        break;
      }
    }

    const nextIndex = LEVELS.findIndex((l) => l.level === current.level + 1);
    const nextLevel = nextIndex !== -1 ? LEVELS[nextIndex] : null;

    if (!nextLevel) {
      return {
        currentLevel: current,
        nextLevel: null,
        levelProgressPercent: 100,
        xpIntoCurrentLevel: xp - current.minXp,
        xpNeededForNextLevel: 0,
      };
    }

    const levelSpan = nextLevel.minXp - current.minXp;
    const xpIntoLevel = Math.max(0, xp - current.minXp);
    const percent = Math.min(100, Math.round((xpIntoLevel / levelSpan) * 100));

    return {
      currentLevel: current,
      nextLevel,
      levelProgressPercent: percent,
      xpIntoCurrentLevel: xpIntoLevel,
      xpNeededForNextLevel: nextLevel.minXp - xp,
    };
  }

  /**
   * Avalia o status das missões diárias do dia de hoje
   */
  static getDailyQuests(
    answers: Record<string, QuestionAnswerRecord>,
    stats: UserStats,
    readingProgress: Record<string, { readSectionIds: string[]; percent: number }>
  ): DailyQuest[] {
    const todayStr = diaLocal(new Date());
    const answersArray = Object.values(answers);

    const questionsToday = answersArray.filter((a) => a.timestamp && diaLocal(a.timestamp) === todayStr).length;
    const cardsToday = stats.cardsReviewedToday || 0;
    const sectionsRead = Object.values(readingProgress).reduce(
      (sum, p) => sum + (p.readSectionIds?.length || 0),
      0
    );

    return [
      {
        id: 'quest-questions',
        title: 'Raciocínio Clínico',
        description: 'Resolva 5 questões comentadas hoje',
        icon: '🩺',
        current: Math.min(5, questionsToday),
        target: 5,
        completed: questionsToday >= 5,
        rewardXp: 100,
      },
      {
        id: 'quest-flashcards',
        title: 'Circuito Sináptico',
        description: 'Revise 5 flashcards da sua fila SRS',
        icon: '🧠',
        current: Math.min(5, cardsToday),
        target: 5,
        completed: cardsToday >= 5,
        rewardXp: 80,
      },
      {
        id: 'quest-reading',
        title: 'Mergulho Teórico',
        description: 'Estude ou complete 1 tópico de compêndio',
        icon: '📖',
        current: Math.min(1, sectionsRead > 0 ? 1 : 0),
        target: 1,
        completed: sectionsRead >= 1,
        rewardXp: 70,
      },
    ];
  }

  /**
   * Avalia a lista de conquistas desbloqueadas
   */
  static getAchievements(
    answers: Record<string, QuestionAnswerRecord>,
    stats: UserStats,
    readingProgress: Record<string, { readSectionIds: string[]; percent: number }>
  ): Achievement[] {
    const answersArray = Object.values(answers);
    const totalAnswered = answersArray.length;
    const totalCorrect = answersArray.filter((a) => a.isCorrect).length;
    const accuracy = totalAnswered > 0 ? Math.round((totalCorrect / totalAnswered) * 100) : 0;
    const streak = stats.streakDays || 0;
    const sectionsCount = Object.values(readingProgress).reduce(
      (sum, p) => sum + (p.readSectionIds?.length || 0),
      0
    );

    return [
      {
        id: 'ach-streak-1',
        title: 'Chama Inicial',
        description: 'Mantenha sua sequência de estudos por 1 dia',
        icon: '🔥',
        category: 'streak',
        unlocked: streak >= 1,
        progress: Math.min(1, streak),
        maxProgress: 1,
        rewardXp: 50,
      },
      {
        id: 'ach-first-correct',
        title: 'Primeiro Diagnóstico',
        description: 'Acerte sua primeira questão comentada',
        icon: '🎯',
        category: 'accuracy',
        unlocked: totalCorrect >= 1,
        progress: Math.min(1, totalCorrect),
        maxProgress: 1,
        rewardXp: 60,
      },
      {
        id: 'ach-volume-10',
        title: 'Maratona Clínica',
        description: 'Resolva 10 questões no banco de provas',
        icon: '📚',
        category: 'volume',
        unlocked: totalAnswered >= 10,
        progress: Math.min(10, totalAnswered),
        maxProgress: 10,
        rewardXp: 120,
      },
      {
        id: 'ach-accuracy-70',
        title: 'Olho Clínico',
        description: 'Alcance acurácia maior que 70% com pelo menos 5 questões',
        icon: '💎',
        category: 'accuracy',
        unlocked: totalAnswered >= 5 && accuracy >= 70,
        progress: totalAnswered >= 5 ? accuracy : Math.round((totalAnswered / 5) * 50),
        maxProgress: 100,
        rewardXp: 150,
      },
      {
        id: 'ach-compendium-scholar',
        title: 'Erudito Nexus',
        description: 'Conclua a leitura de ao menos 3 tópicos clínicos',
        icon: '📜',
        category: 'mastery',
        unlocked: sectionsCount >= 3,
        progress: Math.min(3, sectionsCount),
        maxProgress: 3,
        rewardXp: 140,
      },
      {
        id: 'ach-streak-7',
        title: 'Constância Lendária',
        description: 'Conquiste 7 dias ininterruptos de ofensiva',
        icon: '⚡',
        category: 'streak',
        unlocked: streak >= 7,
        progress: Math.min(7, streak),
        maxProgress: 7,
        rewardXp: 300,
      },
    ];
  }

  /**
   * Calcula UserStats a partir de dados reais e sincronizados (respostas de
   * questões e revisões de flashcard já vindas do Supabase via os
   * repositórios, não do StorageService local isolado). Substitui
   * StorageService.getUserStats(), cujo `streakDays` era um valor fixo
   * (`totalAnswered > 0 ? 4 : 1`) que nunca refletiu uso real — achado ao
   * investigar por que o Dashboard mostrava XP/ofensiva para uma conta sem
   * nenhuma questão registrada no banco.
   *
   * streakDays: dias consecutivos com pelo menos uma questão respondida ou
   * um flashcard revisado, terminando hoje (ou ontem, se ainda não houve
   * atividade hoje — a sequência só quebra depois de um dia inteiro sem
   * nenhuma das duas atividades, não à meia-noite).
   */
  static computeRealStats(
    answers: Record<string, QuestionAnswerRecord>,
    flashcards: Flashcard[],
    readingProgress: Record<string, { readSectionIds: string[]; percent: number }> = {}
  ): UserStats {
    const answersArray = Object.values(answers);
    const totalAnswered = answersArray.length;
    const totalCorrect = answersArray.filter((a) => a.isCorrect).length;

    const todayStr = diaLocal(new Date());
    const cardsReviewedToday = flashcards.reduce((acc, c) => {
      const reviewedToday = (c.srs?.reviewHistory || []).some((h) => h?.date && diaLocal(h.date) === todayStr);
      return acc + (reviewedToday ? 1 : 0);
    }, 0);

    const compendiumsReadCount = Object.values(readingProgress).filter(
      (p) => p && p.percent >= 80
    ).length;

    const activityDates = new Set<string>();
    for (const a of answersArray) {
      if (a.timestamp) activityDates.add(diaLocal(a.timestamp));
    }
    for (const c of flashcards) {
      for (const h of c.srs?.reviewHistory || []) {
        if (h?.date) activityDates.add(diaLocal(h.date));
      }
    }

    let streakDays = 0;
    const cursor = new Date();
    cursor.setHours(0, 0, 0, 0);
    if (!activityDates.has(diaLocal(cursor))) {
      cursor.setDate(cursor.getDate() - 1);
    }
    while (activityDates.has(diaLocal(cursor))) {
      streakDays++;
      cursor.setDate(cursor.getDate() - 1);
    }

    return {
      totalAnswered,
      totalCorrect,
      streakDays,
      lastActiveDate: new Date().toISOString(),
      cardsReviewedToday,
      compendiumsReadCount,
    };
  }

  /**
   * Dispara uma celebração visual com confetes coloridos
   */
  static triggerCelebration() {
    try {
      confetti({
        particleCount: 75,
        spread: 70,
        origin: { y: 0.65 },
        colors: ['#0d9488', '#06b6d4', '#f59e0b', '#8b5cf6', '#10b981'],
        disableForReducedMotion: true,
      });
    } catch {
      // safe fallback if confetti context is restricted
    }
  }
}
