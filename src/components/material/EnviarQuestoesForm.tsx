import React, { useDeferredValue, useMemo, useRef, useState } from 'react';
import { CheckCircle2, FileUp, Send, TriangleAlert } from 'lucide-react';
import type { Compendium, Discipline, Theme } from '../../types';
import { questionSubmissionsRepository } from '../../repositories/QuestionSubmissionsRepository';
import { envioDeMaterialDisponivel } from '../../repositories/MaterialSubmissionsRepository';
import {
  LIMITE_ENVIOS_EM_ESPERA,
  LIMITE_LEITURA_DE_ARQUIVO_BYTES,
  LIMITE_TEXTO_BYTES,
  mensagemDeErroDoEnvio,
  tamanhoLegivel,
} from '../../utils/envioDeMaterial';
import {
  LIMITE_MATERIAIS_POR_ENVIO,
  avaliarLote,
  lerLoteDeQuestoes,
  nomeSugeridoDoLote,
} from '../../utils/envioDeQuestoes';

// ============================================================================
// "Enviar questões" (44-H1) — o modo de questões da tela "Enviar material".
//
// Qualquer usuário ativo cola ou carrega o `.md` de um lote de questões, escrito
// no padrão de questões. A tela mostra ao vivo o resultado do importador (o
// mesmo do botão "Importar questões" do Admin) e só habilita "Enviar" com o
// arquivo aceito e sem pendência. O envio fica guardado como "envio de
// questões", com estado; nada aqui revisa nem publica questão (44-H2).
// Os limites (300 KB, 3 lotes esperando revisão) são do banco; a tela os antecipa.
// ============================================================================

interface EnviarQuestoesFormProps {
  disciplines: Discipline[];
  themes: Theme[];
  compendiums: Compendium[];
  /** Quantos envios de questões da pessoa esperam revisão (o limite é 3). */
  esperando: number;
  /** Chamado depois de um envio aceito pelo servidor (a tela recarrega "Meus envios"). */
  onEnviado: () => Promise<void> | void;
  onAbrirComoEscreverQuestoes?: () => void;
}

const MAX_PENDENCIAS_NA_TELA = 20;

const inputClass =
  'w-full min-h-11 p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100';
const labelClass = 'block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1';

