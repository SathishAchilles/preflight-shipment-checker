"""Export the HS index from Supabase to assets/hs_index.json (design D3, D7).

Builds the whole index as one JSON value from the views of the current snapshot,
runs the self-checks, and writes the minified file only when every check passes.

  python3 -I scripts/export_hs_index.py
"""
import json, os, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import dbenv

OUT = os.path.join(dbenv.ROOT, 'assets', 'hs_index.json')
MAX_BYTES = 2_000_000
EXPECT = {'h6': 5717, 'cn8': 9888, 'l10': 16684}

QUERY = """
select json_build_object(
  'meta', (select json_build_object(
             'source', s.source, 'version', s.version, 'snapshotDate', s.snapshot_date, 'licence', s.licence,
             'store', 'supabase preflight schema',
             'counts', json_build_object(
               'h4', (select count(*) from preflight.v_h4), 'h6', (select count(*) from preflight.v_h6),
               'cn8', (select count(*) from preflight.v_cn8), 'l10', (select count(*) from preflight.v_l10),
               'refs', (select count(*) from preflight.v_refs)))
           from preflight.v_current s),
  'h4',   (select json_object_agg(h4, description order by h4) from preflight.v_h4),
  -- h6 paths are stored relative to their heading ('> Of cotton'; '' when the code is the heading itself);
  -- the engine joins them back onto h4, so 5,717 copies of heading text are not shipped.
  'h6',   (select json_object_agg(x.hs6, case
                when x.description = h.description then ''
                when left(x.description, length(h.description) + 3) = h.description || ' > ' then '> ' || substr(x.description, length(h.description) + 4)
                else x.description end order by x.hs6)
           from preflight.v_h6 x left join preflight.v_h4 h on h.h4 = left(x.hs6, 4)),
  'cn8',  (select json_agg(cn8 order by cn8) from preflight.v_cn8),
  'l10',  (select json_agg(l10 order by l10) from preflight.v_l10),
  'refs', (select json_agg(json_build_array(title, prefix, cls) order by prefix, title, cls) from preflight.v_refs)
);
"""

def check(idx):
    errs = []
    meta = idx.get('meta')
    if not meta:
        return ['no current snapshot in preflight.tariff_snapshot (run snapshot_tariff.py first)']
    for k, n in EXPECT.items():
        got = len(idx[k] or [])
        if abs(got - n) > n * 0.01:
            errs.append(f'{k}: {got} entries, expected about {n} (±1%)')
    for k in ('h4', 'h6', 'cn8', 'l10', 'refs'):
        if meta['counts'][k] != len(idx[k] or []):
            errs.append(f'meta.counts.{k} = {meta["counts"][k]} but the array has {len(idx[k] or [])}')
    for c in ('691200', '090111', '850760', '330300', '610910'):
        if c not in idx['h6']:
            errs.append(f'{c} missing from h6')
    for c in ('999999', '850700', '010000'):
        if c in idx['h6']:
            errs.append(f'{c} must not be in h6')
    l10 = [c for c in idx['l10'] if c.startswith('691200')]
    if len(l10) != 15 or '6912002191' not in l10:
        errs.append(f'expected 15 l10 codes starting 691200 including 6912002191, got {len(l10)}')
    if not 8000 <= len(idx['refs'] or []) <= 8940:
        errs.append(f'refs: {len(idx["refs"] or [])} entries, expected 8,000-8,940')
    return errs

def main():
    idx = json.loads(dbenv.psql(['-At', '-c', QUERY]))
    errs = check(idx)
    text = json.dumps(idx, ensure_ascii=False, separators=(',', ':'))
    size = len(text.encode('utf-8'))
    if size > MAX_BYTES:
        errs.append(f'size {size:,} bytes is over the {MAX_BYTES:,} byte budget')
    if '</script' in text.lower():
        errs.append('index contains "</script"')
    if errs:
        sys.exit('export failed; assets/hs_index.json left unchanged:\n  ' + '\n  '.join(errs))
    tmp = OUT + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        f.write(text + '\n')
    os.replace(tmp, OUT)
    m = idx['meta']
    print(f"{m['version']} ({m['snapshotDate']}): " + ', '.join(f'{k} {v:,}' for k, v in m['counts'].items()) + f'; {size:,} bytes')
    print('OK')

if __name__ == '__main__':
    main()
