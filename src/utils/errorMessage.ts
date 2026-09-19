// Erros do supabase-js (PostgrestError, vindo de .rpc()/.from()) são objetos
// simples com `message` — NÃO são `instanceof Error`. O padrão comum
// `err instanceof Error ? err.message : String(err)` vira "[object Object]"
// para qualquer erro de RPC real (achado real ao testar 23-B em navegador:
// publish_material/publish_question rejeitando ficava sem mensagem legível
// nenhuma na Área Editorial).
export function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'object' && err !== null && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
    return (err as { message: string }).message;
  }
  return String(err);
}

// Equivalente tipado de `err?.message` para um `catch (err: unknown)`:
// devolve a mensagem só quando ela existe e é string, sem o fallback
// `String(err)` acima — para quem já usa `|| 'mensagem padrão'`.
export function getOptionalErrorMessage(err: unknown): string | undefined {
  if (typeof err === 'object' && err !== null && 'message' in err) {
    const message = (err as { message: unknown }).message;
    return typeof message === 'string' ? message : undefined;
  }
  return undefined;
}
