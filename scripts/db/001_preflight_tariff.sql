-- Preflight: UK tariff snapshots held in Supabase (design D7). Re-runnable.
-- Apply: python3 -I scripts/dbenv.py --apply scripts/db/001_preflight_tariff.sql

create schema if not exists preflight;

create table if not exists preflight.tariff_snapshot (
  version         text primary key,
  source          text not null,
  snapshot_date   date not null,
  licence         text not null,
  commodity_rows  int,
  ref_rows        int,
  is_current      boolean not null default false,
  loaded_at       timestamptz not null default now()
);
create unique index if not exists tariff_snapshot_one_current on preflight.tariff_snapshot (is_current) where is_current;

create table if not exists preflight.tariff_commodity (
  version         text not null references preflight.tariff_snapshot (version) on delete cascade,
  row_id          int not null,
  sid             int not null,
  code            char(10) not null,
  suffix          char(2) not null,
  description     text not null,
  validity_start  date,
  validity_end    date,
  parent_sid      int,
  parent_code     char(10),
  parent_suffix   char(2),
  primary key (version, row_id)
);
create index if not exists tariff_commodity_code on preflight.tariff_commodity (version, code, suffix);
create index if not exists tariff_commodity_parent on preflight.tariff_commodity (version, parent_code, parent_suffix);
create index if not exists tariff_commodity_sid on preflight.tariff_commodity (version, sid);

create table if not exists preflight.tariff_search_ref (
  version           text not null references preflight.tariff_snapshot (version) on delete cascade,
  title             text not null,
  referenced_class  text not null,
  code              char(10) not null,
  suffix            char(2) not null
);
create index if not exists tariff_search_ref_version on preflight.tariff_search_ref (version);

-- Readable only by the owner: no policies, so PostgREST's anon/authenticated roles see nothing.
alter table preflight.tariff_snapshot enable row level security;
alter table preflight.tariff_commodity enable row level security;
alter table preflight.tariff_search_ref enable row level security;

-- Tariff descriptions: HTML removed, '|' to space, whitespace collapsed.
create or replace function preflight.clean_desc(d text) returns text
language sql immutable as $$
  select btrim(regexp_replace(replace(regexp_replace(d, '<[^>]*>', ' ', 'g'), '|', ' '), '\s+', ' ', 'g'))
$$;

create or replace view preflight.v_current as
  select * from preflight.tariff_snapshot where is_current;

-- Declarable leaves (D2): current rows, suffix 80, no current row has (code, '80') as its parent.
-- Queries the table directly (not through a CTE) so the parent index serves the NOT EXISTS.
create or replace view preflight.v_leaf as
  select l.code, l.suffix, l.sid, l.description
  from preflight.tariff_commodity l join preflight.v_current s using (version)
  where l.validity_end is null and l.suffix = '80'
    and not exists (select 1 from preflight.tariff_commodity k
                    where k.version = l.version and k.validity_end is null
                      and k.parent_code = l.code and k.parent_suffix = '80');

-- Headings (D3): suffix-80 rows at heading level only, never the suffix-10 sub-chapter titles.
create or replace view preflight.v_h4 as
  select left(c.code, 4) as h4, preflight.clean_desc(c.description) as description
  from preflight.tariff_commodity c join preflight.v_current s using (version)
  where c.validity_end is null and c.suffix = '80'
    and right(c.code, 6) = '000000' and substr(c.code, 3, 2) <> '00';

-- HS-6 subheadings with their path description (D3): from the shallowest hs6||'0000' row
-- (the suffix-80 heading row when hs6 is the heading itself) up to the suffix-80 heading row.
create or replace view preflight.v_h6 as
  with recursive cur as (select version from preflight.v_current),
  hs as (select distinct left(code, 6) as hs6 from preflight.v_leaf),
  start as (
    select distinct on (hs.hs6) hs.hs6, l.version, l.sid, l.code, l.suffix, l.description, l.parent_sid
    from hs join preflight.tariff_commodity l on l.code = (hs.hs6 || '0000')::char(10)
    where l.version = (select version from cur) and l.validity_end is null
    order by hs.hs6, (l.suffix = '80' and right(hs.hs6, 2) = '00') desc, l.suffix
  ),
  walk as (
    select hs6, version, sid, code, suffix, description, parent_sid, 0 as depth from start
    union all
    select w.hs6, p.version, p.sid, p.code, p.suffix, p.description, p.parent_sid, w.depth + 1
    from walk w join preflight.tariff_commodity p on p.version = w.version and p.sid = w.parent_sid and p.validity_end is null
    where not (w.code = left(w.hs6, 4) || '000000' and w.suffix = '80')
      and right(p.code, 8) <> '00000000'
      and w.depth < 20
  )
  select hs6, string_agg(preflight.clean_desc(description), ' > ' order by depth desc) as description
  from walk
  group by hs6;

create or replace view preflight.v_cn8 as
  select distinct left(code, 8) as cn8 from preflight.v_leaf;

create or replace view preflight.v_l10 as
  select distinct code::text as l10 from preflight.v_leaf;

-- Search references (D3): Heading rows keep 4 digits; Subheading/Commodity rows keep the code
-- without trailing zeros, cut to 6. Chapter rows and prefixes matching no HS-6 are dropped.
create or replace view preflight.v_refs as
  with r as (
    select t.title, t.referenced_class,
           case when t.referenced_class = 'Heading' then left(t.code, 4)
                else left(rtrim(t.code, '0'), 6) end as prefix,
           case t.referenced_class when 'Heading' then 'H' when 'Subheading' then 'S' else 'C' end as cls
    from preflight.tariff_search_ref t join preflight.v_current s using (version)
    where t.referenced_class <> 'Chapter'
  )
  , h as materialized (select distinct left(code, 6) as hs6 from preflight.v_leaf),
  p as materialized (select left(hs6, 4) as x from h union select left(hs6, 5) from h union select hs6 from h)
  select r.title, r.prefix, r.cls
  from r
  where r.prefix in (select x from p);
