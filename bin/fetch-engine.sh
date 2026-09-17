#!/bin/sh
# Fetch the engine's release archive from the OptimalMatch/peer-to-peer-db
# releases into this folder, where the Dockerfile copies it from. The archive
# and the binaries never go into git (.gitignore); this script is how a
# fresh clone gets them. Needs the GitHub CLI signed in with access to the repo.
#   bin/fetch-engine.sh            # the version pinned in .env (or .env.example)
#   bin/fetch-engine.sh v2.372.0   # a specific release
set -eu
cd "$(dirname "$0")/.."
VERSION="${1:-}"
if [ -z "$VERSION" ]; then
  f=.env; [ -f "$f" ] || f=.env.example
  VERSION=$(grep -E '^UNIDATUM_VERSION=' "$f" | cut -d= -f2)
fi
ARCHIVE="unidatum-${VERSION}-linux-amd64.tar.gz"
if [ -f "$ARCHIVE" ]; then echo "$ARCHIVE is here already"; exit 0; fi
echo "fetching $ARCHIVE from OptimalMatch/peer-to-peer-db release $VERSION"
gh release download "$VERSION" -R OptimalMatch/peer-to-peer-db -p "$ARCHIVE" -p SHA256SUMS --clobber
grep "$ARCHIVE" SHA256SUMS | sha256sum -c -
