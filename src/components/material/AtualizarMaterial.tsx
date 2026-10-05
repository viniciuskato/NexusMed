import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Download, FileDown, FileUp, TriangleAlert, X } from 'lucide-react';
import type { Compendium, Discipline, Theme } from '../../types';
import { materialSubmissionsRepository } from '../../repositories/MaterialSubmissionsRepository';
import { useDialogA11y } from '../../hooks/useDialogA11y';
import { useEhAdmin } from '../../hooks/useEhAdmin';
import {
  LIMITE_LEITURA_DE_ARQUIVO_BYTES,
  LIMITE_TEXTO_BYTES,
  avaliarEnvio,
  descreverAvisoDaImportacao,
  frasesDoTituloLongo,
  lerArquivoParaEnvio,
  lerMaterialParaPublicar,
  mensagemDeErroDoEnvio,
  tamanhoLegivel,
} from '../../utils/envioDeMaterial';
import { baixarArquivoDeTexto, exportarMaterialParaMarkdown } from '../../utils/exportarMaterial';
import { compararComPublicado } from '../../utils/atualizarMaterial';
import { VERSAO_ATUAL_DO_PADRAO } from '../../utils/compendiumStandardCheck';
import { montarArquivoParaAtualizar, nomeDoArquivoParaAtualizar } from '../../utils/baixarParaAtualizar';
import { publicarEnvioPeloAdmin } from '../../utils/publicarEnvioPeloAdmin';

// ============================================================================
// Os botões do admin no leitor do material: "Exportar .md" (44-B), "Baixar para atualizar" e "Enviar versão nova" (MAT-1)
//
// Aparecem só para o admin ativo (D-13: só o dono publica; o banco confere de novo). "Exportar .md" baixa o material no
// formato do padrão. "Baixar para atualizar" baixa UM .txt com o texto atual e o prompt mais novo, para uma IA reescrevê-lo.
// "Enviar versão nova" lê o arquivo reescrito, mostra o que mudaria e então PUBLICA na hora (o parecer do revisor de IA é só
// conselho, D-12/D-13) ou, se o admin preferir, manda para a revisão sem publicar. Posição na árvore, progresso, questões e
// cards continuam ligados (o banco casa as seções pelo título, 44-B/P8).
// ============================================================================

interface AtualizarMaterialProps {
  compendium: Compendium;
  disciplines: Discipline[];
  themes: Theme[];
  /** Chamado depois que a versão nova entrou no ar: quem tem a lista de materiais do app a recarrega. */
  onPublicado?: () => void;
}

const MAX_ITENS_NA_PREVIA = 12;

const botaoClass =
  'min-h-11 px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-60 disabled:cursor-not-allowed';

