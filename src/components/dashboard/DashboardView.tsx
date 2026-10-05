import React, { useMemo, useState } from 'react';
import { ArrowRight, BookOpen, Brain, ChevronRight, Flame, HelpCircle, Library } from 'lucide-react';
import type { Compendium, Discipline, Flashcard, LastReadingSession, Question, QuestionAnswerRecord } from '../../types';
import { answersRepository } from '../../repositories/AnswersRepository';
import { readingProgressRepository } from '../../repositories/ReadingProgressRepository';
import { useScrollMemory } from '../../hooks/useScrollMemory';
import { useServerLoad } from '../../hooks/useServerLoad';
import { GamificationService } from '../../services/gamification';
import { ConnectionNotice } from '../common/ConnectionNotice';
import { acertosPorDisciplina, cartoesParaHoje, materiaisEmAndamento } from './painelDados';

// PAINEL-1 (04/10/2026) — o painel enxuto: só o que importa hoje. Três blocos,
// nesta ordem: "Hoje" (cartões, questões e sequência), "Acertos por disciplina"
// (gráfico) e "Continue lendo" (materiais em andamento). Todo o resto do painel
// antigo (nível/XP, KPIs, perfil cognitivo, banca, radar, desafios, SRS
// detalhado, conquistas, caderno de erros) vive em "Meu desempenho"
// (`DesempenhoView`), a um clique daqui.

interface DashboardViewProps {
  disciplines: Discipline[];
  questions: Question[];
  compendiums: Compendium[];
  flashcards: Flashcard[];
  lastReadingSession: LastReadingSession | null;
  onSelectView: (view: string) => void;
  onOpenCompendium: (compendiumId?: string, sectionId?: string) => void;
  onStartSRS: () => void;
}

const cardClass =
  'rounded-3xl border border-slate-200/90 dark:border-[#243452] bg-white dark:bg-[#0F172A] p-5 sm:p-6 elev-sm space-y-4';
const titleClass = 'text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300';
const primaryButtonClass =
  'min-h-12 px-5 py-3 rounded-2xl bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500 text-white font-bold text-base elev-xs transition-colors flex items-center justify-center gap-2 cursor-pointer w-full';
const secondaryButtonClass =
  'min-h-12 px-5 py-3 rounded-2xl border border-slate-300 dark:border-[#243452] hover:bg-slate-50 dark:hover:bg-[#182235] text-slate-800 dark:text-slate-100 font-bold text-base transition-colors flex items-center justify-center gap-2 cursor-pointer w-full';

