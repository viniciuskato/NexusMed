import React, { useMemo, useState } from 'react';
import { ChevronRight, Library } from 'lucide-react';
import type { Compendium, Discipline } from '../../types';
import { EstadoDeLeitura, LeituraDoMaterial, minhaLeitura } from './painelDados';
import { cardClass, secondaryButtonClass, subtitleClass, titleClass } from './painelEstilos';

// PAINEL-2 — "Minha leitura": o que já li e o que falta. Total em partes
// (seções), barra por disciplina e a lista de materiais com o estado de cada um.

interface MinhaLeituraBlocoProps {
  /** Materiais e progresso já vieram do servidor. */
  pronto: boolean;
  /** Ainda carregando (sem falha): mostra "Carregando…". */
  esperando: boolean;
  disciplines: Discipline[];
  compendiums: Compendium[];
  readingProgress: Record<string, { readSectionIds: string[]; percent: number }>;
  onOpenCompendium: (compendiumId: string) => void;
  onAbrirBiblioteca: () => void;
}

type Filtro = 'todos' | 'falta';

/** Quantos materiais a lista mostra de início: o acervo inteiro empurraria o resto do Início para baixo no celular. */
export const MATERIAIS_NA_LISTA = 5;

function textoDoEstado(material: LeituraDoMaterial): string {
  if (material.estado === 'lido') return 'Lido';
  if (material.estado === 'lendo') return `Lendo — ${material.percentual}%`;
  return 'Não comecei';
}

const corDoEstado: Record<EstadoDeLeitura, string> = {
  'nao-comecei': 'text-slate-600 dark:text-slate-300',
  lendo: 'text-teal-800 dark:text-teal-300',
  lido: 'text-emerald-700 dark:text-emerald-300',
};

