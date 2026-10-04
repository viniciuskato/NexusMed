-- ============================================================================
-- P12a — o gatilho do flashcard não apaga a seção só porque o material saiu do ar
--
-- O gatilho `app.validar_secao_do_flashcard` (P10, 20261003121100) anulava a
-- seção do card sempre que o material não estava publicado. Como o upsert do
-- cliente reenvia `material_section_id` (a coluna entra no SET e o gatilho
-- dispara), editar ou sincronizar um card de um material despublicado ou
-- arquivado apagava a seção dele em silêncio — e a seção não volta quando o
-- material volta ao ar.
--
-- Agora o gatilho só anula a seção que NÃO pertence ao material do card. O
-- estado do material não conta: a seção continua sendo dele. A criação de card
-- novo pelas RPCs continua pedindo material publicado (`secao_valida_para_card`,
-- sem mudança), e nenhum dado existente é alterado por esta migration.
-- ============================================================================

create or replace function app.validar_secao_do_flashcard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.material_section_id is not null
     and not exists (
       select 1
       from public.material_sections s
       where s.id = new.material_section_id
         and s.material_id = new.material_id
     )
  then
    new.material_section_id := null;
  end if;
  return new;
end;
$$;

-- `create or replace` mantém as permissões, mas o risco 14 pede o revoke explícito.
revoke all on function app.validar_secao_do_flashcard() from public, anon, authenticated;
