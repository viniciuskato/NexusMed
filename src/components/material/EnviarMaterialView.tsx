import React, { useDeferredValue, useMemo, useRef, useState } from 'react';
import { CheckCircle2, FileUp, Send, TriangleAlert } from 'lucide-react';
import type { Compendium, Discipline, Theme } from '../../types';
import {
  envioDeMaterialDisponivel,
  materialSubmissionsRepository,
  type MaterialSubmission,
  type SituacaoDaRevisao,
} from '../../repositories/MaterialSubmissionsRepository';
import { useServerLoad } from '../../hooks/useServerLoad';
import { ConnectionNotice } from '../common/ConnectionNotice';
import {
  LIMITE_ENVIOS_EM_ESPERA,
  LIMITE_LEITURA_DE_ARQUIVO_BYTES,
  LIMITE_TEXTO_BYTES,
  avaliarEnvio,
  descreverAvisoDaImportacao,
  fraseDaEspera,
  frasesDoTituloLongo,
  lerArquivoParaEnvio,
  mensagemDeErroDoEnvio,
  tamanhoLegivel,
} from '../../utils/envioDeMaterial';
import { parentCandidates } from '../../utils/materialNavigation';
import { ListaDeEnvios } from './ListaDeEnvios';

// ============================================================================
// "Enviar material" (44-E)
//
// Qualquer usuário ativo cola ou carrega o `.md` de um material no padrão. A
// tela mostra ao vivo a checagem do padrão e a recusa do importador (as mesmas
// de `npm run checar:material` e do botão "Importar material" do Admin) e só
// habilita "Enviar" com o arquivo aceito e sem pendência. O envio fica
// guardado como "envio", com estado; nada aqui publica material.
// Os limites (300 KB, 3 esperando revisão) são do banco; a tela os antecipa.
// ============================================================================

interface EnviarMaterialViewProps {
  disciplines: Discipline[];
  themes: Theme[];
  compendiums: Compendium[];
  onAbrirComoEscrever?: () => void;
}

const MAX_PENDENCIAS_NA_TELA = 20;

const inputClass =
  'w-full min-h-11 p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100';
const labelClass = 'block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1';

