-- ============================================================================
-- 43-D — Busca de materiais no banco, como numa base de artigos científicos
-- ============================================================================
-- Antes, o Ctrl+K filtrava no navegador o conteúdo baixado, procurando a
-- frase exata: diferenciava acento e letra grega, não ordenava por relevância,
-- não mostrava trecho nem abria na seção. Agora a busca roda aqui:
--
--   * várias palavras em qualquer ordem (todas precisam estar no material);
--     aspas para frase exata;
--   * sem diferença de acento, maiúscula ou letra grega ("β" = "beta"), e um
--     termo com hífen casa com a forma unida ("beta-lactâmico" =
--     "betalactâmico"); palavra de 4+ letras vale como prefixo;
--   * palavras-chave (tags) encontram o material;
--   * ordem: título > palavras-chave > subtítulo/título de seção > texto;
--   * cada resultado traz o caminho na árvore, a seção que casou e um trecho
--     com os termos entre marcadores próprios (U+E000 … U+E001) — o
--     componente monta o destaque; nada aqui é HTML.
--
-- O índice mora no schema `app` (fora da API REST) e é mantido por gatilhos
-- em materials/material_sections. Nada muda nessas tabelas nem no snapshot de
-- atestação: o índice é derivado, reconstruível a qualquer momento pelo
-- backfill no fim deste arquivo.
--
-- A normalização não usa a extensão unaccent: `normalize(..., NFKD)` separa
-- o acento da letra e o acento é removido por faixa Unicode. Tudo IMMUTABLE,
-- sem depender de dicionário instalado no servidor.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Normalização
-- ----------------------------------------------------------------------------

-- Minúsculas, sem acento, letra grega por extenso e hífens tipográficos
-- unificados em "-". Não mexe em espaços: a quantidade de palavras de um texto
-- é a mesma antes e depois (o trecho destacado depende disso).
create or replace function app.search_base(p_text text)
returns text
language sql
immutable
parallel safe
as $$
  select translate(
    replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(
    replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(
    replace(replace(replace(replace(replace(
      regexp_replace(normalize(lower(coalesce(p_text, '')), NFKD), '[\u0300-\u036f]', '', 'g'),
      'α', 'alfa'), 'β', 'beta'), 'γ', 'gama'), 'δ', 'delta'), 'ε', 'epsilon'),
      'ζ', 'zeta'), 'η', 'eta'), 'θ', 'teta'), 'ι', 'iota'), 'κ', 'kappa'),
      'λ', 'lambda'), 'μ', 'mu'), 'ν', 'nu'), 'ξ', 'xi'), 'ο', 'omicron'),
      'π', 'pi'), 'ρ', 'ro'), 'σ', 'sigma'), 'ς', 'sigma'), 'τ', 'tau'),
      'υ', 'upsilon'), 'φ', 'fi'), 'χ', 'qui'), 'ψ', 'psi'), 'ω', 'omega'),
    E'\u2010\u2011', '--'
  )
$$;

-- Texto indexável: palavras soltas (hífen vira espaço, preservando a posição
-- para frase exata) seguidas das formas unidas dos termos com hífen, para que
-- "betalactamico" ache "beta-lactâmico".
create or replace function app.search_document(p_text text)
returns text
language sql
immutable
parallel safe
as $$
  select btrim(
    regexp_replace(b.t, '[^a-z0-9]+', ' ', 'g')
    || coalesce(' ' || (
      select string_agg(replace(m[1], '-', ''), ' ')
      from regexp_matches(b.t, '([a-z0-9]+(?:-+[a-z0-9]+)+)', 'g') as m
    ), '')
  )
  from (select app.search_base(p_text) as t) b
$$;

create or replace function app.search_vector(p_text text)
returns tsvector
language sql
immutable
parallel safe
as $$
  select to_tsvector('simple'::regconfig, app.search_document(p_text))
$$;

-- Consulta digitada → uma tsquery por termo (todas precisam casar), e a lista
-- de termos para o destaque. Termo solto de 4+ letras vale como prefixo; entre
-- aspas, frase exata. Artigos e preposições soltos não contam, salvo se a
-- busca só tiver eles. No máximo 8 termos.
create or replace function app.search_parse_query(p_query text)
returns table (queries tsquery[], terms text[], prefixes boolean[])
language plpgsql
immutable
parallel safe
as $$
declare
  v_match text[];
  v_words text[];
  v_word text;
  v_stop constant text[] := array[
    'a', 'o', 'as', 'os', 'e', 'de', 'da', 'do', 'das', 'dos', 'em', 'no', 'na',
    'nos', 'nas', 'um', 'uma', 'para', 'por', 'com', 'ao', 'aos', 'ou'
  ];
  v_queries tsquery[] := '{}';
  v_terms text[] := '{}';
  v_prefixes boolean[] := '{}';
  v_stopwords text[] := '{}';