export const EnviarQuestoesForm: React.FC<EnviarQuestoesFormProps> = ({
  disciplines,
  themes,
  compendiums,
  esperando,
  onEnviado,
  onAbrirComoEscreverQuestoes,
}) => {
  const [texto, setTexto] = useState('');
  const [nomeDoArquivo, setNomeDoArquivo] = useState('');
  const [avisoDoArquivo, setAvisoDoArquivo] = useState('');
  // O nome do lote sugerido vale enquanto a pessoa não escreve o dela.
  const [nomeEscolhido, setNomeEscolhido] = useState<string | null>(null);
  const [materiaisEscolhidos, setMateriaisEscolhidos] = useState<string[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [erroDoEnvio, setErroDoEnvio] = useState('');
  const [enviadoComo, setEnviadoComo] = useState('');
  const seletorDeArquivo = useRef<HTMLInputElement>(null);

  const textoAvaliado = useDeferredValue(texto);
  const leitura = useMemo(
    () => lerLoteDeQuestoes(textoAvaliado, disciplines, themes),
    [textoAvaliado, disciplines, themes],
  );

  const publicados = useMemo(
    () => compendiums.filter((c) => c.publicationStatus === 'published').map((c) => ({ id: c.id, title: c.title, disciplineId: c.disciplineId })),
    [compendiums],
  );
  const gruposDeMateriais = useMemo(() => {
    const collator = new Intl.Collator('pt-BR');
    return [...disciplines]
      .sort((a, b) => collator.compare(a.name, b.name))
      .map((disciplina) => ({
        disciplina,
        itens: publicados.filter((m) => m.disciplineId === disciplina.id).sort((a, b) => collator.compare(a.title, b.title)),
      }))
      .filter((g) => g.itens.length > 0);
  }, [disciplines, publicados]);

  const avaliacao = useMemo(
    () => avaliarLote(leitura, publicados, materiaisEscolhidos),
    [leitura, publicados, materiaisEscolhidos],
  );
  const nome = (nomeEscolhido ?? nomeSugeridoDoLote(leitura)).trim();
  const nomeLongo = nome.length > 300;
  const atualizando = textoAvaliado !== texto;
  const filaCheia = esperando >= LIMITE_ENVIOS_EM_ESPERA;
  const podeEnviar =
    avaliacao.aceito && !atualizando && !enviando && !filaCheia && nome.length > 0 && !nomeLongo && envioDeMaterialDisponivel;

  const alternarMaterial = (id: string) => {
    setMateriaisEscolhidos((atuais) =>
      atuais.includes(id) ? atuais.filter((x) => x !== id) : atuais.length >= LIMITE_MATERIAIS_POR_ENVIO ? atuais : [...atuais, id],
    );
    setEnviadoComo('');
    setErroDoEnvio('');
  };

  const carregarArquivo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const arquivo = e.target.files?.[0];
    e.target.value = '';
    if (!arquivo) return;
    setEnviadoComo('');
    setErroDoEnvio('');
    if (arquivo.size > LIMITE_LEITURA_DE_ARQUIVO_BYTES) {
      setAvisoDoArquivo(
        `O arquivo “${arquivo.name}” tem ${tamanhoLegivel(arquivo.size)} e passa muito de ${tamanhoLegivel(LIMITE_TEXTO_BYTES)}. Divida o lote em mais de um envio.`,
      );
      return;
    }
    setAvisoDoArquivo('');
    setNomeDoArquivo(arquivo.name);
    setTexto(await arquivo.text());
  };

  const enviar = async () => {
    if (!podeEnviar) return;
    setEnviando(true);
    setErroDoEnvio('');
    setEnviadoComo('');
    try {
      const criado = await questionSubmissionsRepository.submit({ title: nome, contentMd: texto, materialIds: materiaisEscolhidos });
      setEnviadoComo(criado.title);
      setTexto('');
      setNomeDoArquivo('');
      setNomeEscolhido(null);
      setMateriaisEscolhidos([]);
      await onEnviado();
    } catch (err) {
      setErroDoEnvio(mensagemDeErroDoEnvio(err));
      // O limite pode ter mudado do lado do servidor: a tela relê a lista.
      void onEnviado();
    } finally {
      setEnviando(false);
    }
  };

  return (
    <section aria-labelledby="enviar-questoes-form-titulo" className="space-y-4" id="enviar-questoes-form">
      <h2 id="enviar-questoes-form-titulo" className="text-xl font-bold text-slate-900 dark:text-slate-100">
        Novo envio de questões
      </h2>
      <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
        Cole ou carregue o arquivo .md com as suas questões, escrito no padrão de questões do NexusMed. O envio só é
        liberado quando o arquivo passa pela importação sem nenhuma pendência. Enviar não publica nada: o lote fica
        guardado na sua lista de envios.
        {onAbrirComoEscreverQuestoes && (
          <>
            {' '}
            Ainda não tem o arquivo?{' '}
            <button
              type="button"
              id="enviar-questoes-como-escrever"
              onClick={onAbrirComoEscreverQuestoes}
              className="text-teal-700 dark:text-teal-400 font-semibold underline cursor-pointer"
            >
              Veja como escrever questões
            </button>
            .
          </>
        )}
      </p>

      <div>
        <label htmlFor="envio-questoes-nome" className={labelClass}>
          Nome do lote
        </label>
        <input
          id="envio-questoes-nome"
          type="text"
          value={nomeEscolhido ?? nomeSugeridoDoLote(leitura)}
          onChange={(e) => setNomeEscolhido(e.target.value)}
          className={inputClass}
          placeholder="Ex.: Questões de Espirometria (5 questões)"
        />
        {nomeLongo && (
          <p className="mt-1 text-xs text-amber-800 dark:text-amber-300">O nome passa de 300 caracteres. Encurte-o.</p>
        )}
      </div>

      <fieldset>
        <legend className={labelClass}>Material que as questões cobrem (para as que não citam nenhum no arquivo)</legend>
        {gruposDeMateriais.length === 0 ? (
          <p className="text-xs text-slate-500 dark:text-slate-400">Nenhum material publicado ainda.</p>
        ) : (
          <div
            id="envio-questoes-materiais"
            className="max-h-56 overflow-y-auto p-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 space-y-3"
          >
            {gruposDeMateriais.map((g) => (
              <div key={g.disciplina.id}>
                <p className="text-xs font-bold text-slate-700 dark:text-slate-300">{g.disciplina.name}</p>
                <ul className="mt-1 space-y-1">
                  {g.itens.map((m) => (
                    <li key={m.id}>
                      <label className="min-h-11 flex items-center gap-2 text-sm text-slate-900 dark:text-slate-100 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={materiaisEscolhidos.includes(m.id)}
                          onChange={() => alternarMaterial(m.id)}
                          className="w-4 h-4"
                        />
                        <span>{m.title}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
          Só materiais publicados aparecem (até {LIMITE_MATERIAIS_POR_ENVIO}). Questão que já cita “Materiais cobertos” no
          arquivo usa o que ele diz.
        </p>
      </fieldset>

      <div>
        <div className="flex flex-wrap items-end justify-between gap-2 mb-1">
          <label htmlFor="envio-questoes-texto" className="text-xs font-bold text-slate-700 dark:text-slate-300">
            Questões em Markdown (.md)
          </label>
          <div className="flex items-center gap-2">
            {nomeDoArquivo && (
              <span className="text-xs text-slate-500 dark:text-slate-400" id="envio-questoes-nome-arquivo">
                {nomeDoArquivo}
              </span>
            )}
            <button
              type="button"
              onClick={() => seletorDeArquivo.current?.click()}
              className="min-h-11 px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              <FileUp className="w-4 h-4" aria-hidden="true" />
              <span>Carregar arquivo .md</span>
            </button>
            <input
              ref={seletorDeArquivo}
              id="envio-questoes-arquivo"
              type="file"
              accept=".md,.markdown,text/markdown,text/plain"
              onChange={carregarArquivo}
              className="sr-only"
              tabIndex={-1}
              aria-label="Arquivo das questões (.md)"
            />
          </div>
        </div>
        <textarea
          id="envio-questoes-texto"
          value={texto}
          onChange={(e) => {
            setTexto(e.target.value);
            setEnviadoComo('');
            setErroDoEnvio('');
          }}
          rows={12}
          spellCheck={false}
          placeholder="Cole aqui o texto das questões, começando pela primeira (## Questão 1)."
          className={`${inputClass} font-mono text-xs leading-relaxed`}
        />
        {avisoDoArquivo && (
          <p role="alert" className="mt-1 text-xs text-amber-800 dark:text-amber-300">
            {avisoDoArquivo}
          </p>
        )}
        <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400" id="envio-questoes-tamanho">
          {tamanhoLegivel(avaliacao.bytes)} de {tamanhoLegivel(LIMITE_TEXTO_BYTES)}
        </p>
      </div>

      {/* Resultado ao vivo do importador de questões. */}
      <div
        id="envio-questoes-resultado"
        role="status"
        aria-live="polite"
        className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 space-y-2"
      >
        {avaliacao.vazio ? (
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Cole o texto ou carregue o arquivo para ver a checagem das questões.
          </p>
        ) : atualizando ? (
          <p className="text-sm text-slate-600 dark:text-slate-300">Conferindo o arquivo…</p>
        ) : avaliacao.aceito ? (
          <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300 flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
            <span>
              Arquivo aceito: {avaliacao.totalDeQuestoes === 1 ? '1 questão passou' : `${avaliacao.totalDeQuestoes} questões passaram`}{' '}
              pela importação, sem nenhuma pendência.
            </span>
          </p>
        ) : (
          <div className="space-y-2">
            <p className="text-sm font-semibold text-amber-900 dark:text-amber-300 flex items-start gap-2">
              <TriangleAlert className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
              <span>O arquivo ainda não pode ser enviado. Corrija o que está abaixo.</span>
            </p>
            {avaliacao.tamanhoExcedido && (
              <p className="text-sm text-slate-800 dark:text-slate-200" id="envio-questoes-erro-tamanho">
                O texto tem {tamanhoLegivel(avaliacao.bytes)} e o limite é {tamanhoLegivel(LIMITE_TEXTO_BYTES)}. Divida o lote
                em mais de um envio.
              </p>
            )}
            {avaliacao.errosDeImportacao.length > 0 && (
              <ul className="list-disc pl-5 text-sm text-slate-800 dark:text-slate-200 space-y-1" id="envio-questoes-erros-importacao">
                {avaliacao.errosDeImportacao.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            )}
            {avaliacao.pendencias.length > 0 && (
              <div>
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                  {avaliacao.pendencias.length === 1 ? '1 pendência' : `${avaliacao.pendencias.length} pendências`}
                </p>
                <ul className="list-disc pl-5 text-sm text-slate-800 dark:text-slate-200 space-y-1" id="envio-questoes-pendencias">
                  {avaliacao.pendencias.slice(0, MAX_PENDENCIAS_NA_TELA).map((p, i) => (
                    <li key={`${p.questao}-${i}`}>
                      <span className="text-slate-500 dark:text-slate-400">Questão {p.questao}:</span> {p.mensagem}
                    </li>
                  ))}
                </ul>
                {avaliacao.pendencias.length > MAX_PENDENCIAS_NA_TELA && (
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    e mais {avaliacao.pendencias.length - MAX_PENDENCIAS_NA_TELA}. Corrija as primeiras e o resto aparece.
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {filaCheia && (
        <p
          id="envio-questoes-fila-cheia"
          role="alert"
          className="p-3 rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/40 dark:border-amber-700 text-sm text-amber-900 dark:text-amber-200"
        >
          Você já tem {LIMITE_ENVIOS_EM_ESPERA} envios de questões esperando revisão. Quando a revisão de um deles terminar,
          você poderá enviar outro.
        </p>
      )}
      {erroDoEnvio && (
        <p
          id="envio-questoes-erro"
          role="alert"
          className="p-3 rounded-xl border border-rose-300 bg-rose-50 dark:bg-rose-950/40 dark:border-rose-800 text-sm text-rose-900 dark:text-rose-200"
        >
          {erroDoEnvio}
        </p>
      )}
      {enviadoComo && (
        <p
          id="envio-questoes-sucesso"
          role="status"
          className="p-3 rounded-xl border border-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 dark:border-emerald-800 text-sm text-emerald-900 dark:text-emerald-200"
        >
          Lote “{enviadoComo}” enviado. Ele aparece em “Meus envios”, aguardando revisão.
        </p>
      )}

      <div>
        <button
          type="button"
          id="btn-enviar-questoes"
          onClick={enviar}
          disabled={!podeEnviar}
          className="min-h-11 px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 disabled:bg-slate-300 disabled:dark:bg-slate-700 disabled:text-slate-500 disabled:dark:text-slate-400 disabled:cursor-not-allowed text-white text-sm font-semibold flex items-center gap-2 cursor-pointer transition-colors"
        >
          <Send className="w-4 h-4" aria-hidden="true" />
          <span>{enviando ? 'Enviando…' : 'Enviar questões'}</span>
        </button>
      </div>
    </section>
  );
};
