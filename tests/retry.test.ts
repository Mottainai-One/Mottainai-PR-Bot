import assert from "node:assert/strict";
import test from "node:test";
import { isRetryableGeminiError, retryWithBackoff } from "../src/ai/retry.js";

test("identifica o erro 503 retornado pelo SDK do Gemini", () => {
  const error = new Error(
    "[GoogleGenerativeAI Error]: Error fetching: [503 ] This model is currently experiencing high demand."
  );

  assert.equal(isRetryableGeminiError(error), true);
});

test("repete erros temporarios com backoff e retorna quando a API recupera", async () => {
  let attempts = 0;
  const delays: number[] = [];

  const result = await retryWithBackoff(
    async () => {
      attempts += 1;
      if (attempts < 3) throw Object.assign(new Error("temporariamente indisponivel"), { status: 503 });
      return "ok";
    },
    {
      maxAttempts: 4,
      baseDelayMs: 100,
      random: () => 0.5,
      sleep: async (delayMs) => {
        delays.push(delayMs);
      },
    }
  );

  assert.equal(result, "ok");
  assert.equal(attempts, 3);
  assert.deepEqual(delays, [100, 200]);
});

test("nao repete erros permanentes", async () => {
  let attempts = 0;

  await assert.rejects(
    retryWithBackoff(
      async () => {
        attempts += 1;
        throw Object.assign(new Error("requisição invalida"), { status: 400 });
      },
      { maxAttempts: 4, baseDelayMs: 0 }
    ),
    /requisição invalida/
  );

  assert.equal(attempts, 1);
});

test("interrompe depois do numero maximo de tentativas", async () => {
  let attempts = 0;

  await assert.rejects(
    retryWithBackoff(
      async () => {
        attempts += 1;
        throw Object.assign(new Error("limite excedido"), { status: 429 });
      },
      { maxAttempts: 3, baseDelayMs: 0 }
    ),
    /limite excedido/
  );

  assert.equal(attempts, 3);
});
