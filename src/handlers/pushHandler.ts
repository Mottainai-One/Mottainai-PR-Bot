import type { Probot, Context } from "probot";
import { createPullRequest, findOpenPr, isIgnoredRepo, isProtectedBranch, applyTypeLabel, detectBaseBranch } from "../services/prService.js";

export default function pushHandler(app: Probot): void {
  app.on("push", async (context: Context<"push">) => {
    const { ref, repository, commits, sender } = context.payload;

    if (!ref.startsWith("refs/heads/")) return;
    if (sender?.type === "Bot") return;

    const branch = ref.replace("refs/heads/", "");
    const owner = repository.owner.login;
    const repo = repository.name;

    if (isIgnoredRepo(repo)) {
      context.log.debug(`Repo ${repo} ignorado pela configuracao`);
      return;
    }

    const base = await detectBaseBranch(context, owner, repo, branch, repository.default_branch);
    if (branch === base || isProtectedBranch(branch)) {
      context.log.debug(`Branch ${branch} nao recebe PR automatico`);
      return;
    }

    const existing = await findOpenPr(context, owner, repo, branch);
    if (existing) {
      context.log.debug(`PR #${existing} ja existe para ${branch} em ${repo}`);
      return;
    }

    const firstCommitMessage = commits?.[0]?.message;
    const prNumber = await createPullRequest(context, owner, repo, branch, base, firstCommitMessage);
    await applyTypeLabel(context, owner, repo, prNumber, branch);

    await context.octokit.issues.createComment({
      owner,
      repo,
      issue_number: prNumber,
      body: `> **Mottainai PR Bot:** PR criado automaticamente a partir do push em \`${branch}\`. A validacao por IA sera postada aqui em instantes.`,
    });
  });
}
