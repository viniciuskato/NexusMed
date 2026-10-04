import React, { useState } from 'react';
import { ClipboardCopy, Check } from 'lucide-react';
import type { Discipline, Theme } from '../../types';
import type { MaterialReviewView, MaterialSubmission } from '../../repositories/MaterialSubmissionsRepository';
import type { QuestionSubmission } from '../../repositories/QuestionSubmissionsRepository';
import { estadoEmPalavras } from '../../utils/envioDeMaterial';
import { dividirEmBlocos } from '../../utils/padraoMaterial';
import { copiarTexto } from '../../utils/areaDeTransferencia';
import { SafeMarkdown } from '../common/SafeMarkdown';
import type { ResultadoDaAcao } from '../../utils/publicarEnvioPeloAdmin';
import { PublicarEnvioDoAdmin } from './PublicarEnvioDoAdmin';

// Lista de envios — a mesma para "Meus envios" (estudante) e para a aba de
// envios da Área Editorial (admin, que também publica o envio, P8).
//
// 44-G: envio "publicado" tem o link para o material; o recado do servidor (ex.:
// título repetido) aparece junto do estado.
//
// 44-F: cada envio mostra o veredito da revisão de IA em palavras leigas, os
// achados e o bloco de correção. O texto vem da IA: é renderizado só por
// SafeMarkdown (AGENTS.md, risco 15) e por <pre> de texto puro para código —
// nunca como HTML.

/** Os dois tipos de envio (o de questões traz `kind: 'questoes'`). */
export type EnvioDaLista = MaterialSubmission | QuestionSubmission;

