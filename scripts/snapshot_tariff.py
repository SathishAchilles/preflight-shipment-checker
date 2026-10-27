"""Load a UK tariff snapshot into Supabase (design D1, D7).

Downloads the DBT commodities report and HMRC's search references, checks them,
and loads both into the `preflight` schema as one new snapshot version in a
single transaction, then marks it current. Then run export_hs_index.py.

  python3 -I scripts/snapshot_tariff.py --dry-run     # download and check only, no database
  python3 -I scripts/snapshot_tariff.py               # load (refuses a version already loaded)
  python3 -I scripts/snapshot_tariff.py --replace     # reload that version
  python3 -I scripts/snapshot_tariff.py --if-new      # load only if DBT has a version not yet loaded (Vercel build)
  python3 -I scripts/snapshot_tariff.py --commodities-file f.csv --refs-file r.json --version v4.0.1639
"""
import argparse, csv, datetime, io, json, os, sys, tempfile, urllib.error, urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import dbenv

LATEST = 'https://data.api.trade.gov.uk/v1/datasets/uk-tariff-2021-01-01/versions/latest/tables/commodities-report/data?format=csv'
REFS = 'https://www.trade-tariff.service.gov.uk/uk/api/search_references'
SOURCE = 'DBT uk-tariff-2021-01-01 commodities-report'
HEADER = ['id', 'commodity__sid', 'commodity__code', 'commodity__suffix', 'commodity__description',
          'commodity__validity_start', 'commodity__validity_end', 'parent__sid', 'parent__code', 'parent__suffix']
UA = {'User-Agent': 'preflight-shipment-checker/snapshot'}

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k): return None

def resolve_version():
    try:
        urllib.request.build_opener(NoRedirect).open(urllib.request.Request(LATEST, headers=UA), timeout=60)
    except urllib.error.HTTPError as e:
        if e.code in (301, 302, 303, 307, 308):
            url = e.headers['Location']
            return url.split('/versions/')[1].split('/')[0], url
        raise
    sys.exit('snapshot: expected a redirect from versions/latest, got none.')

def fetch(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=180) as r:
        return r.read().decode('utf-8')

def read_commodities(text):
    rd = csv.reader(io.StringIO(text, newline=''))
    header = next(rd)
    if header != HEADER:
        sys.exit(f'snapshot: commodities-report header changed.\n  expected: {", ".join(HEADER)}\n  got:      {", ".join(header)}')
    rows = list(rd)
    if not rows:
        sys.exit('snapshot: commodities-report has no rows.')
    return rows

def read_refs(text):
    data = json.loads(text)['data']
    out = [(a['title'], a['referenced_class'], a['goods_nomenclature_item_id'], a['productline_suffix'])
           for a in (x['attributes'] for x in data)]
    if not out:
        sys.exit('snapshot: search_references returned no entries.')
    return out

def na(v):
    return '' if v in ('#NA', '') else v

def write_csv(path, rows):
    with open(path, 'w', newline='', encoding='utf-8') as f:
        csv.writer(f).writerows(rows)

def is_loaded(version):
    return dbenv.psql(['-At', '-v', f'v={version}', '-f', '-'],
                      input="select count(*) from preflight.tariff_snapshot where version = :'v';").strip() != '0'

def load(version, today, rows, refs, replace):
    if is_loaded(version) and not replace:
        sys.exit(f'snapshot: {version} is already loaded; use --replace to reload it.')
    with tempfile.TemporaryDirectory() as tmp:
        com, ref = os.path.join(tmp, 'commodities.csv'), os.path.join(tmp, 'refs.csv')
        write_csv(com, [[version, r[0], r[1], r[2], r[3], r[4], na(r[5]), na(r[6]), na(r[7]), na(r[8]), na(r[9])] for r in rows])
        write_csv(ref, [[version, *x] for x in refs])
        sql = f"""
delete from preflight.tariff_snapshot where version = :'v';
insert into preflight.tariff_snapshot (version, source, snapshot_date, licence) values (:'v', :'src', :'d', 'OGL v3.0');
\\copy preflight.tariff_commodity (version, row_id, sid, code, suffix, description, validity_start, validity_end, parent_sid, parent_code, parent_suffix) from '{com}' with (format csv)
\\copy preflight.tariff_search_ref (version, title, referenced_class, code, suffix) from '{ref}' with (format csv)
update preflight.tariff_snapshot set
  commodity_rows = (select count(*) from preflight.tariff_commodity where version = :'v'),
  ref_rows = (select count(*) from preflight.tariff_search_ref where version = :'v')
  where version = :'v';
update preflight.tariff_snapshot set is_current = false where is_current and version <> :'v';
update preflight.tariff_snapshot set is_current = true where version = :'v';
select version, commodity_rows, ref_rows, is_current from preflight.tariff_snapshot where version = :'v';
"""
        out = dbenv.psql(['-At', '--single-transaction', '-v', f'v={version}', '-v', f'src={SOURCE}', '-v', f'd={today}', '-f', '-'], input=sql)
    print('loaded:', out.strip().splitlines()[-1].replace('|', ' | '))

def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--dry-run', action='store_true', help='download and check only; no database')
    ap.add_argument('--replace', action='store_true', help='reload a version that is already loaded')
    ap.add_argument('--if-new', action='store_true', help='skip, without downloading, when the latest version is already loaded')
    ap.add_argument('--commodities-file', help='read the commodities CSV from a file instead of downloading')
    ap.add_argument('--refs-file', help='read the search references JSON from a file instead of downloading')
    ap.add_argument('--version', help='dataset version; required with --commodities-file')
    a = ap.parse_args()

    if a.commodities_file:
        if not a.version:
            sys.exit('snapshot: --version is required with --commodities-file.')
        version, text = a.version, open(a.commodities_file, encoding='utf-8', newline='').read()
    else:
        version, url = resolve_version()
        if a.if_new and not a.dry_run and is_loaded(version):
            print(f'{version} already loaded')
            return
        try:
            text = fetch(url)
        except urllib.error.HTTPError as e:
            # DBT sometimes points versions/latest at a version whose tables aren't published yet (404).
            # With --if-new (the deploy build) keep the loaded version and try again on the next deploy.
            if not (a.if_new and e.code == 404):
                raise
            print(f'WARNING: {version} is listed as latest but its data returns 404; keeping the loaded version.', file=sys.stderr)
            return
    rows = read_commodities(text)
    refs = read_refs(open(a.refs_file, encoding='utf-8').read() if a.refs_file else fetch(REFS))
    today = datetime.date.today().isoformat()
    current = sum(1 for r in rows if na(r[6]) == '')
    print(f'version: {version}  snapshot date: {today}')
    print(f'commodity rows: {len(rows)} ({current} current)  search references: {len(refs)}')
    if a.dry_run:
        return
    load(version, today, rows, refs, a.replace)

if __name__ == '__main__':
    main()
