"""Connection to Supabase for the HS tariff scripts.

Reads DATABASE_MIGRATION_URL and optional PSQL from the environment (Vercel),
falling back to ../.env.local (gitignored).
The connection string is passed to psql through PG* environment variables,
so it never appears on a command line or in output.
"""
import os, shutil, subprocess, sys
from urllib.parse import urlsplit, unquote

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def load_env():
    """DATABASE_MIGRATION_URL and PSQL from the environment (Vercel) or else ../.env.local."""
    env = {}
    path = os.path.join(ROOT, '.env.local')
    if os.path.exists(path):
        for line in open(path, encoding='utf-8'):
            line = line.strip()
            if line and not line.startswith('#') and '=' in line:
                k, v = line.split('=', 1)
                env[k.strip()] = v.strip().strip('"')
    for k in ('DATABASE_MIGRATION_URL', 'PSQL'):
        if os.environ.get(k):
            env[k] = os.environ[k]
    if not env.get('DATABASE_MIGRATION_URL'):
        sys.exit('dbenv: DATABASE_MIGRATION_URL is not set (environment or .env.local); see SKILL.md (HS tariff data).')
    return env

def psql_path(env):
    p = env.get('PSQL') or shutil.which('psql')
    if not p or not os.path.exists(p):
        sys.exit('dbenv: psql not found; set PSQL in .env.local (e.g. /opt/homebrew/opt/libpq/bin/psql).')
    return p

def pg_environ(env):
    u = urlsplit(env['DATABASE_MIGRATION_URL'])
    e = dict(os.environ)
    e.update(PGHOST=u.hostname or '', PGPORT=str(u.port or 5432), PGUSER=unquote(u.username or ''),
             PGPASSWORD=unquote(u.password or ''), PGDATABASE=(u.path or '/postgres').lstrip('/') or 'postgres',
             PGCONNECT_TIMEOUT='10', PGAPPNAME='preflight-hs')
    return e

def psql(args, input=None, check=True):
    """Run psql with the project connection. Returns stdout as text."""
    env = load_env()
    r = subprocess.run([psql_path(env), '-X', '-v', 'ON_ERROR_STOP=1', *args], input=input, capture_output=True,
                       text=True, env=pg_environ(env), cwd=ROOT)
    if check and r.returncode != 0:
        sys.exit(f'psql failed (exit {r.returncode}):\n{r.stderr.strip()}')
    return r.stdout

if __name__ == '__main__':
    if '--check' in sys.argv:
        out = psql(['-At', '-c', "select split_part(version(), ' on ', 1) || ' as ' || current_user"])
        print('connected:', out.strip())
    elif '--apply' in sys.argv:
        for f in sys.argv[sys.argv.index('--apply') + 1:]:
            psql(['-q', '--single-transaction', '-f', f])
            print('applied:', f)
    else:
        sys.exit('usage: dbenv.py --check | --apply <file.sql>...')
