import confetti from 'canvas-confetti';

// Sequência de acertos, dentro da mesma disciplina, que dispara a celebração automática (ver QuestionCard.tsx, que
// calcula essa sequência em memória a partir de `answers` no momento de decidir se dispara). É só um confete: não
// guarda nem soma nada (CORTE-1, D-14: XP, nível e ofensiva saíram do app).
export const CELEBRATION_STREAK_LENGTH = 10;

export function triggerCelebration(): void {
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