function Lista({ titulo, itens }: { titulo: string; itens: string[] }) {
  if (itens.length === 0) return null;
  return (
    <div>
      {titulo && <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">{titulo}</p>}
      <ul className="list-disc pl-5 text-sm text-slate-800 dark:text-slate-200 space-y-0.5">
        {itens.slice(0, MAX_ITENS_NA_PREVIA).map((t, i) => (
          <li key={`${t}-${i}`} className="break-words">
            {t}
          </li>
        ))}
      </ul>
      {itens.length > MAX_ITENS_NA_PREVIA && (
        <p className="text-xs text-slate-500 dark:text-slate-400">e mais {itens.length - MAX_ITENS_NA_PREVIA}.</p>
      )}
    </div>
  );
}

const Dialogo: React.FC<AtualizarMaterialProps & { onClose: () => void }> = ({ compendium, disciplines, themes, onClose, onPublicado }) => {
  const idBase = useId();
  const titleId = `${idBase}-titulo`;
  const seletor = useRef<HTMLInputElement>(null);
  const fecharRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useDialogA11y<HTMLDivElement>({ onClose, initialFocusRef: fecharRef });
  const [texto, setTexto] = useState('');
  const [nomeDoArquivo, setNomeDoArquivo] = useState('');
  const [avisoDoArquivo, setAvisoDoArquivo] = useState('');
  const [secoesDasQuestoes, setSecoesDasQuestoes] = useState<string[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [publicando, setPublicando] = useState(false);
  const [erro, setErro] = useState('');
  const [enviado, setEnviado] = useState(false);
  const [publicado, setPublicado] = useState('');

  useEffect(() => {
    // Só enfeita a prévia (quantas questões perdem a seção): se falhar, a prévia sai sem esse aviso.
    let ativo = true;
    materialSubmissionsRepository
      .secoesDasQuestoes(compendium.id)
      .then((ids) => ativo && setSecoesDasQuestoes(ids))
      .catch(() => undefined);
    return () => {
      ativo = false;
    };
  }, [compendium.id]);

  const leitura = useMemo(() => (texto ? lerArquivoParaEnvio(texto, disciplines, themes) : null), [texto, disciplines, themes]);
  const avaliacao = useMemo(
    () =>
      leitura
        ? avaliarEnvio(leitura, { disciplineId: compendium.disciplineId, themeId: compendium.themeId }, disciplines, themes)
        : null,
    [leitura, compendium.disciplineId, compendium.themeId, disciplines, themes],
  );
  const previa = useMemo(() => {
    if (!avaliacao?.aceito) return null;
    const lido = lerMaterialParaPublicar(texto, disciplines, themes);
    if (!lido.ok) return null;
    return compararComPublicado(
      compendium,
      lido.material,
      secoesDasQuestoes.map((id) => ({ compendiumSectionId: id, materialLinks: [] })),
    );
  }, [avaliacao, texto, disciplines, themes, compendium, secoesDasQuestoes]);

  const carregar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const arquivo = e.target.files?.[0];
    e.target.value = '';
    if (!arquivo) return;
    setEnviado(false);
    setPublicado('');
    setErro('');
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
    if (!leitura || !previa || previa.identico || enviando) return;
    setEnviando(true);
    setErro('');
    try {
      await materialSubmissionsRepository.submitUpdate({
        targetMaterialId: compendium.id,
        title: leitura.titulo,
        contentMd: texto,
      });
      setEnviado(true);
      setTexto('');
      setNomeDoArquivo('');
    } catch (err) {
      setErro(mensagemDeErroDoEnvio(err));
    } finally {
      setEnviando(false);
    }
  };

  // A versão nova entra no ar na hora, sem esperar o parecer do revisor (que só aconselha). O envio é gravado antes
  // (o banco guarda o texto e o hash) e então aplicado pela mesma função do botão "Publicar" da tela de envios.
  const publicar = async () => {
    if (!leitura || !previa || previa.identico || enviando || publicando) return;
    setPublicando(true);
    setErro('');
    setPublicado('');
    let envio: Awaited<ReturnType<typeof materialSubmissionsRepository.submitUpdate>>;
    try {
      envio = await materialSubmissionsRepository.submitUpdate({
        targetMaterialId: compendium.id,
        title: leitura.titulo,
        contentMd: texto,
      });
    } catch (err) {
      setErro(mensagemDeErroDoEnvio(err));
      setPublicando(false);
      return;
    }
    try {
      const r = await publicarEnvioPeloAdmin({ ...envio, targetMaterialId: compendium.id }, { disciplines, themes });
      if (r.ok) {
        setPublicado(r.texto);
        setTexto('');
        setNomeDoArquivo('');
        onPublicado?.();
      } else {
        setErro(`${r.texto} O arquivo ficou guardado em “Meus envios”.`);
      }
    } finally {
      setPublicando(false);
    }
  };

  const itensDePendencia = avaliacao
    ? [
        ...avaliacao.avisosDaImportacao.map((a) => descreverAvisoDaImportacao(a)),
        ...avaliacao.pendencias.map((p) => `Linha ${p.linha} · ${p.secao}: ${p.mensagem}`),
      ]
    : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-2xl bg-white dark:bg-[#0F172A] rounded-2xl border border-slate-200 dark:border-[#243452] elev-2xl overflow-hidden flex flex-col max-h-[90vh]"
      >
        <div className="p-4 flex items-start justify-between gap-3 border-b border-slate-200 dark:border-[#243452]">
          <div className="min-w-0">
            <h3 id={titleId} className="text-base font-bold text-slate-900 dark:text-slate-100">
              Enviar versão nova
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-400 break-words">{compendium.title}</p>
          </div>
          <button
            ref={fecharRef}
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="w-11 h-11 -mt-1 -mr-1 shrink-0 flex items-center justify-center rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 cursor-pointer"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        <div className="p-4 space-y-4 overflow-y-auto">
          <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
            Escolha o arquivo .md com a versão nova. Posição na árvore, questões e cards continuam ligados.
          </p>

          <div className="flex flex-wrap items-center gap-2">
            <button type="button" id="atualizar-escolher-arquivo" onClick={() => seletor.current?.click()} className={botaoClass}>
              <FileUp className="w-4 h-4" aria-hidden="true" />
              <span>Escolher arquivo .md</span>
            </button>
            {nomeDoArquivo && (
              <span id="atualizar-nome-arquivo" className="text-xs text-slate-500 dark:text-slate-400">
                {nomeDoArquivo}
              </span>
            )}
            <input
              ref={seletor}
              id="atualizar-arquivo"
              type="file"
              accept=".md,.markdown,text/markdown,text/plain"
              onChange={carregar}
              className="sr-only"
              tabIndex={-1}
              aria-label="Arquivo do material atualizado (.md)"
            />
          </div>
          {avisoDoArquivo && (
            <p role="alert" className="text-xs text-amber-800 dark:text-amber-300">
              {avisoDoArquivo}
            </p>
          )}

          <div id="atualizar-resultado" role="status" aria-live="polite" className="space-y-3">
            {avaliacao && !avaliacao.aceito && (
              <div className="p-3 rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/40 dark:border-amber-700 space-y-2">
                <p className="text-sm font-semibold text-amber-900 dark:text-amber-300 flex items-start gap-2">
                  <TriangleAlert className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
                  <span>O arquivo ainda não pode ser enviado. Corrija o que está abaixo.</span>
                </p>
                {avaliacao.tamanhoExcedido && (
                  <p className="text-sm text-slate-800 dark:text-slate-200">
                    O texto tem {tamanhoLegivel(avaliacao.bytes)} e o limite é {tamanhoLegivel(LIMITE_TEXTO_BYTES)}.
                  </p>
                )}
                <Lista titulo="" itens={avaliacao.errosDeImportacao} />
                <Lista titulo="" itens={avaliacao.problemasDeCatalogo} />
                {avaliacao.tituloLongo && <p className="text-sm text-slate-800 dark:text-slate-200">{frasesDoTituloLongo()}</p>}
                <Lista titulo={itensDePendencia.length === 1 ? '1 pendência do padrão' : `${itensDePendencia.length} pendências do padrão`} itens={itensDePendencia} />
              </div>
            )}

            {previa && previa.identico && (
              <p id="atualizar-identico" className="p-3 rounded-xl border border-slate-300 dark:border-slate-700 text-sm text-slate-800 dark:text-slate-200">
                O arquivo é igual ao material que está no ar: não há nada a atualizar.
              </p>
            )}

            {previa && !previa.identico && (
              <div id="atualizar-previa" className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 space-y-3">
                <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300 flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
                  <span>Arquivo aceito. Veja o que muda:</span>
                </p>
                <Lista titulo="Campos do material" itens={previa.campos.map((c) => `${c.campo}: “${c.de || '—'}” → “${c.para || '—'}”`)} />
                <Lista titulo="Seções novas" itens={previa.secoes.novas} />
                <Lista titulo="Seções alteradas" itens={previa.secoes.alteradas} />
                <Lista titulo="Seções removidas" itens={previa.secoes.removidas} />
                {previa.secoes.reordenadas && <p className="text-sm text-slate-800 dark:text-slate-200">A ordem das seções mudou.</p>}
                <Lista titulo="Referências novas" itens={previa.referencias.novas} />
                <Lista titulo="Referências removidas" itens={previa.referencias.removidas} />
                {previa.referencias.ordemMudou && <p className="text-sm text-slate-800 dark:text-slate-200">A ordem das referências mudou.</p>}
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  {previa.secoes.iguais} {previa.secoes.iguais === 1 ? 'seção continua igual' : 'seções continuam iguais'}.
                </p>
                {previa.questoesEmSecoesQueSomem > 0 && (
                  <p id="atualizar-aviso-questoes" className="text-sm text-amber-900 dark:text-amber-300">
                    {previa.questoesEmSecoesQueSomem === 1
                      ? '1 questão aponta para uma seção que vai sumir: ela continua ligada ao material, mas deixa de apontar para a seção.'
                      : `${previa.questoesEmSecoesQueSomem} questões apontam para seções que vão sumir: elas continuam ligadas ao material, mas deixam de apontar para a seção.`}
                  </p>
                )}
              </div>
            )}

            {erro && (
              <p id="atualizar-erro" role="alert" className="p-3 rounded-xl border border-rose-300 bg-rose-50 dark:bg-rose-950/40 dark:border-rose-800 text-sm text-rose-900 dark:text-rose-200">
                {erro}
              </p>
            )}
            {enviado && (
              <p id="atualizar-sucesso" className="p-3 rounded-xl border border-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 dark:border-emerald-800 text-sm text-emerald-900 dark:text-emerald-200">
                Enviado para revisão. O material continua como está; o parecer aparece em “Meus envios”.
              </p>
            )}
            {publicado && (
              <p id="atualizar-publicado" className="p-3 rounded-xl border border-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 dark:border-emerald-800 text-sm text-emerald-900 dark:text-emerald-200">
                {publicado}
              </p>
            )}
          </div>
        </div>

        <div className="p-4 border-t border-slate-200 dark:border-[#243452] flex flex-wrap justify-end gap-2">
          <button type="button" onClick={onClose} className={botaoClass}>
            Fechar
          </button>
          <button
            type="button"
            id="btn-enviar-atualizacao"
            onClick={enviar}
            disabled={!previa || previa.identico || enviando || publicando}
            className={botaoClass}
          >
            {enviando ? 'Enviando…' : 'Enviar para revisão'}
          </button>
          <button
            type="button"
            id="btn-publicar-versao"
            onClick={publicar}
            disabled={!previa || previa.identico || enviando || publicando}
            className="min-h-11 px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 disabled:bg-slate-300 disabled:dark:bg-slate-700 disabled:text-slate-500 disabled:cursor-not-allowed text-white text-sm font-semibold cursor-pointer"
          >
            {publicando ? 'Publicando…' : 'Publicar versão nova'}
          </button>
        </div>
      </div>
    </div>
  );
};

export const AtualizarMaterial: React.FC<AtualizarMaterialProps> = ({ compendium, disciplines, themes, onPublicado }) => {
  // Só o admin ativo vê os botões (MAT-1; D-13). O banco confere de novo em cada gravação.
  const ehAdmin = useEhAdmin();
  // O leitor é reaproveitado ao navegar entre materiais: a resposta só vale para o material perguntado.
  const [pode, setPode] = useState<{ materialId: string; valor: boolean } | null>(null);
  const [aberto, setAberto] = useState(false);
  const [avisos, setAvisos] = useState<string[]>([]);
  const [baixado, setBaixado] = useState('');
  const [erroAoBaixar, setErroAoBaixar] = useState('');
  const [baixando, setBaixando] = useState(false);

  useEffect(() => {
    let ativo = true;
    setAberto(false);
    setAvisos([]);
    setBaixado('');
    setErroAoBaixar('');
    if (!ehAdmin) {
      setPode(null);
      return;
    }
    // Decorativo: se a pergunta falhar, os botões simplesmente não aparecem.
    materialSubmissionsRepository
      .podeAtualizar(compendium.id)
      .then((valor) => ativo && setPode({ materialId: compendium.id, valor }))
      .catch(() => ativo && setPode({ materialId: compendium.id, valor: false }));
    return () => {
      ativo = false;
    };
  }, [compendium.id, ehAdmin]);

  if (!ehAdmin || !pode || pode.materialId !== compendium.id || !pode.valor) return null;

  const exportar = () => {
    const r = exportarMaterialParaMarkdown(compendium, disciplines, themes);
    baixarArquivoDeTexto(r.nomeDoArquivo, r.texto);
    setErroAoBaixar('');
    setAvisos(r.avisos);
    setBaixado(r.nomeDoArquivo);
  };

  // O prompt e a Parte 1 do padrão pesam no pacote: só são baixados (import dinâmico) quando o admin clica.
  const baixarParaAtualizar = async () => {
    if (baixando) return;
    setBaixando(true);
    setErroAoBaixar('');
    try {
      const { TEXTO_COPIAR_CRIAR } = await import('../../content/padraoMaterial');
      const r = exportarMaterialParaMarkdown(compendium, disciplines, themes);
      const texto = montarArquivoParaAtualizar({
        titulo: compendium.title,
        versaoDoPadrao: VERSAO_ATUAL_DO_PADRAO,
        promptEPadrao: TEXTO_COPIAR_CRIAR,
        materialAtual: r.texto,
      });
      const nome = nomeDoArquivoParaAtualizar(r.nomeDoArquivo);
      baixarArquivoDeTexto(nome, texto, 'text/plain;charset=utf-8');
      setAvisos(r.avisos);
      setBaixado(nome);
    } catch {
      setBaixado('');
      setErroAoBaixar('Não foi possível gerar o arquivo. Tente de novo.');
    } finally {
      setBaixando(false);
    }
  };

  return (
    <div data-testid="atualizar-material" className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" id="btn-baixar-para-atualizar" onClick={baixarParaAtualizar} disabled={baixando} className={botaoClass}>
          <FileDown className="w-4 h-4" aria-hidden="true" />
          <span>Baixar para atualizar</span>
        </button>
        <button type="button" id="btn-atualizar-material" onClick={() => setAberto(true)} className={botaoClass}>
          <FileUp className="w-4 h-4" aria-hidden="true" />
          <span>Enviar versão nova</span>
        </button>
        <button type="button" id="btn-exportar-material" onClick={exportar} className={botaoClass}>
          <Download className="w-4 h-4" aria-hidden="true" />
          <span>Exportar .md</span>
        </button>
      </div>
      {erroAoBaixar && (
        <p id="baixar-erro" role="alert" className="text-xs text-rose-700 dark:text-rose-300">
          {erroAoBaixar}
        </p>
      )}
      {baixado && (
        <p id="exportar-resultado" role="status" className="text-xs text-slate-600 dark:text-slate-300">
          Arquivo “{baixado}” gerado.
        </p>
      )}
      {avisos.length > 0 && (
        <ul id="exportar-avisos" className="list-disc pl-5 text-xs text-amber-800 dark:text-amber-300 space-y-0.5">
          {avisos.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      )}
      {aberto && (
        <Dialogo
          compendium={compendium}
          disciplines={disciplines}
          themes={themes}
          onClose={() => setAberto(false)}
          onPublicado={onPublicado}
        />
      )}
    </div>
  );
};
