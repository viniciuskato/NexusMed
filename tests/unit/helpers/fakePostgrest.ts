// ============================================================================
// PostgREST de mentira, com o mesmo corte do servidor de verdade
// ============================================================================
//
// Imita só o que os repositórios usam na leitura — `from().select()`,
// `.eq()`, `.in()`, `.order()` (encadeável), `.range()` e o `await` — e
// aplica o teto `max_rows`: nenhuma resposta passa de MAX_ROWS linhas, com ou
// sem `.range()`, exatamente como o PostgREST faz (corte silencioso, sem
// erro). Serve para provar que um repositório lê tudo mesmo com mais de 1000
// linhas numa tabela (unidade 45-C).
//
// `select()` devolve a linha inteira: o teste já monta as linhas no formato
// que o repositório espera, inclusive os embutidos (`question_options`,
// `sources`).
// ============================================================================

export const MAX_ROWS = 1000;

export type Row = Record<string, unknown>;

export interface FakePostgrestState {
  tables: Record<string, Row[]>;
  /** Uma entrada por requisição feita, na ordem. */
  requests: { table: string; range?: [number, number]; inValues?: number }[];
}

function compare(a: unknown, b: unknown): number {
  if (a === b) return 0;
  if (a === null || a === undefined) return 1;
  if (b === null || b === undefined) return -1;
  return (a as string | number) < (b as string | number) ? -1 : 1;
}

export function makeFakeSupabase(state: FakePostgrestState) {
  return {
    from(table: string) {
      let rows = [...(state.tables[table] ?? [])];
      const orders: { col: string; asc: boolean }[] = [];
      let range: [number, number] | undefined;
      let inValues: number | undefined;

      const builder = {
        select() {
          return builder;
        },
        eq(col: string, value: unknown) {
          rows = rows.filter((r) => r[col] === value);
          return builder;
        },
        in(col: string, values: unknown[]) {
          inValues = values.length;
          const wanted = new Set(values);
          rows = rows.filter((r) => wanted.has(r[col]));
          return builder;
        },
        order(col: string, opts?: { ascending?: boolean }) {
          orders.push({ col, asc: opts?.ascending ?? true });
          return builder;
        },
        range(from: number, to: number) {
          range = [from, to];
          return builder;
        },
        then<T1, T2 = never>(
          onFulfilled?: (value: { data: Row[]; error: null }) => T1 | PromiseLike<T1>,
          onRejected?: (reason: unknown) => T2 | PromiseLike<T2>
        ) {
          state.requests.push({ table, range, inValues });
          let out = [...rows];
          if (orders.length > 0) {
            out.sort((a, b) => {
              for (const o of orders) {
                const c = compare(a[o.col], b[o.col]);
                if (c !== 0) return o.asc ? c : -c;
              }
              return 0;
            });
          }
          if (range) out = out.slice(range[0], range[1] + 1);
          out = out.slice(0, MAX_ROWS); // o teto do servidor, sempre
          return Promise.resolve({ data: out, error: null }).then(onFulfilled, onRejected);
        },
      };
      return builder;
    },
  };
}
