import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Check, ClipboardCopy, ImagePlus, TriangleAlert } from 'lucide-react';
import { copiarTexto } from '../../utils/areaDeTransferencia';
import {
  LIMITE_DA_IMAGEM_BYTES,
  montarTrechoDaFigura,
  motivoDaImagemRecusada,
  tamanhoDaImagemLegivel,
} from '../../utils/figuraDoMaterial';
import { enviarFigura, ErroDoEnvioDeImagem, type FiguraEnviada } from '../../repositories/FigurasRepository';

// ============================================================================
// "Enviar imagem" (P9) — só admin (a tela que a contém já é só do admin; o banco e o Storage recusam qualquer outra
// pessoa).
//
// O admin escolhe a imagem (PNG, JPEG ou WebP, até 10 MB), escreve o texto alternativo, a legenda e a fonte, envia, e
// recebe o trecho pronto para colar no .md: o bloco de figura do padrão de conteúdos v3, já com o identificador da
// imagem. O trecho acompanha o que ele digita (a imagem enviada é a mesma). Para trocar a figura marcada pela IA
// (`figura:PENDENTE`), basta colar o trecho no lugar do bloco pendente.
// ============================================================================

const inputClass =
  'w-full min-h-11 p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100';
const labelClass = 'block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1';

type EstadoCopia = 'parado' | 'copiado' | 'falhou';

