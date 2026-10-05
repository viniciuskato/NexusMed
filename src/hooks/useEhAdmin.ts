import { useAuth } from '../contexts/AuthContext';

/**
 * A pessoa logada é admin ativa? Mesma regra do `isAdmin` do `App.tsx` (papel E status ativo juntos: um admin bloqueado
 * nunca é tratado como admin pela tela). É só o que a tela mostra: quem protege a gravação é o servidor (RLS e RPCs).
 */
export function useEhAdmin(): boolean {
  const { profile } = useAuth();
  return profile?.role === 'admin' && profile?.status === 'active';
}