begin
  for v_match in
    select regexp_matches(coalesce(p_query, ''), '"([^"]*)"?|([^\s"]+)', 'g')
  loop
    exit when coalesce(array_length(v_queries, 1), 0) >= 8;
    if v_match[1] is not null then
      v_words := array_remove(
        regexp_split_to_array(btrim(regexp_replace(app.search_base(v_match[1]), '[^a-z0-9]+', ' ', 'g')), ' '),
        ''
      );
      continue when coalesce(array_length(v_words, 1), 0) = 0;
      v_queries := v_queries || to_tsquery('simple', array_to_string(v_words, ' <-> '));
      v_terms := v_terms || v_words;
      v_prefixes := v_prefixes || array_fill(false, array[array_length(v_words, 1)]);
    else
      v_words := array_remove(
        regexp_split_to_array(
          regexp_replace(app.search_base(v_match[2]), '([a-z0-9])-+(?=[a-z0-9])', '\1', 'g'),
          '[^a-z0-9]+'
        ),
        ''
      );
      foreach v_word in array coalesce(v_words, '{}') loop
        if v_word = any (v_stop) then
          v_stopwords := v_stopwords || v_word;
          continue;
        end if;
        exit when coalesce(array_length(v_queries, 1), 0) >= 8;
        v_queries := v_queries || to_tsquery('simple', v_word || case when length(v_word) >= 4 then ':*' else '' end);
        v_terms := v_terms || v_word;
        v_prefixes := v_prefixes || (length(v_word) >= 4);
      end loop;
    end if;
  end loop;

  if coalesce(array_length(v_queries, 1), 0) = 0 then
    foreach v_word in array v_stopwords loop
      exit when coalesce(array_length(v_queries, 1), 0) >= 8;
      v_queries := v_queries || to_tsquery('simple', v_word);
      v_terms := v_terms || v_word;
      v_prefixes := v_prefixes || false;
    end loop;
  end if;

  return query select v_queries, v_terms, v_prefixes;
end;
$$;

-- ----------------------------------------------------------------------------
-- 2) Trecho destacado
-- ----------------------------------------------------------------------------

-- Texto corrido a partir do Markdown do material: sem ênfase, links, títulos,
-- marcadores de lista nem tabela, e sem os caracteres usados como marcador de
-- destaque (nenhum texto do admin consegue forjar um destaque).
create or replace function app.search_plain(p_text text)
returns text
language sql
immutable
parallel safe
as $$
  select btrim(regexp_replace(regexp_replace(
    regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(
      translate(coalesce(p_text, ''), chr(57344) || chr(57345), ''),
      '!?\[([^\]]*)\]\([^)]*\)', '\1', 'g'),
      '^[ \t]*(#{1,6}|>+|[-+*•]|\d+[.)])[ \t]+', '', 'gn'),
      '\*+|`+|~~|==', '', 'g'),
      '(^|[\s(])_+|_+([\s).,;:!?]|$)', '\1\2', 'g'),
      '[|[:cntrl:]]', ' ', 'g'),
    '(^|\s)[-:]{3,}(?=\s|$)', ' ', 'g'),
  '\s+', ' ', 'g'))
$$;

-- Envolve a palavra nos marcadores, deixando pontuação colada de fora.
create or replace function app.search_mark_word(p_word text)
returns text
language sql
immutable
parallel safe
as $$
  select case
    when p_word !~ '[[:alnum:]]' then chr(57344) || p_word || chr(57345)
    else
      substring(p_word from '^[^[:alnum:]]*')
      || chr(57344)
      || substr(
           p_word,
           length(substring(p_word from '^[^[:alnum:]]*')) + 1,
           length(p_word) - length(substring(p_word from '^[^[:alnum:]]*'))
             - length(substring(p_word from '[^[:alnum:]]*$'))
         )
      || chr(57345)
      || substring(p_word from '[^[:alnum:]]*$')
  end
$$;

