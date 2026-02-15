#!/usr/bin/env bun
import * as p from "@clack/prompts";
import { cli, command } from "cleye";
import { $ } from "bun";
import fuzzysearch from "fuzzysearch";
import { getLinearApiKey, fetchLinearIssues, type LinearIssue } from "./linear";
import {
  slugify,
  getRepoRoot,
  parseWorktrees,
  ensureWorktree,
  switchToWorktree,
} from "./worktree";

interface PR {
  number: number;
  title: string;
  headRefName: string;
  author: { login: string };
}

function fuzzyFilter(
  search: string,
  option: { label?: string; hint?: string },
): boolean {
  const needle = search.toLowerCase();
  return (
    fuzzysearch(needle, (option.label ?? "").toLowerCase()) ||
    fuzzysearch(needle, (option.hint ?? "").toLowerCase())
  );
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

  const selected = await p.autocomplete({
    message: "Select a PR to checkout as a worktree",
    options: prs.map((pr) => ({
      value: pr,
      label: `#${pr.number}: ${pr.title}`,
      hint: `${pr.headRefName} by ${pr.author.login}`,
    })),
    filter: fuzzyFilter,
  });

  if (p.isCancel(selected)) {
    p.cancel("Cancelled");
    process.exit(0);
  }

  const pr = selected as PR;
  const worktreePath = `${repoRoot}--${slugify(pr.headRefName)}`;

  await ensureWorktree(worktreePath, `PR #${pr.number}`, async () => {
    await $`gh pr checkout ${pr.number} --detach`.quiet();
    await $`git checkout -`.quiet();
    await $`git worktree add ${worktreePath} ${pr.headRefName}`.quiet();
  });

  await switchToWorktree(worktreePath);
}

async function ticket() {
  p.intro("sprout ticket - create worktree from Linear ticket");

  const apiKey = await getLinearApiKey();
  const repoRoot = await getRepoRoot();

  const spinner = p.spinner();
  spinner.start("Fetching Linear issues...");

  let issues: LinearIssue[];
  try {
    issues = await fetchLinearIssues(apiKey);
  } catch (e) {
    spinner.stop("Failed to fetch issues");
    p.cancel(
      `Could not fetch Linear issues: ${e instanceof Error ? e.message : e}`,
    );
    process.exit(1);
  }

  spinner.stop(`Found ${issues.length} assigned issues`);

  if (issues.length === 0) {
    p.outro("No assigned issues found");
    process.exit(0);
  }

  const selected = await p.autocomplete({
    message: "Select a ticket to checkout as a worktree",
    options: issues.map((issue) => ({
      value: issue,
      label: `${issue.identifier}: ${issue.title}`,
      hint: `${issue.state.name} · ${issue.priorityLabel}`,
    })),
    filter: fuzzyFilter,
  });

  if (p.isCancel(selected)) {
    p.cancel("Cancelled");
    process.exit(0);
  }

  const issue = selected as LinearIssue;
  const worktreePath = `${repoRoot}--${slugify(issue.branchName)}`;

  await ensureWorktree(worktreePath, issue.identifier, async () => {
    await $`git worktree add ${worktreePath} -b ${issue.branchName}`.quiet();
  });

  await switchToWorktree(worktreePath);
}

async function open() {
  p.intro("sprout open - switch to an existing worktree");

  const repoRoot = await getRepoRoot();
  const worktrees = await parseWorktrees();

  const sproutWorktrees = worktrees.filter((wt) =>
    wt.path.startsWith(repoRoot + "--"),
  );

  if (sproutWorktrees.length === 0) {
    p.outro("No sprout worktrees found");
    process.exit(0);
  }

  const selected = await p.autocomplete({
    message: "Select a worktree to open",
    options: sproutWorktrees.map((wt) => ({
      value: wt.path,
      label: wt.branch,
      hint: wt.path,
    })),
    filter: fuzzyFilter,
  });

  if (p.isCancel(selected)) {
    p.cancel("Cancelled");
    process.exit(0);
  }

  await switchToWorktree(selected as string);
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

  const spinner = p.spinner();
  spinner.start("Checking worktree status...");

  // Get merged branches and per-worktree dirty status in parallel
  const mergedOutput = await $`git branch --merged main`
    .text()
    .catch(() => "");
  const mergedBranches = new Set(
    mergedOutput
      .split("\n")
      .map((b) => b.trim().replace(/^\* /, ""))
      .filter(Boolean),
  );

  const statuses = await Promise.all(
    sproutWorktrees.map(async (wt) => {
      const status = await $`git -C ${wt.path} status --porcelain`
        .text()
        .catch(() => "");
      const dirty = status.trim().length > 0;
      const merged = mergedBranches.has(wt.branch);
      return { ...wt, dirty, merged };
    }),
  );

  spinner.stop("Worktree status loaded");

  const selected = await p.multiselect({
    message: "Select worktrees to remove",
    options: statuses.map((wt) => {
      const tags: string[] = [];
      if (wt.merged) tags.push("merged");
      if (wt.dirty) tags.push("has uncommitted changes");
      const hint = tags.length > 0 ? tags.join(" · ") : "clean";
      return {
        value: wt.path,
        label: wt.branch,
        hint,
      };
    }),
    required: false,
  });

  if (p.isCancel(selected) || selected.length === 0) {
    p.cancel("Cancelled");
    process.exit(0);
  }

  const paths = selected as string[];

  // Warn about dirty worktrees
  const dirtySelected = statuses.filter(
    (wt) => wt.dirty && paths.includes(wt.path),
  );

  if (dirtySelected.length > 0) {
    p.log.warn(
      `${dirtySelected.length} selected worktree(s) have uncommitted changes:`,
    );
    for (const wt of dirtySelected) {
      p.log.warn(`  ${wt.branch}`);
    }

    const confirmed = await p.confirm({
      message: "Remove these worktrees anyway? Uncommitted changes will be lost.",
    });

    if (p.isCancel(confirmed) || !confirmed) {
      p.cancel("Cancelled");
      process.exit(0);
    }
  }

  const removeSpinner = p.spinner();
  removeSpinner.start(`Removing ${paths.length} worktree(s)...`);

  for (const path of paths) {
    await $`git worktree remove ${path}`.quiet().catch(() => {
      return $`git worktree remove --force ${path}`.quiet();
    });
  }

  removeSpinner.stop(`Removed ${paths.length} worktree(s)`);
  p.outro("Done");
}

async function root() {
  const repoRoot = await getRepoRoot();
  await switchToWorktree(repoRoot);
}

const cleanCommand = command({
  name: "clean",
  help: {
    description: "Remove worktrees",
  },
});

const openCommand = command({
  name: "open",
  help: {
    description: "Switch to an existing worktree",
  },
});

const rootCommand = command({
  name: "root",
  help: {
    description: "Switch to the root repo directory",
  },
});

const ticketCommand = command({
  name: "ticket",
  help: {
    description: "Create worktree from a Linear ticket",
  },
});

const argv = cli({
  name: "sprout",
  version: "0.1.0",
  commands: [cleanCommand, openCommand, rootCommand, ticketCommand],
});

if (argv.command === "clean") {
  await clean();
} else if (argv.command === "open") {
  await open();
} else if (argv.command === "root") {
  await root();
} else if (argv.command === "ticket") {
  await ticket();
} else {
  await checkout();
}
