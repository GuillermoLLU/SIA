#!/usr/bin/env bash
# Pruebas de las políticas de acceso de supabase-schema.sql en un Postgres
# local con pgvector (Docker). No toca ninguna base real.
#
#   scripts/rls-tests/run.sh
#
# Qué prueba:
#   20-policies.sql        sin cabeceras no se ve nada; cada token ve solo lo
#                          suyo (conocimiento, skills, enlaces, búsqueda);
#                          lab/admin/links hacen lo que dicen y nada más; el
#                          dueño gestiona claves pero no crea otro dueño; una
#                          clave o token inventados no abren nada; re-ejecutar
#                          el SQL renueva solo la clave del dueño.
#   30/31 (migración)      una base del esquema 1 con datos pasa al 2 sin
#                          perder conocimiento, skills, accesos ni claves.
#   el fichero tal cual    se niega a ejecutarse (marcador de la clave).
# Emula lo que PostgREST hace en Supabase: el rol anon y las cabeceras en
# request.headers (00-supabase-like.sql + set_config en las pruebas).
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
WORK="$(mktemp -d)"
NAME="sia-rls-test-$$"
trap 'docker rm -f "$NAME" >/dev/null 2>&1 || true; rm -rf "$WORK"' EXIT

cp "$HERE"/*.sql "$WORK/"
node "$ROOT/server/base/schema-sql.js" OWNER-KEY-TEST   > "$WORK/01-schema.sql"       # esquema + clave + skills comunes
node "$ROOT/server/base/schema-sql.js" OWNER-KEY-TEST-2 > "$WORK/01-schema-rerun.sql"
cp "$ROOT/supabase-schema.sql" "$WORK/01-raw.sql"

docker run -d --name "$NAME" -e POSTGRES_PASSWORD=test -v "$WORK":/sql pgvector/pgvector:pg16 >/dev/null
for _ in $(seq 1 40); do docker exec "$NAME" pg_isready -U postgres >/dev/null 2>&1 && break; sleep 2; done
psql() { docker exec -i "$NAME" psql -U postgres -v ON_ERROR_STOP=1 -q "$@"; }
quiet() { grep -v 'skipping\|^ *$\|^(1 row)\|^ assert_eq\|^ expect_error\|^---\|set_config\|^ {' || true; }

echo "── el fichero tal cual debe negarse ──"
if psql -f /sql/01-raw.sql >/dev/null 2>&1; then echo "FALLO: el SQL con el marcador se ejecutó"; exit 1; fi
echo "ok"

echo "── políticas (base nueva) ──"
psql -c "create database t;" >/dev/null
psql -d t -f /sql/00-supabase-like.sql
psql -d t -f /sql/01-schema.sql 2>&1 | quiet
psql -d t -f /sql/20-policies.sql 2>&1 | quiet

echo "── migración (base del esquema 1 con datos) ──"
psql -c "create database m;" >/dev/null
psql -d m -f /sql/00-supabase-like.sql
psql -d m -f /sql/schema-v1.sql 2>&1 | quiet
psql -d m -f /sql/30-old-data.sql
psql -d m -f /sql/01-schema.sql 2>&1 | quiet
psql -d m -c "create or replace function assert_eq(got anyelement, want anyelement, msg text) returns void language plpgsql as \$\$ begin if got is distinct from want then raise exception 'FALLO %: esperado %, obtenido %', msg, want, got; end if; end \$\$; grant execute on function assert_eq(anyelement, anyelement, text) to anon;"
psql -d m -f /sql/31-migration-check.sql 2>&1 | quiet
