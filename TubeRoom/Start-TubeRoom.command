#!/bin/bash
set -e
cd "$(dirname "$0")"
TUBEROOM_APP_DIR="$PWD"
TUBEROOM_RUNTIME_DIR="$HOME/Library/Application Support/TubeRoom/runtime"
TUBEROOM_NODE=""
fail() { echo; echo "$1"; echo; read -r -p 'Press Return to close.'; exit 1; }
echo 'TubeRoom — light follows sound.'
echo 'Keep this window open while you use your lights.'
if /usr/bin/curl -fsS --max-time 1 http://127.0.0.1:8788/api/state 2>/dev/null | /usr/bin/grep -q '"effects"'; then
  /usr/bin/open -a Safari http://127.0.0.1:8788
  exit 0
fi
for TUBEROOM_CANDIDATE in "$TUBEROOM_RUNTIME_DIR/bin/node" "$(command -v node 2>/dev/null || true)" /usr/local/bin/node /opt/homebrew/bin/node; do
  if [ -x "$TUBEROOM_CANDIDATE" ] && "$TUBEROOM_CANDIDATE" -e 'process.exit(Number(process.versions.node.split(".")[0])>=20?0:1)' 2>/dev/null; then
    TUBEROOM_NODE="$TUBEROOM_CANDIDATE"
    break
  fi
done
if [ -z "$TUBEROOM_NODE" ]; then
  echo
  echo 'First launch: downloading a private Node.js runtime from nodejs.org.'
  echo 'This needs internet once. No admin password or npm install is needed.'
  TUBEROOM_ARCH="$(/usr/bin/uname -m)"
  case "$TUBEROOM_ARCH" in arm64) ;; x86_64) TUBEROOM_ARCH=x64 ;; *) fail 'This launcher supports Intel and Apple Silicon Macs.' ;; esac
  TUBEROOM_TEMP="$(/usr/bin/mktemp -d)"
  trap '/bin/rm -rf "$TUBEROOM_TEMP"' EXIT
  /usr/bin/curl --proto '=https' --tlsv1.2 -fL --retry 2 --connect-timeout 15 https://nodejs.org/dist/latest-v22.x/SHASUMS256.txt -o "$TUBEROOM_TEMP/SHASUMS256.txt" || fail 'Could not download the runtime. Connect to internet and open this launcher again.'
  TUBEROOM_ARCHIVE="$(/usr/bin/awk -v suffix="-darwin-$TUBEROOM_ARCH.tar.gz" '$2 ~ suffix"$" {print $2; exit}' "$TUBEROOM_TEMP/SHASUMS256.txt")"
  case "$TUBEROOM_ARCHIVE" in node-v22.*-darwin-*.tar.gz) ;; *) fail 'The official runtime download could not be identified.' ;; esac
  /usr/bin/curl --proto '=https' --tlsv1.2 -fL --retry 2 --connect-timeout 15 "https://nodejs.org/dist/latest-v22.x/$TUBEROOM_ARCHIVE" -o "$TUBEROOM_TEMP/$TUBEROOM_ARCHIVE" || fail 'Download interrupted. Connect to internet and run the launcher again.'
  (cd "$TUBEROOM_TEMP"; /usr/bin/awk -v file="$TUBEROOM_ARCHIVE" '$2==file {print}' SHASUMS256.txt | /usr/bin/shasum -a 256 -c -) || fail 'Runtime checksum failed. The download was not installed; try again.'
  mkdir -p "$TUBEROOM_RUNTIME_DIR"
  /usr/bin/tar -xzf "$TUBEROOM_TEMP/$TUBEROOM_ARCHIVE" -C "$TUBEROOM_RUNTIME_DIR" --strip-components=1 || fail 'Could not extract the runtime.'
  TUBEROOM_NODE="$TUBEROOM_RUNTIME_DIR/bin/node"
  "$TUBEROOM_NODE" --version || fail 'This runtime needs macOS 11 or later. Update macOS, or install a compatible Node.js 20+ runtime yourself.'
  /bin/rm -rf "$TUBEROOM_TEMP"
  trap - EXIT
fi
(
  for TUBEROOM_ATTEMPT in {1..40}; do
    if /usr/bin/curl -fsS --max-time 1 http://127.0.0.1:8788/api/state >/dev/null 2>&1; then
      /usr/bin/open -a Safari http://127.0.0.1:8788
      exit
    fi
    /bin/sleep 0.25
  done
) &
echo
echo 'Opening Safari at http://127.0.0.1:8788'
echo 'Your Mac will stay awake while this window is running.'
/usr/bin/caffeinate -di "$TUBEROOM_NODE" "$TUBEROOM_APP_DIR/runner.mjs"
