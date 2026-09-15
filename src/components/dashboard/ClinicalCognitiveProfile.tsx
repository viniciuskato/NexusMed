import React, { useMemo } from 'react';
import {
  Stethoscope,
  ShieldCheck,
  Target,
  Sparkles,
  TrendingUp,
  BrainCircuit,
  ArrowRight,
} from 'lucide-react';
import { Question, QuestionAnswerRecord, ErrorLogItem } from '../../types';

interface ClinicalCognitiveProfileProps {
  answers: Record<string, QuestionAnswerRecord>;
  questions: Question[];
  errorLogs: ErrorLogItem[];
  onSelectView: (view: string) => void;
}

export const ClinicalCognitiveProfile: React.FC<ClinicalCognitiveProfileProps> = ({
  answers,
  questions,
  errorLogs,
  onSelectView,
}) => {
  const answeredList = useMemo(() => Object.values(answers), [answers]);

  const profileAnalysis = useMemo(() => {
    const total = answeredList.length;
    if (total === 0) {
      return {
        title: 'Calibrando Linha de Base',
        archetype: 'Médico Residente em Formação',
        badgeColor: 'text-teal-700 bg-teal-50 border-teal-200 dark:bg-teal-950/60 dark:text-teal-300 dark:border-teal-800',
        summary: 'Responda suas primeiras questões e simulados para que o NexusMed mapeie seu perfil cognitivo de raciocínio clínico e resistência a pegadinhas de bancas.',
        scores: {
          clinicalReasoning: 60,
          trapResistance: 60,
          guidelineKnowledge: 60,
          consistency: 50,
        },
        prescription: 'Inicie com 15 a 20 questões temáticas na sua especialidade de maior conforto para calibrar a taxa de acerto inicial.',
      };
    }

    const correctCount = answeredList.filter((a) => a.isCorrect).length;
    const generalAccuracy = Math.round((correctCount / total) * 100);

    // Contabiliza causas de erros
    let trapErrors = 0;
    let theoryErrors = 0;
    let attentionErrors = 0;

    for (const log of errorLogs) {
      if (log.errorReason === 'pegadinha') trapErrors++;
      if (log.errorReason === 'lacuna_teorica') theoryErrors++;
      if (log.errorReason === 'falta_atencao') attentionErrors++;
    }

    const totalErrors = Math.max(1, total - correctCount);
    const trapPercent = Math.round((trapErrors / totalErrors) * 100);
    const theoryPercent = Math.round((theoryErrors / totalErrors) * 100);

    // Índices de 0 a 100
    const clinicalReasoning = Math.min(98, Math.max(20, generalAccuracy + 5));
    const trapResistance = Math.min(98, Math.max(15, 100 - trapPercent));
    const guidelineKnowledge = Math.min(98, Math.max(15, 100 - theoryPercent));
    const consistency = Math.min(98, Math.max(20, Math.round((correctCount / Math.max(10, total)) * 100)));

    if (generalAccuracy >= 75 && trapResistance >= 70) {
      return {
        title: 'Clínico Investigador de Alto Rendimento',
        archetype: 'Estrategista de Provas R1 / R3',
        badgeColor: 'text-emerald-700 bg-emerald-50 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800',
        summary: 'Elevada precisão diagnóstica e filtro refinado contra distratores complexos de bancas como USP e ENARE. Seu raciocínio converge com as diretrizes oficiais de conduta médica.',
        scores: {
          clinicalReasoning,
          trapResistance,
          guidelineKnowledge,
          consistency,
        },
        prescription: 'Seu patamar é competitivo para as instituições mais disputadas do país. Mantenha o giro de flashcards de SRS ativos para não perder detalhes de condutas raras e treine simulados cronometrados sob pressão de tempo.',
      };
    }

    if (trapPercent > 35) {
      return {
        title: 'Clínico Intuitivo (Atenção a Distratores)',
        archetype: 'Vulnerável a Pegadinhas de Bancas',
        badgeColor: 'text-amber-700 bg-amber-50 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800',
        summary: 'Você domina os conceitos clínicos essenciais, mas tende a ser atraído por alternativas parcialmente corretas ou distratores semânticos montados pelas bancas examinadoras.',
        scores: {
          clinicalReasoning,
          trapResistance,
          guidelineKnowledge,
          consistency,
        },
        prescription: 'Antes de marcar a alternativa aparente, force a técnica de eliminação sistemática: justifique mentalmente por que as outras 3 ou 4 opções são falsas segundo os consensos.',
      };
    }

    if (theoryPercent > 40) {
      return {
        title: 'Clínico Analítico em Consolidação Teórica',
        archetype: 'Foco em Diretrizes & Consensos',
        badgeColor: 'text-indigo-700 bg-indigo-50 border-indigo-200 dark:bg-indigo-950/60 dark:text-indigo-300 dark:border-indigo-800',
        summary: 'Excelente interpretação de casos clínicos, com pequenas lacunas em notas de rodapé, critérios diagnósticos tabelados e dosagens de primeira linha.',
        scores: {
          clinicalReasoning,
          trapResistance,
          guidelineKnowledge,
          consistency,
        },
        prescription: 'Faça a leitura prévia das seções destacadas da Biblioteca Médica antes de iniciar blocos de questões daquela disciplina. Concentre-se nas caixas de Regra de Ouro.',
      };
    }

    return {
      title: 'Clínico Pragmático em Ascensão',
      archetype: 'Evolução Contínua de Acurácia',
      badgeColor: 'text-teal-700 bg-teal-50 border-teal-200 dark:bg-teal-950/60 dark:text-teal-300 dark:border-teal-800',
      summary: 'Bom equilíbrio entre assimilação teórica e resolução prática. A regularidade diária na plataforma será o divisor de águas para atingir a zona de corte das residências de referência.',
      scores: {
        clinicalReasoning,
        trapResistance,
        guidelineKnowledge,
        consistency,
      },
      prescription: 'Aumente gradualmente o volume de questões no modo cronometrado e alimente o Caderno de Erros com anotações de próprio punho após cada erro.',
    };
  }, [answeredList, errorLogs]);

  return (
    <div className="p-6 sm:p-8 rounded-3xl bg-white dark:bg-[#0F172A] border border-slate-200/90 dark:border-[#243452] elev-sm space-y-6">
      {/* Topo do Perfil */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800 flex items-center justify-center shrink-0">
            <Stethoscope className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">
                NexusMed Cognition Engine
              </span>
              <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black border ${profileAnalysis.badgeColor}`}>
                {profileAnalysis.archetype}
              </span>
            </div>
            <h3 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white tracking-tight">
              {profileAnalysis.title}
            </h3>
          </div>
        </div>

        <button
          type="button"
          onClick={() => onSelectView('questions')}
          className="self-start md:self-auto px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-teal-50 dark:hover:bg-teal-950/50 text-slate-700 dark:text-slate-200 hover:text-teal-700 dark:hover:text-teal-300 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer border border-slate-200 dark:border-slate-700"
        >
          <span>Afinar Diagnóstico</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Descrição & Prescrição do Preceptor */}
        <div className="lg:col-span-7 space-y-4">
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed font-serif-reading">
            {profileAnalysis.summary}
          </p>

          <div className="p-4 rounded-2xl bg-teal-500/10 dark:bg-teal-950/30 border border-teal-500/20 text-teal-950 dark:text-teal-100 space-y-1.5">
            <div className="flex items-center gap-1.5 text-teal-700 dark:text-teal-400 font-bold text-xs uppercase tracking-wider">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Prescrição Estratégica do Preceptor</span>
            </div>
            <p className="text-xs leading-relaxed text-slate-700 dark:text-slate-200">
              {profileAnalysis.prescription}
            </p>
          </div>
        </div>

        {/* 4 Eixos Cognitivos de Desempenho */}
        <div className="lg:col-span-5 space-y-3 p-4 rounded-2xl bg-slate-50 dark:bg-[#142038] border border-slate-200/80 dark:border-slate-800">
          <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-400 mb-2">
            Matriz de Competências Clínicas
          </h4>

          {/* Eixo 1: Raciocínio Clínico */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs font-semibold">
              <span className="text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <BrainCircuit className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                Raciocínio Clínico & Conduta
              </span>
              <span className="font-mono text-teal-700 dark:text-teal-400 font-bold">
                {profileAnalysis.scores.clinicalReasoning}%
              </span>
            </div>
            <div className="w-full bg-slate-200 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full bg-teal-500 transition-all duration-700"
                style={{ width: `${profileAnalysis.scores.clinicalReasoning}%` }}
              />
            </div>
          </div>

          {/* Eixo 2: Resistência a Pegadinhas */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs font-semibold">
              <span className="text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                Filtro Anti-Distratores de Bancas
              </span>
              <span className="font-mono text-emerald-700 dark:text-emerald-400 font-bold">
                {profileAnalysis.scores.trapResistance}%
              </span>
            </div>
            <div className="w-full bg-slate-200 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all duration-700"
                style={{ width: `${profileAnalysis.scores.trapResistance}%` }}
              />
            </div>
          </div>

          {/* Eixo 3: Domínio de Diretrizes */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs font-semibold">
              <span className="text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <Target className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                Consensos & Guidelines Oficiais
              </span>
              <span className="font-mono text-indigo-700 dark:text-indigo-400 font-bold">
                {profileAnalysis.scores.guidelineKnowledge}%
              </span>
            </div>
            <div className="w-full bg-slate-200 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full bg-indigo-500 transition-all duration-700"
                style={{ width: `${profileAnalysis.scores.guidelineKnowledge}%` }}
              />
            </div>
          </div>

          {/* Eixo 4: Consistência de Rotina */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs font-semibold">
              <span className="text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                Consistência Sináptica
              </span>
              <span className="font-mono text-amber-700 dark:text-amber-400 font-bold">
                {profileAnalysis.scores.consistency}%
              </span>
            </div>
            <div className="w-full bg-slate-200 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full bg-amber-500 transition-all duration-700"
                style={{ width: `${profileAnalysis.scores.consistency}%` }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
