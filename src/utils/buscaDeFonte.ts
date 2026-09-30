// 45-H (AUD-32.3) — filtro `.or()` do PostgREST para a busca de fontes.
//
// Dentro de `or=(a,b,c)` o PostgREST separa por vírgula e lê parênteses como
// agrupamento: "Harrison (21ª ed.)" solto no filtro devolvia 400, e o seletor
// mostrava "Fonte não cadastrada". O valor vai entre aspas duplas (a forma que
// o PostgREST define para valor com caractere reservado), com `"` escapado.
// `%` e `\` digitados saem: seriam curinga e escape do LIKE.

/** Condições do `.or()` da busca por texto da citação, DOI ou URL. */
export function filtroBuscaDeFonte(consulta: string): string {
  const limpo = consulta.replace(/[%\\]/g, '');
  const valor = `"%${limpo.replace(/"/g, '\\"')}%"`;
  return [
    `citation_text.ilike.${valor}`,
    `identificadores->>doi.ilike.${valor}`,
    `identificadores->>url.ilike.${valor}`,
  ].join(',');
}
