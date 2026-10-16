#!/bin/sh
set -e
PW=$(cat /opt/emerge/core/.dbpass)

case "$PW" in
  *[!0-9a-f]*) echo "refusing: password is not plain hex"; exit 2 ;;
esac

have_role=$(docker exec emerge-db psql -U postgres -tAc "SELECT 1 FROM pg_roles WHERE rolname='emerge_core'" 2>/tmp/db.err)
if [ "$have_role" = "1" ]; then
  printf "ALTER ROLE emerge_core LOGIN CREATEDB PASSWORD '%s';\n" "$PW" \
    | docker exec -i emerge-db psql -U postgres -q -v ON_ERROR_STOP=1 >/dev/null 2>/tmp/db.err
  echo "role: updated"
else
  printf "CREATE ROLE emerge_core LOGIN CREATEDB PASSWORD '%s';\n" "$PW" \
    | docker exec -i emerge-db psql -U postgres -q -v ON_ERROR_STOP=1 >/dev/null 2>/tmp/db.err
  echo "role: created"
fi

have_db=$(docker exec emerge-db psql -U postgres -tAc "SELECT 1 FROM pg_database WHERE datname='emerge_control'" 2>>/tmp/db.err)
if [ "$have_db" = "1" ]; then
  echo "db: exists"
else
  docker exec emerge-db psql -U postgres -q -v ON_ERROR_STOP=1 \
    -c "CREATE DATABASE emerge_control OWNER emerge_core" >/dev/null 2>>/tmp/db.err
  echo "db: created"
fi

docker exec emerge-db psql -U postgres -tAc \
  "SELECT rolname||' createdb='||rolcreatedb FROM pg_roles WHERE rolname='emerge_core'"
docker exec emerge-db psql -U postgres -tAc \
  "SELECT datname||' owner='||pg_get_userbyid(datdba) FROM pg_database WHERE datname='emerge_control'"
