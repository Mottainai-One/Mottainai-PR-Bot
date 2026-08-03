import type { Context, Probot } from "probot";
import {
  applySuggestedDescriptionToBody,
  extractReviewFromComment,
  isReviewComment,
} from "../services/reviewService.js";

export const APPLY_LABEL = "ai:apply-description";

export default function labelHandler(app: Probot): void {
  app.on("pull_request.labeled", async (context: Context<"pull_request.labeled">) => {
    const { label, pull_request: pr, repository, sender } = context.payload;

    if (!label || label.name !== APPLY_LABEL) return;
    if (sender?.type === "Bot") return;

    const owner = repository.owner.login;
    const repo = repository.name;
    const prNumber = pr.number;

    if (pr.state !== "open") return;
    if (pr.user?.login !== sender?.login) {
      await context.octokit.issues.removeLabel({ owner, repo, issue_number: prNumber, name: APPLY_LABEL });
      await context.octokit.issues.createComment({
        owner,
        repo,
        issue_number: prNumber,
        body: `> ❌ **Mottainai PR Bot:** apenas o autor do PR (@${pr.user?.login}) pode aplicar a descricao com o label \`${APPLY_LABEL}\`.`,
      });
      return;
    }

    const { data: comments } = await context.octokit.issues.listComments({
      owner,
      repo,
      issue_number: prNumber,
      per_page: 100,
    });

    const reviewComment = comments.find(
      (c) => (c.user?.type === "Bot" || c.user?.login?.endsWith("[bot]")) && isReviewComment(c.body || "")
    );

    if (!reviewComment) {
      await context.octokit.issues.removeLabel({ owner, repo, issue_number: prNumber, name: APPLY_LABEL });
      await context.octokit.issues.createComment({
        owner,
        repo,
        issue_number: prNumber,
        body: `> ⚠️ **Mottainai PR Bot:** nenhum review por IA encontrado neste PR para aplicar. Aguarde o comentario de validacao ser postado.`,
      });
      return;
    }

    const review = extractReviewFromComment(reviewComment.body || "");
    if (!review) {
      await context.octokit.issues.removeLabel({ owner, repo, issue_number: prNumber, name: APPLY_LABEL });
      await context.octokit.issues.createComment({
        owner,
        repo,
        issue_number: prNumber,
        body: `> ⚠️ **Mottainai PR Bot:** nao consegui ler os dados do review. Adicione o label \`${APPLY_LABEL}\` novamente apos o bot atualizar o comentario.`,
      });
      return;
    }

    const newBody = applySuggestedDescriptionToBody(review, pr.body || "");

    await context.octokit.pulls.update({
      owner,
      repo,
      pull_number: prNumber,
      body: `${newBody}\n\n---\n\n> 🤖 Descricao gerada e aplicada pelo **Mottainai PR Bot** a pedido de @${sender?.login}.`,
    });

    await context.octokit.issues.removeLabel({ owner, repo, issue_number: prNumber, name: APPLY_LABEL });

    await context.octokit.issues.createComment({
      owner,
      repo,
      issue_number: prNumber,
      body: `> ✅ **Mottainai PR Bot:** descricao sugerida pela IA aplicada ao corpo do PR a pedido de @${sender?.login}.`,
    });

    context.log.info(`Descricao IA aplicada ao PR #${prNumber} em ${owner}/${repo}`);
  });
}
