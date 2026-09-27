import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { LoadStatus, loadStatusOf, onReconnect } from '../services/connectivity';

/**
 * Roda uma carga do servidor e acompanha o resultado (45-G, D-2).
 *
 * `load` grava o próprio estado da tela só quando dá certo; numa falha nada é
 * apagado — o que já estava na tela continua ali — e `status` passa a
 * `offline` (sem rede) ou `error`. Enquanto não for `ok`, a carga roda de novo
 * sozinha quando a rede volta. `key` troca quando a carga precisa ser refeita
 * (ex.: outro material aberto); `null` não carrega.
 */
export function useServerLoad(load: () => Promise<void>, key: string | number | null = 0) {
  const [status, setStatus] = useState<LoadStatus>('ok');
  const loadRef = useRef(load);
  useLayoutEffect(() => {
    loadRef.current = load;
  });
  const seq = useRef(0);

  const reload = useCallback(async () => {
    const mine = ++seq.current;
    try {
      await loadRef.current();
      if (mine === seq.current) setStatus('ok');
    } catch (err) {
      if (mine === seq.current) setStatus(loadStatusOf(err));
    }
  }, []);

  useEffect(() => {
    if (key === null) return;
    void reload();
  }, [key, reload]);

  useEffect(() => {
    if (status === 'ok') return;
    return onReconnect(() => void reload());
  }, [status, reload]);

  return { status, reload };
}
