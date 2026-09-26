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

// A taxonomia de materiais depende de FK restritiva e de índices únicos para
// garantir que a árvore não quebre. Quando eles barram uma ação, o Postgres
// devolve o nome da constraint e nada sobre o que o admin deve fazer — e a
// Área Editorial mostrava esse texto cru (ou, no caso da exclusão, mostrava
// nada: a ação não tinha `try/catch` e falhava em silêncio). Cada entrada aqui
// traduz um bloqueio real em qual realocação editorial o desbloqueia.
const INTEGRITY_HINTS: Array<[string, string]> = [
  [
    'materials_parent_material_id_fkey',
    'Este material tem materiais-filhos na árvore. Realoque ou exclua os filhos antes de excluí-lo.',
  ],
  [
    'material_links_target_fkey',
    'Outro material aponta para este em "Estude antes". As ligações estão congeladas desde a 43-A e não são removidas pela tela; mantenha o material despublicado para tirá-lo do ar.',
  ],
  [
    'material_links_pair_unique',
    'Estes dois materiais já têm uma ligação entre si. Um par pode ser "Estude antes" ou "Veja também", nunca os dois ao mesmo tempo.',
  ],
  [
    'material_links_direction_unique',
    'Esta ligação já existe entre os dois materiais.',
  ],
];

function getIntegrityHint(err: unknown): string | undefined {
  const raw = getRawMessage(err);
  const details = typeof err === 'object' && err !== null && 'details' in err
    ? String((err as { details: unknown }).details ?? '')
    : '';
  const haystack = `${raw} ${details}`;
  return INTEGRITY_HINTS.find(([constraint]) => haystack.includes(constraint))?.[1];
}

export function getErrorMessage(err: unknown): string {
  const integrityHint = getIntegrityHint(err);
  if (integrityHint) return integrityHint;
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
