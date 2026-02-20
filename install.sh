#!/bin/sh
set -e

REPO="github:mhchen/sprout"
MARKER="# sprout shell wrapper"

info() { printf "\033[34m%s\033[0m\n" "$1"; }
success() { printf "\033[32m%s\033[0m\n" "$1"; }
warn() { printf "\033[33m%s\033[0m\n" "$1"; }
error() { printf "\033[31m%s\033[0m\n" "$1"; }

get_shell_rc() {
  case "$(basename "$SHELL")" in
  zsh) echo "$HOME/.zshrc" ;;
  bash)
    if [ -f "$HOME/.bash_profile" ]; then
      echo "$HOME/.bash_profile"
    else
      echo "$HOME/.bashrc"
    fi
    ;;
  *) echo "" ;;
  esac
}

get_sprout_shell_wrapper() {
  bun_global_dir="$(bun pm -g ls 2>/dev/null | head -1 | sed 's/ .*//')" || true
  if [ -z "$bun_global_dir" ]; then
    # Fallback: common bun global install location
    bun_global_dir="$HOME/.bun/install/global"
  fi
  echo "$bun_global_dir/node_modules/sprout/shell/sprout.sh"
}

do_install() {
  info "Installing sprout..."
  echo ""

  # Check for bun
  if ! command -v bun >/dev/null 2>&1; then
    info "Bun not found. Installing bun..."
    curl -fsSL https://bun.sh/install | bash
    export BUN_INSTALL="$HOME/.bun"
    export PATH="$BUN_INSTALL/bin:$PATH"

    if ! command -v bun >/dev/null 2>&1; then
      error "Failed to install bun. Install it manually: https://bun.sh"
      exit 1
    fi
    success "Bun installed."
    echo ""
  fi

  # Install sprout globally
  info "Installing sprout via bun..."
  bun install -g "$REPO"
  echo ""

  if ! command -v sprout-cli >/dev/null 2>&1; then
    warn "sprout-cli command not found on PATH."
    warn "You may need to add bun's global bin to your PATH:"
    warn "  export PATH=\"\$HOME/.bun/bin:\$PATH\""
    echo ""
  fi

  # Check for gh CLI
  if ! command -v gh >/dev/null 2>&1; then
    warn "GitHub CLI (gh) not found. Most sprout commands require it."
    warn "Install it: https://cli.github.com/"
    echo ""
  fi

  # Inject shell wrapper
  shell_rc="$(get_shell_rc)"
  wrapper_path="$(get_sprout_shell_wrapper)"

  if [ -z "$shell_rc" ]; then
    warn "Could not detect shell config file. Add this to your shell config manually:"
    warn "  source \"$wrapper_path\""
    echo ""
  elif grep -qF "$MARKER" "$shell_rc" 2>/dev/null; then
    info "Shell wrapper already in $shell_rc, skipping."
  else
    printf '\n%s\nsource "%s"\n' "$MARKER" "$wrapper_path" >>"$shell_rc"
    success "Added shell wrapper to $shell_rc"
  fi

  echo ""
  success "sprout installed!"
  info "Restart your shell or run: exec \$SHELL"
}

do_install
