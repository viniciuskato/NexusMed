import type { Question, QuestionReviewResult } from '../types';

// Texto do flashcard criado ao errar uma questão (frente, verso e destaque do mecanismo).
//
// O gabarito (qual alternativa é a correta, a explicação) só chega ao navegador de quem é admin: para
// o estudante, `question_option_keys` e `question_answer_keys` não têm leitura, e a questão carregada
// vem com `isCorrect: false` em tudo e com o resumo vazio. O verso que dependesse da questão carregada
// saía vazio para todo mundo que não é admin. A fonte do gabarito depois da resposta é a revisão
// (`getQuestionReview`, RPC que só responde para quem já respondeu a questão): quando ela é passada,
// o verso sai dela. Sem ela, vale o que a questão traz (caminho do admin e do modo local).

export interface TextoDoFlashcard {
  front: string;
  back: string;
  mechanismNote: string;
}

/** A questão carregada já traz o gabarito (admin ou modo local)? Se não, o verso precisa da revisão. */
export function questaoTraGabarito(question: Question): boolean {
  return Boolean(question.flashcardTemplate) || question.options.some((option) => option.isCorrect);
}

export function textoDoFlashcardDoErro(question: Question, review?: QuestionReviewResult): TextoDoFlashcard {
  if (question.flashcardTemplate) return question.flashcardTemplate;

  const front = `[${question.institution} ${question.year}] ${question.questionStem.slice(0, 180)}...`;

  let correctText = question.options.find((option) => option.isCorrect)?.text ?? '';
  let explanation = question.highYieldSummary;
  if (review) {
    const letter = review.options.find((option) => option.optionId === review.correctOptionId)?.letter;
    const doGabarito = letter ? question.options.find((option) => option.letter === letter)?.text : undefined;
    if (doGabarito) correctText = doGabarito;
    explanation = review.highYieldSummary || review.generalCommentary || explanation;
  }

  return {
    front,
    back: `Resposta Correta:\n${correctText}\n\nExplicação:\n${explanation}`,
    mechanismNote: explanation,
  };
}
