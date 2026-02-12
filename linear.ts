import * as p from "@clack/prompts";

export interface LinearIssue {
  identifier: string;
  title: string;
  branchName: string;
  state: { name: string };
  priorityLabel: string;
}

interface SproutConfig {
  linearApiKey?: string;
}

const SPROUT_CONFIG_PATH = `${process.env.HOME}/.sprout/config`;

export async function getLinearApiKey(): Promise<string> {
  const file = Bun.file(SPROUT_CONFIG_PATH);
  let config: SproutConfig = {};

  if (await file.exists()) {
    config = (await file.json()) as SproutConfig;
    if (config.linearApiKey) return config.linearApiKey;
  }

  const apiKey = await p.text({
    message: "Enter your Linear API key",
    placeholder: "lin_api_...",
    validate: (val) => {
      if (!val) return "API key is required";
    },
  });

  if (p.isCancel(apiKey)) {
    p.cancel("Cancelled");
    process.exit(0);
  }

  config.linearApiKey = apiKey;
  await Bun.write(SPROUT_CONFIG_PATH, JSON.stringify(config, null, 2) + "\n", {
    createPath: true,
  });

  return apiKey;
}

export async function fetchLinearIssues(
  apiKey: string,
): Promise<LinearIssue[]> {
  const response = await fetch("https://api.linear.app/graphql", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: apiKey,
    },
    body: JSON.stringify({
      query: `{
        viewer {
          assignedIssues(
            filter: {
              state: { type: { nin: ["completed", "canceled"] } }
            }
            orderBy: updatedAt
            first: 50
          ) {
            nodes {
              identifier
              title
              branchName
              state { name }
              priorityLabel
            }
          }
        }
      }`,
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Linear API error: ${response.status} ${response.statusText}`,
    );
  }

  const data = (await response.json()) as {
    data?: { viewer: { assignedIssues: { nodes: LinearIssue[] } } };
    errors?: { message: string }[];
  };

  if (data.errors?.length) {
    throw new Error(`Linear API error: ${data.errors[0]?.message}`);
  }

  return data.data?.viewer.assignedIssues.nodes ?? [];
}
