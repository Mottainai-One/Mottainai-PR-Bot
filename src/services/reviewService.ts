import type { Context } from "probot";
import { config } from "../config.js";
import type { PrReviewResult, ReviewIssue } from "../ai/types.js";
import { REVIEW_COMMENT_MARKER } from "../ai/types.js";
import { buildReviewPrompt } from "../ai/reviewPrompt.js";
import { GeminiClient } from "../ai/gemini.js";

const MAX_FILES_IN_DIFF = 30;
const REVIEW_JSON_START = "<!-- MOTTAINAI-REVIEW-JSON-START -->";
const REVIEW_JSON_END = "<!-- MOTTAINAI-REVIEW-JSON-END -->";

export async function collectDiffContext(
  context: Context,
  owner: string,
  repo: string,
  prNumber: number
): Promise<{ commitMessages: string[]; files: { path: string; additions: number; deletions: number; patch: string }[] }> {
  const [commitsRes, filesRes] = await Promise.all([
    context.octokit.pulls.listCommits({ owner, repo, pull_number: prNumber, per_page: 50 }),
    context.octokit.pulls.listFiles({ owner, repo, pull_number: prNumber, per_page: 100 }),
  ]);

  const commitMessages = commitsRes.data.map((c) => c.commit.message);

  const files = filesRes.data
    .slice(0, MAX_FILES_IN_DIFF)
    .map((f) => ({
      path: f.filename,
      additions: f.additions,
      deletions: f.deletions,
      patch: f.patch ?? "",
    }))
    .filter((f) => f.additions + f.deletions > 0);

  return { commitMessages, files };
}

export async function generateReview(context: Context, owner: string, repo: string, prNumber: number): Promise<PrReviewResult> {
  const { data: pr } = await context.octokit.pulls.get({ owner, repo, pull_number: prNumber });
  const { commitMessages, files } = await collectDiffContext(context, owner, repo, prNumber);

  const prompt = buildReviewPrompt({
    owner,
    repo,
    prNumber,
    prTitle: pr.title,
    branch: pr.head.ref,
    base: pr.base.ref,
    commitMessages,
    files,
  });

  context.log.info(`Enviando diff de ${files.length} arquivos para ${config.geminiModel}...`);
  const client = new GeminiClient((message) => context.log.warn(message));
  const review = await client.generateReview(prompt);
  context.log.info(`Review gerado: ${review.recommendation} (${review.issuesFound.length} issues)`);
  return review;
}

export function formatReviewComment(review: PrReviewResult, branch: string, base: string): string {
  const verdict =
    review.recommendation === "APPROVE"
      ? "✅ **APPROVE** — pronto para revisao humana"
      : review.recommendation === "REQUEST_CHANGES"
        ? "🛑 **REQUEST_CHANGES** — correcoes necessarias"
        : "💬 **COMMENT** — apenas observacoes";

  const issues = review.issuesFound
    .map((i: ReviewIssue) => {
      const icon = i.severity === "HIGH" ? "🔴" : i.severity === "MEDIUM" ? "🟡" : "🟢";
      return `- ${icon} **${i.severity}** — ${i.description}\n  > ${i.suggestion}`;
    })
    .join("\n");

  const changes = review.changesMade.map((c) => `- ${c}`).join("\n") || "- (nada especifico listado)";

  const jsonBlob = `${REVIEW_JSON_START}${Buffer.from(JSON.stringify(review), "utf8").toString("base64")}${REVIEW_JSON_END}`;

  return `${REVIEW_COMMENT_MARKER}
${jsonBlob}

## 🤖 AI Review — Mottainai PR Bot

**Veredito:** ${verdict}

### 📝 Resumo
${review.summary || "_Sem resumo gerado._"}

### 🏷️ Tipo de mudança
${review.typeOfChange}

### 📦 Mudanças
${changes}

### ⚠️ Pontos de atenção
${issues || "_Nenhum problema encontrado pela validacao automatica._"}

### ✍️ Descrição sugerida
> ${review.suggestedDescription.split("\n").join("\n> ") || "_Sem descricao sugerida._"}

---
> **Como aplicar:** adicione o label \`ai:apply-description\` a este PR para aplicar a descricao sugerida ao corpo do PR (apenas o autor da PR pode fazer isso).
> \`${branch}\` → \`${base}\``;
}

export async function postOrUpdateReviewComment(
  context: Context,
  owner: string,
  repo: string,
  prNumber: number,
  review: PrReviewResult,
  branch: string,
  base: string
): Promise<void> {
  const body = formatReviewComment(review, branch, base);

  const { data: comments } = await context.octokit.issues.listComments({
    owner,
    repo,
    issue_number: prNumber,
    per_page: 100,
  });

  const existing = comments.find(
    (c) => (c.user?.type === "Bot" || c.user?.login?.endsWith("[bot]")) && c.body?.includes(REVIEW_COMMENT_MARKER)
  );

  if (existing) {
    await context.octokit.issues.updateComment({
      owner,
      repo,
      comment_id: existing.id,
      body,
    });
  } else {
    await context.octokit.issues.createComment({
      owner,
      repo,
      issue_number: prNumber,
      body,
    });
  }

  await updateReviewLabels(context, owner, repo, prNumber, review);
}

