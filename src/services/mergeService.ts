import type { Context } from "probot";
import { config } from "../config.js";

export async function ensureBranchProtection(
  context: Context,
  owner: string,
  repo: string,
  branch: string
): Promise<boolean> {
  try {
    await context.octokit.repos.updateBranchProtection({
      owner,
      repo,
      branch,
      required_status_checks: null,
      enforce_admins: true,
      required_pull_request_reviews: {
        required_approving_review_count: config.minApprovals,
        dismiss_stale_reviews: true,
        require_code_owner_reviews: false,
      },
      restrictions: null,
    });
    context.log.info(`Branch protection configurado em ${owner}/${repo}:${branch} (${config.minApprovals} approvals)`);
    return true;
  } catch (err) {
    context.log.warn(
      `Nao foi possivel configurar branch protection em ${owner}/${repo}:${branch}: ${(err as Error).message}. ` +
        "Verifique se o app tem permissao de administracao no repositorio."
    );
    return false;
  }
}

export interface MergeCheckResult {
  canMerge: boolean;
  reasons: string[];
}

export async function checkMergeConditions(
  context: Context,
  owner: string,
  repo: string,
  prNumber: number
): Promise<MergeCheckResult> {
  const reasons: string[] = [];

  const { data: pr } = await context.octokit.pulls.get({ owner, repo, pull_number: prNumber });

  if (pr.state !== "open") {
    reasons.push(`PR esta ${pr.state}`);
    return { canMerge: false, reasons };
  }
  if (!pr.mergeable) {
    reasons.push("PR nao esta mergeable (conflitos?)");
  }

  const { data: reviews } = await context.octokit.pulls.listReviews({ owner, repo, pull_number: prNumber, per_page: 100 });
  const latestPerUser = new Map<string, string>();
  for (const r of reviews) {
    if (!r.user) continue;
    if (r.state === "APPROVED" || r.state === "CHANGES_REQUESTED") {
      latestPerUser.set(r.user.login, r.state);
    }
  }
  const approvers = [...latestPerUser.entries()].filter(([, state]) => state === "APPROVED").length;

  if (approvers < config.minApprovals) {
    reasons.push(`Faltam approvals (${approvers}/${config.minApprovals})`);
  }
  if ([...latestPerUser.values()].includes("CHANGES_REQUESTED")) {
    reasons.push("Existe pedido de alteracoes pendente");
  }

  const allChecksPass = await checksPassed(context, owner, repo, pr.head.sha);
  if (!allChecksPass) {
    reasons.push("Checks/status nao passaram");
  }

  return { canMerge: reasons.length === 0, reasons };
}

async function checksPassed(context: Context, owner: string, repo: string, ref: string): Promise<boolean> {
  try {
    const [checksRes, statusRes] = await Promise.all([
      context.octokit.checks.listForRef({ owner, repo, ref, per_page: 100 }),
      context.octokit.repos.getCombinedStatusForRef({ owner, repo, ref }),
    ]);

    const runs = checksRes.data.check_runs;
    if (runs.length > 0) {
      const failing = runs.filter(
        (r) => r.status === "completed" && r.conclusion !== "success" && r.conclusion !== "skipped" && r.conclusion !== "neutral"
      );
      if (failing.length > 0) return false;
      const pending = runs.filter((r) => r.status !== "completed");
      if (pending.length > 0) return false;
      return true;
    }

    if (statusRes.data.state === "success") return true;
    if (statusRes.data.total_count === 0) return true;

    const failingStatuses = statusRes.data.statuses.filter(
      (s) => s.state === "failure" || s.state === "error"
    );
    const pendingStatuses = statusRes.data.statuses.filter((s) => s.state === "pending");
    return failingStatuses.length === 0 && pendingStatuses.length === 0;
  } catch {
    return true;
  }
}

export async function autoMerge(
  context: Context,
  owner: string,
  repo: string,
  prNumber: number,
  title: string
): Promise<void> {
  try {
    await context.octokit.pulls.merge({
      owner,
      repo,
      pull_number: prNumber,
      merge_method: "squash",
      commit_title: title,
    });
    context.log.info(`PR #${prNumber} mergeado em ${owner}/${repo}`);
  } catch (err) {
    context.log.error(`Falha ao mergear PR #${prNumber}: ${(err as Error).message}`);
  }
}
