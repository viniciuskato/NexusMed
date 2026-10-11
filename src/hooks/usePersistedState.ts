import { useEffect, useState } from 'react';
import { StorageService } from '../services/storage';

// useState que sobrevive à troca de seção do app (App.tsx desmonta cada view
// ao trocar de activeView — ver AdminCMSView.tsx, CompendiumView.tsx,
// QuestionsView.tsx, que perdiam aba/filtro selecionado
// a cada navegação). Grava no localStorage isolado por usuário via
// StorageService.getUIState/setUIState — sobrevive a reload também, não só
// a troca de seção dentro da sessão.
export function usePersistedState<T>(key: string, defaultValue: T) {
  const [value, setValue] = useState<T>(() => StorageService.getUIState<T>(key, defaultValue));

  useEffect(() => {
    StorageService.setUIState(key, value);
  }, [key, value]);

  return [value, setValue] as const;
}
