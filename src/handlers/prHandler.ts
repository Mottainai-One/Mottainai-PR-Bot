import type { Probot, Context } from "probot";
import { isIgnoredRepo } from "../services/prService.js";
import { generateReview, postOrUpdateReviewComment } from "../services/reviewService.js";
import { ensureBranchProtection } from "../services/mergeService.js";

export const RETRY_REVIEW_LABEL = "ai:retry-review";

export default function prHandler(app: Probot): void {
  app.on("pull_request.opened", async (context: Context<"pull_request.opened">) => {
    const pr = context.payload.pull_request;
    const owner = context.payload.repository.owner.login;
    const repo = context.payload.repository.name;

    if (pr.draft) return;
    if (isIgnoredRepo(repo)) return;

    await ensureBranchProtection(context, owner, repo, pr.base.ref);

    context.log.info(`Rodando review IA para PR #${pr.number} em ${owner}/${repo}`);
    try {
      const review = await generateReview(context, owner, repo, pr.number);
      await postOrUpdateReviewComment(context, owner, repo, pr.number, review, pr.head.ref, pr.base.ref);
    } catch (err) {
      context.log.error(`Review IA falhou para PR #${pr.number}: ${(err as Error).message}`);
      await context.octokit.issues.createComment({
        owner,
        repo,
        issue_number: pr.number,
        body: `> **Mottainai PR Bot:** a validacao por IA falhou neste PR. Motivo: \`${(err as Error).message}\`. A descricao podera ser gerada em um proximo push.`,
      });
    }
  });

  app.on("pull_request.reopened", async (context: Context<"pull_request.reopened">) => {
    const pr = context.payload.pull_request;
    const owner = context.payload.repository.owner.login;
    const repo = context.payload.repository.name;

    if (isIgnoredRepo(repo)) return;

    try {
      const review = await generateReview(context, owner, repo, pr.number);
      await postOrUpdateReviewComment(context, owner, repo, pr.number, review, pr.head.ref, pr.base.ref);
    } catch (err) {
      context.log.error(`Review IA falhou para PR #${pr.number}: ${(err as Error).message}`);
    }
  });

  app.on("pull_request.synchronize", async (context: Context<"pull_request.synchronize">) => {
    const pr = context.payload.pull_request;
    const owner = context.payload.repository.owner.login;
    const repo = context.payload.repository.name;

    if (pr.draft || isIgnoredRepo(repo)) return;

    context.log.info(`Atualizando review IA apos novo push no PR #${pr.number}`);
    try {
      const review = await generateReview(context, owner, repo, pr.number);
      await postOrUpdateReviewComment(context, owner, repo, pr.number, review, pr.head.ref, pr.base.ref);
    } catch (err) {
      context.log.warn(`Re-review falhou para PR #${pr.number}: ${(err as Error).message}`);
    }
  });

  app.on("pull_request.labeled", async (context: Context<"pull_request.labeled">) => {
    const { label, pull_request: pr, repository, sender } = context.payload;
    if (label?.name !== RETRY_REVIEW_LABEL || sender?.type === "Bot" || pr.state !== "open" || pr.draft) return;

    const owner = repository.owner.login;
    const repo = repository.name;
    if (isIgnoredRepo(repo)) return;

    try {
      const review = await generateReview(context, owner, repo, pr.number);
      await postOrUpdateReviewComment(context, owner, repo, pr.number, review, pr.head.ref, pr.base.ref);
    } catch (err) {
      context.log.warn(`Re-review manual falhou para PR #${pr.number}: ${(err as Error).message}`);
      await context.octokit.issues.createComment({
        owner,
        repo,
        issue_number: pr.number,
        body: `> **Mottainai PR Bot:** nova tentativa de validacao por IA falhou: \`${(err as Error).message}\`.`,
      });
    } finally {
      await context.octokit.issues.removeLabel({ owner, repo, issue_number: pr.number, name: RETRY_REVIEW_LABEL });
    }
  });
}
