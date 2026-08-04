export const PR_TEMPLATE = `# Pull Request

## Type of Change

- [ ] Feature
- [ ] Bug Fix
- [ ] Documentation
- [ ] Refactoring
- [ ] Test
- [ ] Chore
- [ ] CI/CD

---

## Description

Provide a clear and concise description of the changes implemented.

---

## Related Issue

Closes #

---

## Changes Made

-

-

-

---

## Validation

- [ ] Code reviewed
- [ ] Tests executed
- [ ] Documentation updated (if applicable)
- [ ] No breaking changes

---

## Checklist

- [ ] Branch follows the naming convention
- [ ] Commits follow Conventional Commits
- [ ] No sensitive information included
- [ ] Ready for review

---

## Additional Notes

Add any relevant information for reviewers.`;

const TYPE_BY_BRANCH_PREFIX: Record<string, string> = {
  feature: "Feature",
  feat: "Feature",
  bugfix: "Bug Fix",
  fix: "Bug Fix",
  hotfix: "Bug Fix",
  docs: "Documentation",
  refactor: "Refactoring",
  test: "Test",
  chore: "Chore",
  ci: "CI/CD",
  infra: "CI/CD",
  release: "Chore",
};

const CONVENTIONAL_PREFIX: Record<string, string> = {
  feature: "feat",
  feat: "feat",
  bugfix: "fix",
  fix: "fix",
  hotfix: "fix",
  docs: "docs",
  refactor: "refactor",
  test: "test",
  chore: "chore",
  ci: "ci",
  infra: "ci",
  release: "chore",
};

export function typeOfChangeFromBranch(branch: string): string {
  const prefix = branch.split("/")[0].toLowerCase();
  return TYPE_BY_BRANCH_PREFIX[prefix] || "Feature";
}

export function prTitleFromBranch(branch: string, fallbackCommit?: string): string {
  const firstLine = fallbackCommit?.split("\n")[0]?.trim();
  if (firstLine && !firstLine.startsWith("Merge") && firstLine.length > 0 && firstLine.length <= 72) {
    return firstLine;
  }
  const prefix = branch.split("/")[0].toLowerCase();
  const conventional = CONVENTIONAL_PREFIX[prefix] || "feat";
  const name = branch.split("/").slice(1).join(" ") || branch;
  return `${conventional}: ${name}`;
}

export function buildPrBody(
  branch: string,
  base: string,
  commitMessage?: string,
  repoTemplate?: string
): string {
  const type = typeOfChangeFromBranch(branch);
  const commitLine = commitMessage ? commitMessage.split("\n")[0].trim() : "";
  const title = prTitleFromBranch(branch, commitMessage);
  const template = repoTemplate && repoTemplate.trim().length > 0 ? repoTemplate : PR_TEMPLATE;

  const body = template.replace(
    "Provide a clear and concise description of the changes implemented.",
    `Automated PR for branch \`${branch}\`.` +
      (commitLine ? `\n\n**Latest commit:** ${commitLine}` : "") +
      `\n\n> A description will be suggested by the AI review bot after the diff is analyzed.`
  ).replace(/^- \[ \] ([A-Za-z/]+)$/m, (match, label: string) => {
    return label === type ? `- [x] ${label}` : match;
  });

  return `> **Automatically created by Mottainai PR Bot** — ${title}\n> \`${branch}\` → \`${base}\`\n\n${body}`;
}
