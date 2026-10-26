-- Checks the preflight views against the D2/D3 rules on the current snapshot (task 1.4).
-- Run: python3 -I scripts/dbenv.py --apply scripts/db/check_views.sql   (raises on the first mismatch)

do $$
declare n int; d text;
begin
  select count(*) into n from preflight.v_current;
  if n <> 1 then raise exception 'expected exactly one current snapshot, got %', n; end if;

  select count(*) into n from preflight.v_h6;
  if abs(n - 5717) > 57 then raise exception 'v_h6 has % rows, expected about 5717', n; end if;
  select count(*) into n from preflight.v_cn8;
  if abs(n - 9888) > 99 then raise exception 'v_cn8 has % rows, expected about 9888', n; end if;
  select count(*) into n from preflight.v_l10;
  if abs(n - 16684) > 167 then raise exception 'v_l10 has % rows, expected about 16684', n; end if;

  select count(*) into n from preflight.v_h6 where hs6 in ('691200', '090111', '850760', '330300', '610910');
  if n <> 5 then raise exception 'only % of 691200/090111/850760/330300/610910 are in v_h6', n; end if;
  select count(*) into n from preflight.v_h6 where hs6 in ('999999', '850700', '010000');
  if n <> 0 then raise exception '999999/850700/010000 must not be in v_h6 (% found)', n; end if;

  select count(*) into n from preflight.v_l10 where l10 like '691200%';
  if n <> 15 then raise exception 'expected 15 v_l10 codes starting 691200, got %', n; end if;
  if not exists (select 1 from preflight.v_l10 where l10 = '6912002191') then
    raise exception '6912002191 missing from v_l10 (suffix-aware parent test)'; end if;

  select description into d from preflight.v_h4 where h4 = '6904';
  if d is null or d not like 'Ceramic building bricks%' then raise exception 'v_h4 6904 is "%"', d; end if;

  select description into d from preflight.v_h6 where hs6 = '610910';
  if d is distinct from 'T-shirts, singlets and other vests, knitted or crocheted > Of cotton' then
    raise exception 'v_h6 610910 is "%"', d; end if;
  select description into d from preflight.v_h6 where hs6 = '691200';
  if d is distinct from (select description from preflight.v_h4 where h4 = '6912') then
    raise exception 'v_h6 691200 should be the heading description only, got "%"', d; end if;

  select count(*) into n from preflight.v_refs where title ilike '%socks%' and prefix like '6115%';
  if n = 0 then raise exception 'no socks reference under heading 6115 in v_refs'; end if;
  select count(*) into n from preflight.v_refs r join preflight.tariff_search_ref t on t.title = r.title
    where t.referenced_class = 'Chapter' and length(r.prefix) < 4;
  if n <> 0 then raise exception 'v_refs contains % chapter-level rows', n; end if;

  raise notice 'all view checks passed';
end $$;
