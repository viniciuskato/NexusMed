import React, { useMemo, useState } from 'react';
import { AlertTriangle, ArrowRight, BookOpen, BookOpenCheck, HelpCircle, Timer } from 'lucide-react';
import type { Compendium, Discipline, LastReadingSession, Question, QuestionAnswerRecord } from '../../types';
import { answersRepository } from '../../repositories/AnswersRepository';
import { readingProgressRepository } from '../../repositories/ReadingProgressRepository';
import { useScrollMemory } from '../../hooks/useScrollMemory';
import { useServerLoad } from '../../hooks/useServerLoad';
import { ConnectionNotice } from '../common/ConnectionNotice';
import { retomadaDeLeitura } from '../../services/hoje';
import { respostasDasQuestoes } from '../../utils/questoesDeResidencia';
import { MinhaLeituraBloco } from './MinhaLeituraBloco';
import { QuestoesDeResidenciaBloco } from './QuestoesDeResidenciaBloco';
import { cardClass, primaryButtonClass, secondaryButtonClass, titleClass } from './painelEstilos';

// PAINEL-2 (11/10/2026, D-14) — o Início: a única tela de entrada do app. Cinco
// blocos, nesta ordem: "Continuar lendo", "Minha leitura" (o que já li e o que
// falta), "Questões de residência" (o acerto em números e gráficos simples),
// "Erros para revisar" e os atalhos. Substitui "Hoje", o painel enxuto e "Meu
// desempenho" (PAINEL-1), que deixaram de ser telas. O caderno de erros segue
// como tela própria, a um botão daqui.
//
// O que depende do servidor (respostas e leitura) vem junto e a cada abertura
// (45-G, D-2): numa falha o aviso "sem conexão" aparece e nenhum bloco afirma
// número nenhum — em especial "0", que seria falso. Materiais e questões vêm do
// App (`useAppData`): enquanto `dadosProntos` for falso, as listas vazias são
// falta de dado, não ausência de conteúdo.

interface DashboardViewProps {
  disciplines: Discipline[];
  /** Só questões de residência (RESID-1, D-14): quem monta a lista é o App. */
  questions: Question[];
  /** Os dados deste usuário já vieram do servidor (padrão: sim); sem isso, lista vazia pode ser carga que falhou. */
  dadosProntos?: boolean;
  compendiums: Compendium[];
  lastReadingSession: LastReadingSession | null;
  onSelectView: (view: string) => void;
  onOpenCompendium: (compendiumId?: string, sectionId?: string) => void;
  /** Abre "Testar o que li" (43-C). */
  onTestarOQueLi?: () => void;
  /** Só o admin recebe: abre a Área Editorial na aba de questões, para importar. */
  onImportarQuestoes?: () => void;
}

const plural = (n: number, singular: string, pluralForm: string) => (n === 1 ? `1 ${singular}` : `${n} ${pluralForm}`);

