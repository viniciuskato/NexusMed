import { config as loadEnv } from 'dotenv';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.resolve(__dirname, '..', '.env.local') });

const EXECUTE = process.argv.includes('--execute');
const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const MEDICINA_DIR = 'C:\\Users\\vinic\\OneDrive\\Estudos\\Base de Estudos\\Biblioteca\\Medicina';

// as 3 únicas materials com imagem local, mapeadas pro título exato gravado no banco
const TITLE_TO_LOCAL_DIR: Record<string, string> = {
  'Resposta Imune a Bactérias — Extracelulares e Intracelulares':
    path.join(MEDICINA_DIR, 'Imunologia', 'Fundamentos', 'img', 'resposta-imune-bacterias-extra-intracelulares'),
  'Síndromes Bronco-Pleuro-Pulmonares':
    path.join(MEDICINA_DIR, 'Pneumologia', 'Semiologia', 'img', 'sindromes-bronco-pleuro-pulmonares'),
  'Tumores do Sistema Nervoso Central':
    path.join(MEDICINA_DIR, 'Neurologia', 'Clínica', '_imagens'),
};

async function main() {
  const { data: rows, error } = await admin
    .from('content_assets')
    .select('id, external_url, mime_type, material_sections(material_id, materials(id, title))')
    .not('external_url', 'is', null)
    .not('external_url', 'like', 'http%');
  if (error) throw error;

  console.log(`Encontradas ${rows!.length} content_assets com external_url local (esperado: 32).`);

  let uploaded = 0, failed = 0;
  for (const row of rows!) {
    const section = (row as unknown as { material_sections?: { materials?: { id: string; title: string } | null } | null })
      .material_sections;
    const material = section?.materials;
    if (!material) { console.log('SEM material resolvido para asset', row.id, row.external_url); failed++; continue; }

    const baseDir = TITLE_TO_LOCAL_DIR[material.title];
    if (!baseDir) { console.log('SEM mapeamento de pasta para title:', material.title); failed++; continue; }

    const filename = row.external_url.split('/').pop()!;
    const localPath = path.join(baseDir, filename);
    if (!fs.existsSync(localPath)) { console.log('ARQUIVO NÃO ENCONTRADO:', localPath); failed++; continue; }

    const ext = filename.split('.').pop();
    const storagePath = `materials/${material.id}/${row.id}.${ext}`;

    if (EXECUTE) {
      const buffer = fs.readFileSync(localPath);
      const { error: upErr } = await admin.storage
        .from('editorial-assets')
        .upload(storagePath, buffer, { contentType: row.mime_type, upsert: false });
      if (upErr) { console.log('FALHA upload', storagePath, upErr.message); failed++; continue; }

      const { error: updErr } = await admin
        .from('content_assets')
        .update({ storage_path: storagePath, external_url: null })
        .eq('id', row.id);
      if (updErr) { console.log('FALHA update row', row.id, updErr.message); failed++; continue; }
    }
    console.log(`${EXECUTE ? 'OK' : 'DRY-RUN'}: ${localPath} -> ${storagePath}`);
    uploaded++;
  }
  console.log(`\nTotal: ${uploaded} ${EXECUTE ? 'enviadas' : 'simuladas'}, ${failed} falhas.`);
}
main();
