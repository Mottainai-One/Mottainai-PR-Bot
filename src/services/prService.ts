import type { Context } from "probot";
import { config } from "../config.js";
import { buildPrBody, prTitleFromBranch } from "../github/prTemplate.js";
import { typeOfChangeFromBranch } from "../github/prTemplate.js";

export function isIgnoredRepo(repo: string): boolean {
  return config.ignoredRepos.includes(repo);
}

export function isProtectedBranch(branch: string): boolean {
  return config.protectedBranches.includes(branch);
}

export async function detectBaseBranch(
  context: Context,
  owner: string,
  repo: string,
  branch: string,
  defaultBranch: string
): Promise<string> {
  if (config.prBaseBranch) {
    context.log.info(`Base fixada pela configuracao: ${config.prBaseBranch}`);
    return config.prBaseBranch;
  }

  const { data: branches } = await context.octokit.repos.listBranches({
    owner,
    repo,
    per_page: 100,
  });

  const candidates = branches
    .map((b) => b.name)
    .filter((b) => b !== branch)
    .sort((a, b) => {
      const pa = config.protectedBranches.includes(a) ? 0 : 1;
      const pb = config.protectedBranches.includes(b) ? 0 : 1;
      return pa - pb;
    });

  let best: { base: string; ahead: number } | null = null;

  for (const base of candidates) {
    try {
      const { data } = await context.octokit.repos.compareCommits({
        owner,
        repo,
        base,
        head: branch,
      });
      if (data.status === "ahead" && (data.ahead_by ?? 0) > 0) {
        if (!best || data.ahead_by < best.ahead) {
          best = { base, ahead: data.ahead_by };
        }
      }
    } catch {
      // branch sem merge-base com este candidato
    }
  }

  if (best) {
    context.log.info(`Base detectada para ${branch}: ${best.base} (${best.ahead} commit(s) a frente)`);
    return best.base;
  }

  context.log.info(`Nenhum tronco detectado para ${branch}; usando default '${defaultBranch}'`);
  return defaultBranch;
}

export async function findOpenPr(
  context: Context,
  owner: string,
  repo: string,
  branch: string
): Promise<number | null> {
  const { data } = await context.octokit.pulls.list({
    owner,
    repo,
    state: "open",
    head: `${owner}:${branch}`,
  });
  return data.length > 0 ? data[0].number : null;
}

const TEMPLATE_PATHS = [
  "pull_request_template.md",
  ".github/pull_request_template.md",
  "docs/pull_request_template.md",
];

export async function fetchRepoPrTemplate(
  context: Context,
  owner: string,
  repo: string,
  base: string
): Promise<string | undefined> {
  const refs = [base];
  try {
    const { data } = await context.octokit.repos.get({ owner, repo });
    if (data.default_branch && !refs.includes(data.default_branch)) refs.push(data.default_branch);
  } catch {
    // sem acesso ao repo metadata
  }

  for (const ref of refs) {
    for (const path of TEMPLATE_PATHS) {
      try {
        const { data } = await context.octokit.repos.getContent({
          owner,
          repo,
          path,
          ref,
        });
        if ("content" in data && typeof data.content === "string") {
          const content = Buffer.from(data.content, "base64").toString("utf8");
          if (content.trim().length > 0) return content;
        }
      } catch {
        // caminho nao existe neste ref; tenta o proximo
      }
    }
  }
  return undefined;
}

export async function createPullRequest(
  context: Context,
  owner: string,
  repo: string,
  branch: string,
  base: string,
  firstCommitMessage?: string
): Promise<number> {
  const title = prTitleFromBranch(branch, firstCommitMessage);
  const repoTemplate = await fetchRepoPrTemplate(context, owner, repo, base);
  const body = buildPrBody(branch, base, firstCommitMessage, repoTemplate);

  const { data: pr } = await context.octokit.pulls.create({
    owner,
    repo,
    title,
    head: branch,
    base,
    body,
  });

  context.log.info(`PR criada: ${pr.html_url}`);
  return pr.number;
}

export async function applyTypeLabel(
  context: Context,
  owner: string,
  repo: string,
  prNumber: number,
  branch: string
): Promise<void> {
  try {
    const type = typeOfChangeFromBranch(branch);
    const label = `type:${type.toLowerCase().replace(/ /g, "-")}`;
    await context.octokit.issues.addLabels({
      owner,
      repo,
      issue_number: prNumber,
      labels: [label],
    });
  } catch (err) {
    context.log.warn(`Nao foi possivel adicionar label de tipo: ${(err as Error).message}`);
  }
}
