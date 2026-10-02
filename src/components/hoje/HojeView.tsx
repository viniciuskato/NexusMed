import React, { useMemo, useState } from 'react';
import { ArrowRight, BookOpen, BookOpenCheck, Brain, CheckCircle2, Library } from 'lucide-react';
import type { Compendium, Flashcard, LastReadingSession, Question, QuestionAnswerRecord } from '../../types';
import { answersRepository } from '../../repositories/AnswersRepository';
import { flashcardsRepository } from '../../repositories/FlashcardsRepository';
import { leiturasRepository } from '../../repositories/LeiturasRepository';
import { isCardDueToday } from '../../services/srsAlgorithm';
import { retomadaDeLeitura, testePendenteHoje } from '../../services/hoje';
import type { LeituraDeMaterial } from '../../services/testarOQueLi';
import { useServerLoad } from '../../hooks/useServerLoad';
import { ConnectionNotice } from '../common/ConnectionNotice';
import type { LoadStatus } from '../../services/connectivity';

// 43-E — tela "Hoje": a porta de entrada diária. Reúne o que já existe: continuar
// lendo, testar o que li (43-C) e os cards vencidos. Sem meta, estatística nem
// pontuação.
//
// O que depende do servidor (leituras, respostas, cards) é carregado junto, do
// servidor e a cada vez que a tela abre (45-G, D-2): numa falha o aviso aparece
// e nada é mostrado pela metade — em especial, "tudo feito" só aparece com o dia
// inteiro carregado, nunca porque a carga falhou. O "Continuar lendo" vem da
// sessão de leitura guardada neste aparelho e não espera a rede.
//
// Questões e materiais vêm do App (`useAppData`): enquanto `dataReady` for falso
// (carga em andamento ou que falhou), as listas estão vazias por falta de dado,
// não por não haver nada a fazer — então nem "Testar o que li" é calculado nem
// "tudo feito" é afirmado, e o aviso de conexão do App também aparece aqui.

export interface HojeViewProps {
  compendiums: Compendium[];
  questions: Question[];
  lastReadingSession: LastReadingSession | null;
  /** Os dados do App (questões, materiais) são deste usuário e vieram do servidor. */
  dataReady: boolean;
  dataStatus: LoadStatus;
  onResumeReading: (compendiumId: string, sectionId?: string) => void;
  onTestarOQueLi: () => void;
  onStartReview: (cards: Flashcard[]) => void;
  onOpenLibrary: () => void;
}

interface DadosDoDia {
  leituras: LeituraDeMaterial[];
  answers: Record<string, QuestionAnswerRecord>;
  flashcards: Flashcard[];
}

const cardClass =
  'rounded-3xl border border-slate-200/90 dark:border-[#243452] bg-white dark:bg-[#0F172A] p-5 sm:p-6 elev-sm space-y-3';
const primaryButtonClass =
  'min-h-11 px-5 py-2.5 rounded-2xl bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500 text-white font-bold text-sm elev-xs transition-colors flex items-center justify-center gap-2 cursor-pointer w-full sm:w-auto';

const plural = (n: number, singular: string, pluralForm: string) => (n === 1 ? `1 ${singular}` : `${n} ${pluralForm}`);

