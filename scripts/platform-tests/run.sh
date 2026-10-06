#!/usr/bin/env bash
# Pruebas de supabase-platform.sql en un Postgres local (Docker). No toca
# ninguna base real.
#
#   scripts/platform-tests/run.sh
#
# Qué prueba (20-access.sql): anon no ve ni ejecuta nada; el agente solo usa
# su conocimiento y cambia su nombre; cada vista abre lo suyo (Personas,
# Conocimiento) y el rol pone las de partida; la cola de Issues da una issue
# a una sola persona; nadie cambia su propio rol ni
# sus vistas ni se desactiva; claves secret y
# URLs ajenas rechazadas; tokens enmascarados para los admins; usuarios
# desactivados sin acceso; auditoría inmutable y sin tokens. Después vuelve a
# ejecutar el SQL encima para comprobar que es re-ejecutable sin perder datos,
# y pasa verify.sql (la verificación para el SQL Editor), que debe salir en OK.
# Emula Supabase con 00-supabase-like.sql (auth.users, auth.uid(), roles).
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
WORK="$(mktemp -d)"
NAME="sia-platform-test-$$"
trap 'docker rm -f "$NAME" >/dev/null 2>&1 || true; rm -rf "$WORK"' EXIT

cp "$HERE"/*.sql "$WORK/"
cp "$ROOT/supabase-platform.sql" "$WORK/10-platform.sql"

docker run -d --name "$NAME" -e POSTGRES_PASSWORD=test -v "$WORK":/sql postgres:16 >/dev/null
for _ in $(seq 1 40); do docker exec "$NAME" pg_isready -U postgres >/dev/null 2>&1 && break; sleep 2; done
psql() { docker exec -i "$NAME" psql -U postgres -v ON_ERROR_STOP=1 -q -t "$@"; }
# solo lo que importa: fuera avisos de «ya existe», filas vacías e ids de las altas
quiet() { grep -v 'skipping' | grep -v -E '^[[:space:]]*$|^ [0-9a-f-]{36}$' || true; }

psql -c "create database t;" >/dev/null
psql -d t -f /sql/00-supabase-like.sql
echo "── esquema ──"
psql -d t -f /sql/10-platform.sql 2>&1 | quiet
echo "── acceso por perfiles ──"
psql -d t -f /sql/20-access.sql 2>&1 | quiet
echo "── re-ejecutar el SQL (sin perder datos) ──"
psql -d t -f /sql/10-platform.sql 2>&1 | quiet
psql -d t -c "do \$\$ begin if (select count(*) from platform.users) <> 3 or (select count(*) from platform.knowledge_bases) <> 1 or (select count(*) from vault.secrets) <> 1 then raise exception 'FALLO: re-ejecutar perdió datos'; end if; end \$\$;"
echo "── verificación (verify.sql, la que se pega en el SQL Editor) ──"
psql -d t -f /sql/verify.sql | quiet | tee "$WORK/verify.out"
if grep -q FALLO "$WORK/verify.out"; then echo "FALLO: la verificación no sale toda en OK"; exit 1; fi
echo "ok"
