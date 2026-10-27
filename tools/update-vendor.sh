#!/usr/bin/env bash
# Récupère supabase-js depuis le registre npm, vérifie son empreinte officielle (sha512) et le copie dans vendor/.
# Usage : tools/update-vendor.sh 2.45.4   (puis change VERSION dans auth.js et relance node tools/set-csp.js)
set -euo pipefail
VER="${1:-2.45.4}"
[[ "$VER" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "version invalide" >&2; exit 1; }
HERE="$(cd "$(dirname "$0")/.." && pwd)/public"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
cd "$TMP"
npm pack "@supabase/supabase-js@$VER" >/dev/null
WANT="$(npm view "@supabase/supabase-js@$VER" dist.integrity)"
GOT="sha512-$(openssl dgst -sha512 -binary ./*.tgz | openssl base64 -A)"
[ "$WANT" = "$GOT" ] || { echo "empreinte différente de celle du registre : abandon" >&2; exit 1; }
tar xzf ./*.tgz
mkdir -p "$HERE/vendor"
cp package/dist/umd/supabase.js "$HERE/vendor/supabase-$VER.js"
cp package/dist/umd/591.supabase.js "$HERE/vendor/591.supabase.js"
cp package/LICENSE "$HERE/vendor/LICENSE-supabase-js.txt"
{ echo "# supabase-js $VER (npm, MIT) : empreinte du tarball vérifiée contre le registre au moment de la copie"; echo "npm-integrity: $WANT"
  echo "supabase-$VER.js sha256: $(shasum -a 256 "$HERE/vendor/supabase-$VER.js" | cut -d' ' -f1)"; echo "591.supabase.js sha256: $(shasum -a 256 "$HERE/vendor/591.supabase.js" | cut -d' ' -f1)"; } > "$HERE/vendor/HASHES.txt"
echo "OK : vendor/supabase-$VER.js ($WANT)"
