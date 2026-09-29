import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, act, waitFor, fireEvent } from '@testing-library/react';
import { useState } from 'react';

// 45-G (D-2): sem rede, a tela diz "sem conexão", mantém o que já estava ali
// e carrega sozinha quando a conexão volta — inclusive quando o navegador
// nunca ficou "offline" (servidor fora com navigator.onLine verdadeiro).

vi.mock('../../src/services/storage', () => ({ getStorageUser: () => null }));

const { useServerLoad } = await import('../../src/hooks/useServerLoad');
const { ConnectionNotice } = await import('../../src/components/common/ConnectionNotice');

let serverUp = true;
let serverValue = 'v1';
let failMessage = 'Failed to fetch';

function Screen({ testId = 'value' }: { testId?: string }) {
  const [value, setValue] = useState('(vazio)');
  const { status, reload } = useServerLoad(async () => {
    if (!serverUp) throw new Error(failMessage);
    const next = serverValue;
    return () => setValue(next);
  });
  return (
    <div>
      <ConnectionNotice status={status} />
      <p data-testid={testId}>{value}</p>
      <button type="button" onClick={() => void reload()}>
        recarregar-{testId}
      </button>
    </div>
  );
}

beforeEach(() => {
  serverUp = true;
  serverValue = 'v1';
  failMessage = 'Failed to fetch';
  Object.defineProperty(globalThis.navigator, 'onLine', { value: true, configurable: true });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('useServerLoad + ConnectionNotice', () => {
  it('sem rede: mostra "sem conexão", mantém o que estava na tela e recarrega sozinha quando a rede volta', async () => {
    render(<Screen />);
    await waitFor(() => expect(screen.getByTestId('value').textContent).toBe('v1'));
    expect(screen.queryByText(/Sem conexão/)).toBeNull();

    serverUp = false;
    serverValue = 'v2';
    await act(async () => {
      screen.getByRole('button', { name: 'recarregar-value' }).click();
    });
    expect(await screen.findByText(/Sem conexão/)).toBeTruthy();
    expect(screen.getByTestId('value').textContent).toBe('v1'); // não apagou nada

    serverUp = true;
    await act(async () => {
      window.dispatchEvent(new Event('online'));
    });
    await waitFor(() => expect(screen.getByTestId('value').textContent).toBe('v2'));
    expect(screen.queryByText(/Sem conexão/)).toBeNull();
  });

  it('erro que não é de rede mostra "não foi possível carregar", não "sem conexão"', async () => {
    serverUp = false;
    failMessage = 'permission denied';
    render(<Screen />);
    expect(await screen.findByText(/Não foi possível carregar agora/)).toBeTruthy();
  });

  it('servidor fora com navigator.onLine verdadeiro: tenta de novo sozinha, sem depender do evento online (revisão, item 4)', async () => {
    vi.useFakeTimers();
    serverUp = false;
    render(<Screen />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByText(/Sem conexão/)).toBeTruthy();

    serverUp = true; // o servidor volta; o navegador nunca disparou "online"
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(screen.getByTestId('value').textContent).toBe('v1');
    expect(screen.queryByText(/Sem conexão/)).toBeNull();
  });

  it('resposta velha que chega depois da nova não sobrescreve a tela (revisão, item 6)', async () => {
    const pending: Array<{ value: string; resolve: () => void }> = [];
    function RacyScreen() {
      const [value, setValue] = useState('(vazio)');
      const { reload } = useServerLoad(async () => {
        const next = serverValue;
        await new Promise<void>((resolve) => pending.push({ value: next, resolve }));
        return () => setValue(next);
      }, null);
      return (
        <div>
          <p data-testid="racy">{value}</p>
          <button type="button" onClick={() => void reload()}>
            carregar
          </button>
        </div>
      );
    }
    render(<RacyScreen />);

    serverValue = 'velha';
    fireEvent.click(screen.getByRole('button', { name: 'carregar' }));
    serverValue = 'nova';
    fireEvent.click(screen.getByRole('button', { name: 'carregar' }));
    await waitFor(() => expect(pending).toHaveLength(2));

    await act(async () => {
      pending[1].resolve(); // a nova chega primeiro
    });
    await act(async () => {
      pending[0].resolve(); // a velha chega por último
    });
    expect(screen.getByTestId('racy').textContent).toBe('nova');
  });

  it('duas cargas falhando na mesma tela mostram UM aviso, e "Tentar agora" refaz as duas (revisão, item 8)', async () => {
    serverUp = false;
    render(
      <>
        <Screen testId="a" />
        <Screen testId="b" />
      </>
    );
    await waitFor(() => expect(screen.getAllByRole('status')).toHaveLength(1));

    serverUp = true;
    serverValue = 'v3';
    fireEvent.click(screen.getByRole('button', { name: 'Tentar agora' }));
    await waitFor(() => {
      expect(screen.getByTestId('a').textContent).toBe('v3');
      expect(screen.getByTestId('b').textContent).toBe('v3');
    });
    expect(screen.queryAllByRole('status')).toHaveLength(0);
  });
});
