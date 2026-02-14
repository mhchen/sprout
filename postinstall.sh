#!/bin/sh
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SHELL_WRAPPER="$SCRIPT_DIR/shell/sprout.sh"

echo ""
echo "  Add this to your ~/.zshrc or ~/.bashrc:"
echo ""
echo "    source \"$SHELL_WRAPPER\""
echo ""