export const DashboardView: React.FC<DashboardViewProps> = ({
  disciplines,
  questions,
  compendiums,
  flashcards,
  lastReadingSession,
  onSelectView,
  onOpenCompendium,
  onStartSRS,
}) => {
  useScrollMemory('dashboard');

  const [answers, setAnswers] = useState<Record<string, QuestionAnswerRecord>>({});
  const [readingProgress, setReadingProgress] = useState<Record<string, { readSectionIds: string[]; percent: number }>>({});
  const [carregado, setCarregado] = useState(false);

  // Do servidor (45-G, D-2): sem rede, o aviso aparece e nada é dado como "vazio".
  const { status } = useServerLoad(async () => {
    const [nextAnswers, nextProgress] = await Promise.all([
      answersRepository.getAnswers(),
      readingProgressRepository.getReadingProgress(),
    ]);
    return () => {
      setAnswers(nextAnswers);
      setReadingProgress(nextProgress);
      setCarregado(true);
    };
  });

  const cartoesDeHoje = useMemo(() => cartoesParaHoje(flashcards), [flashcards]);
  const sequencia = useMemo(
    () => GamificationService.computeRealStats(answers, flashcards, readingProgress).streakDays,
    [answers, flashcards, readingProgress]
  );
  const acertos = useMemo(() => acertosPorDisciplina(disciplines, questions, answers), [disciplines, questions, answers]);
  const emAndamento = useMemo(
    () => materiaisEmAndamento(compendiums, readingProgress, lastReadingSession),
    [compendiums, readingProgress, lastReadingSession]
  );

  const carregando = !carregado && status === 'ok';

  return (
    <div id="painel-view" className="w-full max-w-5xl mx-auto space-y-5 pb-12">
      <ConnectionNotice status={status} />

      <h1 className="text-2xl sm:text-3xl font-serif-reading font-bold tracking-tight text-slate-900 dark:text-white">Início</h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
        {/* ── (a) Hoje ── */}
        <section aria-labelledby="painel-hoje-titulo" data-painel-bloco="hoje" className={`${cardClass} lg:col-span-2`}>
          <h2 id="painel-hoje-titulo" className={titleClass}>
            Hoje
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="rounded-2xl bg-slate-50 dark:bg-[#142038] border border-slate-200/80 dark:border-[#243452] p-4 flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <Brain className="w-6 h-6 shrink-0 text-indigo-600 dark:text-indigo-300" aria-hidden="true" />
                <div>
                  <p id="painel-cartoes-numero" className="text-4xl font-black tabular-nums text-slate-900 dark:text-slate-100 leading-none">
                    {cartoesDeHoje.length}
                  </p>
                  <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
                    {cartoesDeHoje.length === 0 ? 'Nenhum cartão para hoje' : 'cartões para revisar'}
                  </p>
                </div>
              </div>
              {cartoesDeHoje.length > 0 ? (
                <button type="button" id="painel-revisar-cartoes" onClick={() => onStartSRS()} className={primaryButtonClass}>
                  <span>Revisar cartões</span>
                  <ArrowRight className="w-4 h-4" aria-hidden="true" />
                </button>
              ) : (
                <button type="button" id="painel-abrir-cartoes" onClick={() => onSelectView('flashcards')} className={secondaryButtonClass}>
                  <span>Abrir cartões</span>
                </button>
              )}
            </div>

            <div className="rounded-2xl bg-slate-50 dark:bg-[#142038] border border-slate-200/80 dark:border-[#243452] p-4 flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <HelpCircle className="w-6 h-6 shrink-0 text-teal-700 dark:text-teal-300" aria-hidden="true" />
                <p className="text-base font-bold text-slate-900 dark:text-slate-100">Questões</p>
              </div>
              <button type="button" id="painel-fazer-questoes" onClick={() => onSelectView('questions')} className={`${primaryButtonClass} mt-auto`}>
                <span>Fazer questões</span>
                <ArrowRight className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>

            <div className="rounded-2xl bg-slate-50 dark:bg-[#142038] border border-slate-200/80 dark:border-[#243452] p-4 flex items-center gap-3">
              <Flame className="w-6 h-6 shrink-0 text-orange-500 fill-orange-500" aria-hidden="true" />
              <div>
                <p id="painel-sequencia-numero" className="text-4xl font-black tabular-nums text-slate-900 dark:text-slate-100 leading-none">
                  {carregado ? sequencia : '—'}
                </p>
                <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
                  {carregado && sequencia === 0 ? 'Estude hoje para começar' : 'dias seguidos'}
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ── (b) Acertos por disciplina ── */}
        <section aria-labelledby="painel-acertos-titulo" data-painel-bloco="acertos" className={cardClass}>
          <h2 id="painel-acertos-titulo" className={titleClass}>
            Acertos por disciplina
          </h2>
          {carregando ? (
            <p role="status" className="text-sm text-slate-500 dark:text-slate-400">
              Carregando…
            </p>
          ) : !carregado ? null : acertos.length === 0 ? (
            <div className="space-y-3">
              <p className="text-sm text-slate-600 dark:text-slate-300">Nenhuma questão respondida ainda</p>
              <button type="button" onClick={() => onSelectView('questions')} className={secondaryButtonClass}>
                <span>Responder questões</span>
              </button>
            </div>
          ) : (
            <ul id="painel-acertos-grafico" className="space-y-3" aria-label="Percentual de acerto por disciplina, da menor para a maior">
              {acertos.map((item) => (
                <li
                  key={item.disciplineId}
                  className="space-y-1"
                  title={`${item.nome}: ${item.percentual}% de acerto em ${item.respondidas} ${item.respondidas === 1 ? 'questão respondida' : 'questões respondidas'}`}
                >
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate font-semibold text-slate-800 dark:text-slate-100">{item.nome}</span>
                    <span className="shrink-0 font-black tabular-nums text-slate-900 dark:text-slate-100">{item.percentual}%</span>
                  </div>
                  <div className="h-3 w-full rounded-r-full bg-slate-200 dark:bg-slate-800 overflow-hidden" aria-hidden="true">
                    <div
                      data-barra-acerto={item.disciplineId}
                      className="h-full rounded-r-full bg-teal-600 dark:bg-teal-400"
                      style={{ width: `${Math.max(item.percentual, 1)}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* ── (c) Continue lendo ── */}
        <section aria-labelledby="painel-leitura-titulo" data-painel-bloco="leitura" className={cardClass}>
          <h2 id="painel-leitura-titulo" className={titleClass}>
            Continue lendo
          </h2>
          {carregando ? (
            <p role="status" className="text-sm text-slate-500 dark:text-slate-400">
              Carregando…
            </p>
          ) : !carregado ? null : emAndamento.length === 0 ? (
            <div className="space-y-3">
              <p className="text-sm text-slate-600 dark:text-slate-300">Nenhum material em andamento</p>
              <button type="button" onClick={() => onSelectView('compendiums')} className={secondaryButtonClass}>
                <Library className="w-4 h-4" aria-hidden="true" />
                <span>Abrir biblioteca</span>
              </button>
            </div>
          ) : (
            <ul className="space-y-3">
              {emAndamento.map((material) => (
                <li key={material.compendiumId}>
                  <button
                    type="button"
                    data-material-em-andamento={material.compendiumId}
                    onClick={() => onOpenCompendium(material.compendiumId, material.sectionId)}
                    className="w-full text-left rounded-2xl border border-slate-200/80 dark:border-[#243452] bg-slate-50 dark:bg-[#142038] hover:border-teal-500/60 p-4 space-y-2 cursor-pointer transition-colors"
                  >
                    <span className="flex items-center gap-3">
                      <BookOpen className="w-5 h-5 shrink-0 text-teal-700 dark:text-teal-300" aria-hidden="true" />
                      <span className="min-w-0 flex-1 font-bold text-slate-900 dark:text-slate-100 break-words">{material.titulo}</span>
                      <ChevronRight className="w-4 h-4 shrink-0 text-slate-400" aria-hidden="true" />
                    </span>
                    <span className="flex items-center gap-3">
                      <span
                        className="h-2.5 flex-1 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden"
                        role="progressbar"
                        aria-label={`Progresso de leitura de ${material.titulo}`}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={material.percentual}
                      >
                        <span className="block h-full rounded-full bg-teal-600 dark:bg-teal-400" style={{ width: `${material.percentual}%` }} />
                      </span>
                      <span className="shrink-0 text-sm font-black tabular-nums text-slate-800 dark:text-slate-100">{material.percentual}%</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="flex justify-center pt-1">
        <button
          type="button"
          id="painel-ver-desempenho"
          onClick={() => onSelectView('desempenho')}
          className="min-h-11 px-4 py-2 rounded-2xl text-sm font-bold text-teal-800 dark:text-teal-300 hover:bg-teal-50 dark:hover:bg-teal-950/30 flex items-center gap-1.5 cursor-pointer"
        >
          <span>Ver meu desempenho</span>
          <ChevronRight className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
};
