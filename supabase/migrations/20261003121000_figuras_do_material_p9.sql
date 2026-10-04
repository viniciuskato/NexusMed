-- ============================================================================
-- P9 — Figuras nos materiais
--
-- Decisão do dono (03/10): o NexusMed passa a ser o caderno digital dele, e material pode ter imagem e figura,
-- sempre com legenda e fonte. A imagem entra no texto do material por um identificador (`figura:<uuid>`, ver o
-- padrão de conteúdos, v3); aqui ficam o arquivo e a regra de quem o vê.
--
-- O que esta migration faz:
--   1. bucket privado `material-figures` (png, jpeg ou webp, até 10 MiB; nada de svg nem pdf);
--   2. tabela `material_figures`: uma linha por imagem enviada (id, caminho, tipo, tamanho, SHA-256);
--   3. quem vê: admin ativo vê todas; estudante ativo só vê a imagem que algum material PUBLICADO cita no texto
--      (`app.figure_is_published`); anon e pendente/bloqueado não veem nada, nem a linha nem o arquivo;
--   4. quem grava: só admin ativo, e só cria: nenhum papel do app atualiza nem apaga figura nem arquivo.
--
-- Por que um bucket e uma tabela novos, em vez do `editorial-assets` + `content_assets`: o `content_assets`
-- exige um material, seção ou questão já existente (a imagem é enviada ANTES de o material existir, para o dono
-- colar o trecho no .md) e o `editorial-assets` deixa o admin sobrescrever e apagar qualquer objeto.
--
-- Por que a figura não precisa de campo próprio no hash/snapshot do material: o identificador da figura está no
-- texto da seção (`content`), que já é o que `app.build_material_snapshot` guarda e o que o hash de atestação e o
-- hash do envio cobrem; trocar a figura de um material é trocar o identificador no texto e muda o hash. E, como a
-- figura é imutável (item 4), o mesmo identificador sempre é o mesmo arquivo: nada muda a imagem de um material
-- atestado sem mudar o hash.
--
-- AGENTS.md riscos 13 e 14: tabela nova com `revoke all ... from anon`; função nova de cliente logado com
-- revoke de public/anon.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Bucket privado
-- ----------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'material-figures',
  'material-figures',
  false,
  10485760, -- 10 MiB
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do nothing;

-- ----------------------------------------------------------------------------
-- 2. Tabela das figuras
-- ----------------------------------------------------------------------------

create table public.material_figures (
  id uuid primary key default gen_random_uuid(),
  -- Caminho do arquivo no bucket: <id>.<png|jpg|webp>.
  storage_path text not null unique,
  mime_type text not null check (mime_type in ('image/png', 'image/jpeg', 'image/webp')),
  byte_size integer not null check (byte_size > 0 and byte_size <= 10485760),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint material_figures_path_matches_id
    check (storage_path = id::text || case mime_type
      when 'image/png' then '.png'
      when 'image/jpeg' then '.jpg'
      else '.webp' end)
);

comment on table public.material_figures is
  'P9: imagem enviada pelo admin para usar em material (`figura:<id>` no texto). Imutável para o app: sem update nem delete.';

-- ----------------------------------------------------------------------------
-- 3. Quem vê a figura
-- ----------------------------------------------------------------------------

-- A figura é visível ao estudante quando algum material publicado a cita no texto de uma seção. SECURITY DEFINER
-- porque a política da tabela roda como o usuário e a leitura do texto das seções passa por ela.
create or replace function app.figure_is_published(p_figure_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.material_sections s
    join public.materials m on m.id = s.material_id
    where m.status = 'published'
      and position(('(figura:' || p_figure_id::text || ')') in s.content) > 0
  );
$$;

revoke all on function app.figure_is_published(uuid) from public, anon;
grant execute on function app.figure_is_published(uuid) to authenticated, service_role;

alter table public.material_figures enable row level security;

revoke all on table public.material_figures from anon;
revoke all on table public.material_figures from authenticated;
grant select, insert on table public.material_figures to authenticated;

create policy material_figures_select on public.material_figures
  for select to authenticated
  using (
    app.is_admin_active(auth.uid())
    or (app.current_profile_status(auth.uid()) = 'active' and app.figure_is_published(id))
  );

create policy material_figures_admin_insert on public.material_figures
  for insert to authenticated
  with check (app.is_admin_active(auth.uid()));

-- ----------------------------------------------------------------------------
-- 4. O arquivo no bucket: o mesmo critério, e só o admin cria
-- ----------------------------------------------------------------------------

-- Leitura: admin ativo, ou estudante ativo para a figura que a tabela (e a regra acima) deixa ver.
create policy material_figures_objects_select
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'material-figures'
    and (
      app.is_admin_active(auth.uid())
      or (
        app.current_profile_status(auth.uid()) = 'active'
        and exists (select 1 from public.material_figures f where f.storage_path = storage.objects.name)
      )
    )
  );

-- Gravação: só admin ativo, só com o nome <uuid>.<png|jpg|webp> na raiz do bucket. Não há política de update nem
-- de delete: o arquivo de uma figura nunca muda (o identificador no texto do material fixa a imagem).
create policy material_figures_objects_admin_insert
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'material-figures'
    and app.is_admin_active(auth.uid())
    and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|webp)$'
  );