async function updateReviewLabels(
  context: Context,
  owner: string,
  repo: string,
  prNumber: number,
  review: PrReviewResult
): Promise<void> {
  const approveLabel = "ai-review:approved";
  const changesLabel = "ai-review:needs-changes";

  try {
    if (review.recommendation === "APPROVE") {
      await context.octokit.issues.addLabels({ owner, repo, issue_number: prNumber, labels: [approveLabel] });
      await removeLabel(context, owner, repo, prNumber, changesLabel);
    } else {
      await context.octokit.issues.addLabels({ owner, repo, issue_number: prNumber, labels: [changesLabel] });
      await removeLabel(context, owner, repo, prNumber, approveLabel);
    }
  } catch (err) {
    context.log.warn(`Labels de review nao atualizadas: ${(err as Error).message}`);
  }
}

async function removeLabel(context: Context, owner: string, repo: string, prNumber: number, label: string): Promise<void> {
  try {
    await context.octokit.issues.removeLabel({ owner, repo, issue_number: prNumber, name: label });
  } catch {
    // label provavelmente nao existe
  }
}

export function applySuggestedDescriptionToBody(review: PrReviewResult, originalBody: string): string {
  const lines = originalBody.replace(/\r\n/g, "\n").split("\n");

  let inChangesSection = false;
  let inDescriptionSection = false;
  let changesReplaced = false;
  const output: string[] = [];

  const pushChangesIfPending = () => {
    if (inChangesSection && !changesReplaced && review.changesMade.length > 0) {
      if (output.length > 0 && output[output.length - 1] !== "") output.push("");
      output.push(...review.changesMade.map((c) => `- ${c}`));
      output.push("");
      changesReplaced = true;
    }
  };

  for (const line of lines) {
    if (line.trim() === "## Changes Made") {
      inChangesSection = true;
      output.push(line);
      continue;
    }
    if (inChangesSection) {
      if (line.trim().startsWith("- ") || line.trim() === "-" || line.trim() === "") {
        continue;
      }
      pushChangesIfPending();
      inChangesSection = false;
    }
    if (line.trim() === "## Description") {
      pushChangesIfPending();
      output.push(line);
      output.push("");
      output.push(review.summary || "_Descricao gerada pela IA._");
      inDescriptionSection = true;
      continue;
    }
    if (inDescriptionSection) {
      if (line.trim() === "---") {
        output.push("");
        output.push(line);
        inDescriptionSection = false;
      }
      continue;
    }
    if (line.trim().startsWith("Provide a clear and concise description")) {
      continue;
    }
    if (line.trim().startsWith("Automated PR for branch") || line.trim().startsWith("**Latest commit:") || line.trim().startsWith("> A description will be suggested")) {
      continue;
    }
    output.push(line);
  }

  pushChangesIfPending();

  const body = output.join("\n");

  return body
    .replace(/^- \[ \] Feature$/m, review.typeOfChange === "Feature" ? "- [x] Feature" : "- [ ] Feature")
    .replace(/^- \[ \] Bug Fix$/m, review.typeOfChange === "Bug Fix" ? "- [x] Bug Fix" : "- [ ] Bug Fix")
    .replace(/^- \[ \] Documentation$/m, review.typeOfChange === "Documentation" ? "- [x] Documentation" : "- [ ] Documentation")
    .replace(/^- \[ \] Refactoring$/m, review.typeOfChange === "Refactoring" ? "- [x] Refactoring" : "- [ ] Refactoring")
    .replace(/^- \[ \] Test$/m, review.typeOfChange === "Test" ? "- [x] Test" : "- [ ] Test")
    .replace(/^- \[ \] Chore$/m, review.typeOfChange === "Chore" ? "- [x] Chore" : "- [ ] Chore")
    .replace(/^- \[ \] CI\/CD$/m, review.typeOfChange === "CI/CD" ? "- [x] CI/CD" : "- [ ] CI/CD")
    .replace(/^- \[ \] Code reviewed$/m, "- [x] Code reviewed")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function extractReviewFromComment(commentBody: string): PrReviewResult | null {
  const start = commentBody.indexOf(REVIEW_JSON_START);
  const end = commentBody.indexOf(REVIEW_JSON_END);
  if (start === -1 || end === -1 || end <= start) return null;
  const encoded = commentBody.slice(start + REVIEW_JSON_START.length, end);
  try {
    return JSON.parse(Buffer.from(encoded, "base64").toString("utf8")) as PrReviewResult;
  } catch {
    return null;
  }
}

export function isReviewComment(commentBody: string): boolean {
  return commentBody.includes(REVIEW_COMMENT_MARKER);
}
