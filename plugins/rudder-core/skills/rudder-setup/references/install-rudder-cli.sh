#!/bin/sh
# The install fallback. Run it unchanged with sh, only when the download of
# https://raw.githubusercontent.com/rudderlabs/rudder-iac/main/install.sh fails with 404.
# It installs the latest release the way that script does: it picks the archive for this
# OS and CPU, the arm64 one under Rosetta too, checks it against the release's checksums
# file, and puts rudder-cli in ~/.local/bin without sudo. It works in a fresh temporary
# folder and removes it, and on any error it installs nothing and exits non-zero. It
# hashes the archive from stdin, because GNU sha256sum and shasum put a backslash
# before the hash when the file's path holds one.
set -e
releases=https://github.com/rudderlabs/rudder-iac/releases
tag=$(curl -fsSLI -o /dev/null -w '%{url_effective}' "$releases/latest"); tag=${tag##*/}
case "$(uname -m)" in
  x86_64 | amd64) arch=x86_64 ;;
  arm64 | aarch64) arch=arm64 ;;
  i386 | i486 | i586 | i686) arch=i386 ;;
  *) echo "no rudder-cli build for $(uname -m)" >&2; exit 1 ;;
esac
if [ "$(uname -s)" = Darwin ] && [ "$arch" = x86_64 ] && [ "$(sysctl -in hw.optional.arm64 2>/dev/null)" = 1 ]; then arch=arm64; fi
archive="rudder-cli_$(uname -s)_$arch.tar.gz"
d=$(mktemp -d); trap 'rm -rf "$d"' EXIT
curl -fsSL -o "$d/$archive" "$releases/download/$tag/$archive"
curl -fsSL -o "$d/checksums.txt" "$releases/download/$tag/rudder-cli_${tag#v}_checksums.txt"
want=$(awk -v f="$archive" '$2 == f { print $1 }' "$d/checksums.txt")
got=$(sha256sum <"$d/$archive" 2>/dev/null || shasum -a 256 <"$d/$archive"); got=${got%% *}
[ -n "$want" ] && [ "$got" = "$want" ] || { echo "checksum mismatch for $archive; not installing" >&2; exit 1; }
tar -xzf "$d/$archive" -C "$d" rudder-cli
mkdir -p "$HOME/.local/bin" && mv "$d/rudder-cli" "$HOME/.local/bin/rudder-cli"
"$HOME/.local/bin/rudder-cli" --version
