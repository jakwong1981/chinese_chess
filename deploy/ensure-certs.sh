#!/usr/bin/env bash
# 3D Xiangqi — self-signed TLS provisioning for the Spring Boot backend.
#
# Ensures deploy/certs/{cert,key}.pem exist before the containers that mount
# them are started (xq_backend_java reads them via SSL_CERT_PATH/SSL_KEY_PATH
# when HTTPS=true). The public edge is hobbyland's caddy, which proxies to
# this app's own TLS with tls_insecure_skip_verify — same pattern as
# hk-live-dashboard and bill-tracker.
#
# Generation happens only when BOTH files are absent; an existing certificate
# or key is never overwritten. The files are gitignored.

set -euo pipefail

DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CERT_DIR="$DEPLOY_DIR/certs"
CERT_FILE="$CERT_DIR/cert.pem"
KEY_FILE="$CERT_DIR/key.pem"

log()  { printf '\033[1;32m[certs]\033[0m %s\n' "$*"; }
die()  { printf '\033[1;31m[certs]\033[0m %s\n' "$*" >&2; exit 1; }

# Both present: leave them untouched (the container runs as a non-root user
# and mounts them read-only, so keep them world-readable like hk-live-dashboard).
if [ -f "$CERT_FILE" ] && [ -f "$KEY_FILE" ]; then
  chmod 644 "$CERT_FILE" "$KEY_FILE" 2>/dev/null || true
  log "Existing TLS pair found, leaving it untouched: $CERT_DIR"
  exit 0
fi

# Half a pair cannot be completed without destroying data — let the operator decide.
if [ -f "$CERT_FILE" ] || [ -f "$KEY_FILE" ]; then
  die "Only one of cert.pem/key.pem exists in $CERT_DIR. A certificate and its key must be a matching pair; remove both and re-run: rm $CERT_FILE $KEY_FILE && $0"
fi

command -v openssl >/dev/null 2>&1 || die "openssl is not installed; cannot generate the TLS pair."
mkdir -p "$CERT_DIR"

# Stage into a private temp dir so the app never observes a half-written pair
# and the key is never briefly world-readable.
umask 077
TMP_DIR="$(mktemp -d "$CERT_DIR/.certgen.XXXXXX")"
trap 'rm -rf "$TMP_DIR"' EXIT

log "No TLS certificate found, generating a self-signed pair (365 days)..."
openssl req -x509 -newkey rsa:2048 -nodes -sha256 \
  -keyout "$TMP_DIR/key.pem" \
  -out "$TMP_DIR/cert.pem" \
  -days 365 -subj "/CN=localhost" \
  -addext "subjectAltName=DNS:localhost,IP:127.0.0.1" 2>/dev/null

[ -s "$TMP_DIR/cert.pem" ] && [ -s "$TMP_DIR/key.pem" ] || die "openssl reported success but the staged files are missing or empty."

mv "$TMP_DIR/cert.pem" "$CERT_FILE"
mv "$TMP_DIR/key.pem" "$KEY_FILE"
# The java-runtime container runs as the non-root user "xiangqi" and mounts
# the pair read-only; mode 600 would make TLS fail to start.
chmod 644 "$CERT_FILE" "$KEY_FILE"

log "Generated: $CERT_FILE"
log "Generated: $KEY_FILE"
log "Self-signed, valid 365 days. Gitignored — never committed."
