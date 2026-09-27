import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, act, waitFor } from '@testing-library/react';
import { useState } from 'react';

// 45-G (D-2): sem rede, a tela diz "sem conexão", mantém o que já estava ali
// e carrega sozinha quando a rede volta.

vi.mock('../../src/services/storage', () => ({ getStorageUser: () => null }));

const { useServerLoad } = await import('../../src/hooks/useServerLoad');
const { ConnectionNotice } = await import('../../src/components/common/ConnectionNotice');

let serverUp = true;
let serverValue = 'v1';
let failMessage = 'Failed to fetch';

function Screen() {
  const [value, setValue] = useState('(vazio)');
  const { status, reload } = useServerLoad(async () => {
    if (!serverUp) throw new Error(failMessage);
    setValue(serverValue);
  });
  return (
    <div>
      <ConnectionNotice status={status} onRetry={() => void reload()} />
      <p data-testid="value">{value}</p>
      <button type="button" onClick={() => void reload()}>
        recarregar
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
afterEach(() => cleanup());

describe('useServerLoad + ConnectionNotice', () => {
  it('sem rede: mostra "sem conexão", mantém o que estava na tela e recarrega sozinha quando a rede volta', async () => {
    render(<Screen />);
    await waitFor(() => expect(screen.getByTestId('value').textContent).toBe('v1'));
    expect(screen.queryByText(/Sem conexão/)).toBeNull();

    // A rede cai e a tela tenta recarregar.
    serverUp = false;
    serverValue = 'v2';
    await act(async () => {
      screen.getByRole('button', { name: 'recarregar' }).click();
    });
    expect(await screen.findByText(/Sem conexão/)).toBeTruthy();
    expect(screen.getByTestId('value').textContent).toBe('v1'); // não apagou nada

    // A rede volta: o navegador avisa e a tela carrega sozinha.
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
});
