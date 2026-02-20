# Shell wrapper for sprout
# Add to your shell config: source /path/to/sprout/shell/sprout.sh

sprout() {
  local dir_file exit_code dir
  dir_file=$(mktemp)

  SPROUT_DIR_FILE="$dir_file" command sprout-cli "$@"
  exit_code=$?

  if [ "$exit_code" -eq 0 ] && [ -f "$dir_file" ]; then
    dir=$(cat "$dir_file")
    rm -f "$dir_file"
    if [ -n "$dir" ] && [ -d "$dir" ]; then
      cd "$dir" || return
    fi
  else
    rm -f "$dir_file"
  fi

  return "$exit_code"
}
