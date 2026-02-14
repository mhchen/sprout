# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

Sprout is a CLI tool that checks out GitHub PRs and Linear tickets as git worktrees. It uses `gh` CLI and the Linear GraphQL API under the hood. Worktrees are created as sibling directories named `{repoRoot}--{slugified-branch}`.

## Commands

- **Run:** `bun run index.ts`
- **Run as CLI:** `bun index.ts` (has shebang `#!/usr/bin/env bun`)
- **Type check:** `bunx tsc --noEmit`
- **Test:** `bun test`

## Tech stack

- **Runtime/package manager:** Bun (not Node.js)
- **Language:** TypeScript (strict mode, `noUncheckedIndexedAccess` enabled)
- **CLI framework:** cleye (command parsing) + @clack/prompts (interactive UI)
- **Shell commands:** `Bun.$` for running git/gh commands

## Architecture

Three source files at the project root:

- **`index.ts`** — Entry point and CLI command definitions (cleye). Contains three flows:
  1. **`checkout()`** — default command. Fetches open PRs via `gh pr list`, presents fuzzy-searchable picker, creates a git worktree.
  2. **`ticket()`** — `sprout ticket` subcommand. Fetches assigned Linear issues, creates a worktree with a new branch.
  3. **`clean()`** — `sprout clean` subcommand. Lists worktrees created by sprout (detected by `--` path convention), presents multi-select, removes selected worktrees.

- **`worktree.ts`** — Git worktree utilities: `slugify`, `getRepoRoot`, `parseWorktrees`, `ensureWorktree`, `switchToWorktree`.

- **`linear.ts`** — Linear API integration: API key management (stored in `~/.sprout/config`) and GraphQL query for assigned issues.

### Shell wrapper mechanism

Sprout needs to `cd` the user's shell into the worktree directory. Since a subprocess can't change the parent shell's cwd, there's a shell wrapper (`shell/sprout.sh`) that users source in their shell config. It sets `SPROUT_DIR_FILE` to a temp file path; sprout writes the target directory there, and the wrapper reads it and `cd`s. Without the wrapper, sprout falls back to spawning a subshell in the worktree directory.

### Worktree naming

`{repoRoot}--{slugified-branch}` where slugify replaces `/` with `-` and truncates to 40 chars.
