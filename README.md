# Sprout

A CLI tool for checking out GitHub PRs and Linear tickets as [git worktrees](https://git-scm.com/docs/git-worktree). Work on multiple branches simultaneously without stashing or losing context.

Worktrees are created as sibling directories next to your repo (e.g. `my-repo--feature-branch`), and sprout automatically `cd`s you into them and installs dependencies.

## Prerequisites

- [Bun](https://bun.sh)
- [GitHub CLI](https://cli.github.com/) (`gh`) — authenticated via `gh auth login`
- A [Linear API key](https://linear.app/settings/api) (only needed for the `ticket` command — sprout will prompt you on first use)

## Install

```sh
bun install -g github:mhchen/sprout
```

After install, you'll see a message with a `source` line to add to your `~/.zshrc` or `~/.bashrc`. This shell wrapper lets sprout `cd` your shell into worktree directories. Add it, then restart your shell.

> **Without the shell wrapper**, sprout still works — it just opens a new subshell in the worktree directory instead of changing your current shell's directory.

## Usage

### `sprout` / `sprout open`

Switch to an existing sprout worktree. This is the default command.

### `sprout pr`

Browse your repo's open PRs with fuzzy search, pick one, and check it out as a worktree.

### `sprout ticket`

Browse your assigned Linear issues with fuzzy search, pick one, and create a worktree with the ticket's branch name. On first run, you'll be prompted for your Linear API key (stored in `~/.sprout/config`).

### `sprout create <branch>`

Create a worktree with a new branch.

### `sprout clean`

List all sprout worktrees with their status (merged, uncommitted changes) and select which ones to remove. Warns before deleting worktrees with uncommitted changes.

### `sprout root`

Switch back to the main repo directory.

### Aliases

| Command  | Alias |
| -------- | ----- |
| `open`   | `o`   |
| `pr`     | `p`   |
| `ticket` | `t`   |
| `clean`  | `c`   |
| `root`   | `r`   |