export const EnviarMaterialView: React.FC<EnviarMaterialViewProps> = ({
  disciplines,
  themes,
  compendiums,
  onAbrirComoEscrever,
}) => {
  const [texto, setTexto] = useState('');
  const [nomeDoArquivo, setNomeDoArquivo] = useState('');
  const [avisoDoArquivo, setAvisoDoArquivo] = useState('');
  // Disciplina/Tema escolhidos à mão; sem escolha, valem os que o arquivo declara.
  const [disciplinaEscolhida, setDisciplinaEscolhida] = useState<string | null>(null);
  const [temaEscolhido, setTemaEscolhido] = useState<string | null>(null);
  const [paiId, setPaiId] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erroDoEnvio, setErroDoEnvio] = useState('');
  const [enviadoComo, setEnviadoComo] = useState('');
  const seletorDeArquivo = useRef<HTMLInputElement>(null);

  // 44-F: envio "não apto" ou "erro" que está sendo corrigido (texto substituído).
  const [substituindo, setSubstituindo] = useState<MaterialSubmission | null>(null);
  const [ocupadoId, setOcupadoId] = useState<string | null>(null);
  const [avisoDaLista, setAvisoDaLista] = useState('');
  const topoDoFormulario = useRef<HTMLHeadingElement>(null);

  const [envios, setEnvios] = useState<MaterialSubmission[]>([]);
  const [situacao, setSituacao] = useState<SituacaoDaRevisao | null>(null);
  const { status: statusDaLista, reload: recarregarEnvios } = useServerLoad(async () => {
    const [lista, sit] = await Promise.all([
      materialSubmissionsRepository.listMine(),
      // A situação só explica a espera: sem ela a lista aparece do mesmo jeito.
      materialSubmissionsRepository.situacaoDaRevisao().catch(() => null),
    ]);
    return () => {
      setEnvios(lista);
      setSituacao(sit);
    };
  }, 'meus-envios');

  const textoAvaliado = useDeferredValue(texto);
  const leitura = useMemo(
    () => lerArquivoParaEnvio(textoAvaliado, disciplines, themes),
    [textoAvaliado, disciplines, themes],
  );

  const disciplineId = disciplinaEscolhida ?? leitura.disciplinaDoArquivo?.id ?? '';
  const themeId = temaEscolhido ?? (disciplinaEscolhida === null ? leitura.temaDoArquivo?.id ?? '' : '');
  const avaliacao = useMemo(
    () => avaliarEnvio(leitura, { disciplineId, themeId }, disciplines, themes),
    [leitura, disciplineId, themeId, disciplines, themes],
  );
  // O texto acabou de mudar e a checagem ainda vai alcançá-lo.
  const atualizando = textoAvaliado !== texto;

  const esperando = envios.filter((e) => e.status === 'aguardando_revisao' || e.status === 'em_revisao').length;
  const filaCheia = esperando >= LIMITE_ENVIOS_EM_ESPERA;

  const disciplinasOrdenadas = useMemo(
    () => [...disciplines].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
    [disciplines],
  );
  const temasDaDisciplina = useMemo(
    () =>
      themes
        .filter((t) => t.disciplineId === disciplineId)
        .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, 'pt-BR')),
    [themes, disciplineId],
  );
  const grupoDePais = useMemo(() => {
    const publicados = parentCandidates(compendiums, null).filter((c) => c.publicationStatus === 'published');
    return disciplinasComItens(disciplinasOrdenadas, publicados);
  }, [compendiums, disciplinasOrdenadas]);

  const carregarArquivo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const arquivo = e.target.files?.[0];
    e.target.value = '';
    if (!arquivo) return;
    setEnviadoComo('');
    setErroDoEnvio('');
    if (arquivo.size > LIMITE_LEITURA_DE_ARQUIVO_BYTES) {
      setAvisoDoArquivo(
        `O arquivo “${arquivo.name}” tem ${tamanhoLegivel(arquivo.size)} e passa muito de ${tamanhoLegivel(LIMITE_TEXTO_BYTES)}. Reduza o material ou divida-o em mais de um.`,
      );
      return;
    }
    setAvisoDoArquivo('');
    setNomeDoArquivo(arquivo.name);
    setTexto(await arquivo.text());
  };

  const enviar = async () => {
    if (!avaliacao.aceito || enviando || filaCheia) return;
    setEnviando(true);
    setErroDoEnvio('');
    setEnviadoComo('');
    setAvisoDaLista('');
    try {
      const dados = {
        title: leitura.titulo,
        disciplineId,
        themeId,
        parentMaterialId: paiId || null,
        contentMd: texto,
      };
      const criado = substituindo
        ? await materialSubmissionsRepository.replaceText(substituindo.id, dados)
        : await materialSubmissionsRepository.submit(dados);
      setEnviadoComo(criado.title);
      setSubstituindo(null);
      setTexto('');
      setNomeDoArquivo('');
      setDisciplinaEscolhida(null);
      setTemaEscolhido(null);
      setPaiId('');
      await recarregarEnvios();
    } catch (err) {
      setErroDoEnvio(mensagemDeErroDoEnvio(err));
      // O limite pode ter mudado do lado do servidor: relê a lista.
      void recarregarEnvios();
    } finally {
      setEnviando(false);
    }
  };

  // Os avisos da importação e as pendências do padrão vão na mesma lista.
  const itensDePendencia = [
    ...avaliacao.avisosDaImportacao.map((a) => ({ chave: `imp-${a}`, onde: 'Importação', texto: descreverAvisoDaImportacao(a) })),
    ...avaliacao.pendencias.map((p, i) => ({
      chave: `${p.regra}-${p.linha}-${i}`,
      onde: `Linha ${p.linha} · ${p.secao}`,
      texto: p.mensagem,
    })),
  ];
  const corrigir = (envio: MaterialSubmission) => {
    setSubstituindo(envio);
    setEnviadoComo('');
    setErroDoEnvio('');
    setAvisoDaLista('');
    setTexto('');
    setNomeDoArquivo('');
    setDisciplinaEscolhida(envio.disciplineId);
    setTemaEscolhido(envio.themeId);
    setPaiId(envio.parentMaterialId ?? '');
    topoDoFormulario.current?.scrollIntoView?.({ block: 'start' });
  };

  const cancelarCorrecao = () => {
    setSubstituindo(null);
    setTexto('');
    setNomeDoArquivo('');
    setDisciplinaEscolhida(null);
    setTemaEscolhido(null);
    setPaiId('');
  };

  const tentarDeNovo = async (envio: MaterialSubmission) => {
    setOcupadoId(envio.id);
    setAvisoDaLista('');
    setErroDoEnvio('');
    try {
      await materialSubmissionsRepository.retry(envio.id, envio.title);
      setAvisoDaLista(`“${envio.title}” voltou para a fila de revisão.`);
      await recarregarEnvios();
    } catch (err) {
      setErroDoEnvio(mensagemDeErroDoEnvio(err));
      void recarregarEnvios();
    } finally {
      setOcupadoId(null);
    }
  };

  const podeEnviar = avaliacao.aceito && !atualizando && !enviando && !filaCheia && envioDeMaterialDisponivel;

  return (
    <div id="enviar-material-view" className="space-y-8 max-w-4xl mx-auto">
      <header className="space-y-3">
        <h1 className="text-2xl sm:text-3xl font-bold font-serif-reading text-slate-900 dark:text-white">
          Enviar material
        </h1>
        <p className="text-sm sm:text-base text-slate-700 dark:text-slate-300 leading-relaxed">
          Cole ou carregue o arquivo .md do seu material, escrito no padrão do NexusMed. O envio só é liberado
          quando o arquivo está aceito e sem pendência. Enviar não publica nada: o material fica na fila de
          revisão.
        </p>
        {onAbrirComoEscrever && (
          <p className="text-sm text-slate-700 dark:text-slate-300">
            Ainda não tem o arquivo?{' '}
            <button
              type="button"
              id="enviar-material-como-escrever"
              onClick={onAbrirComoEscrever}
              className="text-teal-700 dark:text-teal-400 font-semibold underline cursor-pointer"
            >
              Veja como escrever um material
            </button>
            .
          </p>
        )}
      </header>

      {!envioDeMaterialDisponivel && (
        <p
          role="alert"
          className="p-3 rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/40 dark:border-amber-700 text-sm text-amber-900 dark:text-amber-200"
        >
          O envio de material precisa da conexão com o servidor e não está disponível neste ambiente.
        </p>
      )}

      <section aria-labelledby="enviar-material-form-titulo" className="space-y-4">
        <h2
          id="enviar-material-form-titulo"
          ref={topoDoFormulario}
          className="text-xl font-bold text-slate-900 dark:text-slate-100"
        >
          {substituindo ? 'Corrigir envio' : 'Novo envio'}
        </h2>
        {substituindo && (
          <div
            id="envio-substituindo"
            className="p-3 rounded-xl border border-teal-300 bg-teal-50 dark:bg-teal-950/30 dark:border-teal-800 text-sm text-teal-900 dark:text-teal-200 flex flex-wrap items-center justify-between gap-2"
          >
            <span>
              Você está corrigindo “{substituindo.title}”. Cole o texto corrigido: ele substitui o anterior e o envio volta
              para a fila de revisão.
            </span>
            <button
              type="button"
              onClick={cancelarCorrecao}
              className="min-h-11 px-3 py-2 rounded-xl border border-teal-400 text-xs font-semibold cursor-pointer"
            >
              Cancelar correção
            </button>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="envio-disciplina" className={labelClass}>
              Disciplina
            </label>
            <select
              id="envio-disciplina"
              value={disciplineId}
              onChange={(e) => {
                setDisciplinaEscolhida(e.target.value);
                setTemaEscolhido('');
              }}
              className={inputClass}
            >
              <option value="">— Escolha —</option>
              {disciplinasOrdenadas.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="envio-tema" className={labelClass}>
              Tema
            </label>
            <select
              id="envio-tema"
              value={themeId}
              onChange={(e) => setTemaEscolhido(e.target.value)}
              disabled={!disciplineId}
              className={inputClass}
            >
              <option value="">— Escolha —</option>
              {temasDaDisciplina.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="envio-pai" className={labelClass}>
              Material acima (opcional)
            </label>
            <select id="envio-pai" value={paiId} onChange={(e) => setPaiId(e.target.value)} className={inputClass}>
              <option value="">— Nenhum —</option>
              {grupoDePais.map((g) => (
                <optgroup key={g.disciplina.id} label={g.disciplina.name}>
                  {g.itens.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
              Se o seu material aprofunda um material já publicado, escolha-o aqui. Só materiais publicados aparecem.
            </p>
          </div>
        </div>

        <div>
          <div className="flex flex-wrap items-end justify-between gap-2 mb-1">
            <label htmlFor="envio-texto" className="text-xs font-bold text-slate-700 dark:text-slate-300">
              Material em Markdown (.md)
            </label>
            <div className="flex items-center gap-2">
              {nomeDoArquivo && (
                <span className="text-xs text-slate-500 dark:text-slate-400" id="envio-nome-arquivo">
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
                id="envio-arquivo"
                type="file"
                accept=".md,.markdown,text/markdown,text/plain"
                onChange={carregarArquivo}
                className="sr-only"
                tabIndex={-1}
                aria-label="Arquivo do material (.md)"
              />
            </div>
          </div>
          <textarea
            id="envio-texto"
            value={texto}
            onChange={(e) => {
              setTexto(e.target.value);
              setEnviadoComo('');
              setErroDoEnvio('');
            }}
            rows={12}
            spellCheck={false}
            placeholder="Cole aqui o texto do material, começando pela linha do título (# Título)."
            className={`${inputClass} font-mono text-xs leading-relaxed`}
          />
          {avisoDoArquivo && (
            <p role="alert" className="mt-1 text-xs text-amber-800 dark:text-amber-300">
              {avisoDoArquivo}
            </p>
          )}
          <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400" id="envio-tamanho">
            {tamanhoLegivel(avaliacao.bytes)} de {tamanhoLegivel(LIMITE_TEXTO_BYTES)}
          </p>
        </div>

        {/* Resultado ao vivo da checagem do padrão e da importação. */}
        <div
          id="envio-resultado"
          role="status"
          aria-live="polite"
          className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 space-y-2"
        >
          {avaliacao.vazio ? (
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Cole o texto ou carregue o arquivo para ver a checagem do padrão.
            </p>
          ) : atualizando ? (
            <p className="text-sm text-slate-600 dark:text-slate-300">Conferindo o arquivo…</p>
          ) : avaliacao.aceito ? (
            <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300 flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
              <span>
                Arquivo aceito: “{leitura.titulo}” passou pela importação e não tem nenhuma pendência do padrão.
              </span>
            </p>
          ) : (
            <div className="space-y-2">
              <p className="text-sm font-semibold text-amber-900 dark:text-amber-300 flex items-start gap-2">
                <TriangleAlert className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
                <span>O arquivo ainda não pode ser enviado. Corrija o que está abaixo.</span>
              </p>
              {avaliacao.tamanhoExcedido && (
                <p className="text-sm text-slate-800 dark:text-slate-200" id="envio-erro-tamanho">
                  O texto tem {tamanhoLegivel(avaliacao.bytes)} e o limite é {tamanhoLegivel(LIMITE_TEXTO_BYTES)}. Reduza o
                  material ou divida-o em mais de um.
                </p>
              )}
              {avaliacao.errosDeImportacao.length > 0 && (
                <ul className="list-disc pl-5 text-sm text-slate-800 dark:text-slate-200 space-y-1" id="envio-erros-importacao">
                  {avaliacao.errosDeImportacao.map((m) => (
                    <li key={m}>{m}</li>
                  ))}
                </ul>
              )}
              {avaliacao.problemasDeCatalogo.length > 0 && (
                <ul className="list-disc pl-5 text-sm text-slate-800 dark:text-slate-200 space-y-1" id="envio-erros-catalogo">
                  {avaliacao.problemasDeCatalogo.map((m) => (
                    <li key={m}>{m}</li>
                  ))}
                </ul>
              )}
              {avaliacao.tituloLongo && (
                <p className="text-sm text-slate-800 dark:text-slate-200" id="envio-erro-titulo">
                  {frasesDoTituloLongo()}
                </p>
              )}
              {itensDePendencia.length > 0 && (
                <div>
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                    {itensDePendencia.length === 1 ? '1 pendência do padrão' : `${itensDePendencia.length} pendências do padrão`}
                  </p>
                  <ul className="list-disc pl-5 text-sm text-slate-800 dark:text-slate-200 space-y-1" id="envio-pendencias">
                    {itensDePendencia.slice(0, MAX_PENDENCIAS_NA_TELA).map((p) => (
                      <li key={p.chave}>
                        <span className="text-slate-500 dark:text-slate-400">{p.onde}:</span> {p.texto}
                      </li>
                    ))}
                  </ul>
                  {itensDePendencia.length > MAX_PENDENCIAS_NA_TELA && (
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      e mais {itensDePendencia.length - MAX_PENDENCIAS_NA_TELA}. Corrija as primeiras e o resto aparece.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {filaCheia && (
          <p
            id="envio-fila-cheia"
            role="alert"
            className="p-3 rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/40 dark:border-amber-700 text-sm text-amber-900 dark:text-amber-200"
          >
            Você já tem {LIMITE_ENVIOS_EM_ESPERA} envios esperando revisão. Quando a revisão de um deles terminar,
            você poderá enviar outro.
          </p>
        )}
        {erroDoEnvio && (
          <p
            id="envio-erro"
            role="alert"
            className="p-3 rounded-xl border border-rose-300 bg-rose-50 dark:bg-rose-950/40 dark:border-rose-800 text-sm text-rose-900 dark:text-rose-200"
          >
            {erroDoEnvio}
          </p>
        )}
        {enviadoComo && (
          <p
            id="envio-sucesso"
            role="status"
            className="p-3 rounded-xl border border-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 dark:border-emerald-800 text-sm text-emerald-900 dark:text-emerald-200"
          >
            Material “{enviadoComo}” enviado. Ele aparece em “Meus envios”, aguardando revisão.
          </p>
        )}

        <div>
          <button
            type="button"
            id="btn-enviar-material"
            onClick={enviar}
            disabled={!podeEnviar}
            className="min-h-11 px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 disabled:bg-slate-300 disabled:dark:bg-slate-700 disabled:text-slate-500 disabled:dark:text-slate-400 disabled:cursor-not-allowed text-white text-sm font-semibold flex items-center gap-2 cursor-pointer transition-colors"
          >
            <Send className="w-4 h-4" aria-hidden="true" />
            <span>{enviando ? 'Enviando…' : substituindo ? 'Substituir o texto e enviar de novo' : 'Enviar'}</span>
          </button>
        </div>
      </section>

      <section aria-labelledby="meus-envios-titulo" className="space-y-3">
        <h2 id="meus-envios-titulo" className="text-xl font-bold text-slate-900 dark:text-slate-100">
          Meus envios
        </h2>
        <ConnectionNotice status={statusDaLista} />
        {avisoDaLista && (
          <p id="envio-aviso-da-lista" role="status" className="text-sm text-emerald-800 dark:text-emerald-300">
            {avisoDaLista}
          </p>
        )}
        <ListaDeEnvios
          id="meus-envios-lista"
          envios={envios}
          disciplines={disciplines}
          themes={themes}
          vazio="Você ainda não enviou nenhum material."
          avisoDaFila={fraseDaEspera(situacao)}
          onCorrigir={corrigir}
          onTentarDeNovo={tentarDeNovo}
          ocupadoId={ocupadoId}
        />
      </section>
    </div>
  );
};

/** Materiais agrupados por Disciplina, na ordem das Disciplinas dadas, sem grupo vazio. */
function disciplinasComItens(disciplinas: Discipline[], itens: Compendium[]) {
  return disciplinas
    .map((disciplina) => ({ disciplina, itens: itens.filter((c) => c.disciplineId === disciplina.id) }))
    .filter((g) => g.itens.length > 0);
}
