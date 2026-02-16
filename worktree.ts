import * as p from "@clack/prompts";
import { $ } from "bun";

export interface Worktree {
  path: string;
  branch: string;
}

export function slugify(branch: string): string {
  return branch.replace(/\//g, "-").slice(0, 40);
}

export async function getRepoRoot(): Promise<string> {
  const gitCommonDir = await $`git rev-parse --git-common-dir`
    .text()
    .catch(() => null);
  if (!gitCommonDir) {
    p.cancel("Not in a git repository");
    process.exit(1);
  }

  // --git-common-dir returns ".git" in the main worktree, or an absolute
  // path like "/path/to/repo/.git" when inside a linked worktree.
  const dotGit = gitCommonDir.trim();
  if (dotGit === ".git") {
    const toplevel = await $`git rev-parse --show-toplevel`.text();
    return toplevel.trim();
  }
  // Absolute path to .git dir — parent is the main repo root
  return dotGit.replace(/\/\.git$/, "");
}

export async function parseWorktrees(): Promise<Worktree[]> {
  const output = await $`git worktree list --porcelain`.text();
  const worktrees: Worktree[] = [];
  let current: Partial<Worktree> = {};

  for (const line of output.split("\n")) {
    if (line.startsWith("worktree ")) {
      current.path = line.slice(9);
    } else if (line.startsWith("branch ")) {
      current.branch = line.slice(7).replace("refs/heads/", "");
    } else if (line === "") {
      if (current.path && current.branch) {
        worktrees.push(current as Worktree);
      }
      current = {};
    }
  }

  return worktrees;
}

export async function ensureWorktree(
  worktreePath: string,
  label: string,
  create: () => Promise<void>,
): Promise<void> {
  const worktrees = await parseWorktrees();
  if (worktrees.some((wt) => wt.path === worktreePath)) {
    p.log.info(`Worktree already exists at ${worktreePath}`);
    return;
  }

  const spinner = p.spinner();
  spinner.start(`Creating worktree for ${label}...`);

  try {
    await create();
  } catch (e) {
    spinner.stop("Failed to create worktree");
    const stderr =
      e instanceof Error && "stderr" in e
        ? Buffer.from(e.stderr as ArrayBuffer).toString().trim()
        : "";
    const detail = stderr || (e instanceof Error ? e.message : String(e));
    p.cancel(`Could not create worktree: ${detail}`);
    process.exit(1);
  }

  spinner.stop("Worktree created");

  await installDependencies(worktreePath);
}

const lockfileCommands: Record<string, string[]> = {
  "bun.lockb": ["bun", "install"],
  "bun.lock": ["bun", "install"],
  "package-lock.json": ["npm", "install"],
  "yarn.lock": ["yarn", "install"],
  "pnpm-lock.yaml": ["pnpm", "install"],
};

async function installDependencies(worktreePath: string): Promise<void> {
  for (const [lockfile, cmd] of Object.entries(lockfileCommands)) {
    const exists = await Bun.file(`${worktreePath}/${lockfile}`).exists();
    if (exists) {
      const spinner = p.spinner();
      spinner.start(`Installing dependencies (${cmd[0]})...`);
      await $`${cmd} --cwd ${worktreePath}`.quiet();
      spinner.stop("Dependencies installed");
      return;
    }
  }
}

export async function switchToWorktree(worktreePath: string): Promise<void> {
  const dirFile = process.env.SPROUT_DIR_FILE;
  if (dirFile) {
    await Bun.write(dirFile, worktreePath);
    p.outro(`Switching to ${worktreePath}`);
  } else {
    p.outro(`Launching shell in ${worktreePath}`);
    const shell = process.env.SHELL || "/bin/bash";
    const proc = Bun.spawn([shell], {
      cwd: worktreePath,
      stdin: "inherit",
      stdout: "inherit",
      stderr: "inherit",
    });
    await proc.exited;
  }
}
