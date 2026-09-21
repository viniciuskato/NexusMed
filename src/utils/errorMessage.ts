// Erros do supabase-js (PostgrestError, vindo de .rpc()/.from()) são objetos
// simples com `message` — NÃO são `instanceof Error`. O padrão comum
// `err instanceof Error ? err.message : String(err)` vira "[object Object]"
// para qualquer erro de RPC real (achado real ao testar 23-B em navegador:
// publish_material/publish_question rejeitando ficava sem mensagem legível
// nenhuma na Área Editorial).
//
// `PGRST202` é o código que o PostgREST devolve quando a função chamada via
// `.rpc()` simplesmente não existe no schema cache daquele projeto Supabase
// — quase sempre porque uma migration nova só foi aplicada no Supabase
// LOCAL, nunca no remoto (ver AGENTS.md, risco #4: `.env.local` aponta pro
// Supabase remoto por padrão; um build de produção/`vite preview` local usa
// esse remoto, não o local do `supabase start`). Sem tratamento especial, o
// admin só via a mensagem crua do Postgres ("Could not find the function
// public.import_question_draft(...) in the schema cache") repetida em CADA
// linha de um lote inteiro, sem nenhuma pista de causa ou próximo passo —
// achado real ao testar a importação de um lote de 18 questões contra um
// ambiente sem a migration aplicada.
function isFunctionMissingFromSchemaCache(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: unknown }).code === 'PGRST202';
}

export function getErrorMessage(err: unknown): string {
  if (isFunctionMissingFromSchemaCache(err)) {
    const raw = getRawMessage(err);
    return (
      'A função do banco chamada por esta ação ainda não existe neste ambiente Supabase ' +
      '(schema cache sem essa função — normalmente uma migration nova aplicada só no local, ' +
      'nunca no remoto). Se você está testando localmente, confirme que rodou `supabase db reset` ' +
      'depois de puxar as mudanças mais recentes; se isto acontece fora do ambiente local, a migration ' +
      `correspondente ainda não foi aplicada nesse Supabase — não repita a tentativa sem aplicá-la antes. Detalhe técnico: ${raw}`
    );
  }
  return getRawMessage(err);
}

function getRawMessage(err: unknown): string {
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
