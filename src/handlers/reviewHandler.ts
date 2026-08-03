import type { Probot, Context } from "probot";
import { config } from "../config.js";
import { isIgnoredRepo } from "../services/prService.js";
import { checkMergeConditions, autoMerge, ensureBranchProtection } from "../services/mergeService.js";

export default function reviewHandler(app: Probot): void {
  app.on("pull_request_review.submitted", async (context: Context<"pull_request_review.submitted">) => {
    const pr = context.payload.pull_request;
    const owner = context.payload.repository.owner.login;
    const repo = context.payload.repository.name;

    if (isIgnoredRepo(repo)) return;
    if (context.payload.sender?.type === "Bot") return;

    await ensureBranchProtection(context, owner, repo, pr.base.ref);
    await tryAutoMerge(context, owner, repo, pr.number);
  });

  app.on("pull_request_review.edited", async (context: Context<"pull_request_review.edited">) => {
    const pr = context.payload.pull_request;
    const owner = context.payload.repository.owner.login;
    const repo = context.payload.repository.name;

    if (isIgnoredRepo(repo)) return;
    await tryAutoMerge(context, owner, repo, pr.number);
  });

  app.on("check_suite.completed", async (context: Context<"check_suite.completed">) => {
    const { repository, check_suite } = context.payload;
    if (!check_suite?.pull_requests?.length) return;

    const owner = repository.owner.login;
    const repo = repository.name;
    if (isIgnoredRepo(repo)) return;

    const prNumbers = check_suite.pull_requests.map((p) => p.number);
    for (const prNumber of prNumbers) {
      await tryAutoMerge(context, owner, repo, prNumber);
    }
  });

  app.on("pull_request.labeled", async (context: Context<"pull_request.labeled">) => {
    const pr = context.payload.pull_request;
    const owner = context.payload.repository.owner.login;
    const repo = context.payload.repository.name;
    if (isIgnoredRepo(repo)) return;
    await tryAutoMerge(context, owner, repo, pr.number);
  });
}

export async function tryAutoMerge(context: Context, owner: string, repo: string, prNumber: number): Promise<void> {
  try {
    const { data: pr } = await context.octokit.pulls.get({ owner, repo, pull_number: prNumber });
    if (pr.state !== "open") return;

    const result = await checkMergeConditions(context, owner, repo, prNumber);
    if (!result.canMerge) {
      context.log.debug(`PR #${prNumber} ainda nao pode mergear: ${result.reasons.join("; ")}`);
      return;
    }

    context.log.info(`Auto-merge: PR #${prNumber} de ${owner}/${repo} passou em todas as condicoes (${config.minApprovals} approvals + checks OK)`);
    await autoMerge(context, owner, repo, prNumber, pr.title);
  } catch (err) {
    context.log.warn(`tryAutoMerge falhou para PR #${prNumber}: ${(err as Error).message}`);
  }
}
