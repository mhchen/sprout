#!/usr/bin/env bun
import * as p from "@clack/prompts";
import { cli, command } from "cleye";
import { $ } from "bun";

interface PR {
  number: number;
  title: string;
  headRefName: string;
  author: { login: string };
}

interface Worktree {
  path: string;
  branch: string;
}

function slugify(branch: string): string {
  return branch.replace(/\//g, "-").slice(0, 40);
}

async function getRepoRoot(): Promise<string> {
  const gitRoot = await $`git rev-parse --show-toplevel`
    .text()
    .catch(() => null);
  if (!gitRoot) {
    p.cancel("Not in a git repository");
    process.exit(1);
  }
  return gitRoot.trim();
}

async function parseWorktrees(): Promise<Worktree[]> {
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

async function checkout() {
  p.intro("sprout - checkout PRs as worktrees");

  const repoRoot = await getRepoRoot();

  const spinner = p.spinner();
  spinner.start("Fetching PRs...");

  const prsJson =
    await $`gh pr list --json number,title,headRefName,author --limit 50`
      .text()
      .catch(() => null);

  if (!prsJson) {
    spinner.stop("Failed to fetch PRs");
    p.cancel(
      "Could not fetch PRs. Make sure `gh` CLI is installed and authenticated.",
    );
    process.exit(1);
  }

  const prs: PR[] = JSON.parse(prsJson);
  spinner.stop(`Found ${prs.length} open PRs`);

  if (prs.length === 0) {
    p.outro("No open PRs found");
    process.exit(0);
  }

  const selected = await p.select({
    message: "Select a PR to checkout as a worktree",
    options: prs.map((pr) => ({
      value: pr,
      label: `#${pr.number}: ${pr.title}`,
      hint: `${pr.headRefName} by ${pr.author.login}`,
    })),
  });

  if (p.isCancel(selected)) {
    p.cancel("Cancelled");
    process.exit(0);
  }

  const pr = selected as PR;

  const worktreePath = `${repoRoot}--${slugify(pr.headRefName)}`;

  const worktrees = await parseWorktrees();
  const worktreeExists = worktrees.some((wt) => wt.path === worktreePath);

  if (worktreeExists) {
    p.log.info(`Worktree already exists at ${worktreePath}`);
  } else {
    const createSpinner = p.spinner();
    createSpinner.start(`Creating worktree for PR #${pr.number}...`);

    const fetchResult = await $`gh pr checkout ${pr.number} --detach`
      .quiet()
      .catch((e) => e);
    if (fetchResult instanceof Error) {
      createSpinner.stop("Failed to fetch PR");
      p.cancel(`Could not fetch PR: ${fetchResult.message}`);
      process.exit(1);
    }

    await $`git checkout -`.quiet();

    const worktreeResult =
      await $`git worktree add ${worktreePath} ${pr.headRefName}`
        .quiet()
        .catch((e) => e);

    if (worktreeResult instanceof Error) {
      createSpinner.stop("Failed to create worktree");
      p.cancel(`Could not create worktree: ${worktreeResult.message}`);
      process.exit(1);
    }

    createSpinner.stop("Worktree created");
  }

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

async function clean() {
  p.intro("sprout clean - remove worktrees");

  const repoRoot = await getRepoRoot();
  const worktrees = await parseWorktrees();

  const sproutWorktrees = worktrees.filter((wt) =>
    wt.path.startsWith(repoRoot + "--"),
  );

  if (sproutWorktrees.length === 0) {
    p.outro("No sprout worktrees found");
    process.exit(0);
  }

  const selected = await p.multiselect({
    message: "Select worktrees to remove",
    options: sproutWorktrees.map((wt) => ({
      value: wt.path,
      label: wt.branch,
      hint: wt.path,
    })),
    required: false,
  });

  if (p.isCancel(selected) || selected.length === 0) {
    p.cancel("Cancelled");
    process.exit(0);
  }

  const paths = selected as string[];

  const spinner = p.spinner();
  spinner.start(`Removing ${paths.length} worktree(s)...`);

  for (const path of paths) {
    await $`git worktree remove ${path}`.quiet().catch(() => {
      return $`git worktree remove --force ${path}`.quiet();
    });
  }

  spinner.stop(`Removed ${paths.length} worktree(s)`);
  p.outro("Done");
}

const cleanCommand = command({
  name: "clean",
  help: {
    description: "Remove worktrees",
  },
});

const argv = cli({
  name: "sprout",
  version: "0.1.0",
  commands: [cleanCommand],
});

if (argv.command === "clean") {
  await clean();
} else {
  await checkout();
}
