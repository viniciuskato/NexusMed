import React, { useMemo } from 'react';
import { HelpCircle, Upload } from 'lucide-react';
import type { Discipline, Question, QuestionAnswerRecord } from '../../types';
import { TEXTO_SEM_QUESTOES_DE_RESIDENCIA } from '../../utils/questoesDeResidencia';
import { acertoGeral, acertosPorBanca, acertosPorDisciplina, evolucaoSemanal } from './painelDados';
import { cardClass, secondaryButtonClass, subtitleClass, titleClass } from './painelEstilos';

// PAINEL-2 — "Questões de residência": o acerto geral, por disciplina, por
// banca e ao longo das últimas 8 semanas. Gráficos só em CSS. Recebe só questões
// de residência e as respostas a elas (AGENTS.md item 24).

interface QuestoesDeResidenciaBlocoProps {
  /** Questões e respostas já vieram do servidor. */
  pronto: boolean;
  /** Ainda carregando (sem falha): mostra "Carregando…". */
  esperando: boolean;
  disciplines: Discipline[];
  questions: Question[];
  answers: Record<string, QuestionAnswerRecord>;
  onFazerQuestoes: () => void;
  /** Só o admin recebe. */
  onImportarQuestoes?: () => void;
}

const respondidas = (n: number) => (n === 1 ? '1 respondida' : `${n} respondidas`);

export const QuestoesDeResidenciaBloco: React.FC<QuestoesDeResidenciaBlocoProps> = ({
  pronto,
  esperando,
  disciplines,
  questions,
  answers,
  onFazerQuestoes,
  onImportarQuestoes,
}) => {
  const geral = useMemo(() => acertoGeral(answers), [answers]);
  const porDisciplina = useMemo(() => acertosPorDisciplina(disciplines, questions, answers), [disciplines, questions, answers]);
  const porBanca = useMemo(() => acertosPorBanca(questions, answers), [questions, answers]);
  const semanas = useMemo(() => evolucaoSemanal(answers), [answers]);

  return (
    <section aria-labelledby="painel-questoes-titulo" data-painel-bloco="questoes" className={cardClass}>
      <h2 id="painel-questoes-titulo" className={titleClass}>
        Questões de residência
      </h2>

      {esperando ? (
        <p role="status" className="text-sm text-slate-500 dark:text-slate-400">
          Carregando…
        </p>
      ) : !pronto ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">O seu desempenho aparece quando a conexão voltar.</p>
      ) : questions.length === 0 ? (
        <div className="space-y-3">
          <p id="painel-sem-residencia" className="text-sm text-slate-600 dark:text-slate-300">
            {TEXTO_SEM_QUESTOES_DE_RESIDENCIA}
          </p>
          {onImportarQuestoes && (
            <button type="button" id="painel-importar-questoes" onClick={onImportarQuestoes} className={secondaryButtonClass}>
              <Upload className="w-4 h-4" aria-hidden="true" />
              <span>Importar questões</span>
            </button>
          )}
        </div>
      ) : geral.respondidas === 0 ? (
        <div className="space-y-3">
          <p id="painel-sem-respostas" className="text-sm text-slate-600 dark:text-slate-300">
            Nenhuma questão respondida ainda
          </p>
          <button type="button" onClick={onFazerQuestoes} className={secondaryButtonClass}>
            <HelpCircle className="w-4 h-4" aria-hidden="true" />
            <span>Responder questões</span>
          </button>
        </div>
      ) : (
        <>
          <div className="flex items-baseline gap-3">
            <span id="painel-acerto-geral" className="text-4xl font-black tabular-nums text-slate-900 dark:text-slate-100">
              {geral.percentual}%
            </span>
            <span className="text-sm text-slate-700 dark:text-slate-200">
              de acerto · <span id="painel-respondidas">{respondidas(geral.respondidas)}</span>
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-3">
              <h3 className={subtitleClass}>Por disciplina</h3>
              <ul id="painel-acertos-disciplina" className="space-y-3" aria-label="Percentual de acerto por disciplina, da menor para a maior">
                {porDisciplina.map((item) => (
                  <li
                    key={item.disciplineId}
                    data-acerto-disciplina={item.disciplineId}
                    className="space-y-1"
                    title={`${item.nome}: ${item.percentual}% de acerto em ${item.respondidas === 1 ? '1 questão respondida' : `${item.respondidas} questões respondidas`}`}
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
                    <p className="text-xs text-slate-600 dark:text-slate-300">{respondidas(item.respondidas)}</p>
                  </li>
                ))}
              </ul>
            </div>

            <div className="space-y-3">
              <h3 className={subtitleClass}>Por banca</h3>
              <ul id="painel-acertos-banca" className="space-y-2" aria-label="Acerto por banca, da que você mais respondeu para a que menos">
                {porBanca.map((banca) => (
                  <li
                    key={banca.nome}
                    data-acerto-banca={banca.nome}
                    className="flex items-baseline justify-between gap-3 rounded-xl bg-slate-50 dark:bg-[#142038] border border-slate-200/80 dark:border-[#243452] px-3 py-2"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{banca.nome}</span>
                      <span className="block text-xs text-slate-600 dark:text-slate-300">{respondidas(banca.respondidas)}</span>
                    </span>
                    <span className="shrink-0 text-base font-black tabular-nums text-slate-900 dark:text-slate-100">{banca.percentual}%</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="space-y-3">
            <h3 className={subtitleClass}>Evolução nas últimas 8 semanas</h3>
            <ol id="painel-evolucao" className="grid grid-cols-8 gap-1.5 items-end" aria-label="Percentual de acerto por semana, da mais antiga para a atual">
              {semanas.map((semana) => (
                <li
                  key={semana.inicio}
                  data-semana={semana.inicio}
                  className="flex flex-col items-center gap-1 min-w-0"
                  aria-label={
                    semana.percentual === null
                      ? `Semana de ${semana.rotulo}: sem respostas`
                      : `Semana de ${semana.rotulo}: ${semana.percentual}% de acerto em ${respondidas(semana.respondidas)}`
                  }
                >
                  <span className="text-[11px] font-bold tabular-nums text-slate-800 dark:text-slate-100 h-4" aria-hidden="true">
                    {semana.percentual === null ? '' : `${semana.percentual}%`}
                  </span>
                  <div className="h-24 w-full flex items-end justify-center" aria-hidden="true">
                    {semana.percentual === null ? (
                      <div data-semana-vazia className="w-full max-w-8 h-full rounded-t-md border border-dashed border-slate-300 dark:border-slate-600" />
                    ) : (
                      <div
                        data-barra-semana={semana.inicio}
                        className="w-full max-w-8 rounded-t-md bg-teal-600 dark:bg-teal-400"
                        style={{ height: `${Math.max(semana.percentual, 3)}%` }}
                      />
                    )}
                  </div>
                  <span className="text-[11px] tabular-nums text-slate-600 dark:text-slate-300" aria-hidden="true">
                    {semana.rotulo}
                  </span>
                </li>
              ))}
            </ol>
            <p className="text-xs text-slate-600 dark:text-slate-300">Cada coluna é uma semana (a data é a segunda-feira). Coluna tracejada: semana sem respostas.</p>
          </div>
        </>
      )}
    </section>
  );
};
