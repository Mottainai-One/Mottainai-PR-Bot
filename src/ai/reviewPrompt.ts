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

const MAX_PATCH_PREVIEW_CHARS = 6000;

function countChangedLines(patch: string): number {
  return patch.split("\n").filter((line) => {
    if (line.startsWith("+++") || line.startsWith("---")) return false;
    return line.startsWith("+") || line.startsWith("-");
  }).length;
}

export function buildPatchPreview(file: ReviewContext["files"][number]): string {
  if (!file.patch) return "(patch unavailable; do not infer that the source file is empty)";

  const expectedChangedLines = file.additions + file.deletions;
  const githubPreviewIsPartial = countChangedLines(file.patch) < expectedChangedLines;
  const promptPreviewIsPartial = file.patch.length > MAX_PATCH_PREVIEW_CHARS;

  if (!githubPreviewIsPartial && !promptPreviewIsPartial) return file.patch;

  const omittedByPrompt = Math.max(0, file.patch.length - MAX_PATCH_PREVIEW_CHARS);
  const marker = [
    "",
    `... [PATCH PREVIEW TRUNCATED: source diff has ${expectedChangedLines} changed lines; ${omittedByPrompt} characters omitted by prompt limit] ...`,
    "... [THIS MARKER IS NOT END-OF-FILE. DO NOT REPORT AN INCOMPLETE FILE ONLY BECAUSE CONTENT IS OMITTED HERE.] ...",
    "",
  ].join("\n");

  if (!promptPreviewIsPartial) return `${file.patch}${marker}`;

  const availableChars = Math.max(0, MAX_PATCH_PREVIEW_CHARS - marker.length);
  const headChars = Math.ceil(availableChars / 2);
  const tailChars = Math.floor(availableChars / 2);
  return `${file.patch.slice(0, headChars)}${marker}${file.patch.slice(-tailChars)}`;
}

export function buildReviewPrompt(ctx: ReviewContext): string {
  const fileList = ctx.files
    .map((f) => {
      const patch = buildPatchPreview(f);
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
Diff blocks are review previews, not authoritative full-file contents. A truncation marker means the bot omitted
the middle of a large patch while preserving its beginning and end. Never claim that a file, function, table,
or document is incomplete solely because a preview is truncated or content is omitted. Report truncation only
when the visible source contains concrete, unambiguous evidence of an incomplete construct.

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
