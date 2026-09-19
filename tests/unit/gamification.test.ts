import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GamificationService, LEVELS } from '../../src/services/gamification';
import type { Flashcard, Question, QuestionAnswerRecord, UserStats } from '../../src/types';

// Casos de borda de XP, nível e ofensiva (src/services/gamification.ts) antes
// da refatoração do App.tsx. Lógica pura: sem rede, sem localStorage. O
// relógio é fixado com `vi.setSystemTime` e o fuso com `process.env.TZ` (o
// Node reaplica o fuso quando TZ muda em tempo de execução) — a ofensiva
// depende de "hoje", e o app roda em navegador com fuso local do estudante
// (America/Sao_Paulo na prática), não UTC.

const EMPTY_STATS: UserStats = {
  totalAnswered: 0,
  totalCorrect: 0,
  streakDays: 0,
  lastActiveDate: '',
  cardsReviewedToday: 0,
  compendiumsReadCount: 0,
};

function answer(questionId: string, timestamp: string, overrides: Partial<QuestionAnswerRecord> = {}): QuestionAnswerRecord {
  return { questionId, selectedOption: 'A', isCorrect: false, timestamp, timeSpentSeconds: 30, ...overrides };
}

function answersOf(...records: QuestionAnswerRecord[]): Record<string, QuestionAnswerRecord> {
  return Object.fromEntries(records.map((r) => [r.questionId, r]));
}

function cardReviewedAt(id: string, ...dates: string[]): Flashcard {
  return {
    id,
    disciplineId: 'd',
    themeId: 't',
    front: 'f',
    back: 'b',
    mechanismHighlight: '',
    tags: [],
    difficulty: 'medio',
    srs: {
      intervalDays: 1,
      repetitionCount: dates.length,
      easeFactor: 2.5,
      nextDueDate: '2026-12-31T00:00:00.000Z',
      state: 'learning',
      reviewHistory: dates.map((date) => ({ date, rating: 3 as const })),
    },
  };
}

function question(id: string, difficulty: Question['difficulty']): Question {
  return { id, difficulty } as Question;
}

const originalTZ = process.env.TZ;
function useTimeZone(tz: string) {
  process.env.TZ = tz;
}

beforeEach(() => {
  useTimeZone('UTC');
});

afterEach(() => {
  vi.useRealTimers();
  if (originalTZ === undefined) delete process.env.TZ;
  else process.env.TZ = originalTZ;
});

