// Uma rodada por vez neste notebook (D-12): arquivo de trava criado com a flag `wx` (só um processo
// consegue criá-lo). A rodada seguinte, se achar a trava de um processo que ainda vive, sai sem fazer nada.
// Trava de processo que morreu (ou muito velha, de um processo preso) é tomada.
import { closeSync, mkdirSync, openSync, readFileSync, unlinkSync, writeSync } from 'node:fs';
import path from 'node:path';

/** Rodada presa há mais que isto não segura as seguintes. */
export const IDADE_MAXIMA_DA_TRAVA_MS = 3 * 60 * 60 * 1000;

export type Trava = { ok: true; liberar: () => void } | { ok: false; motivo: string };

export interface OpcoesDaTrava {
  agora?: () => number;
  pid?: number;
  /** Diz se o processo existe (troque nos testes). */
  vivo?: (pid: number) => boolean;
  idadeMaximaMs?: number;
}

function processoVivo(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'EPERM';
  }
}

export function tentarTravar(arquivo: string, o: OpcoesDaTrava = {}): Trava {
  const agora = o.agora ?? Date.now;
  const pid = o.pid ?? process.pid;
  const vivo = o.vivo ?? processoVivo;
  const idadeMaxima = o.idadeMaximaMs ?? IDADE_MAXIMA_DA_TRAVA_MS;
  mkdirSync(path.dirname(arquivo), { recursive: true });

  for (let tentativa = 0; tentativa < 2; tentativa += 1) {
    try {
      const fd = openSync(arquivo, 'wx');
      writeSync(fd, JSON.stringify({ pid, inicio: agora() }));
      closeSync(fd);
      return {
        ok: true,
        liberar: () => {
          try {
            unlinkSync(arquivo);
          } catch {
            /* já removida */
          }
        },
      };
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
    }
    // Já existe: de quem é, e ainda vale?
    let dono: { pid?: number; inicio?: number } = {};
    try {
      dono = JSON.parse(readFileSync(arquivo, 'utf8')) as { pid?: number; inicio?: number };
    } catch {
      /* ilegível: trava velha */
    }
    const idade = typeof dono.inicio === 'number' ? agora() - dono.inicio : Number.POSITIVE_INFINITY;
    if (typeof dono.pid === 'number' && vivo(dono.pid) && idade < idadeMaxima) {
      return { ok: false, motivo: `outra rodada em andamento há ${Math.round(idade / 60_000)} min` };
    }
    try {
      unlinkSync(arquivo);
    } catch {
      /* outro processo a tomou primeiro */
    }
  }
  return { ok: false, motivo: 'não foi possível tomar a trava' };
}
