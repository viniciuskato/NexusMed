// Registro curto em arquivo local, fora do git (D-12). Cada linha: horário, e o que aconteceu, em
// números e ids curtos. Nunca o texto de um envio, nem nome, e-mail ou outro dado pessoal.
import { appendFileSync, existsSync, mkdirSync, renameSync, statSync } from 'node:fs';
import path from 'node:path';

export type Registrar = (linha: string) => void;

/** Passou disto, o arquivo vira `revisor.log.1` (o anterior é descartado). */
export const TAMANHO_MAXIMO_DO_LOG = 1_000_000;

export function registroEmArquivo(arquivo: string, agora: () => Date = () => new Date(), eco = true): Registrar {
  return (linha) => {
    const texto = `${agora().toISOString()} ${linha.replace(/\s+/g, ' ').trim()}`;
    if (eco) console.log(texto);
    try {
      mkdirSync(path.dirname(arquivo), { recursive: true });
      if (existsSync(arquivo) && statSync(arquivo).size > TAMANHO_MAXIMO_DO_LOG) renameSync(arquivo, `${arquivo}.1`);
      appendFileSync(arquivo, `${texto}\n`, 'utf8');
    } catch {
      /* o registro nunca derruba a rodada */
    }
  };
}

/** Os 8 primeiros caracteres de um id: o bastante para achar a linha no banco, sem expor o id inteiro. */
export function idCurto(id: string): string {
  return id.slice(0, 8);
}