-- Destaca os termos no texto. Com p_window, devolve só uma janela de
-- p_window palavras em volta do trecho que reúne mais termos diferentes, com
-- "…" nas pontas cortadas; sem p_window, o texto inteiro.
create or replace function app.search_highlight(
  p_text text,
  p_terms text[],
  p_prefixes boolean[],
  p_window integer default null
)
returns text
language sql
immutable
parallel safe
as $$
  with plain as (
    select regexp_split_to_array(app.search_plain(p_text), ' ') as words
  ),
  arrays as (
    -- Uma normalização só para o texto inteiro; o separador chr(1) não existe
    -- no texto corrido (search_plain troca controle por espaço) e sobrevive à
    -- normalização, então a palavra i normalizada é a palavra i original.
    select p.words, regexp_split_to_array(app.search_base(array_to_string(p.words, chr(1))), chr(1)) as norms
    from plain p
  ),
  words as (
    select w.word, w.norm, w.pos::int as pos
    from arrays a
    cross join lateral unnest(a.words, a.norms) with ordinality as w(word, norm, pos)
    where w.word <> ''
  ),
  hits as (
    select distinct wd.pos, t.ord
    from words wd
    join unnest(p_terms, p_prefixes) with ordinality as t(term, is_prefix, ord)
      on strpos(regexp_replace(wd.norm, '[^a-z0-9]+', '', 'g'), t.term) > 0
    where exists (
      select 1
      from unnest(regexp_split_to_array(wd.norm, '[^a-z0-9]+') || regexp_replace(wd.norm, '[^a-z0-9]+', '', 'g')) as x(part)
      where x.part <> ''
        and case when t.is_prefix then starts_with(x.part, t.term) else x.part = t.term end
    )
  ),
  bounds as (
    select coalesce(max(pos), 0) as total from words
  ),
  win as (
    select
      s.first_pos,
      case when p_window is null then b.total else least(b.total, s.first_pos + p_window - 1) end as last_pos,
      b.total
    from bounds b
    cross join lateral (
      select case
        when p_window is null then 1
        else coalesce((
          select greatest(1, h1.pos - 6)
          from hits h1
          join hits h2 on h2.pos between h1.pos and h1.pos + greatest(p_window - 7, 0)
          group by h1.pos
          order by count(distinct h2.ord) desc, h1.pos
          limit 1
        ), 1)
      end as first_pos
    ) s
  )
  select
    case when w.first_pos > 1 then '… ' else '' end
    || coalesce((
      select string_agg(
        case when exists (select 1 from hits h where h.pos = wd.pos) then app.search_mark_word(wd.word) else wd.word end,
        ' ' order by wd.pos
      )
      from words wd
      where wd.pos between w.first_pos and w.last_pos
    ), '')
    || case when w.last_pos < w.total then ' …' else '' end
  from win w
$$;

-- ----------------------------------------------------------------------------
-- 3) Índice, fora da API REST
-- ----------------------------------------------------------------------------
-- Um tsvector por campo, e não um só por linha: frase exata não atravessa a
-- fronteira entre título e texto, e a ordem por relevância sabe onde o termo
-- casou.

create table app.material_search (
  material_id uuid primary key references public.materials(id) on delete cascade,
  title_vector tsvector not null,
  subtitle_vector tsvector not null,
  keywords_vector tsvector not null
);

create table app.material_section_search (
  section_id uuid primary key references public.material_sections(id) on delete cascade,
  material_id uuid not null references public.materials(id) on delete cascade,
  title_vector tsvector not null,
  body_vector tsvector not null
);

create index idx_material_search_title on app.material_search using gin (title_vector);
create index idx_material_search_subtitle on app.material_search using gin (subtitle_vector);
create index idx_material_search_keywords on app.material_search using gin (keywords_vector);
create index idx_material_section_search_title on app.material_section_search using gin (title_vector);
create index idx_material_section_search_body on app.material_section_search using gin (body_vector);
create index idx_material_section_search_material on app.material_section_search (material_id);

-- Só a RPC (SECURITY DEFINER) lê o índice. RLS ligado e sem policy é a
-- segunda porta, caso algum grant apareça depois.
alter table app.material_search enable row level security;
alter table app.material_section_search enable row level security;
revoke all on table app.material_search from public, anon, authenticated;
revoke all on table app.material_section_search from public, anon, authenticated;

create or replace function app.sync_material_search()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into app.material_search (material_id, title_vector, subtitle_vector, keywords_vector)
  values (
    new.id,
    app.search_vector(new.title),
    app.search_vector(new.subtitle),
    app.search_vector(array_to_string(new.tags, ' '))
  )
  on conflict (material_id) do update
    set title_vector = excluded.title_vector,
        subtitle_vector = excluded.subtitle_vector,
        keywords_vector = excluded.keywords_vector;
  return null;
end;
$$;

