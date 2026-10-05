import React from 'react';
import type { Compendium } from '../../types';
import { datasDoMaterial } from '../../utils/datasDoMaterial';
import { padraoDesatualizado } from '../../utils/compendiumStandardCheck';

// MAT-1 — "Publicado em" / "Atualizado em" (todo mundo vê) e o selo "Desatualizado" (só o admin). Presentacionais:
// quem renderiza decide quem é admin (`useEhAdmin`), para o componente não depender do contexto de login.

interface DatasProps {
  compendium: Pick<Compendium, 'publishedAt' | 'lastUpdated'>;
  className?: string;
  /** O que separa as datas (e, com `comSeparadorInicial`, a abre). */
  separador?: string;
  comSeparadorInicial?: boolean;
}

/** "Publicado em dd/mm/aaaa" e, se for outro dia, "Atualizado em dd/mm/aaaa". Nada quando não há data. */
export const DatasDoMaterial: React.FC<DatasProps> = ({ compendium, className, separador = '·', comSeparadorInicial = false }) => {
  const { publicado, atualizado } = datasDoMaterial(compendium);
  if (!publicado && !atualizado) return null;
  return (
    <span data-testid="datas-do-material" className={className ?? 'flex flex-wrap items-center gap-x-2'}>
      {comSeparadorInicial && <span aria-hidden="true">{separador}</span>}
      {publicado && <span data-testid="publicado-em">{`Publicado em ${publicado}`}</span>}
      {publicado && atualizado && <span aria-hidden="true">{separador}</span>}
      {atualizado && <span data-testid="atualizado-em">{`Atualizado em ${atualizado}`}</span>}
    </span>
  );
};

interface SeloProps {
  compendium: Pick<Compendium, 'standardVersion'>;
  /** Só o admin vê o selo. */
  ehAdmin: boolean;
  className?: string;
}

/** "Desatualizado": versão do padrão desconhecida ou anterior à atual. Admin apenas; na versão atual, nada. */
export const SeloDesatualizado: React.FC<SeloProps> = ({ compendium, ehAdmin, className }) => {
  if (!ehAdmin || !padraoDesatualizado(compendium.standardVersion)) return null;
  return (
    <span
      data-testid="selo-desatualizado"
      title="Escrito num padrão anterior ao atual"
      className={
        className ??
        'inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
      }
    >
      Desatualizado
    </span>
  );
};
