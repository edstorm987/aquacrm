#!/usr/bin/env bash
# ONE-TIME, on the owner's Mac. Generates the RSA-4096 backup keypair.
#
#   - Writes the PUBLIC certificate to ops/backup/recipient.cert.pem.
#     Commit that file: CI encrypts every backup TO it. It is not a secret.
#   - Writes the PRIVATE key to ops/backup/_local/ (gitignored).
#
# The private key + its passphrase are the ONLY things that can ever decrypt a
# backup. If you lose either, every backup is permanently unreadable — there is
# no recovery. Move the private key into your password manager or an encrypted
# volume and keep an offline copy. NEVER upload it anywhere, NEVER commit it,
# NEVER put it in CI.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CERT="$HERE/recipient.cert.pem"
LOCAL="$HERE/_local"; mkdir -p "$LOCAL"
KEY="$LOCAL/aquacrm-backup.key.pem"

[ -e "$CERT" ] && { echo "Refusing: $CERT already exists. Delete it only to deliberately ROTATE keys — old backups will still need the OLD private key to decrypt." >&2; exit 1; }
[ -e "$KEY" ]  && { echo "Refusing: $KEY already exists." >&2; exit 1; }

echo "You will be prompted for a passphrase to protect the private key."
echo "Choose a strong one and save it in your password manager NOW — you cannot recover it later."
echo

openssl req -x509 -newkey rsa:4096 -sha256 -days 7300 \
  -keyout "$KEY" -out "$CERT" -subj "/CN=AquaCRM Backup"
chmod 600 "$KEY"

echo
echo "Done."
echo "  Public cert : $CERT"
echo "                -> git add ops/backup/recipient.cert.pem && commit"
echo "  Private key : $KEY"
echo "                -> move to your password manager / encrypted volume, keep an offline copy,"
echo "                   then you may delete the working-tree copy. It is gitignored either way."
echo
echo "Sanity-check the round-trip once (encrypt to the cert, decrypt with the key):"
echo "  echo hi > /tmp/t && openssl cms -encrypt -aes-256-cbc -binary -in /tmp/t -outform DER -out /tmp/t.cms \"$CERT\" \\"
echo "    && openssl cms -decrypt -binary -inform DER -in /tmp/t.cms -inkey \"$KEY\" && echo OK"