// ---------------------------------------------------------------------------
// XP
// ---------------------------------------------------------------------------
describe('GamificationService.calculateXp', () => {
  it('zero dados = zero XP', () => {
    expect(GamificationService.calculateXp({}, EMPTY_STATS, {})).toBe(0);
  });

  it('pondera cada resposta pela dificuldade (fácil 10, médio 15, difícil 22) e usa médio quando a questão é desconhecida', () => {
    const qs = [question('f', 'facil'), question('m', 'medio'), question('d', 'dificil')];
    const t = '2026-09-18T10:00:00.000Z';
    expect(GamificationService.calculateXp(answersOf(answer('f', t)), EMPTY_STATS, {}, qs)).toBe(10);
    expect(GamificationService.calculateXp(answersOf(answer('m', t)), EMPTY_STATS, {}, qs)).toBe(15);
    expect(GamificationService.calculateXp(answersOf(answer('d', t)), EMPTY_STATS, {}, qs)).toBe(22);
    expect(GamificationService.calculateXp(answersOf(answer('desconhecida', t)), EMPTY_STATS, {}, qs)).toBe(15);
    expect(GamificationService.calculateXp(answersOf(answer('sem-lista', t)), EMPTY_STATS, {})).toBe(15);
  });

  it('acerto soma +35; recall aberto só dá bônus (+15) quando correto; autoavaliação dá +5 fixo', () => {
    const t = '2026-09-18T10:00:00.000Z';
    const calc = (r: QuestionAnswerRecord) => GamificationService.calculateXp(answersOf(r), EMPTY_STATS, {});
    expect(calc(answer('q', t, { isCorrect: true }))).toBe(15 + 35);
    expect(calc(answer('q', t, { isCorrect: true, answerMode: 'open_recall' }))).toBe(15 + 35 + 15);
    expect(calc(answer('q', t, { isCorrect: false, answerMode: 'open_recall' }))).toBe(15);
    expect(calc(answer('q', t, { isCorrect: true, answerMode: 'multiple_choice' }))).toBe(15 + 35);
    // O bônus de estratégia é o mesmo para todas as opções (não incentiva mentir).
    for (const strategy of ['recognition', 'elimination', 'false_confidence', 'guess'] as const) {
      expect(calc(answer('q', t, { answerStrategy: strategy }))).toBe(15 + 5);
    }
  });

  it('soma ofensiva (50/dia), flashcards revisados hoje (20 cada) e seções lidas (40 cada)', () => {
    const stats: UserStats = { ...EMPTY_STATS, streakDays: 3, cardsReviewedToday: 2 };
    const reading = {
      'comp-1': { readSectionIds: ['a', 'b'], percent: 50 },
      'comp-2': { readSectionIds: ['c'], percent: 10 },
    };
    expect(GamificationService.calculateXp({}, stats, reading)).toBe(3 * 50 + 2 * 20 + 3 * 40);
  });

  it('tolera progresso de leitura sem readSectionIds e stats com campos zerados', () => {
    const reading = { 'comp-1': { readSectionIds: undefined as unknown as string[], percent: 0 } };
    expect(GamificationService.calculateXp({}, EMPTY_STATS, reading)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Nível
// ---------------------------------------------------------------------------
describe('GamificationService.getLevelInfo', () => {
  it('XP zero = nível 1, 0% e 250 XP até o próximo nível', () => {
    const info = GamificationService.getLevelInfo(0);
    expect(info.currentLevel.level).toBe(1);
    expect(info.nextLevel?.level).toBe(2);
    expect(info.levelProgressPercent).toBe(0);
    expect(info.xpIntoCurrentLevel).toBe(0);
    expect(info.xpNeededForNextLevel).toBe(250);
  });

  it.each(LEVELS.slice(1).map((l) => [l.level, l.minXp] as const))(
    'limite do nível %i (minXp=%i): minXp-1 ainda é o nível anterior, minXp já é o novo nível com 0%%',
    (level, minXp) => {
      const below = GamificationService.getLevelInfo(minXp - 1);
      expect(below.currentLevel.level).toBe(level - 1);
      expect(below.xpNeededForNextLevel).toBe(1);
      expect(below.levelProgressPercent).toBe(100); // arredondado — falta 1 XP

      const at = GamificationService.getLevelInfo(minXp);
      expect(at.currentLevel.level).toBe(level);
      expect(at.xpIntoCurrentLevel).toBe(0);
    }
  );

  it('os níveis são contíguos (maxXp de um = minXp do seguinte), sem buraco nem sobreposição', () => {
    for (let i = 0; i < LEVELS.length - 1; i++) {
      expect(LEVELS[i].maxXp).toBe(LEVELS[i + 1].minXp);
      expect(LEVELS[i + 1].level).toBe(LEVELS[i].level + 1);
    }
  });

  it('progresso percentual no meio de um nível é proporcional e arredondado', () => {
    // Nível 2: 250..650 (vão de 400). 350 = 100/400 = 25%.
    expect(GamificationService.getLevelInfo(350).levelProgressPercent).toBe(25);
    // 251 = 1/400 = 0,25% -> arredonda para 0.
    expect(GamificationService.getLevelInfo(251).levelProgressPercent).toBe(0);
    // 648 = 398/400 = 99,5% -> arredonda para 100 (ainda nível 2).
    const quase = GamificationService.getLevelInfo(648);
    expect(quase.currentLevel.level).toBe(2);
    expect(quase.levelProgressPercent).toBe(100);
  });

  it('nível máximo: sem próximo nível, 100%, e XP acima do teto continua contando', () => {
    const top = LEVELS[LEVELS.length - 1];
    const at = GamificationService.getLevelInfo(top.minXp);
    expect(at.currentLevel.level).toBe(top.level);
    expect(at.nextLevel).toBeNull();
    expect(at.levelProgressPercent).toBe(100);
    expect(at.xpNeededForNextLevel).toBe(0);

    const beyond = GamificationService.getLevelInfo(top.maxXp + 10_000);
    expect(beyond.currentLevel.level).toBe(top.level);
    expect(beyond.xpIntoCurrentLevel).toBe(top.maxXp + 10_000 - top.minXp);
  });
});

// ---------------------------------------------------------------------------
// Ofensiva (streak) e estatísticas reais
// ---------------------------------------------------------------------------
describe('GamificationService.computeRealStats — ofensiva', () => {
  const NOW = new Date('2026-09-18T15:00:00.000Z');
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  it('zero dados: ofensiva 0 e todos os contadores zerados', () => {
    const stats = GamificationService.computeRealStats({}, [], {});
    expect(stats).toMatchObject({
      totalAnswered: 0,
      totalCorrect: 0,
      streakDays: 0,
      cardsReviewedToday: 0,
      compendiumsReadCount: 0,
    });
    expect(stats.lastActiveDate).toBe(NOW.toISOString());
  });

  it('só hoje = 1; hoje + 2 dias anteriores consecutivos = 3', () => {
    expect(GamificationService.computeRealStats(answersOf(answer('q1', '2026-09-18T09:00:00.000Z')), []).streakDays).toBe(1);
    const three = answersOf(
      answer('q1', '2026-09-18T09:00:00.000Z'),
      answer('q2', '2026-09-17T09:00:00.000Z'),
      answer('q3', '2026-09-16T09:00:00.000Z')
    );
    expect(GamificationService.computeRealStats(three, []).streakDays).toBe(3);
  });

  it('ainda sem estudo hoje: a ofensiva de ontem continua valendo (não quebra à meia-noite)', () => {
    const answers = answersOf(answer('q1', '2026-09-17T09:00:00.000Z'), answer('q2', '2026-09-16T09:00:00.000Z'));
    expect(GamificationService.computeRealStats(answers, []).streakDays).toBe(2);
  });

  it('um dia inteiro sem estudo quebra a ofensiva: só conta a partir do buraco', () => {
    // hoje e anteontem, sem nada ontem -> só hoje conta
    const answers = answersOf(answer('q1', '2026-09-18T09:00:00.000Z'), answer('q2', '2026-09-16T09:00:00.000Z'));
    expect(GamificationService.computeRealStats(answers, []).streakDays).toBe(1);
  });

  it('última atividade anteontem (ontem e hoje vazios): ofensiva 0', () => {
    const answers = answersOf(answer('q1', '2026-09-16T09:00:00.000Z'), answer('q2', '2026-09-15T09:00:00.000Z'));
    expect(GamificationService.computeRealStats(answers, []).streakDays).toBe(0);
  });

  it('várias atividades no mesmo dia contam como um único dia', () => {
    const answers = answersOf(
      answer('q1', '2026-09-18T01:00:00.000Z'),
      answer('q2', '2026-09-18T12:00:00.000Z'),
      answer('q3', '2026-09-18T14:59:00.000Z')
    );
    expect(GamificationService.computeRealStats(answers, []).streakDays).toBe(1);
  });

  it('revisão de flashcard também mantém a ofensiva, combinada com questões em dias alternados', () => {
    const answers = answersOf(answer('q1', '2026-09-18T09:00:00.000Z'), answer('q2', '2026-09-16T09:00:00.000Z'));
    const cards = [cardReviewedAt('fc-1', '2026-09-17T20:00:00.000Z')];
    expect(GamificationService.computeRealStats(answers, cards).streakDays).toBe(3);
  });

  it('atravessa virada de mês/ano sem quebrar a sequência', () => {
    vi.setSystemTime(new Date('2027-01-01T12:00:00.000Z'));
    const answers = answersOf(
      answer('q1', '2027-01-01T09:00:00.000Z'),
      answer('q2', '2026-12-31T09:00:00.000Z'),
      answer('q3', '2026-12-30T09:00:00.000Z')
    );
    expect(GamificationService.computeRealStats(answers, []).streakDays).toBe(3);
  });

  it('respostas sem timestamp e histórico de revisão malformado são ignorados, sem lançar', () => {
    const answers = answersOf(answer('q1', ''), answer('q2', '2026-09-18T09:00:00.000Z'));
    const broken = { ...cardReviewedAt('fc-1'), srs: undefined } as unknown as Flashcard;
    const stats = GamificationService.computeRealStats(answers, [broken]);
    expect(stats.streakDays).toBe(1);
    expect(stats.totalAnswered).toBe(2);
  });

  it('cardsReviewedToday conta cartões (não revisões) revisados hoje; compêndios lidos exigem percent >= 80', () => {
    const cards = [
      cardReviewedAt('fc-1', '2026-09-18T08:00:00.000Z', '2026-09-18T09:00:00.000Z'),
      cardReviewedAt('fc-2', '2026-09-18T10:00:00.000Z'),
      cardReviewedAt('fc-3', '2026-09-17T10:00:00.000Z'),
    ];
    const reading = {
      a: { readSectionIds: ['1'], percent: 80 },
      b: { readSectionIds: ['1'], percent: 79 },
      c: { readSectionIds: ['1'], percent: 100 },
    };
    const stats = GamificationService.computeRealStats({}, cards, reading);
    expect(stats.cardsReviewedToday).toBe(2);
    expect(stats.compendiumsReadCount).toBe(2);
    expect(stats.streakDays).toBe(2);
  });

  it('totais de respondidas/acertos vêm do mapa deduplicado por questão', () => {
    const answers = answersOf(
      answer('q1', '2026-09-18T09:00:00.000Z', { isCorrect: true }),
      answer('q2', '2026-09-18T09:00:00.000Z', { isCorrect: false }),
      answer('q3', '2026-09-18T09:00:00.000Z', { isCorrect: true })
    );
    const stats = GamificationService.computeRealStats(answers, []);
    expect(stats.totalAnswered).toBe(3);
    expect(stats.totalCorrect).toBe(2);
  });

  // -------------------------------------------------------------------------
  // "Hoje" é o dia do calendário LOCAL do estudante. Antes da correção, a data
  // das atividades era o dia UTC (`timestamp.slice(0, 10)`): em
  // America/Sao_Paulo (UTC-3), estudo entre 21h e 23h59 caía no dia seguinte
  // e a ofensiva/missões/cards de hoje não contavam o estudo da noite.
  // -------------------------------------------------------------------------
  it('em America/Sao_Paulo, estudo às 22h local de hoje conta para a ofensiva de hoje', () => {
    useTimeZone('America/Sao_Paulo');
    // Agora: 18/09 22:30 em São Paulo = 19/09 01:30 UTC.
    vi.setSystemTime(new Date('2026-09-19T01:30:00.000Z'));
    const answers = answersOf(
      answer('ontem-manha', '2026-09-17T13:00:00.000Z'), // 17/09 10:00 local
      answer('hoje-noite', '2026-09-19T01:00:00.000Z') // 18/09 22:00 local
    );
    expect(GamificationService.computeRealStats(answers, []).streakDays).toBe(2);
  });

  it('sanidade: o fuso America/Sao_Paulo é de fato aplicado neste processo (senão os casos de fuso não provariam nada)', () => {
    useTimeZone('America/Sao_Paulo');
    const d = new Date('2026-09-19T01:30:00.000Z');
    expect(d.getDate()).toBe(18);
    expect(d.getHours()).toBe(22);
  });

  it('em America/Sao_Paulo, às 22h30 local o card revisado de manhã ainda conta como revisado hoje', () => {
    useTimeZone('America/Sao_Paulo');
    vi.setSystemTime(new Date('2026-09-19T01:30:00.000Z')); // 18/09 22:30 local
    const cards = [
      cardReviewedAt('manha', '2026-09-18T13:00:00.000Z'), // 18/09 10:00 local
      cardReviewedAt('ontem-noite', '2026-09-18T01:00:00.000Z'), // 17/09 22:00 local
    ];
    expect(GamificationService.computeRealStats({}, cards).cardsReviewedToday).toBe(1);
  });

  it('em America/Sao_Paulo, às 22h30 local as questões de hoje contam na missão e as das 22h de ontem não', () => {
    useTimeZone('America/Sao_Paulo');
    vi.setSystemTime(new Date('2026-09-19T01:30:00.000Z')); // 18/09 22:30 local
    const quests = GamificationService.getDailyQuests(
      answersOf(
        answer('hoje-manha', '2026-09-18T13:00:00.000Z'), // 18/09 10:00 local
        answer('hoje-noite', '2026-09-19T01:00:00.000Z'), // 18/09 22:00 local
        answer('ontem-noite', '2026-09-18T01:00:00.000Z') // 17/09 22:00 local
      ),
      EMPTY_STATS,
      {}
    );
    expect(quests[0]).toMatchObject({ id: 'quest-questions', current: 2 });
  });

  it('em America/Sao_Paulo, estudo em horário diurno (sem cruzar a meia-noite UTC) conta a ofensiva corretamente', () => {
    useTimeZone('America/Sao_Paulo');
    vi.setSystemTime(new Date('2026-09-18T18:00:00.000Z')); // 18/09 15:00 local
    const answers = answersOf(
      answer('q1', '2026-09-18T14:00:00.000Z'), // 18/09 11:00 local
      answer('q2', '2026-09-17T14:00:00.000Z') // 17/09 11:00 local
    );
    expect(GamificationService.computeRealStats(answers, []).streakDays).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Missões diárias e conquistas (limiares)
// ---------------------------------------------------------------------------
describe('GamificationService.getDailyQuests / getAchievements', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-18T15:00:00.000Z'));
  });

  it('missões: zero dados = nada concluído; 5 questões hoje concluem, respostas de ontem não contam', () => {
    const empty = GamificationService.getDailyQuests({}, EMPTY_STATS, {});
    expect(empty.map((q) => [q.id, q.current, q.completed])).toEqual([
      ['quest-questions', 0, false],
      ['quest-flashcards', 0, false],
      ['quest-reading', 0, false],
    ]);

    const today = Array.from({ length: 6 }, (_, i) => answer(`h${i}`, '2026-09-18T10:00:00.000Z'));
    const yesterday = Array.from({ length: 4 }, (_, i) => answer(`o${i}`, '2026-09-17T10:00:00.000Z'));
    const quests = GamificationService.getDailyQuests(answersOf(...today, ...yesterday), { ...EMPTY_STATS, cardsReviewedToday: 4 }, {
      c: { readSectionIds: ['s'], percent: 10 },
    });
    expect(quests[0]).toMatchObject({ current: 5, completed: true }); // teto em 5
    expect(quests[1]).toMatchObject({ current: 4, completed: false });
    expect(quests[2]).toMatchObject({ current: 1, completed: true });
  });

  it('conquistas: zero dados = nada desbloqueado', () => {
    const achievements = GamificationService.getAchievements({}, EMPTY_STATS, {});
    expect(achievements.every((a) => !a.unlocked)).toBe(true);
    expect(achievements.find((a) => a.id === 'ach-accuracy-70')?.progress).toBe(0);
  });

  it('conquista de acurácia exige pelo menos 5 respostas E >= 70% (limite exato)', () => {
    const t = '2026-09-18T10:00:00.000Z';
    const make = (correct: number, total: number) =>
      answersOf(...Array.from({ length: total }, (_, i) => answer(`q${i}`, t, { isCorrect: i < correct })));
    const acc = (answers: Record<string, QuestionAnswerRecord>) =>
      GamificationService.getAchievements(answers, EMPTY_STATS, {}).find((a) => a.id === 'ach-accuracy-70')!;

    expect(acc(make(4, 4)).unlocked).toBe(false); // 100%, mas só 4 respostas
    expect(acc(make(4, 4)).progress).toBe(40); // 4/5 * 50
    expect(acc(make(7, 10)).unlocked).toBe(true); // exatamente 70%
    expect(acc(make(6, 10)).unlocked).toBe(false); // 60%
  });

  it('conquistas de ofensiva desbloqueiam exatamente em 1 e 7 dias', () => {
    const at = (streakDays: number) =>
      Object.fromEntries(
        GamificationService.getAchievements({}, { ...EMPTY_STATS, streakDays }, {}).map((a) => [a.id, a.unlocked])
      );
    expect(at(0)['ach-streak-1']).toBe(false);
    expect(at(1)['ach-streak-1']).toBe(true);
    expect(at(6)['ach-streak-7']).toBe(false);
    expect(at(7)['ach-streak-7']).toBe(true);
  });
});
