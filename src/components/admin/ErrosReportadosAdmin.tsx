import React, { useMemo, useState } from 'react';
import {
  materialErrorReportsRepository,
  type ReporteDeErro,
} from '../../repositories/MaterialErrorReportsRepository';
import { useServerLoad } from '../../hooks/useServerLoad';
import { ConnectionNotice } from '../common/ConnectionNotice';
import { getErrorMessage } from '../../utils/errorMessage';
import { dataDoEnvio } from '../material/ListaDeEnvios';

// Aba "Erros reportados" da Área Editorial (44-G): os erros que os usuários
// apontaram em materiais publicados, com o material, o trecho, o texto, quem e
// quando. O admin marca como resolvido. O texto é de um usuário: aparece só como
// texto puro (nunca HTML nem Markdown).

export const ErrosReportadosAdmin: React.FC = () => {
  const [reportes, setReportes] = useState<ReporteDeErro[]>([]);
  const [ocupadoId, setOcupadoId] = useState<string | null>(null);
  const [aviso, setAviso] = useState('');
  const { status, reload } = useServerLoad(async () => {
    const lista = await materialErrorReportsRepository.listAll();
    return () => setReportes(lista);
  }, 'erros-reportados-admin');

  // Abertos primeiro; dentro de cada grupo, do mais novo para o mais antigo (a lista já vem assim).
  const ordenados = useMemo(
    () => [...reportes].sort((a, b) => Number(a.status === 'resolvido') - Number(b.status === 'resolvido')),
    [reportes],
  );
  const abertos = reportes.filter((r) => r.status === 'aberto').length;

  const resolver = async (reporte: ReporteDeErro) => {
    setOcupadoId(reporte.id);
    setAviso('');
    try {
      await materialErrorReportsRepository.resolve(reporte.id);
      await reload();
    } catch (err) {
      setAviso(`Não foi possível marcar como resolvido. ${getErrorMessage(err)}`);
    } finally {
      setOcupadoId(null);
    }
  };

  return (
    <div id="admin-erros-reportados" className="space-y-4">
      <div className="bg-white dark:bg-[#0F172A] p-4 rounded-xl border border-stone-200 dark:border-[#243452] elev-xs">
        <h3 className="font-serif-reading text-base font-bold text-stone-900 dark:text-slate-100">Erros reportados</h3>
        <p className="text-[11px] text-stone-500 dark:text-slate-400">
          Erros que usuários apontaram em materiais publicados. Abertos primeiro.{' '}
          <span data-testid="erros-abertos">
            {abertos === 0 ? 'Nenhum erro aberto.' : `${abertos} aberto${abertos > 1 ? 's' : ''}.`}
          </span>
        </p>
      </div>
      <ConnectionNotice status={status} />
      {aviso && (
        <p role="alert" className="text-xs text-rose-800 dark:text-rose-300">
          {aviso}
        </p>
      )}
      {reportes.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">Nenhum erro foi reportado ainda.</p>
      ) : (
        <ul id="admin-erros-lista" className="space-y-2">
          {ordenados.map((r) => (
            <li
              key={r.id}
              data-status={r.status}
              className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col gap-1.5"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 min-w-0 break-words">
                  {r.materialTitle}
                </p>
                <span
                  className={`shrink-0 px-2 py-0.5 rounded-md text-xs font-semibold ${
                    r.status === 'aberto'
                      ? 'bg-amber-100 dark:bg-amber-950/50 text-amber-900 dark:text-amber-200'
                      : 'bg-emerald-100 dark:bg-emerald-950/50 text-emerald-900 dark:text-emerald-200'
                  }`}
                >
                  {r.status === 'aberto' ? 'Aberto' : 'Resolvido'}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Reportado em {dataDoEnvio(r.createdAt)}
                {r.reporter ? ` · por ${r.reporter.name || r.reporter.email}` : ''}
                {r.status === 'resolvido' && r.resolvedAt ? ` · resolvido em ${dataDoEnvio(r.resolvedAt)}` : ''}
              </p>
              <p data-testid="reporte-texto" className="text-sm text-slate-800 dark:text-slate-200 whitespace-pre-wrap break-words">
                {r.description}
              </p>
              {r.excerpt && (
                <blockquote
                  data-testid="reporte-trecho"
                  className="pl-3 border-l-2 border-slate-300 dark:border-slate-600 text-xs text-slate-600 dark:text-slate-300 whitespace-pre-wrap break-words"
                >
                  {r.excerpt}
                </blockquote>
              )}
              {r.status === 'aberto' && (
                <div className="pt-1">
                  <button
                    type="button"
                    disabled={ocupadoId === r.id}
                    onClick={() => void resolver(r)}
                    className="min-h-11 px-3 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 disabled:bg-slate-300 text-white text-xs font-semibold cursor-pointer"
                  >
                    {ocupadoId === r.id ? 'Marcando…' : 'Marcar como resolvido'}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