export const HojeView: React.FC<HojeViewProps> = ({
  compendiums,
  questions,
  lastReadingSession,
  dataReady,
  dataStatus,
  onResumeReading,
  onTestarOQueLi,
  onStartReview,
  onOpenLibrary,
}) => {
  const [dados, setDados] = useState<DadosDoDia | null>(null);

  const { status } = useServerLoad(async () => {
    const [leituras, answers, flashcards] = await Promise.all([
      leiturasRepository.getLeituras(),
      answersRepository.getAnswers(),
      flashcardsRepository.getFlashcards(),
    ]);
    return () => setDados({ leituras, answers, flashcards });
  });

  const retomada = useMemo(() => retomadaDeLeitura(lastReadingSession, compendiums), [lastReadingSession, compendiums]);

  const pendentes = useMemo(
    () =>
      dados && dataReady
        ? testePendenteHoje({
            questions,
            leituras: dados.leituras,
            answers: dados.answers,
            materiaisExistentes: compendiums.map((c) => c.id),
          }).pendentes
        : [],
    [dados, dataReady, questions, compendiums]
  );
  const cardsDeHoje = useMemo(() => (dados ? dados.flashcards.filter((fc) => isCardDueToday(fc)) : []), [dados]);

  const carregado = dados !== null && dataReady;
  const tudoFeito = carregado && pendentes.length === 0 && cardsDeHoje.length === 0;

  return (
    <div id="hoje-view" className="w-full max-w-3xl mx-auto space-y-5 pb-12">
      <ConnectionNotice status={status} />
      <ConnectionNotice status={dataStatus} />

      <div>
        <h1 className="text-2xl sm:text-3xl font-serif-reading font-bold tracking-tight text-slate-900 dark:text-white">
          Hoje
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">O que fazer agora, num lugar só.</p>
      </div>

      {!carregado && status === 'ok' && dataStatus === 'ok' && (
        <p role="status" className="text-sm text-slate-500 dark:text-slate-400">
          Carregando o seu dia…
        </p>
      )}

      {retomada && (
        <section aria-labelledby="hoje-continuar-titulo" className={cardClass}>
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 shrink-0 rounded-xl bg-teal-500/15 text-teal-700 dark:text-teal-300 flex items-center justify-center border border-teal-500/25">
              <BookOpen className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 id="hoje-continuar-titulo" className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Continuar lendo
              </h2>
              <p className="text-base font-bold text-slate-900 dark:text-slate-100 break-words">{retomada.compendiumTitle}</p>
              {retomada.sectionTitle && (
                <p className="text-sm text-slate-600 dark:text-slate-400 break-words">Você parou em: {retomada.sectionTitle}</p>
              )}
            </div>
          </div>
          <button
            type="button"
            id="hoje-continuar-lendo"
            onClick={() => onResumeReading(retomada.compendiumId, retomada.sectionId)}
            className={primaryButtonClass}
          >
            <span>Continuar lendo</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </section>
      )}

      {pendentes.length > 0 && (
        <section aria-labelledby="hoje-testar-titulo" className={cardClass}>
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 shrink-0 rounded-xl bg-teal-500/15 text-teal-700 dark:text-teal-300 flex items-center justify-center border border-teal-500/25">
              <BookOpenCheck className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 id="hoje-testar-titulo" className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Testar o que li
              </h2>
              <p className="text-base font-bold text-slate-900 dark:text-slate-100">
                {plural(pendentes.length, 'questão', 'questões')} dos materiais que você leu hoje
              </p>
            </div>
          </div>
          <button type="button" id="hoje-testar-o-que-li" onClick={onTestarOQueLi} className={primaryButtonClass}>
            <span>Testar o que li</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </section>
      )}

      {cardsDeHoje.length > 0 && (
        <section aria-labelledby="hoje-cards-titulo" className={cardClass}>
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 shrink-0 rounded-xl bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 flex items-center justify-center border border-indigo-500/25">
              <Brain className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 id="hoje-cards-titulo" className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Cards para hoje
              </h2>
              <p className="text-base font-bold text-slate-900 dark:text-slate-100">
                {plural(cardsDeHoje.length, 'card', 'cards')} para hoje
              </p>
            </div>
          </div>
          <button type="button" id="hoje-revisar-cards" onClick={() => onStartReview(cardsDeHoje)} className={primaryButtonClass}>
            <span>Revisar {plural(cardsDeHoje.length, 'card', 'cards')}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </section>
      )}

      {tudoFeito && (
        <section aria-labelledby="hoje-feito-titulo" className={cardClass}>
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 shrink-0 rounded-xl bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 flex items-center justify-center border border-emerald-500/25">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 id="hoje-feito-titulo" className="text-base font-bold text-slate-900 dark:text-slate-100">
                Tudo feito por hoje
              </h2>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Nenhum card para revisar e nenhum teste pendente da sua leitura de hoje.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onOpenLibrary}
            className="min-h-11 px-4 py-2 rounded-2xl border border-slate-300 dark:border-[#243452] hover:bg-slate-50 dark:hover:bg-[#182235] text-slate-800 dark:text-slate-100 font-semibold text-sm transition-colors flex items-center justify-center gap-2 cursor-pointer w-full sm:w-auto"
          >
            <Library className="w-4 h-4" />
            <span>Abrir a biblioteca</span>
          </button>
        </section>
      )}
    </div>
  );
};