export const MinhaLeituraBloco: React.FC<MinhaLeituraBlocoProps> = ({
  pronto,
  esperando,
  disciplines,
  compendiums,
  readingProgress,
  onOpenCompendium,
  onAbrirBiblioteca,
}) => {
  const [filtro, setFiltro] = useState<Filtro>('falta');
  const [verTodos, setVerTodos] = useState(false);
  const leitura = useMemo(
    () => (pronto ? minhaLeitura(disciplines, compendiums, readingProgress) : null),
    [pronto, disciplines, compendiums, readingProgress]
  );
  // Os materiais do filtro, na ordem das disciplinas; a lista mostra os primeiros, a menos que se peça "Ver todos".
  const listados = useMemo(
    () =>
      (leitura?.disciplinas ?? []).flatMap((d) => d.materiais.filter((m) => filtro === 'todos' || m.estado !== 'lido')),
    [leitura, filtro]
  );
  const mostrados = useMemo(
    () => new Set((verTodos ? listados : listados.slice(0, MATERIAIS_NA_LISTA)).map((m) => m.compendiumId)),
    [listados, verTodos]
  );

  const botaoFiltro = (valor: Filtro, texto: string) => (
    <button
      type="button"
      aria-pressed={filtro === valor}
      onClick={() => {
        setFiltro(valor);
        setVerTodos(false);
      }}
      className={`min-h-11 px-4 py-2 rounded-xl text-sm font-bold border cursor-pointer transition-colors ${
        filtro === valor
          ? 'bg-teal-600/15 dark:bg-teal-400/20 text-teal-900 dark:text-teal-100 border-teal-600/40 dark:border-teal-400/50'
          : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#142038] border-slate-300 dark:border-[#243452]'
      }`}
    >
      {texto}
    </button>
  );

  return (
    <section aria-labelledby="painel-leitura-titulo" data-painel-bloco="leitura" className={cardClass}>
      <h2 id="painel-leitura-titulo" className={titleClass}>
        Minha leitura
      </h2>

      {esperando ? (
        <p role="status" className="text-sm text-slate-500 dark:text-slate-400">
          Carregando…
        </p>
      ) : !leitura ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">A sua leitura aparece quando a conexão voltar.</p>
      ) : leitura.total === 0 ? (
        <div className="space-y-3">
          <p id="painel-sem-materiais" className="text-sm text-slate-600 dark:text-slate-300">
            Ainda não há materiais publicados.
          </p>
          <button type="button" onClick={onAbrirBiblioteca} className={secondaryButtonClass}>
            <Library className="w-4 h-4" aria-hidden="true" />
            <span>Abrir biblioteca</span>
          </button>
        </div>
      ) : (
        <>
          <div className="space-y-2">
            <p id="painel-leitura-total" className="text-lg font-bold text-slate-900 dark:text-slate-100">
              Você leu {leitura.lidas} de {leitura.total} {leitura.total === 1 ? 'parte' : 'partes'}
            </p>
            <div
              className="h-3 w-full rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden"
              role="progressbar"
              aria-label="Parte dos materiais que você já leu"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={leitura.percentual}
            >
              <div className="h-full rounded-full bg-teal-600 dark:bg-teal-400" style={{ width: `${leitura.percentual}%` }} />
            </div>
          </div>

          <ul id="painel-leitura-disciplinas" className="space-y-3" aria-label="Quanto você leu em cada disciplina">
            {leitura.disciplinas.map((disciplina) => (
              <li key={disciplina.disciplineId} data-leitura-disciplina={disciplina.disciplineId} className="space-y-1">
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate font-semibold text-slate-800 dark:text-slate-100">{disciplina.nome}</span>
                  <span className="shrink-0 font-black tabular-nums text-slate-900 dark:text-slate-100">{disciplina.percentual}%</span>
                </div>
                <div
                  className="h-2.5 w-full rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden"
                  role="progressbar"
                  aria-label={`Leitura de ${disciplina.nome}`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={disciplina.percentual}
                >
                  <div className="h-full rounded-full bg-teal-600 dark:bg-teal-400" style={{ width: `${disciplina.percentual}%` }} />
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300">
                  {disciplina.lidas} de {disciplina.total} {disciplina.total === 1 ? 'parte' : 'partes'}
                </p>
              </li>
            ))}
          </ul>

          <div className="space-y-3 pt-1">
            <div className="flex items-center gap-2" role="group" aria-label="Quais materiais mostrar">
              {botaoFiltro('falta', 'Falta ler')}
              {botaoFiltro('todos', 'Todos')}
            </div>

            {leitura.disciplinas.map((disciplina) => {
              const materiais = disciplina.materiais.filter((m) => mostrados.has(m.compendiumId));
              if (materiais.length === 0) return null;
              return (
                <div key={disciplina.disciplineId} data-leitura-grupo={disciplina.disciplineId} className="space-y-2">
                  <h3 className={subtitleClass}>{disciplina.nome}</h3>
                  <ul className="space-y-2">
                    {materiais.map((material) => (
                      <li key={material.compendiumId}>
                        <button
                          type="button"
                          data-material-leitura={material.compendiumId}
                          onClick={() => onOpenCompendium(material.compendiumId)}
                          className="w-full min-h-12 text-left rounded-2xl border border-slate-200/80 dark:border-[#243452] bg-slate-50 dark:bg-[#142038] hover:border-teal-500/60 px-4 py-3 flex items-center gap-3 cursor-pointer transition-colors"
                        >
                          <span className="min-w-0 flex-1 font-semibold text-slate-900 dark:text-slate-100 break-words">
                            {material.titulo}
                          </span>
                          <span data-estado-leitura={material.estado} className={`shrink-0 text-sm font-bold ${corDoEstado[material.estado]}`}>
                            {textoDoEstado(material)}
                          </span>
                          <ChevronRight className="w-4 h-4 shrink-0 text-slate-400" aria-hidden="true" />
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}

            {listados.length > MATERIAIS_NA_LISTA && (
              <button
                type="button"
                id="painel-leitura-ver-todos"
                aria-expanded={verTodos}
                onClick={() => setVerTodos((aberto) => !aberto)}
                className={secondaryButtonClass}
              >
                <span>{verTodos ? 'Mostrar menos' : `Ver todos (${listados.length})`}</span>
              </button>
            )}

            {filtro === 'falta' && leitura.disciplinas.every((d) => d.materiais.every((m) => m.estado === 'lido')) && (
              <p id="painel-leitura-tudo-lido" role="status" className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">
                Você já leu todos os materiais publicados.
              </p>
            )}
          </div>
        </>
      )}
    </section>
  );
};
