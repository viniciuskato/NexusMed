import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

// O pgTAP (supabase/tests/database/agendar_revisor_44f.test.sql) roda dentro de um contêiner
// que só enxerga a pasta de testes, então repete o bloco da migration. Este teste garante que
// a cópia é idêntica ao bloco que a migration executa.
const DO_BLOCO = /do \$\$\r?\nbegin[\s\S]*?\r?\nend;\r?\n\$\$;/;
const normalizar = (texto: string) => texto.replace(/\r\n/g, '\n');

describe('44-F — o pgTAP do agendamento testa o mesmo bloco da migration', () => {
  const migration = normalizar(
    readFileSync(path.resolve(process.cwd(), 'supabase/migrations/20261003120600_agendar_revisor_44f.sql'), 'utf8'),
  );
  const teste = normalizar(
    readFileSync(path.resolve(process.cwd(), 'supabase/tests/database/agendar_revisor_44f.test.sql'), 'utf8'),
  );

  it('a migration tem o bloco que agenda revisar-envios a cada 5 minutos', () => {
    const bloco = migration.match(DO_BLOCO)?.[0] ?? '';
    expect(bloco).toContain("cron.schedule('revisar-envios', '*/5 * * * *'");
    expect(bloco).toContain('select app.disparar_revisao()');
  });

  it('o bloco do teste é idêntico ao da migration', () => {
    const daMigration = migration.match(DO_BLOCO)?.[0];
    const entre = teste.split('-- inicio-do-bloco-da-migration\n')[1]?.split('-- fim-do-bloco-da-migration')[0];
    expect(daMigration).toBeTruthy();
    expect(entre?.trim()).toBe(daMigration);
  });
});
