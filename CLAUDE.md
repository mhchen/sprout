# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

Sprout is a CLI tool that checks out GitHub PRs as git worktrees. It uses `gh` CLI under the hood to fetch PR data and creates worktrees in sibling directories named `{repoRoot}--{slugified-branch}`. It has two commands: the default (checkout a PR as a worktree) and `clean` (remove worktrees).

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

Single-file CLI (`index.ts`). The binary entry point is `index.ts` (configured in `package.json` `bin` field). Two main flows:

1. **`checkout()`** — default command. Fetches open PRs via `gh pr list`, presents interactive picker, creates a git worktree, and spawns a shell in it.
2. **`clean()`** — `sprout clean` subcommand. Lists worktrees created by sprout (detected by `--` path convention), presents multi-select, removes selected worktrees.

Worktree naming convention: `{repoRoot}--{slugified-branch}` where slugify replaces `/` with `-` and truncates to 40 chars.