export const EnviarImagemDoMaterial: React.FC = () => {
  const ids = useId();
  const seletor = useRef<HTMLInputElement>(null);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [previa, setPrevia] = useState('');
  const [aviso, setAviso] = useState('');
  const [alt, setAlt] = useState('');
  const [legenda, setLegenda] = useState('');
  const [fonte, setFonte] = useState('');
  const [numero, setNumero] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');
  const [enviada, setEnviada] = useState<FiguraEnviada | null>(null);
  const [copia, setCopia] = useState<{ trecho: EstadoCopia; id: EstadoCopia }>({ trecho: 'parado', id: 'parado' });

  // A prévia local (blob:) da imagem escolhida; é liberada quando a escolha muda ou a tela sai.
  useEffect(() => {
    if (!arquivo || typeof URL.createObjectURL !== 'function') {
      setPrevia('');
      return;
    }
    const url = URL.createObjectURL(arquivo);
    setPrevia(url);
    return () => URL.revokeObjectURL(url);
  }, [arquivo]);

  const numeroDaFigura = useMemo(() => {
    const n = Number.parseInt(numero, 10);
    return Number.isFinite(n) && n > 0 ? n : undefined;
  }, [numero]);

  const trecho = useMemo(
    () => (enviada ? montarTrechoDaFigura({ id: enviada.id, alt, legenda, fonte, numero: numeroDaFigura }) : ''),
    [enviada, alt, legenda, fonte, numeroDaFigura],
  );

  const camposCompletos = alt.trim() !== '' && legenda.trim() !== '' && fonte.trim() !== '';
  const podeEnviar = arquivo !== null && camposCompletos && !enviando && !enviada;

  const escolher = (e: React.ChangeEvent<HTMLInputElement>) => {
    const escolhido = e.target.files?.[0] ?? null;
    e.target.value = '';
    setErro('');
    setEnviada(null);
    setCopia({ trecho: 'parado', id: 'parado' });
    if (!escolhido) return;
    const motivo = motivoDaImagemRecusada(escolhido);
    if (motivo) {
      setArquivo(null);
      setAviso(motivo);
      return;
    }
    setAviso('');
    setArquivo(escolhido);
  };

  const enviar = async () => {
    if (!podeEnviar || !arquivo) return;
    setEnviando(true);
    setErro('');
    try {
      setEnviada(await enviarFigura(arquivo));
    } catch (e) {
      setErro(e instanceof ErroDoEnvioDeImagem ? e.message : 'Não foi possível enviar a imagem. Tente de novo.');
    } finally {
      setEnviando(false);
    }
  };

  const copiar = async (qual: 'trecho' | 'id', texto: string) => {
    const ok = await copiarTexto(texto);
    setCopia((c) => ({ ...c, [qual]: ok ? 'copiado' : 'falhou' }));
  };

  const novaImagem = () => {
    setArquivo(null);
    setEnviada(null);
    setErro('');
    setAviso('');
    setAlt('');
    setLegenda('');
    setFonte('');
    setNumero((n) => {
      const atual = Number.parseInt(n, 10);
      return Number.isFinite(atual) && atual > 0 ? String(atual + 1) : '';
    });
    setCopia({ trecho: 'parado', id: 'parado' });
  };

  return (
    <section
      id="enviar-imagem"
      aria-labelledby={`${ids}-titulo`}
      className="space-y-4 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60"
    >
      <div>
        <h2 id={`${ids}-titulo`} className="text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
          <ImagePlus className="w-5 h-5" aria-hidden="true" />
          Enviar imagem
        </h2>
        <p className="mt-1 text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
          Sobe a imagem de uma figura do material e devolve o trecho pronto para colar no arquivo .md. A imagem só aparece
          para usuários aprovados, depois que o material é publicado. Toda figura leva texto alternativo, legenda e fonte.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label htmlFor={`${ids}-arquivo`} className={labelClass}>
            Imagem (PNG, JPEG ou WebP, até {tamanhoDaImagemLegivel(LIMITE_DA_IMAGEM_BYTES)})
          </label>
          <input
            ref={seletor}
            id={`${ids}-arquivo`}
            data-testid="imagem-arquivo"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={escolher}
            disabled={enviando}
            className="block w-full text-sm text-slate-800 dark:text-slate-200 file:mr-3 file:min-h-11 file:px-3 file:py-2 file:rounded-xl file:border file:border-slate-300 dark:file:border-slate-700 file:bg-white dark:file:bg-slate-900 file:text-xs file:font-semibold file:cursor-pointer"
          />
          {aviso && (
            <p role="alert" data-testid="imagem-aviso" className="mt-1 text-xs text-amber-800 dark:text-amber-300">
              {aviso}
            </p>
          )}
          {arquivo && (
            <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400" data-testid="imagem-escolhida">
              {arquivo.name} · {tamanhoDaImagemLegivel(arquivo.size)}
            </p>
          )}
          {previa && (
            <img
              src={previa}
              alt="Prévia da imagem escolhida"
              className="mt-2 max-h-48 w-auto rounded-lg border border-slate-200 dark:border-slate-800 bg-white"
            />
          )}
        </div>

        <div className="sm:col-span-2">
          <label htmlFor={`${ids}-alt`} className={labelClass}>
            Texto alternativo (descreve a imagem para quem não a vê)
          </label>
          <input id={`${ids}-alt`} data-testid="imagem-alt" value={alt} onChange={(e) => setAlt(e.target.value)} className={inputClass} />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor={`${ids}-legenda`} className={labelClass}>
            Legenda (uma frase que diz o que a figura mostra)
          </label>
          <input
            id={`${ids}-legenda`}
            data-testid="imagem-legenda"
            value={legenda}
            onChange={(e) => setLegenda(e.target.value)}
            className={inputClass}
          />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor={`${ids}-fonte`} className={labelClass}>
            Fonte (autor ou entidade, título, ano)
          </label>
          <input id={`${ids}-fonte`} data-testid="imagem-fonte" value={fonte} onChange={(e) => setFonte(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label htmlFor={`${ids}-numero`} className={labelClass}>
            Número da figura no material (opcional)
          </label>
          <input
            id={`${ids}-numero`}
            data-testid="imagem-numero"
            inputMode="numeric"
            value={numero}
            onChange={(e) => setNumero(e.target.value.replace(/\D/g, '').slice(0, 3))}
            className={inputClass}
          />
        </div>
      </div>

      {!enviada && (
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            data-testid="imagem-enviar"
            onClick={() => void enviar()}
            disabled={!podeEnviar}
            className="min-h-11 px-4 py-2 rounded-xl bg-teal-600 text-white text-sm font-semibold flex items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed hover:bg-teal-700"
          >
            <ImagePlus className="w-4 h-4" aria-hidden="true" />
            {enviando ? 'Enviando…' : 'Enviar imagem'}
          </button>
          {!camposCompletos && arquivo && (
            <span className="text-xs text-slate-600 dark:text-slate-400">Preencha o texto alternativo, a legenda e a fonte.</span>
          )}
        </div>
      )}

      {erro && (
        <p
          role="alert"
          data-testid="imagem-erro"
          className="p-3 rounded-xl border border-rose-300 bg-rose-50 dark:bg-rose-950/40 dark:border-rose-800 text-sm text-rose-900 dark:text-rose-200 flex items-start gap-2"
        >
          <TriangleAlert className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
          <span>{erro}</span>
        </p>
      )}

      {enviada && (
        <div className="space-y-3" data-testid="imagem-resultado">
          <p role="status" className="text-sm font-semibold text-emerald-800 dark:text-emerald-300 flex items-start gap-2">
            <Check className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
            <span>Imagem enviada. Cole o trecho abaixo no arquivo .md, no lugar da figura.</span>
          </p>
          <label htmlFor={`${ids}-trecho`} className={labelClass}>
            Trecho para colar no .md
          </label>
          <textarea
            id={`${ids}-trecho`}
            data-testid="imagem-trecho"
            readOnly
            rows={4}
            value={trecho}
            onFocus={(e) => e.currentTarget.select()}
            className={`${inputClass} font-mono text-xs leading-relaxed`}
          />
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              data-testid="imagem-copiar-trecho"
              onClick={() => void copiar('trecho', trecho)}
              className="min-h-11 px-4 py-2 rounded-xl bg-teal-600 text-white text-sm font-semibold flex items-center gap-2 cursor-pointer hover:bg-teal-700"
            >
              <ClipboardCopy className="w-4 h-4" aria-hidden="true" />
              {copia.trecho === 'copiado' ? 'Trecho copiado' : 'Copiar trecho'}
            </button>
            <button
              type="button"
              data-testid="imagem-copiar-id"
              onClick={() => void copiar('id', `figura:${enviada.id}`)}
              className="min-h-11 px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              <ClipboardCopy className="w-4 h-4" aria-hidden="true" />
              {copia.id === 'copiado' ? 'Identificador copiado' : 'Copiar só o identificador'}
            </button>
            <button
              type="button"
              data-testid="imagem-outra"
              onClick={novaImagem}
              className="min-h-11 px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-semibold text-slate-800 dark:text-slate-200 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              Enviar outra imagem
            </button>
          </div>
          {(copia.trecho === 'falhou' || copia.id === 'falhou') && (
            <p role="alert" className="text-xs text-amber-800 dark:text-amber-300">
              Não foi possível copiar sozinho: selecione o texto da caixa e copie com Ctrl+C.
            </p>
          )}
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            O arquivo da imagem não pode ser trocado depois de enviado. Para usar outra imagem, envie uma nova e troque o
            trecho.
          </p>
        </div>
      )}
    </section>
  );
};
