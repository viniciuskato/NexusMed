import React from 'react';
import type { CompendiumSection } from '../../types';
import { secaoCitaReferencia } from '../../utils/compendiumStandardCheck';

// EVID-1 (D-14) — a biblioteca é baseada em evidências: a leitura diz em quantas referências o material se baseia e
// quantas partes têm citação (todo mundo vê), e o admin vê quais partes estão sem fonte. Presentacionais, como os de
// `DatasDoMaterial`. Quem conta "cita" é a mesma função da checagem do padrão (`secaoCitaReferencia`).

interface ResumoProps {
  secoes: CompendiumSection[];
  /** Quantas referências o material tem. */
  totalDeReferencias: number;
  className?: string;
  /** O que abre a linha, como o separador das datas ao lado. */
  separador?: string;
  comSeparadorInicial?: boolean;
}

/** "Baseado em N referências · M de K partes com citação", ou "Este material ainda não tem referências.". */
export const ResumoDasFontes: React.FC<ResumoProps> = ({ secoes, totalDeReferencias, className, separador = '•', comSeparadorInicial = false }) => {
  const comCitacao = secoes.filter(secaoCitaReferencia).length;
  const texto =
    totalDeReferencias === 0
      ? 'Este material ainda não tem referências.'
      : `Baseado em ${totalDeReferencias} ${totalDeReferencias === 1 ? 'referência' : 'referências'} · ${comCitacao} de ${secoes.length} ${
          secoes.length === 1 ? 'parte' : 'partes'
        } com citação`;
  return (
    <span className={className ?? 'contents'}>
      {comSeparadorInicial && <span aria-hidden="true">{separador}</span>}
      <span data-testid="base-de-evidencias">{texto}</span>
    </span>
  );
};

interface SeloProps {
  secao: Pick<CompendiumSection, 'content' | 'keyTakeaways' | 'clinicalPearl' | 'warningAlert' | 'examConsensus'>;
  /** Só o admin vê o selo. */
  ehAdmin: boolean;
}

/** "Sem fonte nesta parte": a seção não cita nenhuma referência. Admin apenas; com citação, nada. */
export const SeloSemFonte: React.FC<SeloProps> = ({ secao, ehAdmin }) => {
  if (!ehAdmin || secaoCitaReferencia(secao)) return null;
  return (
    <span
      data-testid="selo-sem-fonte"
      title="Esta parte do material não cita nenhuma referência"
      className="inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800"
    >
      Sem fonte nesta parte
    </span>
  );
};
