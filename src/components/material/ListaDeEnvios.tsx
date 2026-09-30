import React, { useState } from 'react';
import { ClipboardCopy, Check } from 'lucide-react';
import type { Discipline, Theme } from '../../types';
import type { MaterialReviewView, MaterialSubmission } from '../../repositories/MaterialSubmissionsRepository';
import { estadoEmPalavras } from '../../utils/envioDeMaterial';
import { dividirEmBlocos } from '../../utils/padraoMaterial';
import { copiarTexto } from '../../utils/areaDeTransferencia';
import { SafeMarkdown } from '../common/SafeMarkdown';

// Lista de envios — a mesma para "Meus envios" (estudante) e para a aba de
// envios da Área Editorial (admin, só leitura nesta unidade).
//
// 44-G: envio "publicado" tem o link para o material; o recado do servidor (ex.:
// título repetido) aparece junto do estado.
//
// 44-F: cada envio mostra o veredito da revisão de IA em palavras leigas, os
// achados e o bloco de correção. O texto vem da IA: é renderizado só por
// SafeMarkdown (AGENTS.md, risco 15) e por <pre> de texto puro para código —
// nunca como HTML.

interface ListaDeEnviosProps {
  id: string;
  envios: MaterialSubmission[];
  disciplines: Discipline[];
  themes: Theme[];
  /** Admin: mostra quem enviou. */
  mostrarAutor?: boolean;
  vazio: string;
  /** Frase que explica por que os envios "aguardando revisão" esperam (limite de custo). */
  avisoDaFila?: string | null;
  /** Estudante: substituir o texto de um envio "não apto" ou "erro". */
  onCorrigir?: (envio: MaterialSubmission) => void;
  /** Estudante: mandar o mesmo texto de novo (envio "erro"). */
  onTentarDeNovo?: (envio: MaterialSubmission) => void;
  /** 44-G: abre o material publicado a partir deste envio. */
  onAbrirMaterial?: (materialId: string) => void;
  ocupadoId?: string | null;
}

export function dataDoEnvio(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

/** Texto da IA (Markdown) sem HTML: código em <pre> de texto puro, o resto por SafeMarkdown. */
export const TextoDaIA: React.FC<{ texto: string }> = ({ texto }) => (
  <div className="space-y-3">
    {dividirEmBlocos(texto).map((bloco, i) =>
      bloco.tipo === 'codigo' ? (
        <pre
          key={i}
          className="overflow-x-auto whitespace-pre-wrap break-words p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs leading-relaxed text-slate-800 dark:text-slate-200 font-mono"
        >
          {bloco.conteudo}
        </pre>
      ) : (
        <SafeMarkdown key={i} content={bloco.conteudo} className="text-sm" />
      ),
    )}
  </div>
);

const BlocoDeCorrecao: React.FC<{ texto: string }> = ({ texto }) => {
  const [copiado, setCopiado] = useState(false);
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">Bloco de correção</p>
      <p className="text-xs text-slate-500 dark:text-slate-400">
        Cole este texto na conversa de quem escreveu o material (a IA que o criou) para corrigir só o que a revisão
        apontou.
      </p>
      <pre
        data-testid="bloco-de-correcao"
        className="max-h-72 overflow-auto whitespace-pre-wrap break-words p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs leading-relaxed text-slate-800 dark:text-slate-200 font-mono"
      >
        {texto}
      </pre>
      <button
        type="button"
        onClick={async () => {
          setCopiado(await copiarTexto(texto));
        }}
        className="min-h-11 px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800"
      >
        {copiado ? <Check className="w-4 h-4" aria-hidden="true" /> : <ClipboardCopy className="w-4 h-4" aria-hidden="true" />}
        <span>{copiado ? 'Copiado' : 'Copiar bloco de correção'}</span>
      </button>
    </div>
  );
};

const RevisaoDoEnvio: React.FC<{ revisao: MaterialReviewView }> = ({ revisao }) => {
  if (!revisao.findingsText && !revisao.correctionBlock) return null;
  return (
    <details className="mt-1">
      <summary className="text-xs font-semibold text-teal-700 dark:text-teal-400 cursor-pointer select-none min-h-8 flex items-center">
        Ver a revisão
      </summary>
      <div className="mt-2 space-y-4" data-testid="revisao-do-envio">
        {revisao.findingsText && <TextoDaIA texto={revisao.findingsText} />}
        {revisao.correctionBlock && <BlocoDeCorrecao texto={revisao.correctionBlock} />}
      </div>
    </details>
  );
};

export const ListaDeEnvios: React.FC<ListaDeEnviosProps> = ({
  id,
  envios,
  disciplines,
  themes,
  mostrarAutor = false,
  vazio,
  avisoDaFila,
  onCorrigir,
  onTentarDeNovo,
  onAbrirMaterial,
  ocupadoId,
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
        const podeCorrigir = onCorrigir && (envio.status === 'nao_apto' || envio.status === 'erro');
        const podeTentarDeNovo = onTentarDeNovo && envio.status === 'erro';
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
            {envio.publicationNote && envio.status !== 'publicado' && (
              <p data-testid="recado-do-servidor" className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
                {envio.publicationNote}
              </p>
            )}
            {envio.status === 'publicado' && envio.publishedMaterialId && onAbrirMaterial && (
              <div className="pt-1">
                <button
                  type="button"
                  data-testid="abrir-material-publicado"
                  onClick={() => onAbrirMaterial(envio.publishedMaterialId as string)}
                  className="min-h-11 px-3 py-2 rounded-xl border border-teal-600 text-teal-700 dark:text-teal-300 dark:border-teal-500 bg-white dark:bg-slate-900 text-xs font-semibold cursor-pointer hover:bg-teal-50 dark:hover:bg-teal-950/40"
                >
                  Abrir o material publicado
                </button>
              </div>
            )}
            {envio.status === 'aguardando_revisao' && avisoDaFila && (
              <p data-testid="aviso-da-fila" className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
                {avisoDaFila}
              </p>
            )}
            {envio.review && envio.status !== 'aguardando_revisao' && envio.status !== 'em_revisao' && (
              <RevisaoDoEnvio revisao={envio.review} />
            )}
            {(podeCorrigir || podeTentarDeNovo) && (
              <div className="flex flex-wrap gap-2 pt-1">
                {podeCorrigir && (
                  <button
                    type="button"
                    disabled={ocupadoId === envio.id}
                    onClick={() => onCorrigir?.(envio)}
                    className="min-h-11 px-3 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 disabled:bg-slate-300 text-white text-xs font-semibold cursor-pointer"
                  >
                    Corrigir e enviar de novo
                  </button>
                )}
                {podeTentarDeNovo && (
                  <button
                    type="button"
                    disabled={ocupadoId === envio.id}
                    onClick={() => onTentarDeNovo?.(envio)}
                    className="min-h-11 px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-800 dark:text-slate-200 cursor-pointer disabled:opacity-60"
                  >
                    {ocupadoId === envio.id ? 'Enviando…' : 'Tentar de novo com o mesmo texto'}
                  </button>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
};