create or replace function app.sync_material_section_search()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into app.material_section_search (section_id, material_id, title_vector, body_vector)
  values (
    new.id,
    new.material_id,
    app.search_vector(concat_ws(' ', new.title, new.mechanism_tag)),
    app.search_vector(concat_ws(E'\n', new.content, array_to_string(new.key_takeaways, E'\n'),
                                new.clinical_pearl, new.warning_alert))
  )
  on conflict (section_id) do update
    set material_id = excluded.material_id,
        title_vector = excluded.title_vector,
        body_vector = excluded.body_vector;
  return null;
end;
$$;

-- Remoção sai sozinha pelo `on delete cascade` das duas tabelas do índice.
create trigger trg_sync_material_search
  after insert or update of title, subtitle, tags on public.materials
  for each row execute function app.sync_material_search();

create trigger trg_sync_material_section_search
  after insert or update of material_id, title, mechanism_tag, content, key_takeaways, clinical_pearl, warning_alert
  on public.material_sections
  for each row execute function app.sync_material_section_search();

-- ----------------------------------------------------------------------------
-- 4) A busca
-- ----------------------------------------------------------------------------
-- Visibilidade igual à das policies de materials: estudante ativo vê só
-- publicado; admin ativo vê tudo; qualquer outro, nada.
create or replace function public.search_materials(
  p_query text,
  p_discipline_id uuid default null,
  p_only_unread boolean default false,
  p_limit integer default 30
)
returns table (
  material_id uuid,
  title text,
  title_marked text,
  status text,
  discipline_id uuid,
  discipline_name text,
  tree_path text[],
  section_id uuid,
  section_title_marked text,
  snippet text,
  estimated_read_time_minutes integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_admin boolean;
  v_queries tsquery[];
  v_terms text[];
  v_prefixes boolean[];
  v_any tsquery;
  v_q tsquery;
  v_n integer;
  v_limit integer := least(greatest(coalesce(p_limit, 30), 1), 50);
begin
  if v_uid is null then
    return;
  end if;
  v_admin := app.is_admin_active(v_uid);
  if not v_admin and app.current_profile_status(v_uid) is distinct from 'active' then
    return;
  end if;

  select pq.queries, pq.terms, pq.prefixes
    into v_queries, v_terms, v_prefixes
  from app.search_parse_query(p_query) pq;
  v_n := coalesce(array_length(v_queries, 1), 0);
  if v_n = 0 then
    return;
  end if;
  foreach v_q in array v_queries loop
    v_any := case when v_any is null then v_q else v_any || v_q end;
  end loop;

  return query
  with recursive
  q as (
    select t.tq, t.ord from unnest(v_queries) with ordinality as t(tq, ord)
  ),
  visible as (
    select m.id, m.title, m.subtitle, m.status, m.discipline_id, m.parent_material_id,
           m.estimated_read_time_minutes
    from public.materials m
    where (v_admin or m.status = 'published')
      and (p_discipline_id is null or m.discipline_id = p_discipline_id)
      -- "Só o que ainda não li" = nenhuma seção atual do material marcada como
      -- lida (mesmo critério do "Não lido" da Biblioteca).
      and (not coalesce(p_only_unread, false) or not exists (
        select 1
        from public.reading_progress rp
        join public.material_sections rs
          on rs.material_id = rp.material_id and rs.id = any (rp.read_section_ids)
        where rp.user_id = v_uid and rp.material_id = m.id
      ))
  ),
  hits as (
    select ms.material_id as mid, q.ord
    from app.material_search ms
    join q on ms.title_vector @@ q.tq or ms.subtitle_vector @@ q.tq or ms.keywords_vector @@ q.tq
    union
    select ss.material_id, q.ord
    from app.material_section_search ss
    join q on ss.title_vector @@ q.tq or ss.body_vector @@ q.tq
  ),
  matched as (
    select h.mid from hits h group by h.mid having count(distinct h.ord) = v_n
  ),
  scored as (
    select
      v.id, v.title, v.subtitle, v.status, v.discipline_id, v.parent_material_id,
      v.estimated_read_time_minutes,
      (select count(*) from q where ms.title_vector @@ q.tq) as n_title,
      (select count(*) from q where ms.keywords_vector @@ q.tq) as n_keywords,
      (select count(*) from q where ms.subtitle_vector @@ q.tq) as n_subtitle,
      best.section_id as best_section_id,
      coalesce(best.n_section_title, 0) as n_section_title,
      coalesce(best.text_rank, 0) as text_rank
    from matched mt
    join visible v on v.id = mt.mid
    join app.material_search ms on ms.material_id = v.id
    left join lateral (
      select
        ss.section_id,
        (select count(*) from q where ss.title_vector @@ q.tq) as n_section_title,
        (select count(*) from q where ss.title_vector @@ q.tq or ss.body_vector @@ q.tq) as n_section,
        ts_rank(ss.body_vector, v_any) as text_rank,
        s.sort_order
      from app.material_section_search ss
      join public.material_sections s on s.id = ss.section_id
      where ss.material_id = v.id
        and (ss.title_vector @@ v_any or ss.body_vector @@ v_any)
      order by n_section_title desc, n_section desc, text_rank desc, s.sort_order
      limit 1
    ) best on true
  ),
  ranked as (
    select sc.*,
      row_number() over (
        order by sc.n_title desc, sc.n_keywords desc,
                 greatest(sc.n_subtitle, sc.n_section_title) desc,
                 sc.text_rank desc, sc.title, sc.id
      ) as rank_pos
    from scored sc
  ),
  top as (
    select * from ranked where ranked.rank_pos <= v_limit
  ),
  chain as (
    select t.id as mid, p.id, p.parent_material_id, p.status,
           coalesce(nullif(btrim(p.nav_short_title), ''), p.title) as label, 1 as depth
    from top t
    join public.materials p on p.id = t.parent_material_id
    union all
    select c.mid, p.id, p.parent_material_id, p.status,
           coalesce(nullif(btrim(p.nav_short_title), ''), p.title), c.depth + 1
    from chain c
    join public.materials p on p.id = c.parent_material_id
    where c.depth < app.material_max_depth()
  )
  select
    t.id,
    t.title,
    app.search_highlight(t.title, v_terms, v_prefixes),
    t.status,
    t.discipline_id,
    d.name,
    array[d.name] || coalesce((
      select array_agg(c.label order by c.depth desc)
      from chain c
      where c.mid = t.id and (v_admin or c.status = 'published')
    ), '{}'::text[]),
    -- Casou com o título inteiro: o clique abre o material do topo.
    case when t.n_title = v_n then null else s.id end,
    case when t.n_title = v_n or s.id is null then null
         else app.search_highlight(s.title, v_terms, v_prefixes) end,
    case
      when (t.n_title = v_n or s.id is null) and nullif(btrim(t.subtitle), '') is not null
        then app.search_highlight(t.subtitle, v_terms, v_prefixes)
      else app.search_highlight(
        concat_ws(E'\n', coalesce(s.content, f.content), array_to_string(coalesce(s.key_takeaways, f.key_takeaways), E'\n'),
                  coalesce(s.clinical_pearl, f.clinical_pearl), coalesce(s.warning_alert, f.warning_alert)),
        v_terms, v_prefixes, 30)
    end,
    t.estimated_read_time_minutes
  from top t
  join public.disciplines d on d.id = t.discipline_id
  left join public.material_sections s on s.id = t.best_section_id
  left join lateral (
    select fs.content, fs.key_takeaways, fs.clinical_pearl, fs.warning_alert
    from public.material_sections fs
    where fs.material_id = t.id and s.id is null
    order by fs.sort_order
    limit 1
  ) f on true
  order by t.rank_pos;
end;
$$;

revoke all on function app.search_base(text) from public;
revoke all on function app.search_document(text) from public;
revoke all on function app.search_vector(text) from public;
revoke all on function app.search_parse_query(text) from public;
revoke all on function app.search_plain(text) from public;
revoke all on function app.search_mark_word(text) from public;
revoke all on function app.search_highlight(text, text[], boolean[], integer) from public;
revoke all on function app.sync_material_search() from public;
revoke all on function app.sync_material_section_search() from public;
revoke all on function public.search_materials(text, uuid, boolean, integer) from public, anon;
grant execute on function public.search_materials(text, uuid, boolean, integer) to authenticated;

-- ----------------------------------------------------------------------------
-- 5) Backfill do que já existe
-- ----------------------------------------------------------------------------
insert into app.material_search (material_id, title_vector, subtitle_vector, keywords_vector)
select m.id, app.search_vector(m.title), app.search_vector(m.subtitle), app.search_vector(array_to_string(m.tags, ' '))
from public.materials m;

insert into app.material_section_search (section_id, material_id, title_vector, body_vector)
select s.id, s.material_id,
       app.search_vector(concat_ws(' ', s.title, s.mechanism_tag)),
       app.search_vector(concat_ws(E'\n', s.content, array_to_string(s.key_takeaways, E'\n'),
                                   s.clinical_pearl, s.warning_alert))
from public.material_sections s;
