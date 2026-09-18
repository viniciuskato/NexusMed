import { FlashcardSRS } from '../types';

const MAX_INTERVAL_DAYS = 36500;

/**
 * SuperMemo SM-2 Spaced Repetition Algorithm implementation for Medical Flashcards
 * Rating:
 * 1 = Errei (Again / Complete Blackout)
 * 2 = Difícil (Hard / Hesitated / Recalled with major effort)
 * 3 = Bom (Good / Normal recall with slight effort)
 * 4 = Fácil (Easy / Instantaneous perfect recall)
 */
export function calculateNextSRS(
  currentSRS?: FlashcardSRS | null,
  rating: 1 | 2 | 3 | 4 = 3,
  reviewDate: Date = new Date()
): FlashcardSRS {
  const baseSRS = currentSRS || createInitialSRS();
  let intervalDays = baseSRS.intervalDays ?? 0;
  let repetitionCount = baseSRS.repetitionCount ?? 0;
  let easeFactor = baseSRS.easeFactor ?? 2.5;

  // Map 1-4 scale to SM-2 0-5 scale
  // 1 -> 1 (Fail)
  // 2 -> 3 (Pass with difficulty)
  // 3 -> 4 (Pass with good recall)
  // 4 -> 5 (Pass with ease)
  const sm2Quality = rating === 1 ? 1 : rating === 2 ? 3 : rating === 3 ? 4 : 5;

  let newState: 'new' | 'learning' | 'review' | 'mastered' = baseSRS.state || 'new';

  if (sm2Quality < 3) {
    // Failed recall: reset repetitions, short interval
    repetitionCount = 0;
    intervalDays = 1;
    newState = 'learning';
  } else {
    // Successful recall
    if (repetitionCount === 0) {
      intervalDays = 1;
    } else if (repetitionCount === 1) {
      intervalDays = rating === 4 ? 4 : 2;
    } else {
      // Calculate new interval using Ease Factor
      const multiplier = rating === 2 ? 1.2 : rating === 3 ? easeFactor : easeFactor * 1.3;
      // Teto de 100 anos: sem ele, "Fácil" repetido faz o intervalo crescer
      // ~3,9x por revisão até estourar o Date (RangeError).
      intervalDays = Math.min(MAX_INTERVAL_DAYS, Math.round(intervalDays * multiplier));
    }
    repetitionCount += 1;
    newState = intervalDays >= 21 ? 'mastered' : 'review';
  }

  // Update Ease Factor (EF' = EF + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)))
  const q = sm2Quality;
  easeFactor = easeFactor + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
  // Keep ease factor within sensible bounds (1.3 to 3.0)
  easeFactor = Math.max(1.3, Math.min(3.0, parseFloat(easeFactor.toFixed(2))));

  // Calculate next due date
  const nextDueDateObj = new Date(reviewDate);
  nextDueDateObj.setDate(nextDueDateObj.getDate() + intervalDays);

  const reviewHistory = [
    ...(baseSRS.reviewHistory || []),
    {
      date: reviewDate.toISOString(),
      rating,
    },
  ];

  return {
    intervalDays,
    repetitionCount,
    easeFactor,
    nextDueDate: nextDueDateObj.toISOString(),
    lastReviewedDate: reviewDate.toISOString(),
    state: newState,
    reviewHistory,
  };
}

export function createInitialSRS(): FlashcardSRS {
  const today = new Date();
  return {
    intervalDays: 0,
    repetitionCount: 0,
    easeFactor: 2.5,
    nextDueDate: today.toISOString(),
    state: 'new',
    reviewHistory: [],
  };
}

export function isCardDue(
  srsOrCard?: FlashcardSRS | { srs?: FlashcardSRS } | null,
  compareDate: Date = new Date()
): boolean {
  if (!srsOrCard) return true;
  const srs: FlashcardSRS | undefined =
    'srs' in srsOrCard && srsOrCard.srs ? srsOrCard.srs : (srsOrCard as FlashcardSRS);

  if (!srs || !srs.nextDueDate) return true;
  const dueDate = new Date(srs.nextDueDate);
  if (isNaN(dueDate.getTime())) return true;
  return dueDate <= compareDate || srs.state === 'new';
}

export function isCardDueToday(
  cardOrSrs?: FlashcardSRS | { srs?: FlashcardSRS } | null,
  compareDate: Date = new Date()
): boolean {
  return isCardDue(cardOrSrs, compareDate);
}

