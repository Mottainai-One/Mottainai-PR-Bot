export interface ReviewContext {
  owner: string;
  repo: string;
  prNumber: number;
  prTitle: string;
  branch: string;
  base: string;
  commitMessages: string[];
  files: { path: string; additions: number; deletions: number; patch: string }[];
}

export function buildReviewPrompt(ctx: ReviewContext): string {
  const fileList = ctx.files
    .map((f) => {
      const patch = f.patch ? f.patch.slice(0, 6000) : "";
      return `### ${f.path} (+${f.additions} / -${f.deletions})\n\`\`\`diff\n${patch}\n\`\`\``;
    })
    .join("\n\n");

  const commits = ctx.commitMessages.map((c) => `- ${c.split("\n")[0]}`).join("\n");

  return `You are a senior software engineer reviewing a Pull Request in the Mottainai ecosystem (predictive retail inventory management). Your job is to validate the code quality, correctness, and security of the changes, and to generate a clear description of what was done.

## Pull Request
- Repository: ${ctx.owner}/${ctx.repo}
- PR #${ctx.prNumber}: ${ctx.prTitle}
- Branch: ${ctx.branch} -> ${ctx.base}

## Commits
${commits || "- (no commits listed)"}

## Diff (files changed: ${ctx.files.length})
${fileList || "(empty diff)"}

## Task
1. Analyze the diff carefully.
2. Validate correctness, security, best practices, and conventions (Conventional Commits, naming, secrets handling).
3. Generate a human-readable description (pt-BR or en) summarizing what was done.

Return ONLY valid JSON (no markdown fences) matching EXACTLY this schema:
{
  "summary": "2-3 sentence technical summary of the change",
  "typeOfChange": "Feature | Bug Fix | Documentation | Refactoring | Test | Chore | CI/CD",
  "changesMade": ["bullet item", "bullet item"],
  "issuesFound": [
    { "severity": "HIGH | MEDIUM | LOW", "description": "what is wrong", "suggestion": "how to fix" }
  ],
  "recommendation": "APPROVE | REQUEST_CHANGES | COMMENT",
  "suggestedDescription": "Markdown description of the PR to be used as PR body"
}

Rules:
- severity HIGH = security vulnerability, data loss, breaking behavior, or clear bug. MEDIUM = maintainability/error handling gaps. LOW = style/nits.
- recommendation APPROVE only if no HIGH issues. REQUEST_CHANGES if HIGH issues exist.
- suggestedDescription must be concise, professional markdown (no template), describing exactly what was done, without inventing features not present in the diff.
- Respond ONLY with the JSON object.`;
}
