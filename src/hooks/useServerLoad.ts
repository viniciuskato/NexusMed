import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { LoadStatus, loadStatusOf } from '../services/connectivity';
import { useAutoRetry } from './useAutoRetry';

/** O que a carga devolve: a função que grava na tela o que chegou do servidor. */
export type ApplyLoaded = () => void;

/**
 * Roda uma carga do servidor e acompanha o resultado (45-G, D-2).
 *
 * `load` busca os dados e devolve a função que os grava na tela. O hook só a
 * chama se esta for a carga mais recente — uma resposta velha que chega por
 * último nunca sobrescreve a nova. Numa falha nada é gravado (o que já estava
 * na tela continua ali) e `status` passa a `offline` (sem rede) ou `error`;
 * enquanto não for `ok`, a carga roda de novo sozinha (`useAutoRetry`).
 * `key` troca quando a carga precisa ser refeita (ex.: outro material
 * aberto); `null` não carrega sozinho — quem usa chama `reload`.
 */
export function useServerLoad(load: () => Promise<ApplyLoaded | void>, key: string | number | null = 0) {
  const [status, setStatus] = useState<LoadStatus>('ok');
  const loadRef = useRef(load);
  useLayoutEffect(() => {
    loadRef.current = load;
  });
  const seq = useRef(0);

  const reload = useCallback(async () => {
    const mine = ++seq.current;
    try {
      const apply = await loadRef.current();
      if (mine !== seq.current) return; // uma carga mais nova já foi pedida: esta é descartada
      apply?.();
      setStatus('ok');
    } catch (err) {
      if (mine === seq.current) setStatus(loadStatusOf(err));
    }
  }, []);

  useEffect(() => {
    if (key === null) return;
    void reload();
  }, [key, reload]);

  useAutoRetry(status, () => void reload());

  return { status, reload };
}
