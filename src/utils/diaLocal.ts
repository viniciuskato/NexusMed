/**
 * Dia do calendário LOCAL (AAAA-MM-DD) de uma data ou timestamp ISO.
 *
 * "Hoje", "ontem" e a ofensiva seguem o relógio do estudante: em UTC-3, estudo
 * às 22h ainda é hoje. `toISOString().slice(0, 10)` dá o dia UTC — às 21h em
 * Brasília já é "amanhã" — e não deve ser usado para decidir o dia de estudo.
 * Timestamp inválido devolve ''.
 */
export function diaLocal(valor: string | Date): string {
  const d = typeof valor === 'string' ? new Date(valor) : valor;
  if (Number.isNaN(d.getTime())) return '';
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mes}-${dia}`;
}
