#!/usr/bin/env bash
# Install the `pmp` command so you can run it from inside any project.
#
# Usage:
#   ./install.sh            # install globally (symlink into ~/.local/bin)
#   ./install.sh --link     # use `npm link` instead (needs npm)
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BIN="$HERE/bin/pmp.js"

chmod +x "$BIN"

if ! command -v node >/dev/null 2>&1; then
  echo "✗ Node.js is required (https://nodejs.org). Install it and re-run."
  exit 1
fi

if [[ "${1:-}" == "--link" ]]; then
  echo "→ npm link"
  (cd "$HERE" && npm link)
  echo "✓ Installed via npm link. Run: pmp init"
  exit 0
fi

# Default: symlink into a PATH dir.
TARGET_DIR="$HOME/.local/bin"
mkdir -p "$TARGET_DIR"
ln -sf "$BIN" "$TARGET_DIR/pmp"
echo "✓ Linked pmp → $TARGET_DIR/pmp"

case ":$PATH:" in
  *":$TARGET_DIR:"*) ;;
  *)
    echo ""
    echo "  ⚠ $TARGET_DIR is not on your PATH. Add this to your shell profile:"
    echo "      export PATH=\"\$HOME/.local/bin:\$PATH\""
    ;;
esac

echo ""
echo "  Done. In any project, run:"
echo "    pmp init"
