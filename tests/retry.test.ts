import assert from "node:assert/strict";
import test from "node:test";
import { isRetryableGeminiError, retryAcrossModels, retryWithBackoff } from "../src/ai/retry.js";

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

test("usa modelo alternativo quando o principal segue em 503", async () => {
  const attempted: string[] = [];
  const fallback: string[] = [];
  const result = await retryAcrossModels(
    ["principal", "alternativo"],
    async (model) => {
      attempted.push(model);
      if (model === "principal") throw Object.assign(new Error("high demand"), { status: 503 });
      return "review gerado";
    },
    {
      maxAttempts: 2,
      baseDelayMs: 0,
      onFallback: (from, to) => fallback.push(`${from}->${to}`),
    }
  );

  assert.equal(result, "review gerado");
  assert.deepEqual(attempted, ["principal", "principal", "alternativo"]);
  assert.deepEqual(fallback, ["principal->alternativo"]);
});

test("nao usa modelo alternativo para erro permanente", async () => {
  const attempted: string[] = [];
  await assert.rejects(
    retryAcrossModels(
      ["principal", "alternativo"],
      async (model) => {
        attempted.push(model);
        throw Object.assign(new Error("credencial invalida"), { status: 401 });
      },
      { maxAttempts: 2, baseDelayMs: 0 }
    ),
    /credencial invalida/
  );
  assert.deepEqual(attempted, ["principal"]);
});

test("nao repete o mesmo modelo configurado como fallback", async () => {
  const attempted: string[] = [];
  await assert.rejects(
    retryAcrossModels(
      ["principal", "principal"],
      async (model) => {
        attempted.push(model);
        throw Object.assign(new Error("indisponivel"), { status: 503 });
      },
      { maxAttempts: 2, baseDelayMs: 0 }
    ),
    /indisponivel/
  );
  assert.deepEqual(attempted, ["principal", "principal"]);
});