interface ListaDeEnviosProps {
  id: string;
  envios: EnvioDaLista[];
  disciplines: Discipline[];
  themes: Theme[];
  /** Admin: mostra quem enviou. */
  mostrarAutor?: boolean;
  vazio: string;
  /** Frase que explica por que os envios "aguardando revisão" esperam (limite de custo). */
  avisoDaFila?: string | null;
  /** Estudante: substituir o texto de um envio "não apto" ou "erro". */
  onCorrigir?: (envio: EnvioDaLista) => void;
  /** Estudante: mandar o mesmo texto de novo (envio "erro"). */
  onTentarDeNovo?: (envio: EnvioDaLista) => void;
  /** 44-G: abre o material publicado a partir deste envio. */
  onAbrirMaterial?: (materialId: string) => void;
  /** 44-H2: abre as questões que o servidor publicou a partir de um envio de questões. */
  onAbrirQuestoes?: (questionIds: string[]) => void;
  ocupadoId?: string | null;
  /** 44-B: os materiais publicados, para dizer de qual deles o envio é a atualização. */
  materiais?: Array<{ id: string; title: string }>;
  /** P8, admin: publica o envio (ou aplica a atualização) com qualquer parecer do revisor. */
  onPublicar?: (envio: EnvioDaLista) => Promise<ResultadoDaAcao>;
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

const BlocoDeCorrecao: React.FC<{ texto: string; objeto: string }> = ({ texto, objeto }) => {
  const [copiado, setCopiado] = useState(false);
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">Bloco de correção</p>
      <p className="text-xs text-slate-500 dark:text-slate-400">
        Cole este texto na conversa de quem escreveu {objeto} (a IA que os criou) para corrigir só o que a revisão
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

const RevisaoDoEnvio: React.FC<{ revisao: MaterialReviewView; objeto: string }> = ({ revisao, objeto }) => {
  if (!revisao.findingsText && !revisao.correctionBlock) return null;
  return (
    <details className="mt-1">
      <summary className="text-xs font-semibold text-teal-700 dark:text-teal-400 cursor-pointer select-none min-h-8 flex items-center">
        Ver a revisão
      </summary>
      <div className="mt-2 space-y-4" data-testid="revisao-do-envio">
        {revisao.findingsText && <TextoDaIA texto={revisao.findingsText} />}
        {revisao.correctionBlock && <BlocoDeCorrecao texto={revisao.correctionBlock} objeto={objeto} />}
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
  onAbrirQuestoes,
  ocupadoId,
  materiais,
  onPublicar,
}) => {
  if (envios.length === 0) {
    return <p className="text-sm text-slate-500 dark:text-slate-400">{vazio}</p>;
  }
  return (
    <ul id={id} className="space-y-2">
      {envios.map((item) => {
        // O envio de questões não tem Disciplina, Tema nem material publicado; tem revisão e questões publicadas (44-H2).
        const questoes = 'kind' in item && item.kind === 'questoes';
        const envio = (questoes ? null : item) as MaterialSubmission | null;
        const idsPublicados = questoes ? ((item as QuestionSubmission).publishedQuestionIds ?? []) : [];
        const alvoDoEnvio = envio?.targetMaterialId ?? null;
        const base = estadoEmPalavras(item.status, questoes ? 'questoes' : 'material');
        // 44-B: na atualização, "publicado" é "o conteúdo no ar foi trocado" (ou já era igual).
        const estado =
          alvoDoEnvio && item.status === 'apto'
            ? { ...base, explicacao: 'O revisor de IA deu parecer favorável à atualização. Ela não é aplicada sozinha: o conteúdo que está no ar só muda quando o dono do site decidir.' }
            : alvoDoEnvio && item.status === 'publicado'
              ? { ...base, explicacao: 'O material que está no ar já tem o conteúdo desta atualização, com o selo de revisado por IA.' }
              : alvoDoEnvio && item.status === 'nao_apto'
                ? { ...base, explicacao: 'A atualização não foi aprovada: o material continua como estava. Corrija o arquivo, e use “Atualizar a partir de arquivo” no material para enviar de novo.' }
                : base;
        const disciplina = envio ? disciplines.find((d) => d.id === envio.disciplineId)?.name : undefined;
        const tema = envio ? themes.find((t) => t.id === envio.themeId)?.name : undefined;
        // 44-B: envio de atualização (o alvo é um material publicado). O texto novo vem de outro arquivo, pelo botão do material.
        const alvoDaAtualizacao = envio?.targetMaterialId ?? null;
        const tituloDoAlvo = alvoDaAtualizacao ? materiais?.find((m) => m.id === alvoDaAtualizacao)?.title : undefined;
        const podeCorrigir = onCorrigir && !alvoDaAtualizacao && (item.status === 'nao_apto' || item.status === 'erro');
        const podeTentarDeNovo = onTentarDeNovo && item.status === 'erro';
        return (
          <li
            key={`${questoes ? 'q' : 'm'}-${item.id}`}
            data-status={item.status}
            data-tipo={questoes ? 'questoes' : 'material'}
            className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col gap-1"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 min-w-0 break-words">{item.title}</p>
              <span className="shrink-0 flex items-center gap-1.5">
                {questoes && (
                  <span className="px-2 py-0.5 rounded-md border border-slate-300 dark:border-slate-600 text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Questões
                  </span>
                )}
                {alvoDaAtualizacao && (
                  <span
                    data-testid="envio-de-atualizacao"
                    className="px-2 py-0.5 rounded-md border border-slate-300 dark:border-slate-600 text-xs font-semibold text-slate-700 dark:text-slate-300"
                  >
                    {tituloDoAlvo ? `Atualização de “${tituloDoAlvo}”` : 'Atualização'}
                  </span>
                )}
                <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-xs font-semibold text-slate-800 dark:text-slate-200">
                  {estado.rotulo}
                </span>
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Enviado em {dataDoEnvio(item.createdAt)}
              {disciplina ? ` · ${disciplina}` : ''}
              {tema ? ` › ${tema}` : ''}
              {mostrarAutor && item.author ? ` · por ${item.author.name || item.author.email}` : ''}
            </p>
            {estado.explicacao && (
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">{estado.explicacao}</p>
            )}
            {item.publicationNote && (item.status !== 'publicado' || alvoDoEnvio) && (
              <p data-testid="recado-do-servidor" className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
                {item.publicationNote}
              </p>
            )}
            {questoes && item.status === 'publicado' && idsPublicados.length > 0 && (
              <div className="pt-1 space-y-1">
                <p data-testid="questoes-publicadas" className="text-xs text-slate-600 dark:text-slate-300">
                  {idsPublicados.length === 1 ? '1 questão publicada.' : `${idsPublicados.length} questões publicadas.`}
                </p>
                {onAbrirQuestoes && (
                  <button
                    type="button"
                    data-testid="abrir-questoes-publicadas"
                    onClick={() => onAbrirQuestoes(idsPublicados)}
                    className="min-h-11 px-3 py-2 rounded-xl border border-teal-600 text-teal-700 dark:text-teal-300 dark:border-teal-500 bg-white dark:bg-slate-900 text-xs font-semibold cursor-pointer hover:bg-teal-50 dark:hover:bg-teal-950/40"
                  >
                    Abrir as questões publicadas
                  </button>
                )}
              </div>
            )}
            {envio && envio.status === 'publicado' && (envio.publishedMaterialId ?? envio.targetMaterialId) && onAbrirMaterial && (
              <div className="pt-1">
                <button
                  type="button"
                  data-testid="abrir-material-publicado"
                  onClick={() => onAbrirMaterial((envio.publishedMaterialId ?? envio.targetMaterialId) as string)}
                  className="min-h-11 px-3 py-2 rounded-xl border border-teal-600 text-teal-700 dark:text-teal-300 dark:border-teal-500 bg-white dark:bg-slate-900 text-xs font-semibold cursor-pointer hover:bg-teal-50 dark:hover:bg-teal-950/40"
                >
                  Abrir o material publicado
                </button>
              </div>
            )}
            {item.status === 'aguardando_revisao' && avisoDaFila && (
              <p data-testid="aviso-da-fila" className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
                {avisoDaFila}
              </p>
            )}
            {item.review && item.status !== 'aguardando_revisao' && item.status !== 'em_revisao' && (
              <RevisaoDoEnvio revisao={item.review} objeto={questoes ? 'as questões' : 'o material'} />
            )}
            {onPublicar && (
              <PublicarEnvioDoAdmin
                titulo={item.title}
                status={item.status}
                veredito={item.review?.verdict}
                tipo={questoes ? 'questoes' : alvoDaAtualizacao ? 'atualizacao' : 'material'}
                onPublicar={() => onPublicar(item)}
              />
            )}
            {(podeCorrigir || podeTentarDeNovo) && (
              <div className="flex flex-wrap gap-2 pt-1">
                {podeCorrigir && (
                  <button
                    type="button"
                    disabled={ocupadoId === item.id}
                    onClick={() => onCorrigir?.(item)}
                    className="min-h-11 px-3 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 disabled:bg-slate-300 text-white text-xs font-semibold cursor-pointer"
                  >
                    Corrigir e enviar de novo
                  </button>
                )}
                {podeTentarDeNovo && (
                  <button
                    type="button"
                    disabled={ocupadoId === item.id}
                    onClick={() => onTentarDeNovo?.(item)}
                    className="min-h-11 px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-800 dark:text-slate-200 cursor-pointer disabled:opacity-60"
                  >
                    {ocupadoId === item.id ? 'Enviando…' : 'Tentar de novo com o mesmo texto'}
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
