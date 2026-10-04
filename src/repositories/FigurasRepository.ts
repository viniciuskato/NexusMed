import { isSupabaseConfigured, supabase } from '../lib/supabaseClient';
import {
  caminhoDaFigura,
  FIGURA_ID,
  LIMITE_DA_IMAGEM_BYTES,
  motivoDaImagemRecusada,
  tipoPelosBytes,
} from '../utils/figuraDoMaterial';

// P9: figuras dos materiais. Acesso direto ao Supabase, sem o padrão "Resilient" (AGENTS.md, risco 8): imagem não é
// gravada local nem entra em fila; ou o servidor aceita, ou a tela diz que não enviou.
//
// O bucket `material-figures` é privado: o leitor mostra a figura por uma URL assinada de curta duração, pedida
// com a sessão da pessoa — a RLS do Storage só a entrega a usuário ativo, e a estudante só vê a figura que algum
// material publicado cita (migration 20261003121000). A figura é imutável: o identificador no texto do material
// é sempre o mesmo arquivo.

export const BUCKET_DE_FIGURAS = 'material-figures';

/** A URL assinada vale 1 h; o leitor guarda a que já pediu até 5 min antes de vencer. */
const VALIDADE_DA_URL_SEGUNDOS = 3600;
const MARGEM_DA_URL_MS = 5 * 60 * 1000;

interface UrlEmCache {
  url: string;
  venceEm: number;
}

const cacheDeUrls = new Map<string, UrlEmCache>();
const emVoo = new Map<string, Promise<string | null>>();

/** Só para testes. */
export function limparCacheDeFiguras(): void {
  cacheDeUrls.clear();
  emVoo.clear();
}

/**
 * A URL assinada da figura, ou `null` quando ela não está disponível para esta pessoa (não existe, não é de um
 * material publicado, pessoa sem acesso, sem conexão com o servidor). Nunca lança.
 */
export async function urlDaFigura(id: string): Promise<string | null> {
  if (!FIGURA_ID.test(id) || !isSupabaseConfigured) return null;
  const guardada = cacheDeUrls.get(id);
  if (guardada && guardada.venceEm - MARGEM_DA_URL_MS > Date.now()) return guardada.url;
  const pedido = emVoo.get(id);
  if (pedido) return pedido;

  const novo = (async () => {
    try {
      const { data: linha, error } = await supabase
        .from('material_figures')
        .select('storage_path')
        .eq('id', id)
        .maybeSingle();
      if (error || !linha) return null;
      const { data, error: erroDaUrl } = await supabase.storage
        .from(BUCKET_DE_FIGURAS)
        .createSignedUrl((linha as { storage_path: string }).storage_path, VALIDADE_DA_URL_SEGUNDOS);
      if (erroDaUrl || !data?.signedUrl) return null;
      cacheDeUrls.set(id, { url: data.signedUrl, venceEm: Date.now() + VALIDADE_DA_URL_SEGUNDOS * 1000 });
      return data.signedUrl;
    } catch {
      return null;
    } finally {
      emVoo.delete(id);
    }
  })();
  emVoo.set(id, novo);
  return novo;
}

export interface FiguraEnviada {
  id: string;
  storagePath: string;
  mimeType: string;
  byteSize: number;
  sha256: string;
}

export class ErroDoEnvioDeImagem extends Error {}

async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Envia a imagem (só admin; o banco e o Storage recusam qualquer outra pessoa): confere tipo e tamanho, depois os
 * primeiros bytes (o tipo dito pelo navegador não basta), sobe o arquivo e registra a figura. Lança
 * `ErroDoEnvioDeImagem` com a explicação em palavras leigas.
 */
export async function enviarFigura(arquivo: File): Promise<FiguraEnviada> {
  if (!isSupabaseConfigured) {
    throw new ErroDoEnvioDeImagem('O envio de imagem precisa da conexão com o servidor e não está disponível neste ambiente.');
  }
  const motivo = motivoDaImagemRecusada(arquivo);
  if (motivo) throw new ErroDoEnvioDeImagem(motivo);

  const bytes = await arquivo.arrayBuffer();
  if (bytes.byteLength > LIMITE_DA_IMAGEM_BYTES) {
    throw new ErroDoEnvioDeImagem('A imagem passa de 10 MB. Reduza-a e tente de novo.');
  }
  const tipo = tipoPelosBytes(new Uint8Array(bytes.slice(0, 16)));
  if (!tipo || tipo !== arquivo.type) {
    throw new ErroDoEnvioDeImagem('O conteúdo do arquivo não é uma imagem PNG, JPEG ou WebP válida.');
  }

  const id = crypto.randomUUID();
  const storagePath = caminhoDaFigura(id, tipo);
  const sha256 = await sha256Hex(bytes);

  const { error: erroDoArquivo } = await supabase.storage
    .from(BUCKET_DE_FIGURAS)
    .upload(storagePath, new Blob([bytes], { type: tipo }), { contentType: tipo, upsert: false });
  if (erroDoArquivo) {
    throw new ErroDoEnvioDeImagem('Não foi possível enviar a imagem. Confira a conexão e se você é administrador, e tente de novo.');
  }

  const { error: erroDaLinha } = await supabase.from('material_figures').insert({
    id,
    storage_path: storagePath,
    mime_type: tipo,
    byte_size: bytes.byteLength,
    sha256,
  });
  if (erroDaLinha) {
    throw new ErroDoEnvioDeImagem('A imagem subiu, mas não foi registrada. Tente enviar de novo.');
  }
  return { id, storagePath, mimeType: tipo, byteSize: bytes.byteLength, sha256 };
}
