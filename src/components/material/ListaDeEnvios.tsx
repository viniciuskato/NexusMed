import React from 'react';
import type { Discipline, Theme } from '../../types';
import type { MaterialSubmission } from '../../repositories/MaterialSubmissionsRepository';
import { estadoEmPalavras } from '../../utils/envioDeMaterial';

// Lista de envios — a mesma para "Meus envios" (estudante) e para a aba de
// envios da Área Editorial (admin, só leitura nesta unidade).

interface ListaDeEnviosProps {
  id: string;
  envios: MaterialSubmission[];
  disciplines: Discipline[];
  themes: Theme[];
  /** Admin: mostra quem enviou. */
  mostrarAutor?: boolean;
  vazio: string;
}

export function dataDoEnvio(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

export const ListaDeEnvios: React.FC<ListaDeEnviosProps> = ({
  id,
  envios,
  disciplines,
  themes,
  mostrarAutor = false,
  vazio,
}) => {
  if (envios.length === 0) {
    return <p className="text-sm text-slate-500 dark:text-slate-400">{vazio}</p>;
  }
  return (
    <ul id={id} className="space-y-2">
      {envios.map((envio) => {
        const estado = estadoEmPalavras(envio.status);
        const disciplina = disciplines.find((d) => d.id === envio.disciplineId)?.name;
        const tema = themes.find((t) => t.id === envio.themeId)?.name;
        return (
          <li
            key={envio.id}
            data-status={envio.status}
            className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col gap-1"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 min-w-0 break-words">{envio.title}</p>
              <span className="shrink-0 px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-xs font-semibold text-slate-800 dark:text-slate-200">
                {estado.rotulo}
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Enviado em {dataDoEnvio(envio.createdAt)}
              {disciplina ? ` · ${disciplina}` : ''}
              {tema ? ` › ${tema}` : ''}
              {mostrarAutor && envio.author ? ` · por ${envio.author.name || envio.author.email}` : ''}
            </p>
            {estado.explicacao && (
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">{estado.explicacao}</p>
            )}
          </li>
        );
      })}
    </ul>
  );
};
