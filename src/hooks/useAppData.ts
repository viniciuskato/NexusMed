import { useCallback, useEffect, useState } from 'react';
import { materialsRepository } from '../repositories/MaterialsRepository';
import { questionsRepository } from '../repositories/QuestionsRepository';
import { flashcardsRepository } from '../repositories/FlashcardsRepository';
import { answersRepository } from '../repositories/AnswersRepository';
import { GamificationService } from '../services/gamification';
import { Compendium, Discipline, Flashcard, Question, QuestionAnswerRecord, Theme, UserStats } from '../types';
import { useServerLoad } from './useServerLoad';

export interface AppData {
  disciplines: Discipline[];
  themes: Theme[];
  compendiums: Compendium[];
  questions: Question[];
  flashcards: Flashcard[];
  answers: Record<string, QuestionAnswerRecord>;
  stats: UserStats;
}

function emptyData(): AppData {
  return {
    disciplines: [],
    themes: [],
    compendiums: [],
    questions: [],
    flashcards: [],
    answers: {},
    stats: GamificationService.computeRealStats({}, []),
  };
}

/**
 * Dados que o componente raiz carrega para todas as telas (45-G, D-2).
 *
 * - Troca de usuário limpa tudo ANTES de carregar: se a carga do novo usuário
 *   falhar, a tela nunca mostra respostas, flashcards ou estatísticas do
 *   anterior (o componente raiz continua montado entre logout e login).
 * - `ready` diz se os dados na tela são DESTE usuário e vieram do servidor.
 *   Quem julga algo a partir deles (ex.: se o pack salvo ainda existe) espera
 *   `ready`: uma carga que falhou deixa as listas vazias, e vazio não é
 *   "despublicado".
 * - Numa falha, `status` avisa e a carga tenta de novo sozinha
 *   (`useServerLoad`/`useAutoRetry`). `refresh` nunca lança: as telas o chamam
 *   como `onUpdate` depois de gravar.
 */
export function useAppData(userId: string | null) {
  const [data, setData] = useState<AppData>(emptyData);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const { status, reload } = useServerLoad(async () => {
    const uid = userId;
    const [disciplines, themes, compendiums, questions, flashcards, answers] = await Promise.all([
      materialsRepository.getDisciplines(),
      materialsRepository.getThemes(),
      materialsRepository.getCompendiums(),
      questionsRepository.getQuestions(),
      flashcardsRepository.getFlashcards(),
      answersRepository.getAnswers(),
    ]);
    return () => {
      setData({
        disciplines,
        themes,
        compendiums,
        questions,
        flashcards,
        answers,
        stats: GamificationService.computeRealStats(answers, flashcards),
      });
      setLoadedFor(uid);
    };
  }, null);

  useEffect(() => {
    if (!userId) return;
    setData(emptyData());
    setLoadedFor(null);
    setLoading(true);
    void reload().finally(() => setLoading(false));
  }, [userId, reload]);

  const refresh = useCallback(() => reload(), [reload]);

  return { ...data, loading, ready: userId !== null && loadedFor === userId, status, refresh };
}