export const DashboardView: React.FC<DashboardViewProps> = ({
  disciplines,
  questions,
  dadosProntos = true,
  compendiums,
  lastReadingSession,
  onSelectView,
  onOpenCompendium,
  onTestarOQueLi,
  onImportarQuestoes,
}) => {
  useScrollMemory('dashboard');

  const [respostas, setRespostas] = useState<Record<string, QuestionAnswerRecord>>({});
  const [progresso, setProgresso] = useState<Record<string, { readSectionIds: string[]; percent: number }>>({});
  const [carregado, setCarregado] = useState(false);

  const { status } = useServerLoad(async () => {
    const [nextAnswers, nextProgress] = await Promise.all([
      answersRepository.getAnswers(),
      readingProgressRepository.getReadingProgress(),
    ]);
    return () => {
      setRespostas(nextAnswers);
      setProgresso(nextProgress);
      setCarregado(true);
    };
  });

  // Resposta antiga a questão de fora da residência não entra em conta nenhuma.
  const respostasDeResidencia = useMemo(() => respostasDasQuestoes(respostas, questions), [respostas, questions]);
  const erros = useMemo(
    () => Object.values(respostasDeResidencia).filter((r) => !r.isCorrect).length,
    [respostasDeResidencia]
  );

  // O "Continuar lendo" vem da sessão de leitura guardada neste aparelho: não espera a rede.
  const retomada = useMemo(() => retomadaDeLeitura(lastReadingSession, compendiums), [lastReadingSession, compendiums]);

  // Só com tudo carregado se afirma um número; senão a tela espera (ou avisa da conexão).
  const pronto = carregado && dadosProntos;
  const esperando = !pronto && status === 'ok';

  return (
    <div id="painel-view" className="w-full max-w-4xl mx-auto space-y-5 pb-12">
      <ConnectionNotice status={status} />

      <h1 className="text-2xl sm:text-3xl font-serif-reading font-bold tracking-tight text-slate-900 dark:text-white">Início</h1>

      {/* ── 1. Continuar lendo ── */}
      {retomada && (
        <section aria-labelledby="painel-continuar-titulo" data-painel-bloco="continuar" className={cardClass}>
          <div className="flex items-start gap-3">
            <BookOpen className="w-6 h-6 shrink-0 text-teal-700 dark:text-teal-300" aria-hidden="true" />
            <div className="min-w-0">
              <h2 id="painel-continuar-titulo" className={titleClass}>
                Continuar lendo
              </h2>
              <p className="text-base font-bold text-slate-900 dark:text-slate-100 break-words">{retomada.compendiumTitle}</p>
              {retomada.sectionTitle && (
                <p className="text-sm text-slate-600 dark:text-slate-300 break-words">Você parou em: {retomada.sectionTitle}</p>
              )}
            </div>
          </div>
          <button
            type="button"
            id="painel-continuar-lendo"
            onClick={() => onOpenCompendium(retomada.compendiumId, retomada.sectionId)}
            className={primaryButtonClass}
          >
            <span>Continuar de onde parei</span>
            <ArrowRight className="w-4 h-4" aria-hidden="true" />
          </button>
        </section>
      )}

      {/* ── 2. Minha leitura ── */}
      <MinhaLeituraBloco
        pronto={pronto}
        esperando={esperando}
        disciplines={disciplines}
        compendiums={compendiums}
        readingProgress={progresso}
        onOpenCompendium={(id) => onOpenCompendium(id)}
        onAbrirBiblioteca={() => onSelectView('compendiums')}
      />

      {/* ── 3. Questões de residência ── */}
      <QuestoesDeResidenciaBloco
        pronto={pronto}
        esperando={esperando}
        disciplines={disciplines}
        questions={questions}
        answers={respostasDeResidencia}
        onFazerQuestoes={() => onSelectView('questions')}
        onImportarQuestoes={onImportarQuestoes}
      />

      {/* ── 4. Erros para revisar ── */}
      <section aria-labelledby="painel-erros-titulo" data-painel-bloco="erros" className={cardClass}>
        <h2 id="painel-erros-titulo" className={titleClass}>
          Erros para revisar
        </h2>
        {esperando ? (
          <p role="status" className="text-sm text-slate-500 dark:text-slate-400">
            Carregando…
          </p>
        ) : !pronto ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">Os erros aparecem quando a conexão voltar.</p>
        ) : (
          <>
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-6 h-6 shrink-0 text-rose-600 dark:text-rose-400" aria-hidden="true" />
              <p id="painel-erros-total" className="text-base font-bold text-slate-900 dark:text-slate-100">
                {erros === 0 ? 'Nenhum erro para revisar.' : `${plural(erros, 'erro', 'erros')} em questões de residência`}
              </p>
            </div>
            <button type="button" id="painel-abrir-caderno" onClick={() => onSelectView('errors')} className={secondaryButtonClass}>
              <span>Abrir caderno de erros</span>
              <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </button>
          </>
        )}
      </section>

      {/* ── 5. Atalhos ── */}
      <section aria-labelledby="painel-atalhos-titulo" data-painel-bloco="atalhos" className={cardClass}>
        <h2 id="painel-atalhos-titulo" className={titleClass}>
          Atalhos
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {onTestarOQueLi && (
            <button type="button" id="painel-testar-o-que-li" onClick={onTestarOQueLi} className={secondaryButtonClass}>
              <BookOpenCheck className="w-4 h-4" aria-hidden="true" />
              <span>Testar o que li</span>
            </button>
          )}
          <button type="button" id="painel-fazer-questoes" onClick={() => onSelectView('questions')} className={secondaryButtonClass}>
            <HelpCircle className="w-4 h-4" aria-hidden="true" />
            <span>Fazer questões</span>
          </button>
          <button type="button" id="painel-simulado" onClick={() => onSelectView('simulados')} className={secondaryButtonClass}>
            <Timer className="w-4 h-4" aria-hidden="true" />
            <span>Simulado</span>
          </button>
        </div>
      </section>
    </div>
  );
};
