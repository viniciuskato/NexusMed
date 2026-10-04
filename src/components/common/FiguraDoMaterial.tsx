import React, { useEffect, useRef, useState } from 'react';
import { ImageOff } from 'lucide-react';
import { urlDaFigura } from '../../repositories/FigurasRepository';
import type { FiguraLida } from '../../utils/figuraDoMaterial';

// P9: a figura de um material, com legenda e fonte. A imagem só vem do Storage do próprio site, pelo identificador
// (`figura:<id>`): endereço externo, caminho, `javascript:` e `data:` não viram `<img>` — o bloco aparece só com a
// legenda e o aviso de que a imagem não está disponível. A URL assinada é pedida com a sessão da pessoa e a RLS do
// Storage só a entrega a usuário ativo.

type Estado = { tipo: 'carregando' } | { tipo: 'ok'; url: string } | { tipo: 'indisponivel' };

interface FiguraDoMaterialProps {
  figura: FiguraLida;
  /** Como o leitor renderiza o Markdown inline (negrito, citação `[N](#ref-N)`) da legenda e da fonte. */
  renderInline: (texto: string) => React.ReactNode;
}

export const FiguraDoMaterial: React.FC<FiguraDoMaterialProps> = ({ figura, renderInline }) => {
  const id = figura.destino.tipo === 'figura' ? figura.destino.id : null;
  const [estado, setEstado] = useState<Estado>(id ? { tipo: 'carregando' } : { tipo: 'indisponivel' });
  const imagem = useRef<HTMLImageElement>(null);

  useEffect(() => {
    if (!id) {
      setEstado({ tipo: 'indisponivel' });
      return;
    }
    let cancelado = false;
    setEstado({ tipo: 'carregando' });
    void urlDaFigura(id).then((url) => {
      if (!cancelado) setEstado(url ? { tipo: 'ok', url } : { tipo: 'indisponivel' });
    });
    return () => {
      cancelado = true;
    };
  }, [id]);

  // A imagem que não carrega (URL vencida, arquivo ausente) vira "indisponível". O ouvinte fica aqui, e não no
  // atributo `onError` do <img>, porque a imagem não é um elemento interativo (jsx-a11y).
  const temImagem = estado.tipo === 'ok';
  useEffect(() => {
    const el = imagem.current;
    if (!temImagem || !el) return;
    const falhou = () => setEstado({ tipo: 'indisponivel' });
    el.addEventListener('error', falhou);
    return () => el.removeEventListener('error', falhou);
  }, [temImagem]);

  return (
    <figure className="my-6" data-testid="figura-do-material">
      {estado.tipo === 'ok' ? (
        <img
          ref={imagem}
          src={estado.url}
          alt={figura.alt}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          className="mx-auto max-w-full h-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-white"
        />
      ) : (
        <div
          role="img"
          aria-label={figura.alt || 'Imagem'}
          className="flex min-h-24 items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/60 p-4 text-xs text-slate-500 dark:text-slate-400"
          data-testid="figura-indisponivel"
        >
          <ImageOff className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span>{estado.tipo === 'carregando' ? 'Carregando a imagem…' : 'Imagem indisponível.'}</span>
        </div>
      )}
      <figcaption className="mt-2 text-sm leading-relaxed text-slate-700 dark:text-slate-300">
        {figura.legenda && <span data-testid="figura-legenda">{renderInline(figura.legenda)}</span>}
        {figura.fonte && (
          <span className="mt-0.5 block text-[11px] text-slate-500 dark:text-slate-400" data-testid="figura-fonte">
            Fonte: {renderInline(figura.fonte)}
          </span>
        )}
      </figcaption>
    </figure>
  );
};
