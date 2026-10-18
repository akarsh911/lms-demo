#!/usr/bin/env bash
set -euo pipefail

DOMAIN=labs.tryemerge.in
BOX_IP=34.131.254.234
UPSTREAM=172.17.0.1:8076
NGINX_CONF=/opt/lms/lms-deploy/nginx/nginx.conf
WEBROOT=/opt/lms/lms-deploy/certbot/www
CERT_CONF=/opt/lms/lms-deploy/certbot/conf
NGINX_CTR=lms-deploy-nginx-1
CERT_EMAIL=admin@tryemerge.in
STAGE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

say() { echo "==> $*"; }
fail() { echo "enable-tls.sh: $*" >&2; exit 1; }

backup=""
restore_and_fail() {
  if [ -n "$backup" ] && [ -f "$backup" ]; then
    say "restoring $NGINX_CONF from $backup"
    sudo cp "$backup" "$NGINX_CONF"
    docker exec "$NGINX_CTR" nginx -s reload >/dev/null 2>&1 || true
  fi
  fail "$1"
}

validate_nginx() {
  docker exec "$NGINX_CTR" nginx -t >/dev/null 2>&1
}

insert_block_before_final_brace() {
  local block_file=$1 tmp
  tmp=$(mktemp)
  head -n -1 "$NGINX_CONF" > "$tmp"
  printf '\n' >> "$tmp"
  cat "$block_file" >> "$tmp"
  printf '\n}\n' >> "$tmp"
  sudo cp "$tmp" "$NGINX_CONF"
  rm -f "$tmp"
}

resolved=$(getent hosts "$DOMAIN" | awk '{print $1}' | head -1 || true)
[ -n "$resolved" ] || fail "$DOMAIN does not resolve yet. Add an A record -> $BOX_IP first."
[ "$resolved" = "$BOX_IP" ] || fail "$DOMAIN resolves to $resolved, expected $BOX_IP."
say "$DOMAIN resolves to $resolved"

curl -fsS -o /dev/null --max-time 10 "http://$UPSTREAM/" \
  || fail "the labs container is not answering on $UPSTREAM; start it with deploy.sh first"
say "upstream $UPSTREAM is answering"

tail -1 "$NGINX_CONF" | grep -qE '^\}\s*$' \
  || fail "$NGINX_CONF does not end in a bare closing brace; insert the vhost by hand"

if grep -q "server_name $DOMAIN;" "$NGINX_CONF"; then
  say "$DOMAIN vhost already present in nginx.conf; skipping the port 80 stage"
else
  backup="$NGINX_CONF.bak-$(date +%Y%m%d%H%M%S)"
  say "backing up nginx.conf to $backup"
  sudo cp "$NGINX_CONF" "$backup"

  say "adding the port 80 / ACME vhost"
  insert_block_before_final_brace "$STAGE_DIR/nginx-labs-stage1-acme.conf"
  validate_nginx || restore_and_fail "nginx rejected the config after the port 80 stage"
  docker exec "$NGINX_CTR" nginx -s reload
  say "nginx reloaded"
fi

if sudo test -f "$CERT_CONF/live/$DOMAIN/fullchain.pem"; then
  say "certificate for $DOMAIN already exists; skipping issuance"
else
  say "requesting a certificate for $DOMAIN"
  docker run --rm \
    -v "$CERT_CONF:/etc/letsencrypt" \
    -v "$WEBROOT:/var/www/certbot" \
    certbot/certbot certonly \
      --webroot -w /var/www/certbot \
      -d "$DOMAIN" \
      --key-type ecdsa \
      --email "$CERT_EMAIL" \
      --agree-tos --no-eff-email --non-interactive \
    || fail "certbot failed; nginx is unchanged from the port 80 stage and still serving every other site"
  say "certificate issued"
fi

if grep -A2 "server_name $DOMAIN;" "$NGINX_CONF" | grep -q "ssl_certificate"; then
  say "TLS vhost for $DOMAIN already present; skipping"
else
  backup="$NGINX_CONF.bak-$(date +%Y%m%d%H%M%S)"
  say "backing up nginx.conf to $backup"
  sudo cp "$NGINX_CONF" "$backup"

  say "adding the TLS vhost"
  insert_block_before_final_brace "$STAGE_DIR/nginx-labs-stage2-tls.conf"
  validate_nginx || restore_and_fail "nginx rejected the config after the TLS stage"
  docker exec "$NGINX_CTR" nginx -s reload
  say "nginx reloaded"
fi

say "verifying https://$DOMAIN/"
code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "https://$DOMAIN/" || true)
case "$code" in
  200|307|308) say "https://$DOMAIN/ answered $code — done" ;;
  *) fail "https://$DOMAIN/ answered $code; check: docker logs $NGINX_CTR --tail=50" ;;
esac
