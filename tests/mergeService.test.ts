import assert from "node:assert/strict";
import test from "node:test";
import type { Context } from "probot";
import { ensureBranchProtection, summarizeReviews } from "../src/services/mergeService.js";

test("configura a protecao sem invalidar approvals apos novos commits", async () => {
  let protection: Record<string, unknown> | undefined;
  const context = {
    octokit: {
      repos: {
        updateBranchProtection: async (input: Record<string, unknown>) => {
          protection = input;
        },
      },
    },
    log: { info: () => undefined, warn: () => undefined },
  } as unknown as Context;

  const configured = await ensureBranchProtection(context, "Mottainai-One", "frontend", "main");

  assert.equal(configured, true);
  assert.equal(
    (protection?.required_pull_request_reviews as { dismiss_stale_reviews?: boolean }).dismiss_stale_reviews,
    false
  );
});

test("conta somente o estado efetivo mais recente de cada integrante", () => {
  const summary = summarizeReviews([
    { user: { login: "ana" }, state: "APPROVED" },
    { user: { login: "bia" }, state: "CHANGES_REQUESTED" },
    { user: { login: "ana" }, state: "DISMISSED" },
    { user: { login: "bia" }, state: "APPROVED" },
    { user: { login: "bia" }, state: "COMMENTED" },
  ]);

  assert.deepEqual(summary, { approvers: 1, hasChangesRequested: false });
});
