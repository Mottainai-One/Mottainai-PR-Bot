import assert from "node:assert/strict";
import test from "node:test";
import { buildPatchPreview, buildReviewPrompt, type ReviewContext } from "../src/ai/reviewPrompt.js";

test("keeps complete patches unchanged", () => {
  const patch = "@@ -1 +1 @@\n-old\n+new";

  assert.equal(buildPatchPreview({ path: "file.sql", additions: 1, deletions: 1, patch }), patch);
});

test("preserves the beginning and end of large patches with an explicit truncation marker", () => {
  const beginning = "+BEGINNING_OF_PATCH\n";
  const middle = `+${"x".repeat(7000)}\n`;
  const end = "+END_OF_PATCH";
  const preview = buildPatchPreview({
    path: "large.sql",
    additions: 3,
    deletions: 0,
    patch: `${beginning}${middle}${end}`,
  });

  assert.match(preview, /BEGINNING_OF_PATCH/);
  assert.match(preview, /END_OF_PATCH/);
  assert.match(preview, /PATCH PREVIEW TRUNCATED/);
  assert.match(preview, /THIS MARKER IS NOT END-OF-FILE/);
  assert.ok(preview.length <= 6000);
});

test("marks GitHub API patches that contain fewer changed lines than reported", () => {
  const preview = buildPatchPreview({
    path: "partial.sql",
    additions: 50,
    deletions: 0,
    patch: "@@ -0,0 +1,50 @@\n+first line\n+second line",
  });

  assert.match(preview, /PATCH PREVIEW TRUNCATED/);
  assert.match(preview, /source diff has 50 changed lines/);
});

test("instructs the reviewer not to infer incomplete source from patch previews", () => {
  const context: ReviewContext = {
    owner: "Mottainai-One",
    repo: "database",
    prNumber: 21,
    prTitle: "feat: add schema",
    branch: "feature/schema",
    base: "develop",
    commitMessages: ["feat: add schema"],
    files: [{ path: "schema.sql", additions: 1, deletions: 0, patch: "+SELECT 1;" }],
  };

  const prompt = buildReviewPrompt(context);

  assert.match(prompt, /Diff blocks are review previews/);
  assert.match(prompt, /Never claim that a file, function, table/);
  assert.match(prompt, /Report truncation only.*concrete, unambiguous evidence/s);
});
